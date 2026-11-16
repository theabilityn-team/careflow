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
  /** Legacy setting retained for the report shape; it is not a timing boundary. */
  trackingSince: number | null;
  /** Fixed reporting baseline supplied by the database. */
  reportingSince?: number;
};

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

/** Login/logout records are retained for counts, but never constitute activity. */
function isRealActivity(event: MeasureEvent) {
  return event.source !== "session" && event.type !== "login" && event.type !== "logout";
}

function isOwnRealActivity(event: MeasureEvent) {
  return event.impersonatedById == null && isRealActivity(event);
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
    if (isRealActivity(event) && (result.firstActivityAt === null || event.at < result.firstActivityAt)) result.firstActivityAt = event.at;
    if (isRealActivity(event) && (result.lastActivityAt === null || event.at > result.lastActivityAt)) result.lastActivityAt = event.at;
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
  hasActivity: boolean;
};

/**
 * Build one timeline for the staff member. Sessions, session keys, login, logout,
 * expiry and impersonated actions are deliberately absent from this calculation.
 */
function buildTiming(events: MeasureEvent[], inactivityMinutes: number, from: number, to: number, cutoff: number) {
  const threshold = Math.max(0, inactivityMinutes * 60_000);
  const reportEnd = to + 1;
  const activities = events
    .filter(isOwnRealActivity)
    .filter(event => event.at >= cutoff && event.at <= to)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const active: ActivityInterval[] = [];
  const inactive: InactiveCandidate[] = [];

  for (let index = 0; index < activities.length; index += 1) {
    const current = activities[index];
    const nextAt = activities[index + 1]?.at ?? reportEnd;
    const activeEnd = Math.min(nextAt, current.at + threshold, reportEnd);
    if (activeEnd > current.at) {
      const clippedFrom = Math.max(current.at, from);
      const clippedTo = Math.min(activeEnd, reportEnd);
      if (clippedTo > clippedFrom) active.push({ from: clippedFrom, to: clippedTo });
    }

    const idleStart = current.at + threshold;
    const idleEnd = Math.min(nextAt, reportEnd);
    if (idleEnd > idleStart) {
      const clippedFrom = Math.max(idleStart, from);
      const clippedTo = Math.min(idleEnd, reportEnd);
      if (clippedTo > clippedFrom) {
        inactive.push({ from: clippedFrom, to: clippedTo, endedByActivity: nextAt < reportEnd });
      }
    }
  }

  return {
    active: mergeIntervals(active),
    inactive: mergeInactive(inactive),
    hasActivity: activities.some(event => event.at >= from && event.at <= to),
  } satisfies TimingAnalysis;
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

function mergeInactive(periods: InactiveCandidate[]) {
  const sorted = [...periods].filter(period => period.to > period.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: InactiveCandidate[] = [];
  for (const period of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && period.from <= previous.to) {
      previous.to = Math.max(previous.to, period.to);
      previous.endedByActivity ||= period.endedByActivity;
    } else merged.push({ ...period });
  }
  return merged;
}

function durationMetrics(timing: TimingAnalysis, from: number, to: number) {
  const result = emptyMetrics();
  for (const [field, values] of [["activeMinutes", timing.active], ["inactiveMinutes", timing.inactive]] as const) {
    const ms = values.reduce((sum, interval) => sum + Math.max(0, Math.min(interval.to, to + 1) - Math.max(interval.from, from)), 0);
    result[field] = roundMinutes(ms / 60_000);
  }
  return result;
}

function overlaps(interval: ActivityInterval | InactiveCandidate, from: number, to: number) {
  return Math.min(interval.to, to + 1) > Math.max(interval.from, from);
}

function durationMetricsWithPeriods(timing: TimingAnalysis, from: number, to: number) {
  const periods = timing.inactive
    .map(period => ({ ...period, from: Math.max(period.from, from), to: Math.min(period.to, to + 1) }))
    .filter(period => period.to > period.from);
  return { periods, total: periods.length };
}

function leadWorkMetrics(events: MeasureEvent[], from: number, to: number, cutoff: number, timing: TimingAnalysis) {
  const ordered = events
    .filter(event => isOwnRealActivity(event) && event.at >= cutoff && event.at <= to)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const samples: number[] = [];
  type LeadState = { id: number; at: number; meaningful: boolean };
  let opened: LeadState | null = null;

  for (const event of ordered) {
    if (event.type === "lead_open" && event.leadId != null) {
      const previous = opened as LeadState | null;
      if (previous !== null && (previous as LeadState).id !== event.leadId) {
        if (previous.meaningful && event.at > previous.at && event.at >= from) {
          const minutes = timing.active.reduce((sum, interval) => sum + Math.max(0, Math.min(interval.to, event.at) - Math.max(interval.from, previous.at)), 0) / 60_000;
          samples.push(minutes);
        }
        opened = { id: event.leadId, at: event.at, meaningful: false };
      } else if (!previous) {
        opened = { id: event.leadId, at: event.at, meaningful: false };
      }
      continue;
    }

    if (!opened || event.leadId !== opened.id) continue;
    if (event.type === "status_change" || event.type === "email_sent" || event.type === "contact" || event.type === "phone_contact" || (event.type === "other_action" && event.leadId === opened.id)) {
      opened.meaningful = true;
    }
  }

  return {
    count: samples.length,
    average: samples.length ? roundMinutes(samples.reduce((sum, value) => sum + value, 0) / samples.length) : null,
  };
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

function addLeadTiming(metrics: MeasureMetrics, events: MeasureEvent[], from: number, to: number, cutoff: number, timing: TimingAnalysis) {
  const sample = leadWorkMetrics(events, from, to, cutoff, timing);
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
  const cutoff = Number.isFinite(input.data.reportingSince) ? input.data.reportingSince! : input.from;
  const from = Math.max(input.from, cutoff);
  const to = Math.min(input.to, input.updatedThrough);
  const uniqueEvents = new Map<string, MeasureEvent>();
  for (const event of input.data.events) uniqueEvents.set(event.id, event);
  const allEvents = Array.from(uniqueEvents.values());
  const events = from <= to ? allEvents.filter(event => eventInRange(event, from, to)) : [];
  const ownEvents = events.filter(event => event.impersonatedById == null);
  const orders = input.data.orders.filter(order => order.at >= from && order.at <= to);
  const totals = eventMetrics(ownEvents, orders, from, to);
  // Retain the full actual-activity timeline for a lead completed in this range;
  // calendar totals clip separately, so earlier work and carried idle are not lost.
  const timing = from <= to ? buildTiming(allEvents, input.inactivityMinutes, cutoff, to, cutoff) : { active: [], inactive: [], hasActivity: false };
  const duration = durationMetrics(timing, from, to);
  totals.activeMinutes = duration.activeMinutes;
  totals.inactiveMinutes = duration.inactiveMinutes;
  addLeadTiming(totals, allEvents, from, to, cutoff, timing);

  const pointDefinitions = from <= to ? makePoints(from, to, input.bucket) : [];
  const impersonated = events.filter(event => event.impersonatedById != null);
  type PointWithActivity = MeasurePoint & { hasActivity: boolean };
  const points: PointWithActivity[] = pointDefinitions
    .map(point => {
      const pointEvents = ownEvents.filter(event => eventInRange(event, point.from, point.to));
      const pointOrders = orders.filter(order => order.at >= point.from && order.at <= point.to);
      const metrics = eventMetrics(pointEvents, pointOrders, point.from, point.to);
      const pointDuration = durationMetrics(timing, point.from, point.to);
      metrics.activeMinutes = pointDuration.activeMinutes;
      metrics.inactiveMinutes = pointDuration.inactiveMinutes;
      addLeadTiming(metrics, allEvents, point.from, point.to, cutoff, timing);
      const hasActivity = pointEvents.some(isRealActivity);
      const hasTiming = timing.active.some(interval => overlaps(interval, point.from, point.to)) || timing.inactive.some(interval => overlaps(interval, point.from, point.to));
      const hasData = hasActivity || pointOrders.length > 0 || hasTiming;
      return hasData ? { key: point.label, label: point.label, from: point.from, to: point.to, metrics, hasActivity } : null;
    })
    .filter((point): point is PointWithActivity => point !== null)
    .sort((a, b) => b.from - a.from);

  const inactiveCandidates = durationMetricsWithPeriods(timing, from, to);
  const inactivePeriods = [...inactiveCandidates.periods]
    .sort((a, b) => b.from - a.from)
    .slice(0, MAX_INACTIVE_PERIODS)
    .map(period => ({
      from: period.from,
      to: period.to,
      minutes: roundMinutes((period.to - period.from) / 60_000),
      endedByActivity: period.endedByActivity,
    }));
  const timingBasis = timing.hasActivity ? "activity_gaps" as const : "not_available" as const;

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
    reportingSince: cutoff,
    historicalEvents: events.filter(event => event.source === "audit" || event.source === "mail").length,
    limitations: [
      "Timing is based only on observed real activity, not login, authentication sessions, session keys, logout, expiry, or impersonation.",
      "Each real action is active until the next real action or the inactivity threshold; a longer gap is idle until the next action or report snapshot.",
      "Credited value excludes cancelled and refunded orders; credited order counts include them.",
      "Impersonated activity is excluded from personal counts and time and is shown separately.",
      "Interactions are sampled (at most once per 10 seconds in the browser); passive polling does not count as activity.",
      "Average lead work requires meaningful work on a lead followed by opening a different lead. Reopening the same lead does not reset it; idle time is excluded and unfinished work is not sampled.",
      "The reporting baseline is fixed by the report data when supplied; legacy trackingSince does not control measurement timing.",
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
