import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { diagnosisCategoryLabel, formatDate, initials, stateLabel } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowRight, BellRing, CalendarClock, Check, CheckCircle2, Clock3, Mail } from "lucide-react";
import { useState } from "react";
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
      });
      await onCompleted();
      toast.success(nextFollowUp ? "Follow-up completed and the next reminder was scheduled." : "Follow-up completed and removed from active reminders.");
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
          This logs the completed contact and removes the current reminder from Upcoming and Overdue. Add a new date only when another follow-up is needed.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2">
        <div className="space-y-2"><Label>Contact method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="in_person">In person</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Next follow-up (optional)</Label><Input type="datetime-local" value={nextFollowUp} onChange={event => setNextFollowUp(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Outcome *</Label><Input value={outcome} onChange={event => setOutcome(event.target.value)} placeholder="Reached the lead and discussed next steps" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder="Optional details from the conversation" /></div>
      </div>
      <div className="rounded-xl bg-teal-50 p-3 text-sm leading-6 text-teal-950">{nextFollowUp ? "The current reminder will be completed and replaced with the new date." : "No new date selected: the current reminder will be completed and disappear from active and overdue follow-ups."}</div>
      <DialogFooter><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={save} disabled={complete.isPending || !outcome.trim()} className="bg-teal-700 hover:bg-teal-800">{complete.isPending ? "Completing…" : "Complete follow-up"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default function FollowUps() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [selectedLead, setSelectedLead] = useState<FollowUpLead | null>(null);
  const { data, isLoading, error } = trpc.dashboard.followUps.useQuery();
  const { data: notifications = [] } = trpc.dashboard.notifications.useQuery();
  const { data: automationStatus } = trpc.dashboard.reminderAutomationStatus.useQuery();
  const { data: access } = trpc.dashboard.access.useQuery();
  const markRead = trpc.dashboard.markNotificationRead.useMutation({ onSuccess: () => utils.dashboard.notifications.invalidate() });
  const now = Date.now();
  if (isLoading) return <PageLoading />;
  const overdue = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt < now) ?? [];
  const upcoming = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt >= now) ?? [];
  const dueNotifications = notifications.filter(item => item.remindAt <= now && !item.readAt);

  async function refreshAfterCompletion() {
    await Promise.all([
      utils.dashboard.followUps.invalidate(),
      utils.dashboard.notifications.invalidate(),
      utils.dashboard.summary.invalidate(),
      utils.leads.invalidate(),
    ]);
  }

  const Group = ({ title, items, overdue = false }: { title: string; items: typeof upcoming; overdue?: boolean }) => <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div className="flex items-center gap-3">{overdue ? <Clock3 className="h-5 w-5 text-rose-600" /> : <CalendarClock className="h-5 w-5 text-teal-700" />}<h2 className="font-semibold">{title}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{items.length}</span></div>{!items.length ? <div className="p-6"><EmptyState title={overdue ? "Nothing overdue" : "No upcoming follow-ups"} description={overdue ? "You are caught up with scheduled conversations." : "Follow-up dates appear here after a communication is logged."} /></div> : <div className="divide-y divide-slate-100">{items.map(lead => <div key={lead.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center"><button onClick={() => navigate(`/leads/${lead.id}`)} className="flex min-w-0 flex-1 items-center gap-4 text-left transition-opacity hover:opacity-75"><Avatar className="h-10 w-10"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className={overdue ? "font-medium text-rose-600" : "text-slate-500"}>{formatDate(lead.nextFollowUpAt, true)}</span><span className="text-slate-300">·</span><span className="text-indigo-600">{stateLabel(lead.stateCode)}</span><span className="text-slate-300">·</span><span className="text-rose-600">{diagnosisCategoryLabel(lead.diagnosisCategory)}</span></div></div><StatusPill value={lead.status} /><ArrowRight className="h-4 w-4 text-slate-300" /></button>{access?.permissions.manageContacts && <Button size="sm" variant={overdue ? "default" : "outline"} className={overdue ? "bg-teal-700 hover:bg-teal-800" : "bg-white"} onClick={() => setSelectedLead(lead as FollowUpLead)}><Check className="mr-2 h-4 w-4" />Complete</Button>}</div>)}</div>}</CardContent></Card>;

  return <div className="mx-auto max-w-[1200px]">
    <PageHeader eyebrow="Personal contact planning" title="Your follow-ups and reminders" description="Only follow-ups for leads you can access appear here. Complete a performed follow-up to remove it, or schedule the next reminder in the same step." actions={<Button onClick={() => navigate("/leads")} variant="outline"><CheckCircle2 className="mr-2 h-4 w-4" />View accessible leads</Button>} />
    <div className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-sm leading-6 text-teal-950"><strong>Workflow:</strong> When you have called, emailed, or met the lead, select <strong>Complete</strong>. CareFlow records the contact in Communications and Audit trail. Leave the next date blank to remove the reminder, or select a new date to reschedule it.</div>
    {automationStatus && (!automationStatus.emailConfigured || !automationStatus.scheduleConfigured) && <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold">Email reminder automation is not fully activated</p><p className="mt-1 leading-6">In-app follow-ups are working. Before automatic emails can be sent, the Super Admin must connect the email sender and activate the scheduled processor after deployment.</p></div></div>}
    {dueNotifications.length > 0 && <Card className="mb-6 overflow-hidden rounded-2xl border-0 bg-slate-950 text-white shadow-[0_12px_40px_rgba(15,23,42,.15)]"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-800 px-6 py-5"><div className="flex items-center gap-3"><BellRing className="h-5 w-5 text-amber-300" /><div><h2 className="font-semibold">Two-hour notifications</h2><p className="mt-1 text-xs text-slate-400">Appointments requiring your attention now</p></div></div><Badge className="bg-amber-300 text-slate-950 hover:bg-amber-300">{dueNotifications.length} unread</Badge></div><div className="divide-y divide-slate-800">{dueNotifications.map(item => <div key={item.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center"><button onClick={() => navigate(`/leads/${item.leadId}`)} className="min-w-0 flex-1 text-left"><p className="font-semibold">{item.firstName} {item.lastName}</p><p className="mt-1 text-sm text-slate-400">Scheduled {formatDate(item.scheduledFor, true)} · {stateLabel(item.stateCode)} · {diagnosisCategoryLabel(item.diagnosisCategory)}</p><p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Mail className="h-3.5 w-3.5" />Staff email: {item.staffEmailStatus} · Lead email: {item.leadEmailStatus}</p></button><Button size="sm" variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" onClick={async () => { try { await markRead.mutateAsync({ id: item.id }); toast.success("Notification marked as read."); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to mark notification."); } }}><Check className="mr-2 h-4 w-4" />Mark read</Button></div>)}</div></CardContent></Card>}
    {error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div> : <div className="grid gap-6 lg:grid-cols-2"><Group title="Overdue" items={overdue} overdue /><Group title="Upcoming" items={upcoming} /></div>}
    <CompleteFollowUpDialog lead={selectedLead} onClose={() => setSelectedLead(null)} onCompleted={refreshAfterCompletion} />
  </div>;
}
