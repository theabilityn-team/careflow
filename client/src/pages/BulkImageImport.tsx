import { PageHeader, StatusPill } from "@/components/crm/CrmUi";
import { ReferralReview } from "@/components/crm/ReferralReview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIAGNOSIS_CATEGORY_OPTIONS, INTEREST_OPTIONS, STATE_OPTIONS, STATUS_OPTIONS } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { inferSupportedStateCode } from "@shared/leadClassification";
import { buildReferralAdditionalInformation, EMPTY_REFERRAL_DATA, isReferralDocument, type ReferralData } from "@shared/referralDocuments";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, FileImage, Files, FolderPlus, Loader2, RotateCcw, ScanLine, Trash2, UploadCloud, UsersRound, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const MAX_GROUPS = 10;
const MAX_FILES_PER_GROUP = 6;
const MAX_TOTAL_FILES = 20;

type UploadFile = { name: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataUrl: string; size: number };
type ExtraField = { section: string; label: string; value: string; confidence: number };
type Extraction = {
  firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; sex: string; medicalRecordNumber: string;
  address: string; city: string; stateProvince: string; stateCode: string; postalCode: string; country: string;
  diagnosis: string; diagnosisCategory: string; clinicalNotes: string; documentCategory: string; referral: ReferralData; documentTypes: string[]; additionalInformation: ExtraField[];
  overallConfidence: number; reviewWarnings: string[];
};
type DuplicateState = { kind: "existing" | "batch"; message: string; leadId?: number } | null;
type GroupState = "idle" | "extracting" | "review" | "checking" | "importing" | "imported" | "error";
type LeadGroup = {
  id: string; files: UploadFile[]; extraction: Extraction | null; status: string; interestLevel: string;
  diagnosisCategory: string; stateCode: string;
  reviewed: boolean; state: GroupState; expanded: boolean; error: string; duplicate: DuplicateState; createdLeadId?: number;
};

const empty: Extraction = { firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", sex: "", medicalRecordNumber: "", address: "", city: "", stateProvince: "", stateCode: "", postalCode: "", country: "", diagnosis: "", diagnosisCategory: "", clinicalNotes: "", documentCategory: "regular", referral: EMPTY_REFERRAL_DATA, documentTypes: [], additionalInformation: [], overallConfidence: 0, reviewWarnings: [] };
const newGroup = (): LeadGroup => ({ id: crypto.randomUUID(), files: [], extraction: null, status: "verified", interestLevel: "unknown", diagnosisCategory: "", stateCode: "", reviewed: false, state: "idle", expanded: true, error: "", duplicate: null });
const readFile = (file: File) => new Promise<UploadFile>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, mimeType: file.type as UploadFile["mimeType"], dataUrl: String(reader.result), size: file.size }); reader.onerror = reject; reader.readAsDataURL(file); });
const hasIdentitySignal = (lead: Extraction) => Boolean(lead.firstName.trim() && lead.lastName.trim() && lead.dateOfBirth.trim());

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label><Input type={type} value={value} onChange={event => onChange(event.target.value)} className="h-10 border-slate-200" /></div>;
}

