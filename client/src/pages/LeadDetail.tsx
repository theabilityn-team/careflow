import { PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { INTEREST_OPTIONS, STATUS_OPTIONS, formatDate, initials } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarClock, FileImage, GitCompareArrows, History, LockKeyhole, Mail, MapPin, MessageSquarePlus, Pencil, Phone, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const utils = trpc.useUtils();
  const { data: access } = trpc.dashboard.access.useQuery();
  const { data, isLoading, error } = trpc.leads.get.useQuery({ id }, { enabled: Number.isFinite(id) });
  const { data: assignees = [] } = trpc.leads.assignees.useQuery(undefined, { enabled: Boolean(access?.permissions.viewLeads) });
  const update = trpc.leads.update.useMutation({ onSuccess: () => utils.leads.get.invalidate({ id }) });
  const addContact = trpc.leads.addCommunication.useMutation({ onSuccess: () => { utils.leads.get.invalidate({ id }); utils.dashboard.invalidate(); } });
  if (isLoading) return <PageLoading />;
  if (error || !data) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-700">{error?.message ?? "Lead not found."}</div>;
  const lead = data.lead;

  async function changeField(field: "status" | "interestLevel", value: string) {
    try { await update.mutateAsync({ id, lead: { [field]: value } as any }); toast.success("Lead updated."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Unable to update the lead."); }
  }

  let additional: Array<{ label: string; value: string }> = [];
  try { additional = lead.additionalInformation ? JSON.parse(lead.additionalInformation) : []; } catch { additional = []; }
  const contactRows = [
    { icon: Mail, value: lead.email, label: "Email" },
    { icon: Phone, value: lead.phone, label: "Phone" },
    { icon: MapPin, value: [lead.address, lead.city, lead.stateProvince, lead.postalCode, lead.country].filter(Boolean).join(", "), label: "Address" },
    { icon: CalendarClock, value: lead.dateOfBirth, label: "Date of birth" },
  ];

  return <div className="mx-auto max-w-[1380px]">
    <button onClick={() => navigate("/leads")} className="mb-5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to leads</button>
    <PageHeader eyebrow={`Lead #${lead.id}`} title={`${lead.firstName} ${lead.lastName}`} description={`Created ${formatDate(lead.createdAt)} · Last updated ${formatDate(lead.updatedAt, true)}`} actions={<>{access?.permissions.editLeads && <EditLeadDialog lead={lead} assignees={assignees} canViewClinical={access.permissions.viewClinical} canChangeStatus={access.permissions.changeStatus} onSave={async values => { await update.mutateAsync({ id, lead: values as any }); toast.success("Profile details saved and audited."); }} />}{access?.permissions.manageContacts && <ContactDialog onSave={async values => { await addContact.mutateAsync({ leadId: id, ...values }); toast.success("Communication logged."); }} />}</>} />

    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p><Select disabled={!access?.permissions.changeStatus} value={lead.status} onValueChange={value => changeField("status", value)}><SelectTrigger className="mt-3 h-10"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Interest</p><Select disabled={!access?.permissions.editLeads} value={lead.interestLevel} onValueChange={value => changeField("interestLevel", value)}><SelectTrigger className="mt-3 h-10"><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last contact</p><p className="mt-4 text-sm font-semibold text-slate-900">{formatDate(lead.lastContactAt, true)}</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-slate-950 text-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next follow-up</p><p className="mt-4 text-sm font-semibold">{formatDate(lead.nextFollowUpAt, true)}</p></CardContent></Card>
    </div>

    <Tabs defaultValue="overview" className="space-y-5"><TabsList className="h-auto min-h-11 flex-wrap justify-start rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger><TabsTrigger value="documents" className="rounded-lg">Documents ({data.documents.length})</TabsTrigger><TabsTrigger value="communications" className="rounded-lg">Communications ({data.communications.length})</TabsTrigger><TabsTrigger value="audit" className="rounded-lg">Audit trail ({data.auditEvents.length})</TabsTrigger></TabsList>
      <TabsContent value="overview" className="mt-0"><div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><CardTitle className="text-lg">Contact information</CardTitle></CardHeader><CardContent className="space-y-5"><div className="flex items-center gap-4"><Avatar className="h-14 w-14"><AvatarFallback className="bg-teal-50 font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div><p className="font-semibold">{lead.firstName} {lead.lastName}</p><StatusPill value={lead.status} /></div></div><Separator />{contactRows.map(row => <div key={row.label} className="flex items-start gap-3"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100"><row.icon className="h-4 w-4 text-slate-500" /></div><div><p className="text-xs font-medium text-slate-400">{row.label}</p><p className="mt-0.5 text-sm text-slate-800">{String(row.value || "Not provided")}</p></div></div>)}</CardContent></Card>
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-rose-600" /><CardTitle className="text-lg">Protected clinical information</CardTitle></div></CardHeader><CardContent className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Diagnosis</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{lead.diagnosis || "No diagnosis recorded or access is restricted."}</p></div><Separator /><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Clinical notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{lead.clinicalNotes || "No clinical notes recorded or access is restricted."}</p></div>{additional.length > 0 && <><Separator /><div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Additional information</p><div className="grid gap-3 sm:grid-cols-2">{additional.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-400">{item.label}</p><p className="mt-1 text-sm text-slate-800">{item.value}</p></div>)}</div></div></>}</CardContent></Card>
      </div></TabsContent>
      <TabsContent value="documents" className="mt-0"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6">{!data.documents.length ? <p className="text-sm text-slate-500">No source documents are attached.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.documents.map(document => <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200"><img src={document.fileUrl} alt={document.fileName} className="h-44 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" /><div className="flex items-center gap-2 p-3"><FileImage className="h-4 w-4 text-teal-700" /><span className="truncate text-sm font-medium">{document.fileName}</span></div></a>)}</div>}</CardContent></Card></TabsContent>
      <TabsContent value="communications" className="mt-0"><TimelineCard title="Communication history" items={data.communications.map(item => ({ id: `c-${item.id}`, title: `${item.method.replace("_", " ")} · ${item.outcome}`, detail: item.notes, date: item.contactedAt }))} /></TabsContent>
      <TabsContent value="audit" className="mt-0"><AuditTrail items={data.auditEvents} assignees={assignees} /></TabsContent>
    </Tabs>
  </div>;
}

