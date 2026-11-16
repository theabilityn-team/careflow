import { MEASURE_REPORTING_START_DATE, type MeasureBucket, type MeasurePeriod } from "./measure";
import { easternDayKey, easternStartOfDay, formatEasternDate } from "./time";

export const MEASURE_PERIODS: Array<{ value: MeasurePeriod; label: string }> = [
  { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "custom", label: "Custom" },
];
function shiftDate(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
export function measurePeriodRange(period: MeasurePeriod, now = Date.now(), custom = { fromDate: easternDayKey(now), toDate: easternDayKey(now) }) {
  const today = easternDayKey(now);
  let fromDate = today; let toDate = today;
  if (period === "week") {
    const [year, month, day] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    fromDate = shiftDate(today, -(weekday + 6) % 7); toDate = shiftDate(fromDate, 6);
  } else if (period === "month") {
    const [year, month] = today.split("-").map(Number);
    fromDate = `${today.slice(0, 7)}-01`; toDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  } else if (period === "custom") {
    fromDate = custom.fromDate; toDate = custom.toDate;
  }
  const availableFromDate = period === "custom" ? fromDate : [fromDate, MEASURE_REPORTING_START_DATE].sort().at(-1)!;
  const bucket: MeasureBucket = availableFromDate === toDate ? "hour" : "day";
  const format = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(easternStartOfDay(date)) ? formatEasternDate(easternStartOfDay(date)) : date || "Select dates";
  const label = period === "day" ? `Today · ${format(today)}` : `${period === "week" ? "This week" : period === "month" ? "This month" : "Custom"} · ${format(fromDate)}${fromDate === toDate ? "" : ` – ${format(toDate)}`}`;
  return { fromDate: availableFromDate, toDate, bucket, label, availableFromDate, calendarFromDate: fromDate, today };
}
