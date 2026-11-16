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
import type { MeasureBucket, MeasureMetrics, MeasureReport, MeasureStaff } from "@shared/measure";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, MailCheck, RefreshCw, Save, ShieldAlert, UserRound, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

const measureTrpc = trpc.measure;

const EASTERN = "America/New_York";
const BUCKETS: Array<{ value: MeasureBucket; label: string }> = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];
const EMPTY_METRICS: MeasureMetrics = {
  logins: 0, navigation: 0, interactions: 0, leadOpens: 0, uniqueLeadsOpened: 0, statusChanges: 0,
  contactsLogged: 0, phoneContactsLogged: 0, emailsSent: 0, ordersEntered: 0, ordersCredited: 0,
  creditedValueByCurrency: {}, activeMinutes: 0, inactiveMinutes: 0, leadWorkSamples: 0, averageLeadMinutes: null,
  firstLoginAt: null, firstActivityAt: null, lastActivityAt: null,
};

function easternDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return { year: Number(parts.find(part => part.type === "year")?.value), month: Number(parts.find(part => part.type === "month")?.value), day: Number(parts.find(part => part.type === "day")?.value) };
}
function dateString(parts: { year: number; month: number; day: number }) { return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`; }
function calendarDateToUtc(value: string) { const [year, month, day] = value.split("-").map(Number); return Date.UTC(year, month - 1, day); }
function shiftCalendarDate(value: string, amount: number) { const date = new Date(calendarDateToUtc(value)); date.setUTCDate(date.getUTCDate() + amount); return dateString({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }); }
function defaultDateRange() { const today = dateString(easternDateParts()); return { from: shiftCalendarDate(today, -6), to: today }; }
function dateRangeError(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Select both an Eastern start and end date.";
  const start = calendarDateToUtc(from); const end = calendarDateToUtc(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Select valid calendar dates.";
  if (new Date(start).toISOString().slice(0,10) !== from || new Date(end).toISOString().slice(0,10) !== to) return "Select valid calendar dates.";
  if (end < start) return "The end date must be on or after the start date.";
  if ((end - start) / 86400000 + 1 > 366) return "Choose an Eastern date range of 366 calendar days or fewer.";
  return null;
}
function easternDateTime(value: number | null) { return value ? new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not recorded"; }
function easternDate(value: number) { return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function number(value: number) { return new Intl.NumberFormat("en-US").format(value); }
function minutes(value: number | null) { return value === null ? "Not available" : `${number(Math.round(value))} min`; }
function displayError(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
function metricValue(metrics: MeasureMetrics | undefined, key: keyof MeasureMetrics) { return (metrics?.[key] as number | null | undefined) ?? 0; }
function valuesByCurrency(values: Record<string, number> | undefined) {
  const entries = Object.entries(values ?? {});
  return entries.length ? entries.map(([currency, cents]) => `${currency} ${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100)}`).join(" · ") : "No credited value";
}

export default function Measure() {
  const { user } = useAuth();
  const impersonating = Boolean(impersonationInfo(user));
  const accessQuery = trpc.dashboard.access.useQuery(undefined, { retry: false });
  const access = accessQuery.data;
  const allowed = Boolean(access?.isActive && (access.role === "super_admin" || access.isLeader) && !impersonating);
  const initialRange = useMemo(defaultDateRange, []);
  const [staffId, setStaffId] = useState("");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [bucket, setBucket] = useState<MeasureBucket>("day");
  const [threshold, setThreshold] = useState(40);
  const [thresholdDraft, setThresholdDraft] = useState("40");
  const [saveError, setSaveError] = useState<string | null>(null);
  const rangeError = useMemo(() => dateRangeError(fromDate, toDate), [fromDate, toDate]);
  const saving = useRef(false);

  const staffQuery = measureTrpc.staff.useQuery(undefined, { enabled: allowed, retry: false, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const settingsQuery = measureTrpc.settings.useQuery(undefined, { enabled: allowed, retry: false, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const staff = (staffQuery.data ?? []) as MeasureStaff[];
  const selectedStaffId = staffId || (staff[0] ? String(staff[0].id) : "");
  const reportInput = useMemo(() => ({ staffId: Number(selectedStaffId), fromDate, toDate, bucket }), [selectedStaffId, fromDate, toDate, bucket]);
  const reportEnabled = allowed && Boolean(selectedStaffId) && !rangeError;
  const reportQuery = measureTrpc.report.useQuery(reportInput, { enabled: reportEnabled, retry: false, refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const saveSettings = measureTrpc.saveSettings.useMutation();

  useEffect(() => { if (!staffId && staff[0]) setStaffId(String(staff[0].id)); }, [staff, staffId]);
  useEffect(() => {
    if (typeof settingsQuery.data?.inactivityMinutes === "number") {
      setThreshold(settingsQuery.data.inactivityMinutes);
      setThresholdDraft(String(settingsQuery.data.inactivityMinutes));
    }
  }, [settingsQuery.data?.inactivityMinutes]);

  if (accessQuery.isLoading) return <PageLoading />;
  if (!allowed) return <Unavailable impersonating={impersonating} />;
  if (staffQuery.error || settingsQuery.error) return <LoadError message={displayError(staffQuery.error ?? settingsQuery.error, "Unable to load Measure access data.")} onRetry={() => { void staffQuery.refetch(); void settingsQuery.refetch(); }} />;

  const selectedStaff = staff.find(member => String(member.id) === selectedStaffId);
  const report = !reportEnabled || accessQuery.error || reportQuery.isFetching || reportQuery.error ? undefined : reportQuery.data;
  const metrics = report?.totals ?? EMPTY_METRICS;
  const refresh = async () => { await Promise.all([settingsQuery.refetch(), reportEnabled ? reportQuery.refetch() : Promise.resolve()]); };
  const saveThreshold = async () => {
    if (saving.current || saveSettings.isPending) return;
    const value = Number(thresholdDraft);
    if (!Number.isInteger(value) || value < 1 || value > 240) { setSaveError("Enter a whole-number threshold from 1 to 240 minutes."); return; }
    saving.current = true;
    setSaveError(null);
    try { await saveSettings.mutateAsync({ inactivityMinutes: value }); setThreshold(value); await refresh(); }
    catch (error) { setSaveError(displayError(error, "Unable to save the inactivity threshold.")); }
    finally { saving.current = false; }
  };
  const hasNoEvents = Boolean(report && report.totals.logins + report.totals.navigation + report.totals.interactions + report.totals.leadOpens + report.totals.statusChanges + report.totals.contactsLogged + report.totals.emailsSent + report.totals.ordersEntered + report.totals.ordersCredited + report.impersonation.events === 0);

  return <div className="mx-auto max-w-[1500px]">
    <PageHeader eyebrow="Operations intelligence" title="Measure" description="Understand CRM activity and estimated app time without treating these metrics as attendance, payroll, or salary records." actions={<Button variant="outline" className="min-h-11 w-full bg-white sm:w-auto" onClick={() => void refresh()} disabled={reportQuery.isFetching || settingsQuery.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${reportQuery.isFetching || settingsQuery.isFetching ? "animate-spin" : ""}`} />Refresh</Button>} />
    <Card className="mb-5 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-2 md:items-end">
        <div className="min-w-0 space-y-1.5"><Label htmlFor="measure-staff">Staff member</Label><Select value={selectedStaffId} onValueChange={setStaffId}><SelectTrigger id="measure-staff" className="min-h-11 w-full"><SelectValue placeholder="Select staff member">{selectedStaff?.name}</SelectValue></SelectTrigger><SelectContent>{staff.map(member => <SelectItem key={member.id} value={String(member.id)}><span className="block max-w-[min(70vw,28rem)] whitespace-normal break-words">{member.name}{member.email ? ` · ${member.email}` : ""}</span></SelectItem>)}</SelectContent></Select>{selectedStaff && <p className="break-words text-xs text-slate-500">{selectedStaff.email || "No email on file"} · {selectedStaff.isActive ? "Active" : "Inactive"}</p>}</div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Grouping"><span className="sr-only">Group report by</span>{BUCKETS.map(option => <button key={option.value} type="button" role="tab" aria-selected={bucket === option.value} onClick={() => setBucket(option.value)} className={`min-h-10 rounded-lg px-2 text-sm font-medium transition-colors ${bucket === option.value ? "bg-white text-teal-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{option.label}</button>)}</div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2"><div className="min-w-0 space-y-1.5"><Label htmlFor="measure-from">From (Eastern)</Label><Input id="measure-from" type="date" className="h-11 w-full min-w-0" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor="measure-to">To (Eastern)</Label><Input id="measure-to" type="date" className="h-11 w-full min-w-0" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} /></div></div>
        <div className="text-xs leading-5 text-slate-500 ">Both dates are included. Reports cover up to 366 Eastern calendar days.</div>
      </div>
      {rangeError && <p role="alert" className="mt-3 text-sm text-rose-700">{rangeError}</p>}
    </CardContent></Card>

    {settingsQuery.data && <SettingsCard value={threshold} draft={thresholdDraft} setDraft={setThresholdDraft} canEdit={access?.role === "super_admin"} pending={saveSettings.isPending} error={saveError} onSave={() => void saveThreshold()} />}
    {reportQuery.error && <LoadError message={displayError(reportQuery.error, "Unable to load this Measure report. Your access may have changed.")} onRetry={() => void reportQuery.refetch()} />}
    {reportQuery.isLoading && <PageLoading />}
    {!reportQuery.isLoading && !reportQuery.error && !report && reportEnabled && <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">Loading the selected snapshot…</div>}
    {report && <>
      <div className="mb-5 flex flex-col gap-2 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950 sm:flex-row sm:items-center sm:justify-between"><span><strong>Data updated through {easternDateTime(report.updatedThrough)} Eastern.</strong> This snapshot is applied only when the complete report is available.</span><span className="text-xs text-teal-800">Generated {easternDateTime(report.generatedAt)}</span></div>
      {!report.timingAvailable && <Notice tone="amber" title="Historical timing is not available" text="Activity counts may include older audit history, but estimated active/idle time and lead-work timing begin only from the tracking start date shown below." />}
      {report.trackingSince && <p className="mb-4 text-xs text-slate-500">New timing and navigation measures are available from {easternDateTime(report.trackingSince)} Eastern. Historical event count in this range: {number(report.historicalEvents)}.</p>}
      {hasNoEvents ? <EmptyState title="No Measure activity in this range" description="Try a wider Eastern date range or select another staff member. No static or placeholder activity is displayed." /> : <>
        <MetricGrid metrics={metrics} />
        <div className="mt-5"><MeasureCharts points={report.points} /></div>
        <ReportTable points={report.points} />
        <div className="mt-5 grid gap-5 xl:grid-cols-2"><InactivePeriods report={report} /><ImpersonationPanel report={report} /></div>
        {report.limitations.length > 0 && <Card className="mt-5 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-base">How to read Measure</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{report.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul></CardContent></Card>}
      </>}
    </>}
  </div>;
}

function MetricGrid({ metrics }: { metrics: MeasureMetrics }) {
  const cards = [
    ["First login", easternDateTime(metrics.firstLoginAt), "Login activity"], ["First activity", easternDateTime(metrics.firstActivityAt), "Any recorded app activity"], ["Last activity", easternDateTime(metrics.lastActivityAt), "Any recorded app activity"],
    ["Lead opens", `${number(metrics.leadOpens)} · ${number(metrics.uniqueLeadsOpened)} unique`, "Lead records opened"], ["Status changes", number(metrics.statusChanges), "Explicit status changes"], ["Contacts logged", number(metrics.contactsLogged), "Manual contact records"],
    ["Phone contacts logged", number(metrics.phoneContactsLogged), "Manual phone contacts; not tel clicks"], ["Successful emails", number(metrics.emailsSent), "Successful outgoing messages"], ["Orders entered", number(metrics.ordersEntered), "Manual orders entered"], ["Orders credited", `${number(metrics.ordersCredited)} · ${valuesByCurrency(metrics.creditedValueByCurrency)}`, "Credited sales value by currency"],
    ["Estimated active time", minutes(metrics.activeMinutes), "Not actual attendance"], ["Estimated idle time", minutes(metrics.inactiveMinutes), "After no app activity"], ["Average lead work", `${minutes(metrics.averageLeadMinutes)} · ${number(metrics.leadWorkSamples)} samples`, "Estimated; sample size shown"],
  ];
  return <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">{cards.map(([label, value, hint]) => <Card key={label} className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="min-w-0 p-4"><p className="break-words text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-2 break-words text-lg font-semibold text-slate-950 [overflow-wrap:anywhere]">{value}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">{hint}</p></CardContent></Card>)}</div>;
}

