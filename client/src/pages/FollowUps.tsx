import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { diagnosisCategoryLabel, formatDate, initials, stateLabel } from "@/lib/crm";
import { archivePeriodStart, calendarRangeForMonth, countFollowUpsByDay, localDayKey, type ArchivePeriod } from "@/lib/followUpViews";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowRight, BellRing, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, History, Mail, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type FollowUpLead = {
  id: number;
  firstName: string;
  lastName: string;
  nextFollowUpAt: number | null;
  stateCode: string | null;
  diagnosisCategory: string | null;
  status: string;
};

const METHOD_OPTIONS = [
  ["phone", "Phone"],
  ["email", "Email"],
  ["sms", "SMS"],
  ["in_person", "In person"],
  ["other", "Other"],
] as const;

const methodLabel = (value: string) => METHOD_OPTIONS.find(([key]) => key === value)?.[1] ?? value;

function CompleteFollowUpDialog({ lead, onClose, onCompleted }: {
  lead: FollowUpLead | null;
  onClose: () => void;
  onCompleted: () => Promise<void>;
}) {
  const [method, setMethod] = useState("phone");
  const [outcome, setOutcome] = useState("Follow-up completed");
  const [notes, setNotes] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const complete = trpc.leads.addCommunication.useMutation();

  function close() {
    setMethod("phone");
    setOutcome("Follow-up completed");
    setNotes("");
    setNextFollowUp("");
    onClose();
  }

  async function save() {
    if (!lead || !outcome.trim()) return toast.error("Add the contact outcome.");
    try {
      await complete.mutateAsync({
        leadId: lead.id,
        method: method as "phone" | "email" | "sms" | "in_person" | "other",
        direction: "outbound",
        outcome: outcome.trim(),
        notes: notes.trim() || null,
        contactedAt: Date.now(),
        nextFollowUpAt: nextFollowUp ? new Date(nextFollowUp).getTime() : null,
        clearFollowUp: !nextFollowUp,
        completeFollowUp: true,
      });
      await onCompleted();
      toast.success(nextFollowUp ? "Follow-up archived and the next reminder was scheduled." : "Follow-up completed, archived, and removed from active reminders.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete the follow-up.");
    }
  }

  return <Dialog open={Boolean(lead)} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Complete follow-up</DialogTitle>
        <DialogDescription>
          This records the performed contact in Communications, Audit trail, and the completed Follow-up archive. Add a new date only when another follow-up is needed.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <div className="space-y-2"><Label>Contact method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{METHOD_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Next follow-up (optional)</Label><Input type="datetime-local" value={nextFollowUp} onChange={event => setNextFollowUp(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Outcome *</Label><Input value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Reached the lead and discussed next steps" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder="Optional details from the conversation" /></div>
      </div>
      <div className="rounded-xl bg-teal-50 p-3 text-sm leading-6 text-teal-950">{nextFollowUp ? "The current reminder will move to the archive and be replaced with the new date." : "No new date selected: the current reminder will move to the archive and disappear from active and overdue follow-ups."}</div>
      <DialogFooter><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={complete.isPending || !outcome.trim()} className="bg-teal-700 hover:bg-teal-800">{complete.isPending ? "Completing…" : "Complete follow-up"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function FollowUpRow({ lead, overdue, canComplete, onOpen, onComplete }: {
  lead: FollowUpLead;
  overdue?: boolean;
  canComplete: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  return <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center">
    <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left transition-opacity hover:opacity-75">
      <Avatar className="h-10 w-10"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={overdue ? "font-medium text-rose-600" : "text-slate-500"}>{formatDate(lead.nextFollowUpAt, true)}</span><span className="text-slate-300">·</span><span className="text-indigo-600">{stateLabel(lead.stateCode)}</span><span className="text-slate-300">·</span><span className="text-rose-600">{diagnosisCategoryLabel(lead.diagnosisCategory)}</span></div></div>
      <StatusPill value={lead.status} /><ArrowRight className="h-4 w-4 text-slate-300" />
    </button>
    {canComplete && <Button size="sm" variant={overdue ? "default" : "outline"} className={overdue ? "bg-teal-700 hover:bg-teal-800" : "bg-white"} onClick={onComplete}><Check className="mr-2 h-4 w-4" />Complete</Button>}
  </div>;
}

export default function FollowUps() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("queue");
  const [selectedLead, setSelectedLead] = useState<FollowUpLead | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());
  const [archiveSearch, setArchiveSearch] = useState("");
  const deferredArchiveSearch = useDeferredValue(archiveSearch.trim());
  const [archiveMethod, setArchiveMethod] = useState("all");
  const [archivePeriod, setArchivePeriod] = useState<ArchivePeriod>("all");
  const [archivePage, setArchivePage] = useState(1);
  const archivePageSize = 20;

  const { data, isLoading, error } = trpc.dashboard.followUps.useQuery();
  const { data: notifications = [] } = trpc.dashboard.notifications.useQuery();
  const { data: automationStatus } = trpc.dashboard.reminderAutomationStatus.useQuery();
  const { data: access } = trpc.dashboard.access.useQuery();
  const calendarInput = useMemo(() => calendarRangeForMonth(calendarMonth), [calendarMonth]);
  const { data: calendarItems = [], isLoading: calendarLoading } = trpc.dashboard.followUpCalendar.useQuery(calendarInput, { enabled: tab === "calendar" });
  const archiveInput = useMemo(() => ({
    search: deferredArchiveSearch || undefined,
    method: archiveMethod === "all" ? undefined : archiveMethod as "phone" | "email" | "sms" | "in_person" | "other",
    completedFrom: archivePeriodStart(archivePeriod),
    page: archivePage,
    pageSize: archivePageSize,
  }), [deferredArchiveSearch, archiveMethod, archivePeriod, archivePage]);
  const { data: archive, isLoading: archiveLoading, isFetching: archiveFetching, error: archiveError } = trpc.dashboard.followUpArchive.useQuery(archiveInput, { enabled: tab === "archive", placeholderData: previous => previous });
  const markRead = trpc.dashboard.markNotificationRead.useMutation({ onSuccess: () => utils.dashboard.notifications.invalidate() });
  const now = Date.now();
  const overdue = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt < now) ?? [];
  const upcoming = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt >= now) ?? [];
  const dueNotifications = notifications.filter(item => item.remindAt <= now && !item.readAt);
  const countsByDay = useMemo(() => countFollowUpsByDay(calendarItems), [calendarItems]);
  const eventDates = useMemo(() => calendarItems.filter(item => item.nextFollowUpAt).map(item => new Date(item.nextFollowUpAt!)), [calendarItems]);
  const selectedKey = selectedDate ? localDayKey(selectedDate) : "";
  const selectedItems = calendarItems.filter(item => item.nextFollowUpAt && localDayKey(item.nextFollowUpAt) === selectedKey);

  useEffect(() => setArchivePage(1), [deferredArchiveSearch, archiveMethod, archivePeriod]);

  async function refreshAfterCompletion() {
    await Promise.all([
      utils.dashboard.followUps.invalidate(),
      utils.dashboard.followUpCalendar.invalidate(),
      utils.dashboard.followUpArchive.invalidate(),
      utils.dashboard.notifications.invalidate(),
      utils.dashboard.summary.invalidate(),
      utils.leads.invalidate(),
    ]);
  }

  const Group = ({ title, items, overdue = false }: { title: string; items: typeof upcoming; overdue?: boolean }) => <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div className="flex items-center gap-3">{overdue ? <Clock3 className="h-5 w-5 text-rose-600" /> : <CalendarClock className="h-5 w-5 text-teal-700" />}<h2 className="font-semibold">{title}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{items.length}</span></div>{!items.length ? <div className="p-6"><EmptyState title={overdue ? "Nothing overdue" : "No upcoming follow-ups"} description={overdue ? "You are caught up with scheduled conversations." : "Follow-up dates appear here after a communication is logged."} /></div> : <div className="divide-y divide-slate-100">{items.map(lead => <FollowUpRow key={lead.id} lead={lead as FollowUpLead} overdue={overdue} canComplete={Boolean(access?.permissions.manageContacts)} onOpen={() => navigate(`/leads/${lead.id}`)} onComplete={() => setSelectedLead(lead as FollowUpLead)} />)}</div>}</CardContent></Card>;

  if (isLoading) return <PageLoading />;

  return <div className="mx-auto max-w-[1280px]">
    <PageHeader eyebrow="Personal contact planning" title="Your follow-ups and reminders" description="Plan active reminders in a queue or calendar, then review every completed follow-up in the permanent archive." actions={<Button onClick={() => navigate("/leads")} variant="outline"><CheckCircle2 className="mr-2 h-4 w-4" />View accessible leads</Button>} />
    <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-sm leading-6 text-teal-950"><strong>Workflow:</strong> Select <strong>Complete</strong> after the call, email, or meeting. CareFlow logs the contact and moves the original reminder into Archive. Leave the next date blank to close it, or select a new date to schedule another follow-up.</div>
    {automationStatus && (!automationStatus.emailConfigured || !automationStatus.scheduleConfigured) && <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-start"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div className="flex-1"><p className="font-semibold">Email reminder automation is not fully activated</p><p className="mt-1 leading-6">{automationStatus.scope === "staff" ? "In-app reminders are working. Connect and verify your personal SMTP mailbox so emails for your assigned leads are sent from your address." : `${automationStatus.configuredStaff} of ${automationStatus.totalStaff} active staff SMTP accounts are verified. Each staff member must configure their own sender.`}{!automationStatus.scheduleConfigured ? " The scheduled reminder processor must also be activated after deployment." : ""}</p></div>{automationStatus.scope === "staff" && <Button size="sm" variant="outline" className="bg-white" onClick={() => navigate("/email-settings")}>Open Email settings</Button>}</div>}
    {dueNotifications.length > 0 && <Card className="mb-6 overflow-hidden rounded-2xl border-0 bg-slate-950 text-white shadow-[0_12px_40px_rgba(15,23,42,.15)]"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-800 px-6 py-5"><div className="flex items-center gap-3"><BellRing className="h-5 w-5 text-amber-300" /><div><h2 className="font-semibold">Two-hour notifications</h2><p className="mt-1 text-xs text-slate-400">Appointments requiring your attention now</p></div></div><Badge className="bg-amber-300 text-slate-950 hover:bg-amber-300">{dueNotifications.length} unread</Badge></div><div className="divide-y divide-slate-800">{dueNotifications.map(item => <div key={item.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center"><button onClick={() => navigate(`/leads/${item.leadId}`)} className="min-w-0 flex-1 text-left"><p className="font-semibold">{item.firstName} {item.lastName}</p><p className="mt-1 text-sm text-slate-400">Scheduled {formatDate(item.scheduledFor, true)} · {stateLabel(item.stateCode)} · {diagnosisCategoryLabel(item.diagnosisCategory)}</p><p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" />Staff email: {item.staffEmailStatus} · Lead email: {item.leadEmailStatus}</p></button><Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" onClick={async () => { try { await markRead.mutateAsync({ id: item.id }); toast.success("Notification marked as read."); } catch (markError) { toast.error(markError instanceof Error ? markError.message : "Unable to mark notification."); } }}><Check className="mr-2 h-4 w-4" />Mark read</Button></div>)}</div></CardContent></Card>}

    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <TabsList className="h-11 w-full justify-start rounded-xl bg-white p-1 shadow-sm sm:w-fit"><TabsTrigger value="queue" className="px-4"><Clock3 />Queue</TabsTrigger><TabsTrigger value="calendar" className="px-4"><CalendarClock />Calendar</TabsTrigger><TabsTrigger value="archive" className="px-4"><History />Archive</TabsTrigger></TabsList>

      <TabsContent value="queue" className="mt-0">
        {error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div> : <div className="grid gap-6 lg:grid-cols-2"><Group title="Overdue" items={overdue} overdue /><Group title="Upcoming" items={upcoming} /></div>}
      </TabsContent>

      <TabsContent value="calendar" className="mt-0">
        <div className="grid gap-6 lg:grid-cols-[430px_1fr]">
          <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><div className="mb-4"><p className="font-semibold text-slate-950">Follow-up calendar</p><p className="mt-1 text-sm text-slate-500">Dates with reminders are highlighted. Select a date to see its schedule.</p></div><Calendar mode="single" month={calendarMonth} onMonthChange={month => { setCalendarMonth(month); setSelectedDate(month); }} selected={selectedDate} onSelect={setSelectedDate} modifiers={{ hasFollowUps: eventDates }} modifiersClassNames={{ hasFollowUps: "font-bold ring-2 ring-teal-500/30 bg-teal-50" }} className="mx-auto w-full [--cell-size:--spacing(11)]" /></CardContent></Card>
          <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-0"><div className="border-b border-slate-100 px-6 py-5"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-slate-950">{selectedDate ? selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Select a date"}</p><p className="mt-1 text-sm text-slate-500">{selectedDate ? `${countsByDay[selectedKey] ?? 0} scheduled follow-up${countsByDay[selectedKey] === 1 ? "" : "s"}` : "Choose a highlighted calendar day."}</p></div>{calendarLoading && <span className="text-xs text-slate-400">Loading…</span>}</div></div>{calendarLoading ? <div className="p-6"><PageLoading /></div> : !selectedItems.length ? <div className="p-6"><EmptyState title="No follow-ups on this date" description="Select another highlighted day or schedule a reminder from a lead profile." /></div> : <div className="divide-y divide-slate-100">{selectedItems.map(lead => <FollowUpRow key={lead.id} lead={lead as FollowUpLead} overdue={Boolean(lead.nextFollowUpAt && lead.nextFollowUpAt < now)} canComplete={Boolean(access?.permissions.manageContacts)} onOpen={() => navigate(`/leads/${lead.id}`)} onComplete={() => setSelectedLead(lead as FollowUpLead)} />)}</div>}</CardContent></Card>
        </div>
      </TabsContent>

      <TabsContent value="archive" className="mt-0">
        <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-0">
          <div className="border-b border-slate-100 p-5"><div className="flex flex-col gap-3 lg:flex-row"><div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={archiveSearch} onChange={event => setArchiveSearch(event.target.value)} className="h-11 pl-10" placeholder="Search lead, outcome, or notes…" /></div><Select value={archiveMethod} onValueChange={setArchiveMethod}><SelectTrigger className="h-11 w-full lg:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All methods</SelectItem>{METHOD_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={archivePeriod} onValueChange={value => setArchivePeriod(value as ArchivePeriod)}><SelectTrigger className="h-11 w-full lg:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All completion dates</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="365">Last 12 months</SelectItem></SelectContent></Select></div><div className="mt-4 flex items-center justify-between text-sm text-slate-500"><p><strong className="text-slate-800">{archive?.total ?? 0}</strong> completed follow-up{archive?.total === 1 ? "" : "s"}</p>{archiveFetching && !archiveLoading && <span>Updating…</span>}</div></div>
          {archiveLoading ? <div className="p-6"><PageLoading /></div> : archiveError ? <div className="m-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{archiveError.message}</div> : !archive?.items.length ? <div className="p-6"><EmptyState title="No completed follow-ups" description="Completed reminders will appear here with their original schedule, result, staff member, and any next reminder." /></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="pl-6">Lead</TableHead><TableHead>Original schedule</TableHead><TableHead>Completed</TableHead><TableHead>Result</TableHead><TableHead>Completed by</TableHead><TableHead>Next reminder</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{archive.items.map(item => <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/leads/${item.leadId}`)}><TableCell className="py-4 pl-6"><div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(item.firstName, item.lastName)}</AvatarFallback></Avatar><div><p className="font-semibold text-slate-900">{item.firstName} {item.lastName}</p><p className="mt-1 text-xs text-slate-400">{stateLabel(item.stateCode)} · {diagnosisCategoryLabel(item.diagnosisCategory)}</p></div></div></TableCell><TableCell><p className="text-sm text-slate-700">{formatDate(item.scheduledFor, true)}</p></TableCell><TableCell><p className="text-sm font-medium text-slate-900">{formatDate(item.completedAt, true)}</p></TableCell><TableCell><div className="max-w-64"><div className="flex items-center gap-2"><Badge variant="outline">{methodLabel(item.method)}</Badge><span className="truncate text-sm font-medium text-slate-800">{item.outcome}</span></div>{item.notes && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{item.notes}</p>}</div></TableCell><TableCell><span className="text-sm text-slate-700">{item.completedByName || (item.completedBy < 0 ? "Super Administrator" : `Staff #${item.completedBy}`)}</span></TableCell><TableCell><span className="text-sm text-slate-600">{item.nextFollowUpAt ? formatDate(item.nextFollowUpAt, true) : "Closed"}</span></TableCell><TableCell><ChevronRight className="h-4 w-4 text-slate-300" /></TableCell></TableRow>)}</TableBody></Table></div>}
          {archive && archive.total > 0 && <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Page {archive.page} of {archive.totalPages}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={archive.page <= 1} onClick={() => setArchivePage(page => Math.max(1, page - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={archive.page >= archive.totalPages} onClick={() => setArchivePage(page => Math.min(archive.totalPages, page + 1))}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>}
        </CardContent></Card>
      </TabsContent>
    </Tabs>
    <CompleteFollowUpDialog lead={selectedLead} onClose={() => setSelectedLead(null)} onCompleted={refreshAfterCompletion} />
  </div>;
}
