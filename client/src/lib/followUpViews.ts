import { addEasternDays, easternDayKey, easternEndOfDay, easternParts, easternStartOfDay } from "@shared/time";

export type ArchivePeriod = "all" | "30" | "90" | "365";

export const localDayKey = easternDayKey;

export function calendarRangeForMonth(month: Date) {
  const parts = easternParts(month);
  const firstKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  const lastKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const firstWeekday = new Date(Date.UTC(parts.year, parts.month - 1, 1)).getUTCDay();
  const lastWeekday = new Date(Date.UTC(parts.year, parts.month - 1, lastDay)).getUTCDay();
  const from = addEasternDays(easternStartOfDay(firstKey), -firstWeekday);
  const lastGridDay = addEasternDays(easternStartOfDay(lastKey), 6 - lastWeekday);
  return { from, to: easternEndOfDay(lastGridDay) };
}

export function archivePeriodStart(period: ArchivePeriod, now = Date.now()) {
  if (period === "all") return undefined;
  return now - Number(period) * 24 * 60 * 60 * 1000;
}

export function countFollowUpsByDay(items: Array<{ scheduledFor?: number | null; nextFollowUpAt?: number | null }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const timestamp = item.scheduledFor ?? item.nextFollowUpAt;
    if (!timestamp) return counts;
    const key = easternDayKey(timestamp);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
