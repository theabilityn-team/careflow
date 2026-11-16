import type {
  MeasureBucket,
  MeasureEvent,
  MeasureMetrics,
  MeasurePoint,
} from "../shared/measure";
import { addEasternDays, easternDayKey, easternParts, easternStartOfDay, parseEasternDateTimeInput } from "../shared/time";

export type MeasureOrder = {
  id: number;
  at: number;
  ownerUserId: number;
  quantity: number;
  unitPriceCents: number;
  currency: string;
  status: string;
};

export type MeasureReportData = {
  events: MeasureEvent[];
  orders: MeasureOrder[];
  trackingSince: number | null;
};

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_INACTIVE_PERIODS = 100;

export function emptyMetrics(): MeasureMetrics {
  return {
    logins: 0,
    navigation: 0,
    interactions: 0,
    leadOpens: 0,
    uniqueLeadsOpened: 0,
    statusChanges: 0,
    contactsLogged: 0,
    phoneContactsLogged: 0,
    emailsSent: 0,
    ordersEntered: 0,
    ordersCredited: 0,
    creditedValueByCurrency: {},
    activeMinutes: 0,
    inactiveMinutes: 0,
    leadWorkSamples: 0,
    averageLeadMinutes: null,
    firstLoginAt: null,
    firstActivityAt: null,
    lastActivityAt: null,
  };
}

function roundMinutes(value: number) {
  return Math.round(value * 100) / 100;
}

function eventInRange(event: MeasureEvent, from: number, to: number) {
  return event.at >= from && event.at <= to;
}

function addEventMetric(metrics: MeasureMetrics, event: MeasureEvent) {
  if (event.type === "login") metrics.logins += 1;
  if (event.type === "navigation") metrics.navigation += 1;
  if (event.type === "interaction" || event.type === "other_action") metrics.interactions += event.type === "interaction" ? 1 : 0;
  if (event.type === "lead_open") metrics.leadOpens += 1;
  if (event.type === "status_change") metrics.statusChanges += 1;
  if (event.type === "contact") metrics.contactsLogged += 1;
  if (event.type === "phone_contact") {
    metrics.contactsLogged += 1;
    metrics.phoneContactsLogged += 1;
  }
  if (event.type === "email_sent") metrics.emailsSent += 1;
  if (event.type === "order_entered") metrics.ordersEntered += 1;
}

function eventMetrics(events: MeasureEvent[], orders: MeasureOrder[], from: number, to: number): MeasureMetrics {
  const result = emptyMetrics();
  const opened = new Set<number>();
  for (const event of events) {
    if (!eventInRange(event, from, to)) continue;
    addEventMetric(result, event);
    if (event.type === "lead_open" && event.leadId != null) opened.add(event.leadId);
    if (event.type === "login" && (result.firstLoginAt === null || event.at < result.firstLoginAt)) result.firstLoginAt = event.at;
    if (event.type !== "login" && event.type !== "logout" && (result.firstActivityAt === null || event.at < result.firstActivityAt)) result.firstActivityAt = event.at;
    if (event.type !== "login" && event.type !== "logout" && (result.lastActivityAt === null || event.at > result.lastActivityAt)) result.lastActivityAt = event.at;
  }
  result.uniqueLeadsOpened = opened.size;
  for (const order of orders) {
    if (order.at < from || order.at > to) continue;
    result.ordersCredited += 1;
    if (order.status === "cancelled" || order.status === "refunded") continue;
    const value = order.quantity * order.unitPriceCents;
    if (!Number.isSafeInteger(value)) continue;
    result.creditedValueByCurrency[order.currency] = (result.creditedValueByCurrency[order.currency] ?? 0) + value;
  }
  return result;
}

type ActivityInterval = { from: number; to: number };
type InactiveCandidate = { from: number; to: number; endedByActivity: boolean };
type TimingAnalysis = {
  active: ActivityInterval[];
  inactive: InactiveCandidate[];
  trackedUsable: boolean;
};

function isTrackedTimingEvent(event: MeasureEvent) {
  // A canonical audit/mail event can share only a uniquely evidenced runtime
  // session key. Session metadata may stand alone as a real login boundary.
  return event.impersonatedById == null && (event.source === "session" || event.sessionKey != null);
}

function finiteBoundary(value: number | undefined) {
  return value != null && Number.isFinite(value) ? value : null;
}

