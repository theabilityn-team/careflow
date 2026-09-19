export const CAREFLOW_TIME_ZONE = "America/New_York";
export const CAREFLOW_TIME_ZONE_LABEL = "Eastern Time";

type DateValue = number | Date;

type EasternParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAREFLOW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function asDate(value: DateValue) {
  return value instanceof Date ? value : new Date(value);
}

export function easternParts(value: DateValue): EasternParts {
  const values = Object.fromEntries(partsFormatter.formatToParts(asDate(value)).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function easternDayKey(value: DateValue) {
  const parts = easternParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function easternDateTimeInputValue(value?: DateValue | null) {
  if (value === undefined || value === null) return "";
  const parts = easternParts(value);
  return `${easternDayKey(value)}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function parseEasternDateTimeInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return Number.NaN;
  const desired: EasternParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
  const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
  let candidate = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = easternParts(candidate);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const adjustment = desiredAsUtc - observedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  const confirmed = easternParts(candidate);
  if (Object.keys(desired).some(key => confirmed[key as keyof EasternParts] !== desired[key as keyof EasternParts])) return Number.NaN;
  return candidate;
}

export function easternStartOfDay(value: string | DateValue) {
  const key = typeof value === "string" ? value : easternDayKey(value);
  return parseEasternDateTimeInput(`${key}T00:00`);
}

export function easternEndOfDay(value: string | DateValue) {
  const key = typeof value === "string" ? value : easternDayKey(value);
  const start = easternStartOfDay(key);
  return addEasternDays(start, 1) - 1;
}

export function addEasternDays(value: DateValue, days: number) {
  const parts = easternParts(value);
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const key = `${calendar.getUTCFullYear()}-${String(calendar.getUTCMonth() + 1).padStart(2, "0")}-${String(calendar.getUTCDate()).padStart(2, "0")}`;
  return easternStartOfDay(key);
}

export function formatEasternDate(value?: DateValue | null, includeTime = false, locale = "en-US") {
  if (value === undefined || value === null) return "Not set";
  return new Intl.DateTimeFormat(locale, includeTime
    ? { timeZone: CAREFLOW_TIME_ZONE, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }
    : { timeZone: CAREFLOW_TIME_ZONE, year: "numeric", month: "short", day: "numeric" }).format(asDate(value));
}

export function formatEasternLongDate(value: DateValue, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CAREFLOW_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(asDate(value));
}

export function formatEasternLongDateTime(value: DateValue, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CAREFLOW_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(asDate(value));
}