function ReportTable({ points }: { points: MeasureReport["points"] }) {
  return <Card className="mt-5 min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-base">Report data</CardTitle><p className="text-sm font-normal text-slate-500">Accessible table for the chart values.</p></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">Measure activity, email, and estimated time values by period</caption><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3 font-semibold sm:px-6">Period</th><th className="px-4 py-3 font-semibold">Activities</th><th className="px-4 py-3 font-semibold">Successful emails</th><th className="px-4 py-3 font-semibold">Estimated active</th><th className="px-4 py-3 font-semibold">Estimated idle</th></tr></thead><tbody>{points.map(point => <tr key={point.key} className="border-b border-slate-100 last:border-0"><td className="px-4 py-3 font-medium text-slate-900 sm:px-6">{point.label}</td><td className="px-4 py-3 text-slate-600">{number(point.metrics.navigation + point.metrics.interactions + point.metrics.leadOpens + point.metrics.statusChanges + point.metrics.contactsLogged + point.metrics.ordersEntered)}</td><td className="px-4 py-3 text-slate-600">{number(point.metrics.emailsSent)}</td><td className="px-4 py-3 text-slate-600">{minutes(point.metrics.activeMinutes)}</td><td className="px-4 py-3 text-slate-600">{minutes(point.metrics.inactiveMinutes)}</td></tr>)}</tbody></table></div></CardContent></Card>;
}

