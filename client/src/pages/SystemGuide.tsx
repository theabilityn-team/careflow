import { PageHeader, StatusPill } from "@/components/crm/CrmUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { STATUS_DESCRIPTIONS, STATUS_OPTIONS } from "@/lib/crm";
import { ArrowRight, BellRing, CheckCircle2, ClipboardCheck, Download, FileHeart, Files, FileSearch, FolderKanban, History, KeyRound, Library, Mail, MessageSquarePlus, ScanLine, ServerCog, ShieldCheck, UserCog } from "lucide-react";
import { useLocation } from "wouter";

const flows = [
  {
    number: "01", icon: ScanLine, title: "Add a lead from document images", action: "Open Add lead", path: "/scan",
    steps: ["Upload up to six images for one person, including referral orders, referral forms, and Hospital Facesheets. Native iPhone HEIC/HEIF photos and originals up to 25 MB are accepted at full resolution.", "JPG, PNG, and WebP images are scanned with their original bytes; HEIC/HEIF is decoded to a full-quality JPEG only because OCR cannot read the Apple container directly.", "AI classifies explicit referrals separately, detects standard and extended Hospital Facesheet layouts, and labels every other non-referral image as Regular.", "Authorized staff reviews and corrects every field.", "First name, last name, and date of birth are required for the mandatory patient duplicate check.", "Confirm state, diagnosis group, lead language, initial Status, and Interest level, then save."],
    result: "One lead owned by its creator is created, automatically added to that creator's most recently created group when one exists, all source images are attached, and the complete reviewed state is written to the Audit trail.",
  },
  {
    number: "02", icon: Files, title: "Bulk import multiple leads from images", action: "Open Bulk image import", path: "/bulk-import",
    steps: ["Create one image group for each person.", "Attach one to six JPG, PNG, WebP, HEIC, or HEIF images belonging to that person; never mix people inside one image group.", "Process all image groups at full OCR quality. CareFlow extracts each person separately.", "Confirm first name, last name, date of birth, document type, diagnosis group, state, and lead language for each lead.", "Approve and import. Existing and in-batch name + date-of-birth duplicates are blocked."],
    result: "Multiple reviewed leads are created from one operation, automatically added to the creator's most recently created group when one exists, with every source image attached to the correct person and a separate audit trail for each lead.",
  },
  {
    number: "03", icon: FileSearch, title: "Duplicate protection before saving", action: "Open Bulk image import", path: "/bulk-import",
    steps: ["Upload images and review the extracted draft.", "CareFlow requires and normalizes first name, last name, and date of birth.", "It also checks normalized email and phone as additional duplicate signals.", "Confirm the lead only after the patient identity is correct.", "If any identity matches an existing lead, creation is blocked and the existing Lead number is shown when you have access."],
    result: "The same patient cannot be silently inserted twice. The database enforces the same identity keys even if two users save at the same moment; bulk import also checks duplicates between groups in the current batch.",
  },
  {
    number: "04", icon: MessageSquarePlus, title: "Record a call, email, SMS, or meeting", action: "Open Leads", path: "/leads",
    steps: ["Open a lead and select Log contact.", "Choose method and direction, then write the outcome and optional notes.", "Optionally schedule the next follow-up date.", "Save the communication."],
    result: "Most recent contact and Communication history are updated. A new reminder is scheduled only when a date is entered. Status is never changed automatically.",
  },
  {
    number: "05", icon: ClipboardCheck, title: "Plan and complete follow-ups", action: "Open Follow-ups", path: "/follow-ups",
    steps: ["A reminder is created from Log contact or Edit lead.", "Upcoming reminders appear in Upcoming; passed dates appear in Overdue.", "After calling, emailing, or meeting the lead, select Complete beside the reminder.", "Record the contact outcome and notes.", "Leave the next date blank to remove the reminder, or select a new date to complete and reschedule it."],
    result: "Completion is written to Communications and Audit trail. The completed reminder disappears from Upcoming and Overdue unless a new date is scheduled. Status and Interest do not change automatically.",
  },
  {
    number: "06", icon: History, title: "Change status and preserve history", action: "Open Leads", path: "/leads",
    steps: ["Open a lead.", "Change Business Status or Interest Signal from its own top control.", "Watch the control-specific Saving indicator, then review the new item in Recent pipeline changes.", "Use the always-visible Status and Interest filters on Leads to find matching records."],
    result: "Business Status and Interest Signal are saved independently. Changing one never resets the other, and each change retains before/after audit values.",
  },
  {
    number: "07", icon: KeyRound, title: "Recover a staff password", action: "Open staff sign-in", path: "/",
    steps: ["Select Forgot password on the staff sign-in screen and submit the staff email.", "The Super Admin reviews the request under Staff & access → Password resets.", "The Super Admin generates and privately shares a one-time reset link.", "The staff member opens the link, creates a new password, and is signed in automatically.", "The link expires after one hour and cannot be reused."],
    result: "Passwords are never sent or displayed. Existing staff sessions are revoked when the reset is completed.",
  },
  {
    number: "08", icon: FolderKanban, title: "Organize and share lead access", action: "Open Lead groups", path: "/groups",
    steps: ["A staff member creates a private lead group.", "From an accessible lead, use Groups & sharing to add it to a group you manage.", "The group owner may share the entire group with another active staff member.", "The lead creator may also share one lead directly without sharing a group.", "Open Lead groups to review group membership and current access."],
    result: "Staff see only leads they created, leads assigned to them, directly shared leads, or leads inside a shared group. Super Admin can see and manage everything.",
  },
  {
    number: "09", icon: BellRing, title: "Plan, complete, and archive follow-ups", action: "Open Follow-ups", path: "/follow-ups",
    steps: ["Set a Scheduled follow-up from Log contact or Edit lead.", "Select English or Spanish on the lead record; this is the lead's reminder language, not a staff preference.", "Use Queue for overdue and upcoming work, or Calendar to select a day and review its schedule.", "Two hours before the appointment, an unread in-app notification appears. CareFlow uses the responsible staff or Super Admin verified SMTP account: the internal email is always English and the lead email uses that lead's selected language.", "After the call, email, or meeting, select Complete and record the method, outcome, notes, and optional next reminder.", "Use Archive to search and filter completed follow-ups while preserving the original scheduled time, completion time, staff actor, result, and reschedule decision."],
    result: "Active reminders remain actionable, emails come from the responsible account, and every completed follow-up becomes a permanent, permission-scoped history record without changing Business Status or Interest Signal.",
  },
  {
    number: "10", icon: FileHeart, title: "Review a medical referral document", action: "Open Add lead", path: "/scan",
    steps: ["Upload the referral order or form as an image; multiple pages for the same patient may be uploaded together.", "CareFlow identifies the patient and keeps referring and receiving provider details separate.", "Review insurance, authorization, referral reason, priority, visit count, appointment instructions, ICD codes, and CPT / HCPCS codes.", "Confirm the suggested Oncology or Hematology group and the patient state.", "Save only after checking the extracted values against the source document."],
    result: "The patient becomes the lead; referral, insurance, provider, authorization, and coding details appear in structured protected sections. Social Security numbers are never extracted or stored.",
  },
  {
    number: "11", icon: ServerCog, title: "Manage SMTP mailboxes", action: "Open Email settings", path: "/email-settings",
    steps: ["Super Admin opens Email settings and selects Super Admin or a technical staff account.", "Enter the SMTP host, port, TLS mode, username, password, sender email, and sender name supplied by that mailbox provider.", "Enable automatic sending, save the settings, then test the connection.", "For Send test email, enter the recipient address and select an active product template; CareFlow never substitutes a fixed default message.", "Technical staff can open Email settings to see only their assigned sender email, whether it is active and verified, and run the two test actions.", "Staff cannot view or edit SMTP host, username, password, sender identity, or reply-to settings.", "If required, Super Admin may update the same values directly in the staff_smtp_settings database table."],
    result: "Super Admin centrally manages every SMTP profile, including the administrator mailbox. Follow-up emails use the responsible account's sender, while saved passwords are never returned by the API or shown in the UI.",
  },
  {
    number: "12", icon: Mail, title: "Send email to an accessible lead", action: "Open Mails", path: "/mails",
    steps: ["Open Mails and select a lead that has an email address; staff can choose only leads they are permitted to access.", "Optionally select an active product and an approved Super Admin plain-text or HTML template.", "Review and personalize the filled subject and message. HTML templates can be previewed or edited as source before sending.", "CareFlow sanitizes HTML again, replaces optional lead and sender tokens, and wraps the message with that account's saved HTML header and footer.", "Send through the logged-in user's active, verified SMTP account.", "Review successful and failed attempts under Sent history; successful sends are also recorded in the lead's Communication history.", "To read replies or any received email, sign in directly to the assigned email mailbox."],
    result: "Staff can send tracked outbound email from approved reusable drafts without seeing SMTP credentials. Sent history preserves the selected product and template names even if the library changes later. CareFlow does not act as an inbox.",
  },
  {
    number: "13", icon: Library, title: "Manage product email templates", action: "Open Email templates", path: "/email-templates",
    steps: ["Super Admin creates a product category with an internal description and sort order.", "Add a plain-text template or choose HTML design and attach an .html/.htm file up to 250 KB.", "Review the HTML source and sandboxed preview. On save, CareFlow removes scripts, forms, event handlers, embedded objects, and unsupported markup.", "Use personalization tokens for the lead and sender when useful.", "Keep a product or template active while staff should see it in Compose.", "Archive outdated products or templates to remove them from staff selection without changing historical sent-email records."],
    result: "Only Super Admin can manage the central library. Staff with Manage communications permission can apply active plain-text or HTML templates, preview and edit the draft, then send the sanitized result.",
  },
  {
    number: "14", icon: FileHeart, title: "Review a Hospital Facesheet", action: "Open Add lead", path: "/scan",
    steps: ["Upload the Hospital Facesheet image; standard legacy and extended multi-insurance layouts are supported.", "CareFlow identifies the patient and keeps the patient's phone, address, and email separate from next of kin, emergency contact, guarantor, provider, insurer, and facility values.", "Review encounter dates, account number, room / bed, demographics, contacts, primary and secondary insurance, care team, visit reason, diagnoses, procedures, and ICD codes.", "Check every warning for handwritten, unclear, cut-off, placeholder, or screen-photographed values.", "Confirm the document layout, patient identity, state, and diagnosis group before saving."],
    result: "The lead is saved with Hospital Facesheet — standard layout or Hospital Facesheet — extended layout, structured protected information, and attached source images. Social Security numbers and mother's maiden names are never extracted or stored.",
  },
];