export default function BulkImageImport() {
  const [, navigate] = useLocation();
  const [groups, setGroups] = useState<LeadGroup[]>([newGroup()]);
  const [running, setRunning] = useState(false);
  const extract = trpc.scanner.extract.useMutation();
  const duplicateCheck = trpc.leads.bulkDuplicateCheck.useMutation();
  const create = trpc.leads.create.useMutation();
  const totalFiles = groups.reduce((sum, group) => sum + group.files.length, 0);
  const processed = groups.filter(group => group.extraction || group.state === "error").length;
  const approved = groups.filter(group => group.extraction && group.reviewed && group.state !== "imported").length;
  const imported = groups.filter(group => group.state === "imported").length;
  const progress = running ? Math.round(((processed + imported) / Math.max(groups.length * 2, 1)) * 100) : imported === groups.length && groups.length ? 100 : Math.round((processed / Math.max(groups.length, 1)) * 50);

  const updateGroup = (id: string, update: Partial<LeadGroup> | ((group: LeadGroup) => Partial<LeadGroup>)) => setGroups(current => current.map(group => group.id === id ? { ...group, ...(typeof update === "function" ? update(group) : update) } : group));
  const updateExtraction = (id: string, key: keyof Extraction, value: string) => updateGroup(id, group => ({ extraction: group.extraction ? { ...group.extraction, [key]: value } : null, reviewed: false, duplicate: null }));

  async function addFiles(id: string, list: FileList | File[]) {
    const group = groups.find(item => item.id === id);
    if (!group || group.state === "imported") return;
    const roomInGroup = MAX_FILES_PER_GROUP - group.files.length;
    const roomInBatch = MAX_TOTAL_FILES - totalFiles;
    const selected = Array.from(list).slice(0, Math.min(roomInGroup, roomInBatch));
    if (!selected.length) return toast.error(`Maximum ${MAX_FILES_PER_GROUP} images per lead and ${MAX_TOTAL_FILES} per batch.`);
    const invalid = selected.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 6_000_000);
    if (invalid) return toast.error("Use JPG, PNG, or WebP images up to 6 MB each.");
    const loaded = await Promise.all(selected.map(readFile));
    updateGroup(id, current => ({ files: [...current.files, ...loaded], extraction: null, reviewed: false, state: "idle", duplicate: null, error: "" }));
  }

  function addGroup() {
    if (groups.length >= MAX_GROUPS) return toast.error(`A batch can contain up to ${MAX_GROUPS} leads.`);
    setGroups(current => [...current.map(group => ({ ...group, expanded: false })), newGroup()]);
  }

  async function processAll() {
    const processable = groups.filter(group => group.files.length && group.state !== "imported");
    if (!processable.length) return toast.error("Add at least one image group first.");
    setRunning(true);
    for (const group of processable) {
      updateGroup(group.id, { state: "extracting", error: "", duplicate: null, reviewed: false, expanded: true });
      try {
        const result = await extract.mutateAsync({ files: group.files.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })) });
        const extracted = { ...empty, ...(result as Extraction) };
        updateGroup(group.id, { extraction: extracted, diagnosisCategory: extracted.diagnosisCategory || "", stateCode: inferSupportedStateCode(extracted) ?? "", state: "review", expanded: true });
      } catch (error) {
        updateGroup(group.id, { state: "error", error: error instanceof Error ? error.message : "Extraction failed." });
      }
    }
    setRunning(false);
    toast.success("Image processing finished. Review and approve every lead before import.");
  }

  async function importApproved() {
    const candidates = groups.filter(group => group.extraction && group.reviewed && group.state !== "imported");
    if (!candidates.length) return toast.error("Review and approve at least one extracted lead.");
    const invalid = candidates.find(group => !group.extraction!.firstName.trim() || !group.extraction!.lastName.trim() || !hasIdentitySignal(group.extraction!) || !group.diagnosisCategory || !group.stateCode);
    if (invalid) return toast.error("Every approved lead needs first name, last name, date of birth, diagnosis group, and state.");

    setRunning(true);
    candidates.forEach(group => updateGroup(group.id, { state: "checking", duplicate: null, error: "" }));
    let checks;
    try {
      checks = await duplicateCheck.mutateAsync({ leads: candidates.map(group => ({
        firstName: group.extraction!.firstName, lastName: group.extraction!.lastName,
        email: group.extraction!.email || null, phone: group.extraction!.phone || null,
        dateOfBirth: group.extraction!.dateOfBirth, address: group.extraction!.address || null,
        postalCode: group.extraction!.postalCode || null,
      })) });
    } catch (error) {
      candidates.forEach(group => updateGroup(group.id, { state: "review", error: error instanceof Error ? error.message : "Duplicate check failed." }));
      setRunning(false);
      return toast.error("Bulk duplicate check failed. No leads were created.");
    }

    const blocked = new Set<string>();
    checks.forEach(check => {
      const group = candidates[check.index];
      if (!group) return;
      if (check.existing) {
        blocked.add(group.id);
        updateGroup(group.id, { state: "review", expanded: true, duplicate: { kind: "existing", leadId: check.existing.leadId, message: `Matches existing Lead #${check.existing.leadId} by ${check.existing.matchedBy.join(", ")}.` } });
      } else if (check.duplicateOfIndex !== null) {
        blocked.add(group.id);
        updateGroup(group.id, { state: "review", expanded: true, duplicate: { kind: "batch", message: `Duplicates Lead group ${check.duplicateOfIndex + 1} by ${check.duplicateInBatchBy.join(", ")}.` } });
      }
    });

    let successCount = 0;
    for (const group of candidates) {
      if (blocked.has(group.id)) continue;
      updateGroup(group.id, { state: "importing" });
      const lead = group.extraction!;
      try {
        const saved = await create.mutateAsync({
          lead: {
            firstName: lead.firstName, lastName: lead.lastName, email: lead.email || null, phone: lead.phone || null,
            dateOfBirth: lead.dateOfBirth || null, address: lead.address || null, city: lead.city || null,
            stateProvince: lead.stateProvince || null, postalCode: lead.postalCode || null, country: lead.country || null,
            diagnosis: lead.diagnosis || null, diagnosisCategory: group.diagnosisCategory as "oncology" | "hematology", stateCode: group.stateCode as "FL" | "AZ" | "NV" | "CA" | "OR", clinicalNotes: lead.clinicalNotes || null,
            sourceDocumentType: lead.documentCategory as "referral_order" | "referral_form" | "regular",
            additionalInformation: JSON.stringify(buildReferralAdditionalInformation({ documentCategory: lead.documentCategory, sex: lead.sex, medicalRecordNumber: lead.medicalRecordNumber, referral: lead.referral, additionalInformation: lead.additionalInformation })) || null,
            status: group.status as any, interestLevel: group.interestLevel as any, assignedTo: null,
          },
          documents: group.files.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })),
        });
        successCount += 1;
        updateGroup(group.id, { state: "imported", createdLeadId: saved.id, expanded: false, error: "" });
      } catch (error) {
        updateGroup(group.id, { state: "review", expanded: true, reviewed: false, error: error instanceof Error ? error.message : "Lead creation failed." });
      }
    }
    setRunning(false);
    const duplicateCount = blocked.size;
    if (successCount) toast.success(`${successCount} lead${successCount === 1 ? "" : "s"} imported from images.${duplicateCount ? ` ${duplicateCount} duplicate${duplicateCount === 1 ? " was" : "s were"} blocked.` : ""}`);
    else toast.error(duplicateCount ? "All approved groups were blocked as duplicates." : "No leads were imported.");
  }

  function resetCompleted() {
    setGroups(current => {
      const remaining = current.filter(group => group.state !== "imported");
      return remaining.length ? remaining : [newGroup()];
    });
  }

  return <div className="mx-auto max-w-[1450px]">
    <PageHeader eyebrow="Bulk document intelligence" title="Bulk import leads from images" description="Create one lead group per person, attach one or more images to each group, then process, review, check duplicates, and import the approved leads together." actions={<Button variant="outline" className="bg-white" onClick={() => navigate("/scan")}><ScanLine className="mr-2 h-4 w-4" />Single lead</Button>} />

    <div className="mb-6 grid gap-4 sm:grid-cols-4">
      {[{ label: "Lead groups", value: groups.length, icon: UsersRound }, { label: "Images", value: `${totalFiles}/${MAX_TOTAL_FILES}`, icon: FileImage }, { label: "Approved", value: approved, icon: CheckCircle2 }, { label: "Imported", value: imported, icon: Files }].map(item => <Card key={item.label} className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="flex items-center gap-4 p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><item.icon className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">{item.label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{item.value}</p></div></CardContent></Card>)}</div>

    <Alert className="mb-6 rounded-2xl border-teal-200 bg-teal-50"><FolderPlus className="h-4 w-4 text-teal-700" /><AlertTitle>One group equals one patient</AlertTitle><AlertDescription className="leading-6 text-teal-900">Put all referral pages and supporting images for the same patient in one group. Create another group for the next patient. CareFlow separates patient, provider, insurance, authorization, and referral information inside each group.</AlertDescription></Alert>

    {running && <div className="mb-6 rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold">Bulk operation in progress</p><p className="mt-1 text-sm text-slate-400">Groups run sequentially to keep every extraction and upload reliable.</p></div><span className="text-sm font-medium text-teal-300">{progress}%</span></div><Progress value={progress} className="mt-4 h-2 bg-slate-800" /></div>}

    <div className="space-y-4">{groups.map((group, groupIndex) => {
      const lead = group.extraction;
      const confidence = Math.round((lead?.overallConfidence ?? 0) * 100);
      const identityReady = lead ? hasIdentitySignal(lead) : false;
      return <Card key={group.id} className={`overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)] ${group.duplicate || group.error ? "ring-1 ring-amber-200" : group.state === "imported" ? "ring-1 ring-emerald-200" : ""}`}>
        <button type="button" onClick={() => updateGroup(group.id, { expanded: !group.expanded })} className="flex w-full items-center gap-4 p-5 text-left sm:p-6">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${group.state === "imported" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{group.state === "extracting" || group.state === "checking" || group.state === "importing" ? <Loader2 className="h-5 w-5 animate-spin" /> : group.state === "imported" ? <Check className="h-5 w-5" /> : <span className="text-sm font-bold">{groupIndex + 1}</span>}</div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-950">{lead?.firstName || lead?.lastName ? `${lead.firstName} ${lead.lastName}`.trim() : `Lead group ${groupIndex + 1}`}</h2>{lead && <StatusPill value={group.status} />}{group.reviewed && group.state !== "imported" && <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Approved</Badge>}{group.duplicate && <Badge className="bg-amber-50 text-amber-800 hover:bg-amber-50">Duplicate blocked</Badge>}</div><p className="mt-1 text-sm text-slate-500">{group.files.length} image{group.files.length === 1 ? "" : "s"}{lead ? ` · ${confidence}% extraction confidence` : " · waiting for processing"}{group.state === "imported" ? ` · created as Lead #${group.createdLeadId}` : ""}</p></div>
          {groups.length > 1 && group.state !== "imported" && <Button type="button" variant="ghost" size="icon" onClick={event => { event.stopPropagation(); setGroups(current => current.filter(item => item.id !== group.id)); }} disabled={running} aria-label={`Remove lead group ${groupIndex + 1}`}><Trash2 className="h-4 w-4 text-slate-400" /></Button>}
          {group.expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {group.expanded && <CardContent className="border-t border-slate-100 p-5 sm:p-6">
          {group.state === "imported" ? <div className="flex flex-col items-start justify-between gap-4 rounded-xl bg-emerald-50 p-5 sm:flex-row sm:items-center"><div><p className="font-semibold text-emerald-900">Lead imported successfully</p><p className="mt-1 text-sm text-emerald-700">All {group.files.length} source image{group.files.length === 1 ? " is" : "s are"} attached to Lead #{group.createdLeadId}.</p></div><Button variant="outline" className="bg-white" onClick={() => navigate(`/leads/${group.createdLeadId}`)}>Open lead</Button></div> : !lead ? <div>
            <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(group.id, event.dataTransfer.files); }} className="grid min-h-40 cursor-pointer place-items-center rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-6 text-center transition-colors hover:bg-teal-50"><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => event.target.files && addFiles(group.id, event.target.files)} /><div><UploadCloud className="mx-auto h-6 w-6 text-teal-700" /><p className="mt-3 font-medium text-slate-900">Add this person's document images</p><p className="mt-1 text-sm text-slate-500">JPG, PNG, or WebP · up to {MAX_FILES_PER_GROUP} images · 6 MB each</p></div></label>
            {group.files.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{group.files.map((file, fileIndex) => <div key={`${file.name}-${fileIndex}`} className="overflow-hidden rounded-xl border border-slate-200"><img src={file.dataUrl} alt="Document preview" className="h-24 w-full object-cover" /><div className="flex items-center gap-2 p-2"><span className="min-w-0 flex-1 truncate text-xs">{file.name}</span><button onClick={() => updateGroup(group.id, current => ({ files: current.files.filter((_, index) => index !== fileIndex) }))} aria-label={`Remove ${file.name}`}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button></div></div>)}</div>}
            {group.error && <p className="mt-4 text-sm text-rose-700">{group.error}</p>}
          </div> : <div className="space-y-6">
            {lead.reviewWarnings.length > 0 && <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertTitle>Review warnings</AlertTitle><AlertDescription>{lead.reviewWarnings.join(" · ")}</AlertDescription></Alert>}
            {group.duplicate && <Alert className="border-amber-200 bg-amber-50"><XCircle className="h-4 w-4 text-amber-700" /><AlertTitle>{group.duplicate.kind === "existing" ? "Existing duplicate blocked" : "Duplicate inside this batch blocked"}</AlertTitle><AlertDescription className="leading-6">{group.duplicate.message}{group.duplicate.leadId && <Button variant="link" className="ml-2 h-auto p-0 text-amber-900" onClick={() => navigate(`/leads/${group.duplicate!.leadId}`)}>Open existing lead</Button>}</AlertDescription></Alert>}
            {group.error && <Alert className="border-rose-200 bg-rose-50"><XCircle className="h-4 w-4 text-rose-700" /><AlertTitle>Import failed</AlertTitle><AlertDescription>{group.error}</AlertDescription></Alert>}
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]"><div className="space-y-6">
              <div><h3 className="mb-4 font-semibold">Patient identity and contact</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="First name *" value={lead.firstName} onChange={value => updateExtraction(group.id, "firstName", value)} /><Field label="Last name *" value={lead.lastName} onChange={value => updateExtraction(group.id, "lastName", value)} /><Field label="Email" type="email" value={lead.email} onChange={value => updateExtraction(group.id, "email", value)} /><Field label="Phone" value={lead.phone} onChange={value => updateExtraction(group.id, "phone", value)} /><Field label="Date of birth" value={lead.dateOfBirth} onChange={value => updateExtraction(group.id, "dateOfBirth", value)} /><Field label="Sex" value={lead.sex} onChange={value => updateExtraction(group.id, "sex", value)} /><Field label="Medical record number" value={lead.medicalRecordNumber} onChange={value => updateExtraction(group.id, "medicalRecordNumber", value)} /><Field label="Postal code" value={lead.postalCode} onChange={value => updateExtraction(group.id, "postalCode", value)} /><Field label="Address" value={lead.address} onChange={value => updateExtraction(group.id, "address", value)} className="sm:col-span-2" /><Field label="City" value={lead.city} onChange={value => updateExtraction(group.id, "city", value)} /><Field label="State / Province" value={lead.stateProvince} onChange={value => updateExtraction(group.id, "stateProvince", value)} /><Field label="Country" value={lead.country} onChange={value => updateExtraction(group.id, "country", value)} /></div></div>
              <div className="grid gap-4 border-t border-slate-100 pt-6 lg:grid-cols-2"><div className="space-y-2"><Label>Diagnosis</Label><Textarea value={lead.diagnosis} onChange={event => updateExtraction(group.id, "diagnosis", event.target.value)} rows={3} /></div><div className="space-y-2"><Label>Clinical notes</Label><Textarea value={lead.clinicalNotes} onChange={event => updateExtraction(group.id, "clinicalNotes", event.target.value)} rows={3} /></div></div>
              {isReferralDocument(lead.documentCategory) && <ReferralReview value={lead.referral} onChange={value => updateGroup(group.id, current => ({ extraction: current.extraction ? { ...current.extraction, referral: value } : null, reviewed: false, duplicate: null }))} documentCategory={lead.documentCategory} onDocumentCategoryChange={value => updateExtraction(group.id, "documentCategory", value)} />}
              {lead.additionalInformation.length > 0 && <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold">Additional extracted information</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{lead.additionalInformation.map((item, index) => <p key={`${item.label}-${index}`} className="text-sm text-slate-600"><strong className="text-slate-800">{item.label}:</strong> {item.value}</p>)}</div></div>}
            </div><div className="space-y-4 rounded-2xl bg-slate-50 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Review and approval</p><p className="mt-2 text-sm leading-6 text-slate-600">Compare all fields with this group's {group.files.length} source image{group.files.length === 1 ? "" : "s"}.</p></div><div className="rounded-xl bg-teal-50 p-3 ring-1 ring-teal-200"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-teal-700">Required classification</p><div className="space-y-3"><div className="space-y-2"><Label>Diagnosis group</Label><Select value={group.diagnosisCategory} onValueChange={value => updateGroup(group.id, { diagnosisCategory: value, reviewed: false })}><SelectTrigger className="bg-white"><SelectValue placeholder="Select group" /></SelectTrigger><SelectContent>{DIAGNOSIS_CATEGORY_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>State</Label><Select value={group.stateCode} onValueChange={value => updateGroup(group.id, { stateCode: value, reviewed: false })}><SelectTrigger className="bg-white"><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent>{STATE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></div><div className="space-y-2"><Label>Initial business status</Label><Select value={group.status} onValueChange={value => updateGroup(group.id, { status: value, reviewed: false })}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Interest level</Label><Select value={group.interestLevel} onValueChange={value => updateGroup(group.id, { interestLevel: value, reviewed: false })}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className={`rounded-xl p-3 text-xs leading-5 ${identityReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{identityReady ? "First name + last name + date of birth are ready for the mandatory duplicate check." : "Enter first name, last name, and date of birth before approval."}</div><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><Checkbox checked={group.reviewed} disabled={!lead.firstName.trim() || !lead.lastName.trim() || !identityReady || !group.diagnosisCategory || !group.stateCode} onCheckedChange={checked => updateGroup(group.id, { reviewed: checked === true, duplicate: null })} /><span className="text-sm leading-5 text-slate-700">I reviewed every field, confirmed name and date of birth, selected the diagnosis group and state, and approve this lead for import.</span></label><Button variant="outline" className="w-full bg-white" onClick={() => updateGroup(group.id, { extraction: null, reviewed: false, state: "idle", duplicate: null, error: "" })}><RotateCcw className="mr-2 h-4 w-4" />Replace or rescan images</Button></div></div>
          </div>}
        </CardContent>}
      </Card>;
    })}</div>

    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between"><div className="shrink-0"><p className="font-semibold text-slate-950">Batch controls</p><p className="mt-1 text-sm text-slate-500">Process image groups first. Import creates only reviewed, approved, unique leads.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={addGroup} disabled={running || groups.length >= MAX_GROUPS || totalFiles >= MAX_TOTAL_FILES}><FolderPlus className="mr-2 h-4 w-4" />Add lead group</Button><Button variant="outline" onClick={processAll} disabled={running || !groups.some(group => group.files.length && group.state !== "imported")}><ScanLine className="mr-2 h-4 w-4" />Process all groups</Button>{imported > 0 && <Button variant="ghost" onClick={resetCompleted} disabled={running}>Clear imported</Button>}<Button onClick={importApproved} disabled={running || approved === 0} className="bg-teal-700 hover:bg-teal-800">{running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Check duplicates and import {approved || "approved"}</Button></div></div>
  </div>;
}