function TimelineCard({ title, items }: { title: string; items: Array<{ id: string; title: string; detail?: string | null; date: number }> }) {
  return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent>{!items.length ? <p className="text-sm text-slate-500">No activity recorded yet.</p> : <div className="space-y-0">{items.map((item, index) => <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">{index < items.length - 1 && <div className="absolute left-[7px] top-5 h-[calc(100%-10px)] w-px bg-slate-200" />}<div className="mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-teal-100 bg-teal-700" /><div><p className="text-sm font-semibold capitalize text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-400">{formatDate(item.date, true)}</p>{item.detail && <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>}</div></div>)}</div>}</CardContent></Card>;
}

const auditFieldLabels: Record<string, string> = {
  firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone",
  dateOfBirth: "Date of birth", address: "Street address", city: "City",
  stateProvince: "State / Province", postalCode: "Postal code", country: "Country",
  diagnosis: "Diagnosis", clinicalNotes: "Clinical notes", additionalInformation: "Additional information",
  status: "Status", interestLevel: "Interest level", assignedTo: "Assigned staff",
  lastContactAt: "Last contact", nextFollowUpAt: "Next follow-up",
};

const auditActionLabels: Record<string, string> = {
  "lead.created": "Initial lead state",
  "lead.audit_baseline": "Audit baseline",
  "lead.updated": "Lead profile updated",
  "lead.status_changed": "Status changed",
  "lead.interest_changed": "Interest level changed",
  "communication.logged": "Communication logged",
};

function auditValue(field: string, value: unknown, assignees: Array<{ id: number; name: string | null; email: string | null }>) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (field === "status") return STATUS_OPTIONS.find(([key]) => key === value)?.[1] ?? String(value);
  if (field === "interestLevel") return INTEREST_OPTIONS.find(([key]) => key === value)?.[1] ?? String(value);
  if (field === "assignedTo") return assignees.find(staff => staff.id === Number(value))?.name ?? `Staff #${value}`;
  if (field === "lastContactAt" || field === "nextFollowUpAt") return formatDate(Number(value), true);
  if (field === "additionalInformation") {
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) return parsed.map(item => `${item.label}: ${item.value}`).join(" · ");
    } catch { /* Keep the original value. */ }
  }
  return String(value);
}