function sessionGroupKey(event: MeasureEvent) {
  if (event.sessionKey != null) return `key:${event.sessionKey}`;
  const started = finiteBoundary(event.sessionStartedAt);
  if (started != null) return `started:${started}`;
  return `event:${event.id}`;
}

function splitSessionIntervals(events: MeasureEvent[], inactivityMs: number, updatedThrough: number) {
  const active: ActivityInterval[] = [];
  const inactive: InactiveCandidate[] = [];
  const sorted = [...events]
    .filter(isTrackedTimingEvent)
    .filter(event => event.at <= updatedThrough)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const groups = new Map<string, MeasureEvent[]>();
  for (const event of sorted) {
    const list = groups.get(sessionGroupKey(event)) ?? [];
    list.push(event);
    groups.set(sessionGroupKey(event), list);
  }

  for (const group of Array.from(groups.values())) {
    let segment: MeasureEvent[] = [];
    const flush = () => {
      if (segment.length === 0) return;
      addSessionSegment(segment, inactivityMs, updatedThrough, active, inactive);
      segment = [];
    };
    for (const event of group) {
      // Re-authentication on a reused key is a new boundary, and a logout always
      // closes the current segment so no logged-out gap can be bridged.
      if (event.type === "login" && segment.some(item => item.type === "login" || item.type !== "logout")) flush();
      segment.push(event);
      if (event.type === "logout") flush();
    }
    flush();
  }
  return { active, inactive };
}

function addSessionSegment(
  orderedInput: MeasureEvent[],
  inactivityMs: number,
  updatedThrough: number,
  active: ActivityInterval[],
  inactive: InactiveCandidate[],
) {
  const ordered = [...orderedInput].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const login = ordered.find(event => event.type === "login");
  const actions = ordered.filter(event => event.type !== "login" && event.type !== "logout");
  const explicitStart = ordered
    .map(event => finiteBoundary(event.sessionStartedAt))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)[0];
  const start = explicitStart ?? login?.at ?? actions[0]?.at;
  if (start == null || start > updatedThrough) return;

  const explicitExpiry = ordered
    .map(event => finiteBoundary(event.sessionExpiresAt))
    .filter((value): value is number => value != null && value > start)
    .sort((a, b) => a - b)[0];
  const logoutAt = ordered.find(event => event.type === "logout" && event.at >= start)?.at;
  const sessionEnd = Math.min(updatedThrough, explicitExpiry ?? start + SESSION_TTL_MS, logoutAt ?? Number.POSITIVE_INFINITY);
  if (sessionEnd <= start) return;

  const usableActions = actions.filter(event => event.at >= start && event.at < sessionEnd);
  const first = usableActions[0];
  if (first && first.at > start) {
    const idleFrom = Math.min(sessionEnd, start + inactivityMs);
    if (first.at > idleFrom) inactive.push({ from: idleFrom, to: first.at, endedByActivity: true });
  }

  for (let index = 0; index < usableActions.length; index += 1) {
    const current = usableActions[index];
    const next = usableActions[index + 1];
    const end = Math.min(next?.at ?? sessionEnd, sessionEnd);
    const activeEnd = Math.min(end, current.at + inactivityMs);
    if (activeEnd > current.at) active.push({ from: current.at, to: activeEnd });
    if (end > activeEnd) inactive.push({
      from: activeEnd,
      to: end,
      endedByActivity: Boolean(next && next.at <= sessionEnd),
    });
  }

  // A login-only retained session is not active work. It still supplies idle
  // evidence after the grace period, ending at logout, expiry, or the snapshot.
  if (!first && login) {
    const idleFrom = Math.min(sessionEnd, start + inactivityMs);
    if (sessionEnd > idleFrom) inactive.push({ from: idleFrom, to: sessionEnd, endedByActivity: false });
  }
}

function mergeIntervals(intervals: ActivityInterval[]) {
  const sorted = [...intervals].filter(interval => interval.to > interval.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: ActivityInterval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval.from <= previous.to) previous.to = Math.max(previous.to, interval.to);
    else merged.push({ ...interval });
  }
  return merged;
}