function InactivePeriods({ report }: { report: MeasureReport }) {
  const periods = report.inactivePeriods.slice(0, 100);
  return <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-base">Inactive periods</CardTitle><p className="text-sm font-normal text-slate-500">Estimated gaps after {report.inactivityMinutes} minutes without app activity.</p></CardHeader><CardContent>{periods.length ? <div className="space-y-2">{periods.map(period => <div key={`${period.from}-${period.to}`} className="flex min-w-0 flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-medium text-slate-800">{easternDateTime(period.from)} – {easternDateTime(period.to)}</p><p className="text-xs text-slate-500">{period.endedByActivity ? "Ended with activity" : "Bounded by snapshot or session expiry"}</p></div><Badge variant="outline" className="w-fit shrink-0 bg-white">{number(Math.round(period.minutes))} min</Badge></div>)}{report.inactivePeriodsTotal > 100 && <p className="pt-2 text-xs text-slate-500">Showing the first 100 inactive periods of {number(report.inactivePeriodsTotal)} total.</p>}</div> : <p className="text-sm text-slate-500">No estimated inactive periods in this range.</p>}</CardContent></Card>;
}

function ImpersonationPanel({ report }: { report: MeasureReport }) {
  return <Card className="min-w-0 rounded-2xl border-0 bg-slate-950 text-white shadow-sm"><CardHeader><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-300" /><CardTitle className="text-base text-white">Impersonation activity</CardTitle></div><p className="text-sm font-normal text-slate-400">Separate from the staff member’s own workspace activity.</p></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[["Events", report.impersonation.events], ["Lead opens", report.impersonation.leadOpens], ["Status changes", report.impersonation.statusChanges], ["Emails", report.impersonation.emailsSent], ["Orders", report.impersonation.ordersEntered]].map(([label, value]) => <div key={label} className="rounded-xl bg-white/10 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold">{number(Number(value))}</p></div>)}</div></CardContent></Card>;
}