function AuditTrail({ items, assignees }: { items: any[]; assignees: Array<{ id: number; name: string | null; email: string | null }> }) {
  return <Card className="rounded-2xl border-0 bg-white shadow-sm">
    <CardHeader className="border-b border-slate-100"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><GitCompareArrows className="h-5 w-5" /></div><div><CardTitle className="text-lg">Lead state audit</CardTitle><p className="mt-1 text-sm text-slate-500">Immutable history of the initial record and every subsequent field change.</p></div></div></CardHeader>
    <CardContent className="p-0">{!items.length ? <div className="p-6 text-sm text-slate-500">No audit events have been recorded yet.</div> : <div>{items.map((item, index) => {
      const isBaseline = item.action === "lead.audit_baseline";
      const isLegacyCreation = item.action === "lead.created" && item.changes.length === 0;
      const fieldOrder = Object.keys(auditFieldLabels);
      const baselineEntries = isBaseline ? Object.entries(item.snapshotAfter ?? {}).filter(([, value]) => value !== null && value !== "").sort(([a], [b]) => fieldOrder.indexOf(a) - fieldOrder.indexOf(b)) : [];
      return <div key={item.id} className={`p-6 ${index < items.length - 1 ? "border-b border-slate-100" : ""}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{isLegacyCreation ? "Original creation event" : auditActionLabels[item.action] ?? item.action.replaceAll(".", " ")}</p><Badge variant="outline" className="rounded-full font-normal capitalize">{item.source === "migration" ? "Audit upgrade" : item.source.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-xs text-slate-400">{item.actorName || item.actorEmail || `Staff #${item.actorId}`} · {formatDate(item.occurredAt, true)}</p>{item.detail && <p className="mt-2 text-sm text-slate-600">{item.detail}</p>}</div><Badge className="w-fit rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{isBaseline ? "Current-state baseline" : isLegacyCreation ? "Legacy event" : `${item.changes.length} ${item.changes.length === 1 ? "change" : "changes"}`}</Badge></div>
        {baselineEntries.length > 0 && <div className="mt-5"><p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-slate-400">State when detailed auditing began</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{baselineEntries.map(([field, value]) => <div key={`${item.id}-${field}`} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{auditFieldLabels[field] ?? field}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900">{auditValue(field, value, assignees)}</p></div>)}</div></div>}
        {item.changes.length > 0 && <div className="mt-5 grid gap-3 xl:grid-cols-2">{item.changes.map((change: any) => <div key={`${item.id}-${change.field}`} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{auditFieldLabels[change.field] ?? change.field}</p><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start"><div><p className="text-[11px] font-medium uppercase tracking-wider text-rose-500">Before</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{auditValue(change.field, change.before, assignees)}</p></div><div className="hidden pt-6 text-slate-300 sm:block">→</div><div><p className="text-[11px] font-medium uppercase tracking-wider text-teal-600">After</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-900">{auditValue(change.field, change.after, assignees)}</p></div></div></div>)}</div>}
      </div>;
    })}</div>}</CardContent>
  </Card>;
}

