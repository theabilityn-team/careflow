import { easternEndOfDay, easternStartOfDay } from "./time";

export type OrderDateRange = {
  orderedFrom?: number;
  orderedTo?: number;
};

function parseDate(value: string, label: "From" | "To") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(`Purchase date ${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = month === 2
    ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31;

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth) {
    throw new RangeError(`Purchase date ${label} is not a valid calendar date.`);
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function getOrderDateRange(dateFrom?: string, dateTo?: string): OrderDateRange {
  const fromInput = dateFrom?.trim() || undefined;
  const toInput = dateTo?.trim() || undefined;
  const from = fromInput ? parseDate(fromInput, "From") : undefined;
  const to = toInput ? parseDate(toInput, "To") : undefined;

  const orderedFrom = from === undefined ? undefined : easternStartOfDay(from);
  const orderedTo = to === undefined ? undefined : easternEndOfDay(to);
  if (orderedFrom !== undefined && !Number.isFinite(orderedFrom)) {
    throw new RangeError("Purchase date From is not a valid Eastern calendar date.");
  }
  if (orderedTo !== undefined && !Number.isFinite(orderedTo)) {
    throw new RangeError("Purchase date To is not a valid Eastern calendar date.");
  }
  if (orderedFrom !== undefined && orderedTo !== undefined && orderedFrom > orderedTo) {
    throw new RangeError("Purchase date range is reversed: From must be on or before To.");
  }

  return { orderedFrom, orderedTo };
}
