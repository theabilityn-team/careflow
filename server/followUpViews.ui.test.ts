import { describe, expect, it } from "vitest";
import { archivePeriodStart, calendarRangeForMonth, countFollowUpsByDay, localDayKey } from "../client/src/lib/followUpViews";

describe("follow-up calendar and archive helpers", () => {
  it("builds a complete Sunday-to-Saturday calendar grid range", () => {
    const range = calendarRangeForMonth(new Date(2026, 8, 15));
    const from = new Date(range.from);
    const to = new Date(range.to);
    expect(from.getDay()).toBe(0);
    expect(from.getHours()).toBe(0);
    expect(to.getDay()).toBe(6);
    expect(to.getHours()).toBe(23);
    expect(range.to).toBeGreaterThan(range.from);
  });

  it("groups scheduled follow-ups by the user's local calendar date", () => {
    const morning = new Date(2026, 8, 11, 9, 0).getTime();
    const afternoon = new Date(2026, 8, 11, 16, 30).getTime();
    const nextDay = new Date(2026, 8, 12, 10, 0).getTime();
    expect(countFollowUpsByDay([
      { nextFollowUpAt: morning },
      { nextFollowUpAt: afternoon },
      { nextFollowUpAt: nextDay },
      { nextFollowUpAt: null },
    ])).toEqual({
      [localDayKey(morning)]: 2,
      [localDayKey(nextDay)]: 1,
    });
  });

  it("creates deterministic archive cutoffs and keeps All unbounded", () => {
    const now = Date.UTC(2026, 8, 11, 12, 0);
    expect(archivePeriodStart("all", now)).toBeUndefined();
    expect(archivePeriodStart("30", now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
    expect(archivePeriodStart("365", now)).toBe(now - 365 * 24 * 60 * 60 * 1000);
  });
});