function ContactDialog({ onSave }: { onSave: (values: any) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [method, setMethod] = useState("phone"); const [direction, setDirection] = useState("outbound"); const [outcome, setOutcome] = useState(""); const [notes, setNotes] = useState(""); const [followUp, setFollowUp] = useState(""); const [saving, setSaving] = useState(false);
  async function save() { if (!outcome.trim()) return toast.error("Add an outcome."); setSaving(true); try { await onSave({ method, direction, outcome, notes: notes || null, contactedAt: Date.now(), nextFollowUpAt: followUp ? new Date(followUp).getTime() : null }); setOpen(false); setOutcome(""); setNotes(""); setFollowUp(""); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-teal-700 hover:bg-teal-800"><MessageSquarePlus className="mr-2 h-4 w-4" />Log contact</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Log communication</DialogTitle><DialogDescription>Record the conversation, outcome, and next promised action.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2"><Label>Method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["phone", "email", "sms", "in_person", "other"].map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Direction</Label><Select value={direction} onValueChange={setDirection}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outbound">Outbound</SelectItem><SelectItem value="inbound">Inbound</SelectItem></SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label>Outcome *</Label><Input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Interested — requested product details" /></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} /></div><div className="space-y-2 sm:col-span-2"><Label>Next follow-up</Label><Input type="datetime-local" value={followUp} onChange={e => setFollowUp(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save communication</Button></DialogFooter></DialogContent></Dialog>;
}

function dateTimeInputValue(value: number | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function additionalInfoText(value: string | null | undefined) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(item => `${item.label}: ${item.value}`).join("\n");
  } catch { /* Keep the stored text. */ }
  return value;
}

function serializeAdditionalInfo(value: string) {
  const rows = value.split("\n").map(row => row.trim()).filter(Boolean).map(row => {
    const separator = row.indexOf(":");
    return separator > 0
      ? { label: row.slice(0, separator).trim(), value: row.slice(separator + 1).trim() }
      : { label: "Note", value: row };
  });
  return rows.length ? JSON.stringify(rows) : null;
}

function buildLeadForm(lead: any) {
  return {
    firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", email: lead.email ?? "",
    phone: lead.phone ?? "", dateOfBirth: lead.dateOfBirth ?? "", address: lead.address ?? "",
    city: lead.city ?? "", stateProvince: lead.stateProvince ?? "", postalCode: lead.postalCode ?? "",
    country: lead.country ?? "", status: lead.status ?? "new", interestLevel: lead.interestLevel ?? "unknown",
    assignedTo: lead.assignedTo ? String(lead.assignedTo) : "unassigned",
    nextFollowUpAt: dateTimeInputValue(lead.nextFollowUpAt), diagnosis: lead.diagnosis ?? "",
    clinicalNotes: lead.clinicalNotes ?? "", additionalInformation: additionalInfoText(lead.additionalInformation),
  };
}

function EditLeadDialog({ lead, assignees, canViewClinical, canChangeStatus, onSave }: {
  lead: any;
  assignees: Array<{ id: number; name: string | null; email: string | null; jobTitle: string | null }>;
  canViewClinical: boolean;
  canChangeStatus: boolean;
  onSave: (values: any) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildLeadForm(lead));
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const setDialogOpen = (value: boolean) => { if (value) setForm(buildLeadForm(lead)); setOpen(value); };
  async function save() {
    setSaving(true);
    try {
      const values: Record<string, unknown> = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() || null,
        phone: form.phone.trim() || null, dateOfBirth: form.dateOfBirth.trim() || null,
        address: form.address.trim() || null, city: form.city.trim() || null,
        stateProvince: form.stateProvince.trim() || null, postalCode: form.postalCode.trim() || null,
        country: form.country.trim() || null, interestLevel: form.interestLevel,
        assignedTo: form.assignedTo === "unassigned" ? null : Number(form.assignedTo),
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).getTime() : null,
      };
      if (canChangeStatus) values.status = form.status;
      if (canViewClinical) {
        values.diagnosis = form.diagnosis.trim() || null;
        values.clinicalNotes = form.clinicalNotes.trim() || null;
        values.additionalInformation = serializeAdditionalInfo(form.additionalInformation);
      }
      await onSave(values);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save changes.");
    } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={setDialogOpen}><DialogTrigger asChild><Button variant="outline"><Pencil className="mr-2 h-4 w-4" />Edit lead</Button></DialogTrigger><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Edit lead</DialogTitle><DialogDescription>Update permitted fields. Every actual change is stored in the immutable audit trail.</DialogDescription></DialogHeader><div className="space-y-6 py-2"><section><p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Pipeline and ownership</p><div className="grid gap-4 sm:grid-cols-2">{canChangeStatus && <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={value => set("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><Label>Interest level</Label><Select value={form.interestLevel} onValueChange={value => set("interestLevel", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Assigned staff</Label><Select value={form.assignedTo} onValueChange={value => set("assignedTo", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{assignees.map(staff => <SelectItem key={staff.id} value={String(staff.id)}>{staff.name || staff.email || `Staff #${staff.id}`}{staff.jobTitle ? ` · ${staff.jobTitle}` : ""}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Next follow-up</Label><Input type="datetime-local" value={form.nextFollowUpAt} onChange={e => set("nextFollowUpAt", e.target.value)} /></div></div></section><Separator /><section><p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-teal-700">Contact and identity</p><div className="grid gap-4 sm:grid-cols-2">{[["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"], ["phone", "Phone"], ["dateOfBirth", "Date of birth"], ["address", "Street address"], ["city", "City"], ["stateProvince", "State / Province"], ["postalCode", "Postal code"], ["country", "Country"]].map(([key, label]) => <div key={key} className={`space-y-2 ${key === "address" ? "sm:col-span-2" : ""}`}><Label>{label}</Label><Input value={(form as any)[key]} onChange={e => set(key, e.target.value)} /></div>)}</div></section>{canViewClinical && <><Separator /><section><div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-rose-600" /><p className="text-xs font-semibold uppercase tracking-[.16em] text-rose-700">Protected clinical information</p></div><div className="grid gap-4"><div className="space-y-2"><Label>Diagnosis</Label><Textarea value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} rows={3} /></div><div className="space-y-2"><Label>Clinical notes</Label><Textarea value={form.clinicalNotes} onChange={e => set("clinicalNotes", e.target.value)} rows={4} /></div><div className="space-y-2"><Label>Additional information</Label><Textarea value={form.additionalInformation} onChange={e => set("additionalInformation", e.target.value)} rows={5} placeholder={"Insurance: Example Health\nReferral source: Clinic\nPreferred contact time: Morning"} /><p className="text-xs text-slate-400">Enter one item per line as Label: Value.</p></div></div></section></>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>{saving ? "Saving…" : "Save audited changes"}</Button></DialogFooter></DialogContent></Dialog>;
}
