import { useEffect, useState } from "react";
import { CAREFLOW_TIME_ZONE } from "@shared/time";

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: CAREFLOW_TIME_ZONE, month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: CAREFLOW_TIME_ZONE, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZoneName: "short" });
export function easternClockValue(timestamp: number) {
  const date = new Date(timestamp);
  return { date: dateFormatter.format(date), time: timeFormatter.format(date), iso: date.toISOString() };
}
export default function EasternClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const visible = () => { if (document.visibilityState === "visible") update(); };
    const timer = window.setInterval(update, 1_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const value = easternClockValue(now);
  return <time dateTime={value.iso} title="Current date and time · America/New_York" aria-label={`${value.date}, ${value.time}, Eastern Time`} className="mt-1.5 block text-[11px] leading-4 tabular-nums" data-testid="logo-eastern-clock"><span className="block text-slate-500">{value.date}</span><span className="block font-semibold text-teal-800">{value.time}</span></time>;
}
