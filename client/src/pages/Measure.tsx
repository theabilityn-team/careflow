import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import MeasureCharts from "@/components/crm/MeasureCharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { impersonationInfo } from "@/lib/impersonation";
import { MEASURE_REPORTING_START_DATE, type MeasureBucket, type MeasureMetrics, type MeasureReport } from "@shared/measure";
import { Clock3, RefreshCw, Save, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

const EASTERN = "America/New_York";
const BUCKETS: Array<{ value: MeasureBucket; label: string }> = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];
function easternDay() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
}
function calendarTime(value: string) { const [year, month, day] = value.split("-").map(Number); return Date.UTC(year, month - 1, day); }
function defaultDateRange() {
  const to = easternDay(); const date = new Date(calendarTime(to)); date.setUTCDate(date.getUTCDate() - 6);
  return { from: [date.toISOString().slice(0, 10), MEASURE_REPORTING_START_DATE].sort().at(-1)!, to };
}
function dateRangeError(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Select both an Eastern start and end date.";
  const start = calendarTime(from); const end = calendarTime(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return "Select valid calendar dates.";
  if (from < MEASURE_REPORTING_START_DATE || to < MEASURE_REPORTING_START_DATE) return `Reports start on ${MEASURE_REPORTING_START_DATE} Eastern.`;
  if (end < start) return "The end date must be on or after the start date.";
  if ((end - start) / 86400000 + 1 > 366) return "Choose 366 Eastern calendar days or fewer.";
  if (from > easternDay()) return "The start date cannot be in the future.";
  return null;
}
function easternTime(value: number) { return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function number(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function minutes(value: number | null) { return value === null ? "No completed sample" : value > 0 && value < 1 ? "<1 min" : `${number(Math.round(value))} min`; }
function displayError(error: unknown) { return error instanceof Error && error.message ? error.message : "Measure data could not be loaded. Please try again."; }

export default function Measure() {
  const { user } = useAuth(); const impersonating = Boolean(impersonationInfo(user));
  const accessQuery = trpc.dashboard.access.useQuery(undefined, { retry: false });
  const access = accessQuery.data;
  const allowed = Boolean(access?.isActive && (access.role === "super_admin" || access.isLeader) && !impersonating && !accessQuery.error);
  const range = useMemo(defaultDateRange, []);
  const [staffId, setStaffId] = useState(""); const [fromDate, setFromDate] = useState(range.from); const [toDate, setToDate] = useState(range.to);
  const [bucket, setBucket] = useState<MeasureBucket>("day"); const [threshold, setThreshold] = useState(40); const [draft, setDraft] = useState("40"); const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false); const rangeError = useMemo(() => dateRangeError(fromDate, toDate), [fromDate, toDate]);
  const queryOptions = { enabled: allowed, retry: false, refetchInterval: false as const, refetchOnWindowFocus: false as const, refetchOnReconnect: false as const };
  const staffQuery = trpc.measure.staff.useQuery(undefined, queryOptions);
  const settingsQuery = trpc.measure.settings.useQuery(undefined, queryOptions);
  const staff = staffQuery.data ?? []; const selectedStaffId = staffId || (staff[0] ? String(staff[0].id) : "");
  const reportInput = useMemo(() => ({ staffId: Number(selectedStaffId), fromDate, toDate, bucket }), [selectedStaffId, fromDate, toDate, bucket]);
  const reportEnabled = allowed && Boolean(selectedStaffId) && !rangeError;
  const reportQuery = trpc.measure.report.useQuery(reportInput, { ...queryOptions, enabled: reportEnabled });
  const save = trpc.measure.saveSettings.useMutation();
  useEffect(() => { if (!staffId && staff[0]) setStaffId(String(staff[0].id)); }, [staff, staffId]);
  useEffect(() => { if (settingsQuery.data) { setThreshold(settingsQuery.data.inactivityMinutes); setDraft(String(settingsQuery.data.inactivityMinutes)); } }, [settingsQuery.data?.inactivityMinutes]);
  const refresh = async () => { await Promise.all([settingsQuery.refetch(), reportEnabled ? reportQuery.refetch() : Promise.resolve()]); };
  const saveThreshold = async () => {
    if (saving.current || save.isPending) return;
    const value = Number(draft);
    if (!Number.isInteger(value) || value < 1 || value > 240) { setSaveError("Enter a whole number from 1 to 240 minutes."); return; }
    saving.current = true; setSaveError(null);
    try { await save.mutateAsync({ inactivityMinutes: value }); setThreshold(value); await refresh(); }
    catch (error) { setSaveError(displayError(error)); }
    finally { saving.current = false; }
  };
  if (accessQuery.isLoading) return <PageLoading />;
  if (!allowed) return <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6"><UserRound className="h-6 w-6" /><h1 className="mt-4 text-2xl font-semibold">Measure is unavailable</h1><p className="mt-3 text-sm text-slate-600">{impersonating ? "Measure is disabled while impersonating another workspace." : "Measure is available only to active Leaders and Super Admins."}</p></div>;
  if (staffQuery.error || settingsQuery.error) return <LoadError message={displayError(staffQuery.error ?? settingsQuery.error)} onRetry={() => { void staffQuery.refetch(); void settingsQuery.refetch(); }} />;
  const selected = staff.find(member => String(member.id) === selectedStaffId);
  const report = reportEnabled && !reportQuery.isFetching && !reportQuery.error ? reportQuery.data : undefined;
  return <div className="mx-auto max-w-[1500px]">
    <PageHeader eyebrow="Staff activity" title="Measure" description="Lead work, emails, orders, and time between actual app activities." actions={<Button variant="outline" className="min-h-11 w-full bg-white sm:w-auto" disabled={reportQuery.isFetching || settingsQuery.isFetching} onClick={() => void refresh()}><RefreshCw className={`mr-2 h-4 w-4 ${reportQuery.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    <Card className="mb-5 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-4 sm:p-5"><div className="grid gap-4 md:grid-cols-2 md:items-end">
      <div className="min-w-0 space-y-1.5"><Label htmlFor="measure-staff">Staff member</Label><Select value={selectedStaffId} onValueChange={setStaffId}><SelectTrigger id="measure-staff" className="min-h-11 w-full"><SelectValue placeholder="Select staff member">{selected?.name}</SelectValue></SelectTrigger><SelectContent>{staff.map(member => <SelectItem key={member.id} value={String(member.id)}><span className="block max-w-[min(70vw,28rem)] whitespace-normal break-words">{member.name}{member.email ? ` · ${member.email}` : ""}</span></SelectItem>)}</SelectContent></Select>{selected && <p className="break-words text-xs text-slate-500">{selected.email} · {selected.isActive ? "Active" : "Inactive"}</p>}</div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Grouping">{BUCKETS.map(option => <button type="button" key={option.value} role="tab" aria-selected={bucket === option.value} onClick={() => setBucket(option.value)} className={`min-h-10 rounded-lg px-2 text-sm font-medium ${bucket === option.value ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`}>{option.label}</button>)}</div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="measure-from">From (Eastern)</Label><Input id="measure-from" type="date" className="h-11 w-full min-w-0" min={MEASURE_REPORTING_START_DATE} max={toDate} value={fromDate} onChange={e => setFromDate(e.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="measure-to">To (Eastern)</Label><Input id="measure-to" type="date" className="h-11 w-full min-w-0" min={fromDate || MEASURE_REPORTING_START_DATE} value={toDate} onChange={e => setToDate(e.target.value)} /></div></div>
      <p className="text-xs leading-5 text-slate-500">Reports start November 15, 2026, Eastern. Reports cover up to 366 Eastern calendar days. Empty dates are hidden; newest dates are first.</p>
    </div>{rangeError && <p role="alert" className="mt-3 text-sm text-rose-700">{rangeError}</p>}</CardContent></Card>
    <Card className="mb-5 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"><div className="min-w-0"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-teal-700" /><h2 className="font-semibold">Inactivity threshold</h2><Badge variant="outline">{access?.role === "super_admin" ? "Super Admin" : "Read-only"}</Badge></div><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">After the last actual activity, {threshold} minutes without a new action starts idle time. The idle gap ends with the next action or Refresh. Login is not activity.</p>{saveError && <p role="alert" className="mt-2 text-sm text-rose-700">{saveError}</p>}</div><div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end"><div className="space-y-1.5"><Label htmlFor="measure-threshold">Minutes (1–240)</Label><Input id="measure-threshold" type="number" min={1} max={240} step={1} className="h-11 w-full sm:w-32" value={draft} disabled={access?.role !== "super_admin" || save.isPending} onChange={e => setDraft(e.target.value)} /></div>{access?.role === "super_admin" && <Button className="h-11 bg-teal-700 hover:bg-teal-800" disabled={save.isPending} onClick={() => void saveThreshold()}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save"}</Button>}</div></CardContent></Card>
    {reportQuery.error && <LoadError message={displayError(reportQuery.error)} onRetry={() => void reportQuery.refetch()} />}
    {reportQuery.isFetching && reportEnabled && <PageLoading />}
    {report && <><p className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-950"><strong>Data updated through {easternTime(report.updatedThrough)} Eastern.</strong> Use Refresh for newer activity.</p>
      <MetricGrid metrics={report.totals} />
      {report.points.length === 0 ? <div className="mt-5"><EmptyState title="No activity" description="No actual app activity or ongoing measured gap in this range. Empty dates are not listed." /></div> : <><div className="mt-5"><MeasureCharts points={report.points} timingAvailable={report.timingAvailable} trackingSince={report.reportingSince} /></div><ReportTable report={report} /></>}
      <InactivePeriods report={report} />
      <p className="mt-4 text-xs leading-5 text-slate-500">Lead work runs from opening a lead, working on it, then opening a different lead; idle time is excluded. Calls count only when recorded, not when a number is clicked. Emails count only successful sends.</p>
    </>}
  </div>;
}
function MetricGrid({ metrics }: { metrics: MeasureMetrics }) {
  const cards = [["Lead opens", number(metrics.leadOpens)], ["Completed lead work", number(metrics.leadWorkSamples)], ["Status changes", number(metrics.statusChanges)], ["Contacts logged", number(metrics.contactsLogged)], ["Successful emails", number(metrics.emailsSent)], ["Orders entered", number(metrics.ordersEntered)], ["Estimated active time", minutes(metrics.activeMinutes)], ["Estimated idle time", minutes(metrics.inactiveMinutes)], ["Average lead work", minutes(metrics.averageLeadMinutes)]];
  return <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(([label, value]) => <Card key={label} className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="min-w-0 p-4"><p className="break-words text-[11px] font-semibold uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-2 break-words text-xl font-semibold text-slate-950 [overflow-wrap:anywhere]">{value}</p></CardContent></Card>)}</div>;
}
function ReportTable({ report }: { report: MeasureReport }) {
  const points = [...report.points].sort((a, b) => b.from - a.from);
  return <Card className="mt-5 min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-base">Activity by period</CardTitle><p className="text-sm text-slate-500">Newest periods first. Dates without activity or a measured gap are hidden.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm" aria-label="Measure activity by period"><thead><tr className="border-b text-xs uppercase text-slate-400">{["Period", "Lead opens", "Status changes", "Contacts", "Emails", "Orders", "Worked leads", "Average / lead", "Active", "Idle"].map(label => <th className="px-4 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead><tbody>{points.map(p => <tr key={p.key} className="border-b border-slate-100 last:border-0"><td className="whitespace-nowrap px-4 py-3 font-medium">{p.label}{p.hasActivity === false && <span className="mt-1 block text-xs font-normal text-slate-500">No activity</span>}</td>{[p.metrics.leadOpens, p.metrics.statusChanges, p.metrics.contactsLogged, p.metrics.emailsSent, p.metrics.ordersEntered, p.metrics.leadWorkSamples].map((value, index) => <td key={index} className="px-4 py-3 text-slate-600">{number(value)}</td>)}<td className="whitespace-nowrap px-4 py-3">{minutes(p.metrics.averageLeadMinutes)}</td><td className="whitespace-nowrap px-4 py-3">{minutes(p.metrics.activeMinutes)}</td><td className="whitespace-nowrap px-4 py-3">{minutes(p.metrics.inactiveMinutes)}</td></tr>)}</tbody></table></div></CardContent></Card>;
}
function InactivePeriods({ report }: { report: MeasureReport }) {
  const periods = [...report.inactivePeriods].sort((a, b) => b.from - a.from).slice(0, 100);
  return <Card className="mt-5 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-base">Inactive periods</CardTitle><p className="text-sm text-slate-500">Newest gaps first; after {report.inactivityMinutes} minutes without an action.</p></CardHeader><CardContent>{periods.length ? <div className="space-y-2">{periods.map(p => <div key={`${p.from}-${p.to}`} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium">{easternTime(p.from)} – {easternTime(p.to)}</p><p className="mt-1 text-xs text-slate-500">{p.endedByActivity ? "Ended with new activity" : "Measured through this snapshot"}</p></div><Badge variant="outline" className="w-fit shrink-0 bg-white">{minutes(p.minutes)}</Badge></div>)}{report.inactivePeriodsTotal > 100 && <p className="text-xs text-slate-500">Showing the latest 100 of {number(report.inactivePeriodsTotal)} gaps.</p>}</div> : <p className="text-sm text-slate-500">No measured idle gap in this range.</p>}</CardContent></Card>;
}
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"><span className="break-words">{message}</span><Button variant="outline" className="min-h-10 bg-white" onClick={onRetry}>Retry</Button></div>; }
