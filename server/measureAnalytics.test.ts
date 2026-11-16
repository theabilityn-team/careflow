import { describe, expect, it } from "vitest";
import { calculateMeasureReport, validateMeasureRange } from "./measureAnalytics";
import type { MeasureEvent } from "../shared/measure";

const staff = { id: 7, name: "Leader", email: "leader@example.invalid", isActive: true };
const event = (id: string, at: number, type: MeasureEvent["type"], extra: Partial<MeasureEvent> = {}): MeasureEvent => ({
  id,
  at,
  type,
  source: "tracking",
  sessionKey: "session-a",
  ...extra,
});

function report(
  events: MeasureEvent[],
  from: number,
  to: number,
  bucket: "day" | "week" | "month" = "day",
  reportingSince: number | undefined = from,
  orders: Array<{ id: number; at: number; ownerUserId: number; quantity: number; unitPriceCents: number; currency: string; status: string }> = [],
) {
  return calculateMeasureReport({
    staff,
    from,
    to,
    bucket,
    inactivityMinutes: 40,
    updatedThrough: to,
    data: { events, orders, trackingSince: null, reportingSince },
  });
}

const minute = 60_000;

describe("activity-based measure analytics", () => {
  it("uses one staff-wide activity timeline and caps each action at 40 minutes", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([
      event("a", start, "interaction", { sessionKey: "one" }),
      event("b", start + 45 * minute, "navigation", { sessionKey: "two" }),
    ], start, start + 46 * minute);
    expect(result.totals.activeMinutes).toBe(41);
    expect(result.totals.inactiveMinutes).toBe(5);
    expect(result.timingBasis).toBe("activity_gaps");
  });

  it("does not seed, stop, or reset timing from login, logout, expiry, or session keys", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([
      event("login", start, "login", { source: "session", sessionKey: "one", sessionExpiresAt: start + 5 * minute }),
      event("a", start + 10 * minute, "interaction", { sessionKey: "one" }),
      event("logout", start + 15 * minute, "logout", { source: "session", sessionKey: "one" }),
      event("b", start + 20 * minute, "interaction", { sessionKey: "two" }),
    ], start, start + 100 * minute);
    expect(result.totals.activeMinutes).toBe(50);
    expect(result.totals.inactiveMinutes).toBe(40);
    expect(result.totals.firstActivityAt).toBe(start + 10 * minute);
    expect(result.totals.lastActivityAt).toBe(start + 20 * minute);
  });

  it("does not fabricate time from login-only data", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([event("login", start, "login", { source: "session" })], start, start + 90 * minute);
    expect(result.totals.activeMinutes).toBe(0);
    expect(result.totals.inactiveMinutes).toBe(0);
    expect(result.timingAvailable).toBe(false);
    expect(result.points).toHaveLength(0);
  });

  it("times audit and mail activity without a session key and carries a gap across day boundaries", () => {
    const start = Date.UTC(2026, 10, 16, 4, 55);
    const next = start + 45 * minute;
    const result = report([
      event("audit", start, "status_change", { source: "audit", sessionKey: null }),
      event("mail", next, "email_sent", { source: "mail", sessionKey: null }),
    ], start, next + 5 * minute);
    expect(result.totals.activeMinutes).toBe(45);
    expect(result.totals.inactiveMinutes).toBe(5);
    expect(result.historicalEvents).toBe(2);
    expect(result.points).toHaveLength(2);
    expect(result.points[0].from).toBeGreaterThan(result.points[1].from);
  });

  it("applies the fixed reporting cutoff, ignores old counts, and retains a prior-action idle point", () => {
    const cutoff = Date.UTC(2026, 10, 15, 0);
    const old = cutoff - minute;
    const action = cutoff + 5 * minute;
    const result = report([
      event("old", old, "interaction"),
      event("new", action, "interaction"),
    ], old, cutoff + 90 * minute, "day", cutoff);
    expect(result.from).toBe(cutoff);
    expect(result.totals.interactions).toBe(1);
    expect(result.totals.firstActivityAt).toBe(action);
    expect(result.totals.activeMinutes).toBe(40);
    expect(result.totals.inactiveMinutes).toBe(45);
    expect(result.points.length).toBe(1);
    expect(result.reportingSince).toBe(cutoff);
  });

  it("does not create empty dates or impersonation-only points, while showing impersonation separately", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([
      event("imp", start, "lead_open", { leadId: 1, impersonatedById: 99 }),
      event("own", start + 2 * 86_400_000, "interaction"),
    ], start, start + 2 * 86_400_000 + minute);
    expect(result.impersonation.leadOpens).toBe(1);
    expect(result.totals.leadOpens).toBe(0);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].hasActivity).toBe(true);
  });

  it("keeps other_action-only points even though interaction count remains zero", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([event("other", start, "other_action")], start, start + minute);
    expect(result.totals.interactions).toBe(0);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].hasActivity).toBe(true);
  });

  it("requires meaningful work and a different next lead; reopening does not reset, direct email without lead does not attribute", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([
      event("open-1", start, "lead_open", { leadId: 1 }),
      event("reopen-1", start + 5 * minute, "lead_open", { leadId: 1 }),
      event("email-direct", start + 10 * minute, "email_sent", { leadId: null }),
      event("contact-1", start + 15 * minute, "contact", { leadId: 1 }),
      event("open-2", start + 90 * minute, "lead_open", { leadId: 2 }),
    ], start, start + 100 * minute);
    expect(result.totals.leadWorkSamples).toBe(1);
    expect(result.totals.averageLeadMinutes).toBe(55);
  });

  it("excludes unfinished lead work and subtracts idle from completed samples", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([
      event("open", start, "lead_open", { leadId: 1 }),
      event("status", start + minute, "status_change", { leadId: 1 }),
      event("next", start + 81 * minute, "lead_open", { leadId: 2 }),
    ], start, start + 100 * minute);
    expect(result.totals.leadWorkSamples).toBe(1);
    expect(result.totals.averageLeadMinutes).toBe(41);
  });

  it("preserves order counts and credited currency logic without requiring events", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([], start, start + minute, "day", start, [
      { id: 1, at: start, ownerUserId: 7, quantity: 2, unitPriceCents: 12345, currency: "USD", status: "completed" },
      { id: 2, at: start, ownerUserId: 7, quantity: 1, unitPriceCents: 999, currency: "EUR", status: "pending" },
      { id: 3, at: start, ownerUserId: 7, quantity: 1, unitPriceCents: 333, currency: "USD", status: "refunded" },
    ]);
    expect(result.totals.ordersCredited).toBe(3);
    expect(result.totals.creditedValueByCurrency).toEqual({ USD: 24690, EUR: 999 });
    expect(result.points).toHaveLength(1);
  });

  it("keeps daily, weekly, and monthly sums consistent across DST", () => {
    const from = parseDate("2026-03-08");
    const to = from + 2 * 86_400_000;
    const events = [event("a", from, "interaction"), event("b", from + 45 * minute, "interaction")];
    const reports = [report(events, from, to, "day"), report(events, from, to, "week"), report(events, from, to, "month")];
    for (const result of reports) {
      expect(result.points.reduce((sum, point) => sum + point.metrics.activeMinutes, 0)).toBe(result.totals.activeMinutes);
      expect(result.points.reduce((sum, point) => sum + point.metrics.inactiveMinutes, 0)).toBe(result.totals.inactiveMinutes);
    }
  });

  it("validates inclusive Eastern ranges and rejects nonexistent calendar dates", () => {
    const now = Date.UTC(2026, 10, 20, 17);
    const range = validateMeasureRange("2026-11-15", "2026-11-16", now);
    expect(new Date(range.to).toISOString()).toBe("2026-11-17T04:59:59.999Z");
    expect(() => validateMeasureRange("2026-02-30", "2026-03-01", now)).toThrow();
  });
});

function parseDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 5);
}

describe("User examples and filtered days", () => {
  it("shows exactly 40 active and 5 idle after 45 minutes without a new action", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([event("open", start, "lead_open", { leadId: 1, sessionKey: null })], start, start + 45 * minute);
    expect(result.totals.activeMinutes).toBe(40);
    expect(result.totals.inactiveMinutes).toBe(5);
    expect(result.inactivePeriods[0].from).toBe(start + 40 * minute);
  });
  it("keeps today as idle with no new action after yesterday's real activity", () => {
    const cutoff = Date.parse("2026-11-15T05:00:00Z");
    const today = Date.parse("2026-11-16T05:00:00Z");
    const result = report([event("yesterday", today - 2 * 60 * minute, "interaction", { sessionKey: null })], today, today + 60 * minute, "day", cutoff);
    expect(result.totals.activeMinutes).toBe(0);
    expect(result.totals.inactiveMinutes).toBe(60);
    expect(result.timingAvailable).toBe(true);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].hasActivity).toBe(false);
    expect(result.points[0].label).toBe("2026-11-16");
  });
  it("keeps the full worked lead duration when the next lead is opened after the selected start", () => {
    const cutoff = Date.parse("2026-11-15T05:00:00Z");
    const start = cutoff + 60 * minute;
    const result = report([
      event("open", start, "lead_open", { leadId: 1, sessionKey: null }),
      event("email", start + 5 * minute, "email_sent", { leadId: 1, source: "mail", sessionKey: null }),
      event("next", start + 20 * minute, "lead_open", { leadId: 2, sessionKey: "different" }),
    ], start + 10 * minute, start + 30 * minute, "day", cutoff);
    expect(result.totals.leadWorkSamples).toBe(1);
    expect(result.totals.averageLeadMinutes).toBe(20);
    expect(result.totals.activeMinutes).toBe(20);
  });
  it("sorts inactive gaps newest first and does not turn empty history into time", () => {
    const start = Date.UTC(2026, 10, 15, 14);
    const result = report([event("a", start, "interaction"), event("b", start + 100 * minute, "interaction")], start, start + 200 * minute);
    expect(result.inactivePeriods).toHaveLength(2);
    expect(result.inactivePeriods[0].from).toBeGreaterThan(result.inactivePeriods[1].from);
    expect(report([], start, start + 48 * 60 * minute).points).toEqual([]);
  });
});