function SettingsCard({ value, draft, setDraft, canEdit, pending, error, onSave }: { value: number; draft: string; setDraft: (value: string) => void; canEdit: boolean; pending: boolean; error: string | null; onSave: () => void }) {
  return <Card className="mb-5 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5"><div className="min-w-0"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-teal-700" /><h2 className="font-semibold text-slate-950">Global inactivity threshold</h2><Badge variant="outline">{canEdit ? "Super Admin" : "Read-only"}</Badge></div><p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-500">After this many minutes with no app activity, Measure estimates idle time. Opens, clicks, navigation, and actions reset the threshold even without a status change. This is not attendance or salary tracking.</p>{error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}</div><div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-end"><div className="space-y-1.5"><Label htmlFor="measure-threshold">Minutes (1–240)</Label><Input id="measure-threshold" type="number" min={1} max={240} step={1} value={draft} disabled={!canEdit || pending} onChange={event => setDraft(event.target.value)} className="h-11 w-full sm:w-32" /></div>{canEdit && <Button className="h-11 bg-teal-700 hover:bg-teal-800" onClick={onSave} disabled={pending}><Save className="mr-2 h-4 w-4" />{pending ? "Saving…" : "Save"}</Button>}{!canEdit && <span className="pb-2 text-xs text-slate-500">Current: {value} min</span>}</div></CardContent></Card>;
}

function Notice({ tone, title, text }: { tone: "amber" | "blue"; title: string; text: string }) { return <div className={`mb-4 flex min-w-0 gap-3 rounded-xl border px-4 py-3 text-sm ${tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-sky-200 bg-sky-50 text-sky-950"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0"><strong>{title}</strong><p className="mt-1 break-words leading-6">{text}</p></div></div>; }
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div role="alert" className="mb-5 flex min-w-0 flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"><span className="break-words">{message}</span><Button variant="outline" className="min-h-10 w-full shrink-0 border-rose-200 bg-white sm:w-auto" onClick={onRetry}>Retry</Button></div>; }
function Unavailable({ impersonating }: { impersonating: boolean }) { return <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600"><UserRound className="h-5 w-5" /></div><h1 className="mt-5 text-2xl font-semibold text-slate-950">Measure is unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">{impersonating ? "Measure is disabled while impersonating another workspace." : "Measure is available only to active Leaders and Super Admins."}</p></div>; }
