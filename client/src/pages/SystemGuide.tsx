import { PageHeader, StatusPill } from "@/components/crm/CrmUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { STATUS_DESCRIPTIONS, STATUS_OPTIONS } from "@/lib/crm";
import { ArrowRight, CheckCircle2, ClipboardCheck, Download, Files, FileSearch, History, MessageSquarePlus, ScanLine, ShieldCheck, UserCog } from "lucide-react";
import { useLocation } from "wouter";

const flows = [
  {
    number: "01", icon: ScanLine, title: "Add a lead from document images", action: "Open Add lead", path: "/scan",
    steps: ["Upload up to six images for one person.", "AI extracts visible personal and clinical information into a draft.", "Authorized staff reviews and corrects every field.", "Choose the initial Status and Interest level explicitly.", "Confirm creation. Duplicate protection runs before the record is saved."],
    result: "One lead is created, all source images are attached, and the initial reviewed state is written to the Audit trail.",
  },
  {
    number: "02", icon: Files, title: "Bulk import multiple leads from images", action: "Open Bulk image import", path: "/bulk-import",
    steps: ["Create one lead group for each person.", "Attach one to six images belonging to that person; never mix people inside one group.", "Process all groups. CareFlow extracts each group separately and sequentially.", "Review every field and explicitly approve each lead.", "Select Check duplicates and import. Unique approved groups are created; existing and in-batch duplicates are blocked."],
    result: "Multiple reviewed leads are created from one operation, with every source image attached to the correct person and a separate audit trail for each lead.",
  },
  {
    number: "03", icon: FileSearch, title: "Duplicate protection before saving", action: "Open Bulk image import", path: "/bulk-import",
    steps: ["Upload images and review the extracted draft.", "CareFlow normalizes email and phone values before comparison.", "It also creates a strong profile identity from name + date of birth, or name + address + postal code.", "Confirm the lead only after the reviewed identity is correct.", "If any identity matches an existing lead, creation is blocked and the existing Lead number is shown."],
    result: "The same person is not silently inserted twice. Bulk import checks both existing records and duplicates between groups in the current batch.",
  },
  {
    number: "04", icon: MessageSquarePlus, title: "Record a call, email, SMS, or meeting", action: "Open Leads", path: "/leads",
    steps: ["Open a lead and select Log contact.", "Choose method and direction, then write the outcome and optional notes.", "Optionally schedule the next follow-up date.", "Save the communication."],
    result: "Most recent contact and Communication history are updated. A new reminder is scheduled only when a date is entered. Status is never changed automatically.",
  },
  {
    number: "05", icon: ClipboardCheck, title: "Plan and complete follow-ups", action: "Open Follow-ups", path: "/follow-ups",
    steps: ["A reminder is created from Log contact or Edit lead.", "Upcoming reminders appear in Upcoming; passed dates appear in Overdue.", "Open the lead, perform the contact, and log the result.", "Set a new reminder if another action is needed, or clear it from Edit lead."],
    result: "The queue is driven only by Scheduled follow-up dates, not by Status.",
  },
  {
    number: "06", icon: History, title: "Change status and preserve history", action: "Open Leads", path: "/leads",
    steps: ["Open a lead.", "Change Status from the top Status control or Edit lead.", "Choose the stage that reflects the current business reality.", "The change is saved immediately with before/after values."],
    result: "Status changes only when an authorized person changes it. Scanning, logging contact, and scheduling reminders do not silently overwrite it.",
  },
];

export default function SystemGuide() {
  const [, navigate] = useLocation();
  return <div className="mx-auto max-w-[1380px]">
    <PageHeader eyebrow="CareFlow operating model" title="System guide" description="A single source of truth for how leads enter the system, move through statuses, receive follow-ups, and stay protected from duplicates." />

    <div className="mb-8 grid gap-4 md:grid-cols-3">
      <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-6"><ShieldCheck className="h-5 w-5 text-teal-300" /><p className="mt-5 font-semibold">Rule 1 — Human confirmation</p><p className="mt-2 text-sm leading-6 text-slate-400">AI extraction creates only a draft. A lead record exists only after an authorized person reviews and confirms it.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><CheckCircle2 className="h-5 w-5 text-teal-700" /><p className="mt-5 font-semibold">Rule 2 — Explicit status</p><p className="mt-2 text-sm leading-6 text-slate-500">Status changes only from the Status control, Edit lead, or the initial status selected during image review. Communication does not change it.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><FileSearch className="h-5 w-5 text-teal-700" /><p className="mt-5 font-semibold">Rule 3 — No silent duplicates</p><p className="mt-2 text-sm leading-6 text-slate-500">Email, phone, and strong profile identity are checked before every create and identity update. Matching records are blocked.</p></CardContent></Card>
    </div>

    <div className="space-y-5">{flows.map(flow => <Card key={flow.number} className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.04)]"><CardContent className="p-6 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-start"><div className="flex min-w-72 items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><flow.icon className="h-5 w-5" /></div><div><p className="text-xs font-semibold tracking-[.16em] text-teal-700">FLOW {flow.number}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{flow.title}</h2><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(flow.path)}>{flow.action}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></div></div><div className="grid flex-1 gap-5 md:grid-cols-[1fr_.8fr]"><ol className="space-y-3">{flow.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{index + 1}</span>{step}</li>)}</ol><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-emerald-700">Result</p><p className="mt-2 text-sm leading-6 text-emerald-900">{flow.result}</p></div></div></div></CardContent></Card>)}</div>

    <Card className="mt-8 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Lead status dictionary</CardTitle><p className="text-sm leading-6 text-slate-500">Status answers one question: <strong>What business stage is this lead in now?</strong> It does not represent the follow-up reminder date.</p></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{STATUS_OPTIONS.map(([value, label]) => <div key={value} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between gap-3"><StatusPill value={value} /><Badge variant="outline" className="font-mono text-[10px] text-slate-400">{value}</Badge></div><p className="mt-3 text-sm leading-6 text-slate-600">{STATUS_DESCRIPTIONS[value]}</p></div>)}</div></CardContent></Card>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex items-center gap-2"><UserCog className="h-5 w-5 text-teal-700" /><CardTitle>People and permissions</CardTitle></div></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Super Administrator:</strong> creates staff invitations, activates accounts, and assigns each permission separately.</p><p><strong className="text-slate-900">Technical staff:</strong> sees only actions granted to that account. Export, clinical data, adding leads from images, status changes, and contact logging are independently controlled.</p><p><strong className="text-slate-900">Local login:</strong> staff signs in with email and password; Super Admin uses the private Super Admin login.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex items-center gap-2"><Download className="h-5 w-5 text-teal-700" /><CardTitle>Audit and export</CardTitle></div></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Audit trail:</strong> records the actor, time, source, and before/after values for every lead state change.</p><p><strong className="text-slate-900">Export:</strong> filters by one or more statuses and creates CSV, Excel, or PDF with basic lead information only.</p><p><strong className="text-slate-900">Privacy:</strong> clinical fields and source documents are excluded from exports and hidden from staff without clinical access.</p></CardContent></Card>
    </div>

    <Separator className="my-8" />
    <div className="flex flex-col justify-between gap-4 rounded-2xl bg-teal-50 p-6 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-900">Recommended daily workflow</p><p className="mt-1 text-sm text-slate-600">Check Follow-ups → log outcomes → change Status only when the business stage changes → review the Audit trail when context is needed.</p></div><Button onClick={() => navigate("/follow-ups")} className="bg-teal-700 hover:bg-teal-800">Open Follow-ups<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
  </div>;
}
