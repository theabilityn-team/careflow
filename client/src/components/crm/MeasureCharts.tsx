import type { MeasureBucket, MeasurePoint } from "@shared/measure";
import { measureDurationLabel, measureDurationValue, type MeasureDurationUnit } from "@shared/measureDuration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const chartTooltip = { contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }, labelStyle: { color: "#0f172a", fontWeight: 600 } };
const TIME_LINES = [{ key: "active", name: "Active", color: "#0f766e", dash: undefined }, { key: "idle", name: "Idle", color: "#f59e0b", dash: "6 3" }];
const ACTION_LINES = [{ key: "leadOpens", name: "Lead opens", color: "#2563eb", dash: undefined }, { key: "statuses", name: "Status changes", color: "#7c3aed", dash: "6 3" }, { key: "contacts", name: "Contacts", color: "#64748b", dash: "2 3" }, { key: "emails", name: "Emails", color: "#0891b2", dash: "8 3 2 3" }, { key: "orders", name: "Orders", color: "#e11d48", dash: "10 4" }];
const timeNumberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const timeAxisFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });

export function measureChartData(points: MeasurePoint[], durationUnit: MeasureDurationUnit = "minutes") {
  return [...points].sort((a, b) => a.from - b.from).map(point => ({
    key: point.key, label: point.label, from: point.from, observed: point.observed !== false,
    active: point.observed === false ? null : measureDurationValue(point.metrics.activeMinutes, durationUnit),
    idle: point.observed === false ? null : measureDurationValue(point.metrics.inactiveMinutes, durationUnit),
    leadOpens: point.observed === false ? null : point.metrics.leadOpens,
    statuses: point.observed === false ? null : point.metrics.statusChanges,
    contacts: point.observed === false ? null : point.metrics.contactsLogged,
    emails: point.observed === false ? null : point.metrics.emailsSent,
    orders: point.observed === false ? null : point.metrics.ordersEntered,
  }));
}
export default function MeasureCharts({ points, bucket, durationUnit = "minutes" }: { points: MeasurePoint[]; bucket: MeasureBucket; durationUnit?: MeasureDurationUnit }) {
  const data = measureChartData(points, durationUnit);
  const hourly = bucket === "hour";
  const durationLabel = measureDurationLabel(durationUnit);
  const tickLabel = (key: string) => { const label = data.find(p => p.key === key)?.label ?? key; return hourly ? label.split(" ")[0] : label.slice(5); };
  const tooltipLabel = (key: unknown) => {
    const point = data.find(p => p.key === String(key));
    if (!point) return String(key);
    return `${point.label}${point.observed ? "" : " · Not yet elapsed"}`;
  };
  const renderChart = (lines: typeof TIME_LINES, timeSeries: boolean) => <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 16, right: 16, left: -16, bottom: 4 }}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
    <XAxis dataKey="key" tickFormatter={tickLabel} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={22} />
    <YAxis allowDecimals={timeSeries} domain={timeSeries ? [0, (max: number) => max > 0 ? max : 1] : [0, (max: number) => Math.max(max, 1)]} tickFormatter={timeSeries ? (value: number) => timeAxisFormat.format(value) : undefined} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
    <Tooltip {...chartTooltip} labelFormatter={tooltipLabel} formatter={(value: number, name: string) => [timeSeries ? `${value > 0 && value < 0.01 ? "<0.01" : timeNumberFormat.format(value)} ${durationLabel.toLowerCase()}` : value, name]} />
    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
    {lines.map(line => <Line key={line.key} type="linear" name={line.name} dataKey={line.key} stroke={line.color} strokeDasharray={line.dash} strokeWidth={2.5} dot={data.filter(point => point.observed).length === 1 ? { r: 3 } : false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />)}
  </LineChart></ResponsiveContainer>;
  return <section className="grid min-w-0 gap-5 xl:grid-cols-2" aria-label="Measure line charts">
    <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">Active and idle time</CardTitle><p className="text-sm text-slate-500">{durationLabel} per {hourly ? "hour" : "day"} · Eastern Time</p></CardHeader><CardContent className="min-w-0 p-3 pt-0 sm:p-5"><div className="h-72 min-w-0 w-full" role="img" aria-label={`Active and idle ${durationLabel.toLowerCase()} by ${hourly ? "hour" : "day"}`}>{renderChart(TIME_LINES, true)}</div></CardContent></Card>
    <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader className="pb-2"><CardTitle className="text-base">Leads, emails and orders</CardTitle><p className="text-sm text-slate-500">Recorded actions per {hourly ? "hour" : "day"} · counts</p></CardHeader><CardContent className="min-w-0 p-3 pt-0 sm:p-5"><div className="h-72 min-w-0 w-full" role="img" aria-label={`Lead opens, status changes, contacts, emails and orders by ${hourly ? "hour" : "day"}`}>{renderChart(ACTION_LINES, false)}</div></CardContent></Card>
  </section>;
}