/** Idle in one tab/source is not inactivity while another authenticated source is active. */
function subtractActive(idleCandidates: InactiveCandidate[], active: ActivityInterval[]) {
  const idle: InactiveCandidate[] = [];
  for (const gap of idleCandidates) {
    let fragments: InactiveCandidate[] = [{ ...gap }];
    for (const occupied of active) {
      const next: InactiveCandidate[] = [];
      for (const part of fragments) {
        if (occupied.to <= part.from || occupied.from >= part.to) {
          next.push(part);
          continue;
        }
        if (occupied.from > part.from) next.push({ from: part.from, to: occupied.from, endedByActivity: true });
        if (occupied.to < part.to) next.push({ from: occupied.to, to: part.to, endedByActivity: part.endedByActivity });
      }
      fragments = next;
    }
    idle.push(...fragments);
  }
  const inactive: InactiveCandidate[] = [];
  for (const gap of idle.sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = inactive[inactive.length - 1];
    if (last && gap.from <= last.to) {
      if (gap.to > last.to) {
        last.to = gap.to;
        last.endedByActivity = gap.endedByActivity;
      } else if (gap.to === last.to) {
        last.endedByActivity ||= gap.endedByActivity;
      }
    } else inactive.push({ ...gap });
  }
  return inactive;
}

function buildTiming(events: MeasureEvent[], inactivityMinutes: number, through: number): TimingAnalysis {
  const inactivityMs = inactivityMinutes * 60_000;
  const tracked = splitSessionIntervals(events, inactivityMs, through);
  const active = mergeIntervals(tracked.active);
  const inactive = subtractActive(tracked.inactive, active);
  return {
    active,
    inactive,
    trackedUsable: events.some(isTrackedTimingEvent),
  };
}

function timingEventsFromCutoff(events: MeasureEvent[], trackingSince: number | null, through: number) {
  if (trackingSince == null || !Number.isFinite(trackingSince)) return [];
  const cutoff = trackingSince;
  const timingEvents: MeasureEvent[] = [];
  const retainedSessions = new Map<string, { event: MeasureEvent; expiresAt: number }>();
  const postCutoffLogins = new Set<string>();

  for (const event of events) {
    if (!isTrackedTimingEvent(event) || event.impersonatedById != null) continue;
    const startedAt = finiteBoundary(event.sessionStartedAt);
    const expiresAt = finiteBoundary(event.sessionExpiresAt);
    const groupKey = sessionGroupKey(event);

    if (event.at < cutoff) {
      // Pre-cutoff actions never become timing evidence. A retained real session
      // can only seed the cutoff boundary when its true expiry is still open.
      if (startedAt != null && startedAt <= cutoff && expiresAt != null && expiresAt > cutoff) {
        const previous = retainedSessions.get(groupKey);
        if (!previous || expiresAt > previous.expiresAt) retainedSessions.set(groupKey, { event, expiresAt });
      }
      continue;
    }
    if (event.at > through || (expiresAt != null && expiresAt <= cutoff)) continue;

    const copy: MeasureEvent = { ...event };
    if (startedAt != null) copy.sessionStartedAt = Math.max(startedAt, cutoff);
    timingEvents.push(copy);
    if (event.type === "login") postCutoffLogins.add(groupKey);
  }

  for (const [groupKey, retained] of Array.from(retainedSessions.entries())) {
    if (postCutoffLogins.has(groupKey)) continue;
    timingEvents.push({
      ...retained.event,
      id: `${retained.event.id}:tracking-boundary`,
      at: cutoff,
      type: "login",
      source: "session",
      sessionStartedAt: cutoff,
      sessionExpiresAt: retained.expiresAt,
    });
  }

  return timingEvents;
}

function durationMetrics(timing: TimingAnalysis, from: number, to: number) {
  const result = emptyMetrics();
  for (const [field, values] of [["activeMinutes", timing.active], ["inactiveMinutes", timing.inactive]] as const) {
    const ms = values.reduce((sum, interval) => sum + Math.max(0, Math.min(interval.to, to + 1) - Math.max(interval.from, from)), 0);
    result[field] = roundMinutes(ms / 60_000);
  }
  return result;
}

