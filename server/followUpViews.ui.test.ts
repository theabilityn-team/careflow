import { describe, expect, it } from "vitest";
import { archivePeriodStart, calendarRangeForMonth, countFollowUpsByDay, localDayKey } from "../client/src/lib/followUpViews";
import { easternParts, formatEasternDate, parseEasternDateTimeInput } from "../shared/time";

describe("follow-up calendar and archive helpers", () => {
  it("builds a complete Eastern Sunday-to-Saturday calendar grid range", () => {
    const range = calendarRangeForMonth(new Date("2026-09-15T12:00:00Z"));
    const from = easternParts(range.from);
    const to = easternParts(range.to);
    expect(new Date(Date.UTC(from.year, from.month - 1, from.day)).getUTCDay()).toBe(0);
    expect(from.hour).toBe(0);
    expect(new Date(Date.UTC(to.year, to.month - 1, to.day)).getUTCDay()).toBe(6);
    expect(to.hour).toBe(23);
    expect(to.minute).toBe(59);
    expect(range.to).toBeGreaterThan(range.from);
  });

  it("groups scheduled follow-ups by the Eastern calendar date", () => {
    const morning = parseEasternDateTimeInput("2026-09-11T09:00");
    const afternoon = parseEasternDateTimeInput("2026-09-11T16:30");
    const nextDay = parseEasternDateTimeInput("2026-09-12T10:00");
    expect(countFollowUpsByDay([
      { scheduledFor: morning },
      { scheduledFor: afternoon },
      { scheduledFor: nextDay },
      { scheduledFor: null },
    ])).toEqual({
      "2026-09-11": 2,
      "2026-09-12": 1,
    });
  });

  it("creates deterministic archive cutoffs and keeps All unbounded", () => {
    const now = Date.UTC(2026, 8, 11, 12, 0);
    expect(archivePeriodStart("all", now)).toBeUndefined();
    expect(archivePeriodStart("30", now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(archivePeriodStart("365", now)).toBe(now - 365 * 24 * 60 * 60 * 1000);
  });

  it("keeps ambiguous and DST-shifted inputs deterministic in America/New_York", () => {
    const winter = parseEasternDateTimeInput("2026-01-15T09:00");
    const summer = parseEasternDateTimeInput("2026-07-15T09:00");
    expect(localDayKey(winter)).toBe("2026-01-15");
    expect(localDayKey(summer)).toBe("2026-07-15");
    expect(formatEasternDate(winter, true)).toContain("EST");
    expect(formatEasternDate(summer, true)).toContain("EDT");
    expect(Number.isNaN(parseEasternDateTimeInput("2026-03-08T02:30"))).toBe(true);
  });
});
