import { useState } from "react";
import { isMeasureDurationUnit, type MeasureDurationUnit } from "@shared/measureDuration";
function preferenceKey(viewerId: number | null | undefined) { return typeof viewerId === "number" && Number.isFinite(viewerId) ? `careflow-measure-duration-unit:${viewerId}` : null; }
export function readMeasureDurationUnit(viewerId: number | null | undefined): MeasureDurationUnit {
  const key = preferenceKey(viewerId);
  try { const value = key && typeof window !== "undefined" ? window.localStorage.getItem(key) : null; return isMeasureDurationUnit(value) ? value : "minutes"; }
  catch { return "minutes"; }
}
export function useMeasureDurationUnit(viewerId: number | null | undefined) {
  const key = preferenceKey(viewerId);
  const [choice, setChoice] = useState(() => ({ key, unit: readMeasureDurationUnit(viewerId) }));
  const unit = choice.key === key ? choice.unit : readMeasureDurationUnit(viewerId);
  const selectUnit = (value: string) => {
    if (!isMeasureDurationUnit(value)) return;
    setChoice({ key, unit: value });
    try { if (key) window.localStorage.setItem(key, value); } catch { /* Display remains usable if browser storage is blocked. */ }
  };
  return [unit, selectUnit] as const;
}
