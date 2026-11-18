export type MeasureDurationUnit = "minutes" | "hours" | "days";
export const MEASURE_DURATION_UNITS: ReadonlyArray<{ value: MeasureDurationUnit; label: string }> = [
  { value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" },
];
export function isMeasureDurationUnit(value: unknown): value is MeasureDurationUnit { return value === "minutes" || value === "hours" || value === "days"; }
export function measureDurationLabel(unit: MeasureDurationUnit) { return MEASURE_DURATION_UNITS.find(option => option.value === unit)!.label; }
export function measureDurationValue(minutes: number, unit: MeasureDurationUnit = "minutes") { return minutes / (unit === "days" ? 1440 : unit === "hours" ? 60 : 1); }
const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
export function formatMeasureDuration(minutes: number | null, unit: MeasureDurationUnit = "minutes"): string {
  if (minutes === null) return "No completed sample";
  const value = measureDurationValue(minutes, unit);
  const suffix = unit === "minutes" ? "min" : unit === "hours" ? "hr" : value === 1 ? "day" : "days";
  if (value > 0 && value < (unit === "minutes" ? 1 : 0.01)) return `<${unit === "minutes" ? "1 min" : `0.01 ${unit === "hours" ? "hr" : "day"}`}`;
  return `${numbers.format(unit === "minutes" ? Math.round(value) : value)} ${suffix}`;
}
