import type { MeasurePoint } from "@shared/measure";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const chartTooltip = {
  contentStyle: { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function MeasureCharts({ points, timingAvailable = true, trackingSince = null }: { points: MeasurePoint[]; timingAvailable?: boolean; trackingSince?: number | null }) {
  const data = [...points].sort((a, b) => a.from - b.from).map(point => ({
    label: point.label,
    activities: point.metrics.leadOpens + point.metrics.statusChanges + point.metrics.contactsLogged + point.metrics.ordersEntered,
    emails: point.metrics.emailsSent,
    activeMinutes: timingAvailable && trackingSince !== null && point.to >= trackingSince ? point.metrics.activeMinutes : null,
    inactiveMinutes: timingAvailable && trackingSince !== null && point.to >= trackingSince ? point.metrics.inactiveMinutes : null,
  }));
  return <div className="grid min-w-0 gap-5 xl:grid-cols-2">
    <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardHeader className="pb-2"><CardTitle className="text-base">Lead work and successful emails</CardTitle><p className="text-sm font-normal text-slate-500">Counts per {points.length ? "selected" : "report"} period.</p></CardHeader>
      <CardContent className="min-w-0 p-3 pt-0 sm:p-5">
        <div className="h-64 min-w-0 w-full" role="img" aria-label="Activities and successful outgoing emails by period">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 8, left: -18, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
            <Tooltip {...chartTooltip} formatter={(value: number, name: string) => [value, name === "activities" ? "Activities" : "Successful emails"]} />
            <Legend formatter={value => value === "activities" ? "Activities" : "Successful emails"} />
            <Bar dataKey="activities" fill="#0f766e" radius={[5, 5, 0, 0]} maxBarSize={28} />
            <Bar dataKey="emails" fill="#99f6e4" radius={[5, 5, 0, 0]} maxBarSize={28} />
          </BarChart></ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
    <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardHeader className="pb-2"><CardTitle className="text-base">Estimated active and idle time</CardTitle><p className="text-sm font-normal text-slate-500">From actual activities; idle begins after the configured threshold.</p></CardHeader>
      <CardContent className="min-w-0 p-3 pt-0 sm:p-5">
        {!timingAvailable ? <div className="flex h-64 items-center justify-center rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">No activity recorded in this range.</div> : <div className="h-64 min-w-0 w-full" role="img" aria-label="Estimated active and inactive minutes by period">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} tickFormatter={compactNumber} />
            <Tooltip {...chartTooltip} formatter={(value: number, name: string) => [`${value} min`, name === "activeMinutes" ? "Estimated active" : "Estimated idle"]} />
            <Legend formatter={value => value === "activeMinutes" ? "Estimated active" : "Estimated idle"} />
            <Line type="monotone" dataKey="activeMinutes" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3, fill: "#0f766e" }} />
            <Line type="monotone" dataKey="inactiveMinutes" stroke="#94a3b8" strokeWidth={2.5} dot={{ r: 3, fill: "#94a3b8" }} />
          </LineChart></ResponsiveContainer>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
