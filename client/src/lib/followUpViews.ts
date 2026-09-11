export type ArchivePeriod = "all" | "30" | "90" | "365";

export function localDayKey(value: number | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calendarRangeForMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  const from = new Date(first);
  from.setDate(first.getDate() - first.getDay());
  const to = new Date(last);
  to.setDate(last.getDate() + (6 - last.getDay()));
  return { from: from.getTime(), to: to.getTime() };
}

export function archivePeriodStart(period: ArchivePeriod, now = Date.now()) {
  if (period === "all") return undefined;
  return now - Number(period) * 24 * 60 * 60 * 1000;
}

export function countFollowUpsByDay(items: Array<{ nextFollowUpAt: number | null }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    if (!item.nextFollowUpAt) return counts;
    const key = localDayKey(item.nextFollowUpAt);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}
