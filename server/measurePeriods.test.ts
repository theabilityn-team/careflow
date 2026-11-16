import { describe, expect, it } from "vitest";
import { measurePeriodRange } from "../shared/measurePeriods";
const monday = Date.parse("2026-11-16T18:00:00Z");
describe("Measure Eastern period presets", () => {
  it("Day always selects today only with hourly resolution", () => {
    expect(measurePeriodRange("day", monday)).toMatchObject({ fromDate: "2026-11-16", toDate: "2026-11-16", bucket: "hour", label: "Today · Nov 16, 2026" });
  });
  it("week is Monday to Sunday and month is the calendar month, not grouping labels", () => {
    expect(measurePeriodRange("week", monday)).toMatchObject({ fromDate: "2026-11-16", toDate: "2026-11-22", bucket: "day" });
    expect(measurePeriodRange("month", monday)).toMatchObject({ fromDate: "2026-11-15", calendarFromDate: "2026-11-01", toDate: "2026-11-30", bucket: "day" });
  });
  it("uses Eastern today rather than the browser or UTC date", () => {
    expect(measurePeriodRange("day", Date.parse("2026-11-17T02:00:00Z"))).toMatchObject({ fromDate: "2026-11-16", toDate: "2026-11-16" });
    expect(measurePeriodRange("day", Date.parse("2026-11-17T05:00:00Z"))).toMatchObject({ fromDate: "2026-11-17", toDate: "2026-11-17" });
  });
  it("Sunday remains in the same Monday-based week", () => {
    expect(measurePeriodRange("week", Date.parse("2026-11-22T18:00:00Z"))).toMatchObject({ fromDate: "2026-11-16", toDate: "2026-11-22" });
  });
  it("handles December/January and leap-year month lengths", () => {
    expect(measurePeriodRange("week", Date.parse("2027-01-01T18:00:00Z"))).toMatchObject({ fromDate: "2026-12-28", toDate: "2027-01-03" });
    expect(measurePeriodRange("month", Date.parse("2028-02-15T18:00:00Z"))).toMatchObject({ fromDate: "2028-02-01", toDate: "2028-02-29" });
  });
  it("Custom preserves dates and uses hours for one day, days for longer ranges", () => {
    expect(measurePeriodRange("custom", monday, { fromDate: "2026-11-15", toDate: "2026-11-15" })).toMatchObject({ fromDate: "2026-11-15", toDate: "2026-11-15", bucket: "hour" });
    expect(measurePeriodRange("custom", monday, { fromDate: "2026-11-15", toDate: "2026-11-16" })).toMatchObject({ fromDate: "2026-11-15", toDate: "2026-11-16", bucket: "day" });
  });
});
