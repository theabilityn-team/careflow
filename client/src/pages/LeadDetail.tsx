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
import { ArrowLeft, CalendarClock, FileImage, History, LockKeyhole, Mail, MapPin, MessageSquarePlus, Pencil, Phone, UserRound } from "lucide-react";
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
    <PageHeader eyebrow={`Lead #${lead.id}`} title={`${lead.firstName} ${lead.lastName}`} description={`Created ${formatDate(lead.createdAt)} · Last updated ${formatDate(lead.updatedAt, true)}`} actions={<>{access?.permissions.editLeads && <EditLeadDialog lead={lead} canViewClinical={access.permissions.viewClinical} onSave={async values => { await update.mutateAsync({ id, lead: values as any }); toast.success("Profile details saved."); }} />}{access?.permissions.manageContacts && <ContactDialog onSave={async values => { await addContact.mutateAsync({ leadId: id, ...values }); toast.success("Communication logged."); }} />}</>} />

    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Status</p><Select disabled={!access?.permissions.changeStatus} value={lead.status} onValueChange={value => changeField("status", value)}><SelectTrigger className="mt-3 h-10"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Interest</p><Select disabled={!access?.permissions.editLeads} value={lead.interestLevel} onValueChange={value => changeField("interestLevel", value)}><SelectTrigger className="mt-3 h-10"><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last contact</p><p className="mt-4 text-sm font-semibold text-slate-900">{formatDate(lead.lastContactAt, true)}</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-slate-950 text-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Next follow-up</p><p className="mt-4 text-sm font-semibold">{formatDate(lead.nextFollowUpAt, true)}</p></CardContent></Card>
    </div>

    <Tabs defaultValue="overview" className="space-y-5"><TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger><TabsTrigger value="documents" className="rounded-lg">Documents ({data.documents.length})</TabsTrigger><TabsTrigger value="timeline" className="rounded-lg">Timeline ({data.communications.length + data.auditEvents.length})</TabsTrigger></TabsList>
      <TabsContent value="overview" className="mt-0"><div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><CardTitle className="text-lg">Contact information</CardTitle></CardHeader><CardContent className="space-y-5"><div className="flex items-center gap-4"><Avatar className="h-14 w-14"><AvatarFallback className="bg-teal-50 font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div><p className="font-semibold">{lead.firstName} {lead.lastName}</p><StatusPill value={lead.status} /></div></div><Separator />{contactRows.map(row => <div key={row.label} className="flex items-start gap-3"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100"><row.icon className="h-4 w-4 text-slate-500" /></div><div><p className="text-xs font-medium text-slate-400">{row.label}</p><p className="mt-0.5 text-sm text-slate-800">{String(row.value || "Not provided")}</p></div></div>)}</CardContent></Card>
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-rose-600" /><CardTitle className="text-lg">Protected clinical information</CardTitle></div></CardHeader><CardContent className="space-y-6"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Diagnosis</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{lead.diagnosis || "No diagnosis recorded or access is restricted."}</p></div><Separator /><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Clinical notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{lead.clinicalNotes || "No clinical notes recorded or access is restricted."}</p></div>{additional.length > 0 && <><Separator /><div><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Additional information</p><div className="grid gap-3 sm:grid-cols-2">{additional.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-400">{item.label}</p><p className="mt-1 text-sm text-slate-800">{item.value}</p></div>)}</div></div></>}</CardContent></Card>
      </div></TabsContent>
      <TabsContent value="documents" className="mt-0"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6">{!data.documents.length ? <p className="text-sm text-slate-500">No source documents are attached.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{data.documents.map(document => <a key={document.id} href={document.fileUrl} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200"><img src={document.fileUrl} alt={document.fileName} className="h-44 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" /><div className="flex items-center gap-2 p-3"><FileImage className="h-4 w-4 text-teal-700" /><span className="truncate text-sm font-medium">{document.fileName}</span></div></a>)}</div>}</CardContent></Card></TabsContent>
      <TabsContent value="timeline" className="mt-0"><div className="grid gap-6 lg:grid-cols-2"><TimelineCard title="Communication history" items={data.communications.map(item => ({ id: `c-${item.id}`, title: `${item.method.replace("_", " ")} · ${item.outcome}`, detail: item.notes, date: item.contactedAt }))} /><TimelineCard title="Audit history" items={data.auditEvents.map(item => ({ id: `a-${item.id}`, title: item.action.replaceAll(".", " "), detail: item.detail, date: item.occurredAt }))} /></div></TabsContent>
    </Tabs>
  </div>;
}

