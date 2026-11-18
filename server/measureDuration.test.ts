import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMeasureDuration, isMeasureDurationUnit, measureDurationLabel, measureDurationValue } from "../shared/measureDuration";
import { readMeasureDurationUnit } from "../client/src/lib/measureDurationPreference";
afterEach(() => vi.unstubAllGlobals());
describe("Measure duration display units", () => {
  it("converts canonical minutes into hours and 24-hour days without rounding the data", () => {
    expect(measureDurationValue(1440, "hours")).toBe(24);
    expect(measureDurationValue(1440, "days")).toBe(1);
    expect(measureDurationValue(90, "hours")).toBe(1.5);
    expect(measureDurationValue(1, "days")).toBe(1 / 1440);
    expect(measureDurationValue(90)).toBe(90);
  });
  it("reduces large numbers using explicit labels and readable decimals", () => {
    expect(formatMeasureDuration(2880, "minutes")).toBe("2,880 min");
    expect(formatMeasureDuration(2880, "hours")).toBe("48 hr");
    expect(formatMeasureDuration(2880, "days")).toBe("2 days");
    expect(formatMeasureDuration(1440, "days")).toBe("1 day");
    expect(formatMeasureDuration(90, "hours")).toBe("1.5 hr");
    expect(measureDurationLabel("days")).toBe("Days");
  });
  it("retains zero, unknown sample and positive tiny values without false zero time", () => {
    for (const unit of ["minutes", "hours", "days"] as const) expect(formatMeasureDuration(null, unit)).toBe("No completed sample");
    expect(formatMeasureDuration(0)).toBe("0 min"); expect(formatMeasureDuration(0, "hours")).toBe("0 hr"); expect(formatMeasureDuration(0, "days")).toBe("0 days");
    expect(formatMeasureDuration(0.5)).toBe("<1 min"); expect(formatMeasureDuration(0.1, "hours")).toBe("<0.01 hr"); expect(formatMeasureDuration(1, "days")).toBe("<0.01 day");
  });
  it("accepts only supported units", () => {
    for (const value of ["minutes", "hours", "days"]) expect(isMeasureDurationUnit(value)).toBe(true);
    for (const value of [null, undefined, "weeks", "", 60]) expect(isMeasureDurationUnit(value)).toBe(false);
  });
});
describe("Measure account/browser duration preference", () => {
  it("defaults to minutes without a browser or viewer", () => { expect(readMeasureDurationUnit(42)).toBe("minutes"); expect(readMeasureDurationUnit(null)).toBe("minutes"); });
  it("uses only the current viewer's validated preference", () => {
    const getItem = vi.fn((key: string) => key.endsWith(":42") ? "hours" : key.endsWith(":43") ? "days" : "invalid");
    vi.stubGlobal("window", { localStorage: { getItem } });
    expect(readMeasureDurationUnit(42)).toBe("hours"); expect(readMeasureDurationUnit(43)).toBe("days"); expect(readMeasureDurationUnit(44)).toBe("minutes");
    expect(getItem).toHaveBeenCalledWith("careflow-measure-duration-unit:42");
  });
  it("fails safely if browser storage is blocked", () => { vi.stubGlobal("window", { get localStorage() { throw new Error("Storage blocked"); } }); expect(readMeasureDurationUnit(42)).toBe("minutes"); });
});