function durationMetricsWithPeriods(timing: TimingAnalysis, from: number, to: number) {
  const periods = timing.inactive;
  const clipped = periods
    .map(period => ({ ...period, from: Math.max(period.from, from), to: Math.min(period.to, to + 1) }))
    .filter(period => period.to > period.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  return { periods: clipped, total: clipped.length };
}

function leadWorkMetrics(events: MeasureEvent[], from: number, to: number, inactivityMinutes: number) {
  const samples: number[] = [];
  const sessions = new Map<string, MeasureEvent[]>();
  for (const event of events.filter(item => item.at <= to && item.at >= from - SESSION_TTL_MS && isTrackedTimingEvent(item) && item.sessionKey)) {
    const key = itemSessionKey(event);
    const group = sessions.get(key) ?? [];
    group.push(event);
    sessions.set(key, group);
  }
  for (const group of Array.from(sessions.values())) {
    const ordered = group.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    const timing = buildTiming(ordered, inactivityMinutes, to);
    let opened: { id: number; at: number; statusChanged: boolean } | null = null;
    for (const event of ordered) {
      if (event.type === "logout" || event.type === "login") {
        opened = null;
        continue;
      }
      if (event.type === "lead_open" && event.leadId != null) {
        if (opened && opened.id === event.leadId) continue;
        if (opened && opened.statusChanged && event.at >= from && event.at - opened.at <= SESSION_TTL_MS) {
          const start = opened.at;
          const end = event.at;
          const ms = timing.active.reduce((sum, interval) => sum + Math.max(0, Math.min(interval.to, end) - Math.max(interval.from, start)), 0);
          samples.push(ms / 60_000);
        }
        opened = { id: event.leadId, at: event.at, statusChanged: false };
      } else if (event.type === "status_change" && opened && event.leadId === opened.id) opened.statusChanged = true;
    }
  }
  return { count: samples.length, average: samples.length ? roundMinutes(samples.reduce((sum, value) => sum + value, 0) / samples.length) : null };
}

function itemSessionKey(event: MeasureEvent) {
  return event.sessionKey!;
}

function dateKeyFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function bucketStart(value: number, bucket: MeasureBucket) {
  const parts = easternParts(value);
  if (bucket === "day") return easternStartOfDay(dateKeyFromParts(parts));
  if (bucket === "month") return easternStartOfDay(`${parts.year}-${String(parts.month).padStart(2, "0")}-01`);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return easternStartOfDay(dateKeyFromParts({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }));
}

function nextBucketStart(value: number, bucket: MeasureBucket) {
  if (bucket === "day") return addEasternDays(value, 1);
  if (bucket === "week") return addEasternDays(value, 7);
  const parts = easternParts(value);
  return parts.month === 12
    ? easternStartOfDay(`${parts.year + 1}-01-01`)
    : easternStartOfDay(`${parts.year}-${String(parts.month + 1).padStart(2, "0")}-01`);
}

function makePoints(from: number, to: number, bucket: MeasureBucket) {
  const points: Array<{ from: number; to: number; label: string }> = [];
  let cursor = bucketStart(from, bucket);
  while (cursor <= to) {
    const next = nextBucketStart(cursor, bucket);
    const pointFrom = Math.max(from, cursor);
    const pointTo = Math.min(to, next - 1);
    if (pointTo >= pointFrom) points.push({ from: pointFrom, to: pointTo, label: easternDayKey(cursor) });
    cursor = next;
  }
  return points;
}

function addLeadTiming(metrics: MeasureMetrics, events: MeasureEvent[], from: number, to: number, inactivityMinutes: number) {
  const sample = leadWorkMetrics(events, from, to, inactivityMinutes);
  metrics.leadWorkSamples = sample.count;
  metrics.averageLeadMinutes = sample.average;
}

export function calculateMeasureReport(input: {
  staff: { id: number; name: string; email: string | null; isActive: boolean };
  from: number;
  to: number;
  bucket: MeasureBucket;
  inactivityMinutes: number;
  updatedThrough: number;
  data: MeasureReportData;
}) {
  const from = input.from;
  const to = Math.min(input.to, input.updatedThrough);
  const uniqueEvents = new Map<string, MeasureEvent>();
  for (const event of input.data.events) uniqueEvents.set(event.id, event);
  const allEvents = Array.from(uniqueEvents.values());
  const events = allEvents.filter(event => eventInRange(event, from, to));
  // Counts use the requested range. Timing starts only at the implementation
  // cutoff; retained sessions may seed that boundary without backdating work.
  const timingEvents = timingEventsFromCutoff(allEvents, input.data.trackingSince, to);
  const orders = input.data.orders.filter(order => order.at >= from && order.at <= to);
  const ownEvents = events.filter(event => event.impersonatedById == null);
  const ownTimingEvents = timingEvents.filter(event => event.impersonatedById == null);
  const totals = eventMetrics(ownEvents, orders, from, to);
  const timing = buildTiming(ownTimingEvents, input.inactivityMinutes, to);
  const duration = durationMetrics(timing, from, to);
  totals.activeMinutes = duration.activeMinutes;
  totals.inactiveMinutes = duration.inactiveMinutes;
  addLeadTiming(totals, ownTimingEvents.filter(isTrackedTimingEvent), from, to, input.inactivityMinutes);

  const points: MeasurePoint[] = makePoints(from, to, input.bucket).map(point => {
    const metrics = eventMetrics(ownEvents, orders, point.from, point.to);
    const pointDuration = durationMetrics(timing, point.from, point.to);
    metrics.activeMinutes = pointDuration.activeMinutes;
    metrics.inactiveMinutes = pointDuration.inactiveMinutes;
    addLeadTiming(metrics, ownTimingEvents.filter(isTrackedTimingEvent), point.from, point.to, input.inactivityMinutes);
    return { key: point.label, label: point.label, from: point.from, to: point.to, metrics };
  });

  const impersonated = events.filter(event => event.impersonatedById != null);
  const inactiveCandidates = durationMetricsWithPeriods(timing, from, to);
  const inactivePeriods = inactiveCandidates.periods.slice(0, MAX_INACTIVE_PERIODS).map(period => ({
    from: period.from,
    to: period.to,
    minutes: roundMinutes((period.to - period.from) / 60_000),
    endedByActivity: period.endedByActivity,
  }));
  const timingBasis: "tracked_sessions" | "not_available" = timing.trackedUsable ? "tracked_sessions" : "not_available";
  return {
    staff: input.staff,
    from,
    to,
    bucket: input.bucket,
    updatedThrough: Math.min(input.updatedThrough, to),
    generatedAt: Date.now(),
    inactivityMinutes: input.inactivityMinutes,
    totals,
    points,
    impersonation: {
      events: impersonated.length,
      leadOpens: impersonated.filter(event => event.type === "lead_open").length,
      statusChanges: impersonated.filter(event => event.type === "status_change").length,
      emailsSent: impersonated.filter(event => event.type === "email_sent").length,
      ordersEntered: impersonated.filter(event => event.type === "order_entered").length,
    },
    inactivePeriods,
    inactivePeriodsTotal: inactiveCandidates.total,
    trackingSince: input.data.trackingSince,
    timingAvailable: timingBasis !== "not_available",
    timingBasis,
    historicalEvents: events.filter(event => event.source === "audit" || event.source === "mail").length,
    limitations: [
      "Timing is available only from the implemented tracking start. Historical audit and mail events remain visible in counts but do not create retrospective active or idle time without proven session evidence.",
      "A login or session boundary is not work. Login-only periods contribute idle only after the inactivity threshold, through the snapshot, logout, or real session expiry.",
      "Credited value excludes cancelled and refunded orders; credited order counts include them.",
      "Legacy sent emails without impersonation provenance cannot be reliably separated from impersonated sends.",
      "Interactions are sampled (at most once per 10 seconds in the browser); passive polling does not count as activity.",
      "Estimated time is evidence-based and is not attendance. Tracked active windows are bounded by the inactivity threshold and explicit session boundaries.",
      "Average lead work requires a status change followed by opening a different lead in the same session. Idle time is excluded; unfinished lead work is not a completed sample.",
      "Changing the global threshold recalculates tracked timing on Refresh; it does not alter the raw activity logs.",
    ],
  };
}

export function validateMeasureRange(fromDate: string, toDate: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new RangeError("Measure dates must use YYYY-MM-DD.");
  const from = parseEasternDateTimeInput(`${fromDate}T00:00`);
  const requestedTo = parseEasternDateTimeInput(`${toDate}T23:59:59`) + 999;
  if (!Number.isFinite(from) || !Number.isFinite(requestedTo) || from > requestedTo) throw new RangeError("Measure date range is invalid.");
  const calendarDays = Math.floor((Date.UTC(Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7)) - 1, Number(toDate.slice(8, 10))) - Date.UTC(Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)) - 1, Number(fromDate.slice(8, 10)))) / 86_400_000) + 1;
  if (calendarDays > 366) throw new RangeError("Measure date range cannot exceed 366 days.");
  if (from > now) throw new RangeError("Measure date range cannot start in the future.");
  return { from, to: Math.min(requestedTo, now), now };
}