function TimelineCard({ title, items }: { title: string; items: Array<{ id: string; title: string; detail?: string | null; date: number }> }) {
  return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader><CardContent>{!items.length ? <p className="text-sm text-slate-500">No activity recorded yet.</p> : <div className="space-y-0">{items.map((item, index) => <div key={item.id} className="relative flex gap-4 pb-6 last:pb-0">{index < items.length - 1 && <div className="absolute left-[7px] top-5 h-[calc(100%-10px)] w-px bg-slate-200" />}<div className="mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-teal-100 bg-teal-700" /><div><p className="text-sm font-semibold capitalize text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-400">{formatDate(item.date, true)}</p>{item.detail && <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>}</div></div>)}</div>}</CardContent></Card>;
}

function ContactDialog({ onSave }: { onSave: (values: any) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [method, setMethod] = useState("phone"); const [direction, setDirection] = useState("outbound"); const [outcome, setOutcome] = useState(""); const [notes, setNotes] = useState(""); const [followUp, setFollowUp] = useState(""); const [saving, setSaving] = useState(false);
  async function save() { if (!outcome.trim()) return toast.error("Add an outcome."); setSaving(true); try { await onSave({ method, direction, outcome, notes: notes || null, contactedAt: Date.now(), nextFollowUpAt: followUp ? new Date(followUp).getTime() : null }); setOpen(false); setOutcome(""); setNotes(""); setFollowUp(""); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-teal-700 hover:bg-teal-800"><MessageSquarePlus className="mr-2 h-4 w-4" />Log contact</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Log communication</DialogTitle><DialogDescription>Record the conversation, outcome, and next promised action.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2"><Label>Method</Label><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["phone", "email", "sms", "in_person", "other"].map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Direction</Label><Select value={direction} onValueChange={setDirection}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="outbound">Outbound</SelectItem><SelectItem value="inbound">Inbound</SelectItem></SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label>Outcome *</Label><Input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="Interested — requested product details" /></div><div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} /></div><div className="space-y-2 sm:col-span-2"><Label>Next follow-up</Label><Input type="datetime-local" value={followUp} onChange={e => setFollowUp(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save communication</Button></DialogFooter></DialogContent></Dialog>;
}

function EditLeadDialog({ lead, canViewClinical, onSave }: { lead: any; canViewClinical: boolean; onSave: (values: any) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [form, setForm] = useState({ firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", email: lead.email ?? "", phone: lead.phone ?? "", dateOfBirth: lead.dateOfBirth ?? "", address: lead.address ?? "", city: lead.city ?? "", stateProvince: lead.stateProvince ?? "", postalCode: lead.postalCode ?? "", country: lead.country ?? "", diagnosis: lead.diagnosis ?? "", clinicalNotes: lead.clinicalNotes ?? "" }); const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  async function save() { setSaving(true); try { const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value || null])); if (!canViewClinical) { delete values.diagnosis; delete values.clinicalNotes; } await onSave(values); setOpen(false); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to save changes."); } finally { setSaving(false); } }
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><Pencil className="mr-2 h-4 w-4" />Edit profile</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit lead profile</DialogTitle><DialogDescription>Correct verified information while preserving the audit history.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2">{[["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"], ["phone", "Phone"], ["dateOfBirth", "Date of birth"], ["address", "Street address"], ["city", "City"], ["stateProvince", "State / Province"], ["postalCode", "Postal code"], ["country", "Country"]].map(([key, label]) => <div key={key} className={`space-y-2 ${key === "address" ? "sm:col-span-2" : ""}`}><Label>{label}</Label><Input value={(form as any)[key]} onChange={e => set(key, e.target.value)} /></div>)}{canViewClinical && <><div className="space-y-2 sm:col-span-2"><Label>Diagnosis</Label><Textarea value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} rows={3} /></div><div className="space-y-2 sm:col-span-2"><Label>Clinical notes</Label><Textarea value={form.clinicalNotes} onChange={e => set("clinicalNotes", e.target.value)} rows={4} /></div></>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>Save changes</Button></DialogFooter></DialogContent></Dialog>;
}