export default function SystemGuide() {
  const [, navigate] = useLocation();
  return <div className="mx-auto max-w-[1380px]">
    <PageHeader eyebrow="CareFlow operating model" title="System guide" description="A single source of truth for lead ownership, image intake, supported medical document types, five states including Oregon, sharing, statuses, follow-up calendars, and archives." />

    <div className="mb-8 grid gap-4 md:grid-cols-3">
      <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-6"><ShieldCheck className="h-5 w-5 text-teal-300" /><p className="mt-5 font-semibold">Rule 1 — Human confirmation</p><p className="mt-2 text-sm leading-6 text-slate-400">AI extraction creates only a draft. A lead record exists only after an authorized person reviews and confirms it.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><CheckCircle2 className="h-5 w-5 text-teal-700" /><p className="mt-5 font-semibold">Rule 2 — Explicit status</p><p className="mt-2 text-sm leading-6 text-slate-500">Status changes only from the Status control, Edit lead, or the initial status selected during image review. Communication does not change it.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><FileSearch className="h-5 w-5 text-teal-700" /><p className="mt-5 font-semibold">Rule 3 — No silent duplicates</p><p className="mt-2 text-sm leading-6 text-slate-500">Every image-created lead requires first name, last name, and date of birth. That identity, email, and phone are checked before saving and enforced by unique database keys.</p></CardContent></Card>
    </div>

    <div className="space-y-5">{flows.map(flow => <Card key={flow.number} className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.04)]"><CardContent className="p-6 sm:p-7"><div className="flex flex-col gap-5 lg:flex-row lg:items-start"><div className="flex min-w-72 items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><flow.icon className="h-5 w-5" /></div><div><p className="text-xs font-semibold tracking-[.16em] text-teal-700">FLOW {flow.number}</p><h2 className="mt-1 text-lg font-semibold text-slate-950">{flow.title}</h2><Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(flow.path)}>{flow.action}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></div></div><div className="grid flex-1 gap-5 md:grid-cols-[1fr_.8fr]"><ol className="space-y-3">{flow.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{index + 1}</span>{step}</li>)}</ol><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-emerald-700">Result</p><p className="mt-2 text-sm leading-6 text-emerald-900">{flow.result}</p></div></div></div></CardContent></Card>)}</div>

    <Card className="mt-8 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Lead status dictionary</CardTitle><p className="text-sm leading-6 text-slate-500">Status answers one question: <strong>What business stage is this lead in now?</strong> It does not represent the follow-up reminder date.</p></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{STATUS_OPTIONS.map(([value, label]) => <div key={value} className="rounded-xl border border-slate-100 p-4"><div className="flex items-center justify-between gap-3"><StatusPill value={value} /><Badge variant="outline" className="font-mono text-[10px] text-slate-400">{value}</Badge></div><p className="mt-3 text-sm leading-6 text-slate-600">{STATUS_DESCRIPTIONS[value]}</p></div>)}</div></CardContent></Card>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex items-center gap-2"><UserCog className="h-5 w-5 text-teal-700" /><CardTitle>People and permissions</CardTitle></div></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Super Administrator:</strong> creates staff invitations, activates accounts, assigns each permission, reviews password reset requests, manages every SMTP profile including the Super Admin sender, and can rotate the private administrator password.</p><p><strong className="text-slate-900">Technical staff:</strong> sees only leads created by that staff member, assigned to them, shared directly, or included in a shared group. Under Email settings, staff can see only their assigned email and activation/verification status, then test the connection or send a test message.</p><p><strong className="text-slate-900">Local login:</strong> staff signs in with email and password; Super Admin uses the private Super Admin login. Password reset links are one-time and expire after one hour.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex items-center gap-2"><Download className="h-5 w-5 text-teal-700" /><CardTitle>Audit and export</CardTitle></div></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-slate-600"><p><strong className="text-slate-900">Audit trail:</strong> records the actor, time, source, and before/after values for every lead state change.</p><p><strong className="text-slate-900">Export:</strong> filters by one or more statuses and creates CSV, Excel, or PDF with basic lead information only.</p><p><strong className="text-slate-900">Privacy:</strong> clinical fields and source documents are excluded from exports and hidden from staff without clinical access.</p></CardContent></Card>
    </div>

    <Separator className="my-8" />
    <div className="flex flex-col justify-between gap-4 rounded-2xl bg-teal-50 p-6 sm:flex-row sm:items-center"><div><p className="font-semibold text-slate-900">Recommended daily workflow</p><p className="mt-1 text-sm text-slate-600">Check Follow-ups → log outcomes → change Status only when the business stage changes → review the Audit trail when context is needed.</p></div><Button onClick={() => navigate("/follow-ups")} className="bg-teal-700 hover:bg-teal-800">Open Follow-ups<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
  </div>;
}
