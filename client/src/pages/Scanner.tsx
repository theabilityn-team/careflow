import { PageHeader } from "@/components/crm/CrmUi";
import { FacesheetReview } from "@/components/crm/FacesheetReview";
import { ReferralReview } from "@/components/crm/ReferralReview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DIAGNOSIS_CATEGORY_OPTIONS, documentTypeLabel, INTEREST_OPTIONS, LANGUAGE_OPTIONS, STATE_OPTIONS, STATUS_OPTIONS } from "@/lib/crm";
import { IMAGE_FILE_ACCEPT, isSupportedImageInput, MAX_SCAN_BATCH_BYTES, MAX_SOURCE_IMAGE_BYTES, prepareUploadImage, totalOriginalBytes, type PreparedUploadImage } from "@/lib/imageUpload";
import { trpc } from "@/lib/trpc";
import { inferSupportedStateCode } from "@shared/leadClassification";
import { buildReferralAdditionalInformation, EMPTY_FACESHEET_DATA, EMPTY_REFERRAL_DATA, isHospitalFacesheet, isReferralDocument, type FacesheetData, type ReferralData } from "@shared/referralDocuments";
import { AlertTriangle, ArrowLeft, Check, FileImage, Files, Loader2, LockKeyhole, ScanLine, ShieldCheck, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type UploadFile = PreparedUploadImage;
type ExtraField = { section: string; label: string; value: string; confidence: number };
type Extraction = {
  firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string; sex: string; medicalRecordNumber: string;
  address: string; city: string; stateProvince: string; stateCode: string; postalCode: string; country: string;
  diagnosis: string; diagnosisCategory: string; clinicalNotes: string; documentCategory: string; referral: ReferralData; facesheet: FacesheetData; documentTypes: string[]; additionalInformation: ExtraField[];
  overallConfidence: number; reviewWarnings: string[];
};

const empty: Extraction = { firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", sex: "", medicalRecordNumber: "", address: "", city: "", stateProvince: "", stateCode: "", postalCode: "", country: "", diagnosis: "", diagnosisCategory: "", clinicalNotes: "", documentCategory: "regular", referral: EMPTY_REFERRAL_DATA, facesheet: EMPTY_FACESHEET_DATA, documentTypes: [], additionalInformation: [], overallConfidence: 0, reviewWarnings: [] };

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-11 border-slate-200" /></div>;
}

export default function Scanner() {
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<Extraction | null>(null);
  const [duplicate, setDuplicate] = useState<{ leadId: number; firstName: string; lastName: string; matchedBy: string[] } | null>(null);
  const [status, setStatus] = useState("verified");
  const [interestLevel, setInterestLevel] = useState("unknown");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [diagnosisCategory, setDiagnosisCategory] = useState("");
  const [stateCode, setStateCode] = useState("");
  const extract = trpc.scanner.extract.useMutation();
  const duplicateCheck = trpc.leads.duplicateCheck.useMutation();
  const create = trpc.leads.create.useMutation();
  const confidence = useMemo(() => Math.round((result?.overallConfidence ?? 0) * 100), [result]);
  const nameDobReady = Boolean(result?.firstName.trim() && result.lastName.trim() && result.dateOfBirth.trim());

  async function addFiles(list: FileList | File[]) {
    const remaining = 6 - files.length;
    const selected = Array.from(list).slice(0, remaining);
    const invalid = selected.find(file => !isSupportedImageInput(file) || file.size > MAX_SOURCE_IMAGE_BYTES);
    if (invalid) return toast.error("Use JPG, PNG, WebP, HEIC, or HEIF images up to 25 MB each.");
    if (totalOriginalBytes(files) + selected.reduce((sum, file) => sum + file.size, 0) > MAX_SCAN_BATCH_BYTES) return toast.error("Keep one lead's selected originals under 32 MB so CareFlow can scan them at full quality.");
    try {
      const loaded = await Promise.all(selected.map(prepareUploadImage));
      if (files.reduce((sum, file) => sum + file.size, 0) + loaded.reduce((sum, file) => sum + file.size, 0) > MAX_SCAN_BATCH_BYTES) return toast.error("The full-quality prepared images exceed 32 MB together. Upload fewer pages in this scan; CareFlow will not reduce OCR quality.");
      setFiles(current => [...current, ...loaded]);
      const converted = loaded.filter(file => file.convertedFromHeic).length;
      if (converted) toast.success(`${converted} iPhone photo${converted === 1 ? " was" : "s were"} converted from HEIC/HEIF to JPEG.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The photo could not be prepared.");
    }
  }

  async function startScan() {
    try {
      const data = await extract.mutateAsync({ files: files.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })) });
      const extracted = { ...empty, ...(data as Extraction) };
      setResult(extracted);
      setStateCode(inferSupportedStateCode(extracted) ?? "");
      setDiagnosisCategory(extracted.diagnosisCategory || "");
      setDuplicate(null);
      toast.success("Extraction complete. Review every field before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The documents could not be scanned.");
    }
  }

  async function saveLead() {
    if (!result?.firstName.trim() || !result.lastName.trim()) return toast.error("First and last name are required.");
    if (!result.dateOfBirth.trim()) return toast.error("Date of birth is required so CareFlow can block duplicate patients by name and date of birth.");
    if (!diagnosisCategory || !stateCode) return toast.error("Select a diagnosis group and state before creating the lead.");
    try {
      const checked = await duplicateCheck.mutateAsync({ firstName: result.firstName, lastName: result.lastName, email: result.email || null, phone: result.phone || null, dateOfBirth: result.dateOfBirth, address: result.address || null, postalCode: result.postalCode || null });
      if (checked.duplicate) {
        setDuplicate(checked.duplicate);
        toast.error(`Duplicate detected: Lead #${checked.duplicate.leadId}.`);
        return;
      }
      setDuplicate(null);
      const saved = await create.mutateAsync({
        lead: {
          firstName: result.firstName, lastName: result.lastName, email: result.email || null,
          preferredLanguage: preferredLanguage as "en" | "es",
          phone: result.phone || null, dateOfBirth: result.dateOfBirth || null, address: result.address || null,
          city: result.city || null, stateProvince: result.stateProvince || null, postalCode: result.postalCode || null,
          country: result.country || null, diagnosis: result.diagnosis || null, diagnosisCategory: diagnosisCategory as "oncology" | "hematology", stateCode: stateCode as "FL" | "AZ" | "NV" | "CA" | "OR", clinicalNotes: result.clinicalNotes || null,
          sourceDocumentType: result.documentCategory as "referral_order" | "referral_form" | "hospital_facesheet_standard" | "hospital_facesheet_extended" | "regular",
          additionalInformation: JSON.stringify(buildReferralAdditionalInformation({ documentCategory: result.documentCategory, sex: result.sex, medicalRecordNumber: result.medicalRecordNumber, referral: result.referral, facesheet: result.facesheet, additionalInformation: result.additionalInformation })) || null,
          status: status as any, interestLevel: interestLevel as any, assignedTo: null,
        },
        documents: files.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })),
      });
      toast.success("Lead created with reviewed information.");
      navigate(`/leads/${saved.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The lead could not be saved.");
    }
  }

  const update = (key: keyof Extraction, value: string) => { setDuplicate(null); setResult(current => current ? { ...current, [key]: value } : current); };
  const updateReferral = (value: ReferralData) => { setDuplicate(null); setResult(current => current ? { ...current, referral: value } : current); };
  const updateFacesheet = (value: FacesheetData) => { setDuplicate(null); setResult(current => current ? { ...current, facesheet: value } : current); };

  return <div className="mx-auto max-w-[1380px]">
    <PageHeader eyebrow="Document intelligence" title={result ? "Review extracted information" : "Add lead from images"} description={result ? "Confirm every value, correct any uncertainty, and save only when the record is accurate. Duplicate protection runs before creation." : "Upload up to six images for one person. CareFlow combines visible information into one reviewed lead draft."} actions={!result ? <Button variant="outline" className="w-full bg-white sm:w-auto" onClick={() => navigate("/bulk-import")}><Files className="mr-2 h-4 w-4" />Bulk image import</Button> : undefined} />

    {!result ? <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
      <Card className="rounded-[1.5rem] border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-4 sm:p-8">
        <input ref={inputRef} type="file" accept={IMAGE_FILE_ACCEPT} multiple className="sr-only" aria-label="Upload lead document images" onChange={e => e.target.files && addFiles(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }} className="group grid min-h-64 w-full min-w-0 place-items-center rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-5 text-center transition-all hover:border-teal-500 hover:bg-teal-50 sm:min-h-72 sm:p-8">
          <div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-teal-100"><UploadCloud className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-semibold text-slate-900">Drop document images here</h2><p className="mt-2 text-sm text-slate-500">JPG, PNG, WebP, iPhone HEIC/HEIF · up to 25 MB originals</p><Badge variant="outline" className="mt-4 bg-white">{files.length}/6 images selected</Badge></div>
        </button>
        {files.length > 0 && <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{files.map((file, index) => <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={file.dataUrl} alt="Document preview" className="h-36 w-full object-cover" /><div className="flex min-w-0 items-center gap-2 p-2 pl-3"><FileImage className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{file.name}</span><button onClick={() => setFiles(current => current.filter((_, i) => i !== index))} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 md:h-8 md:w-8" aria-label={`Remove ${file.name}`}><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
        <Button onClick={startScan} disabled={!files.length || extract.isPending} size="lg" className="mt-6 w-full bg-teal-700 hover:bg-teal-800">{extract.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reading {files.length} document{files.length === 1 ? "" : "s"}…</> : <><ScanLine className="mr-2 h-4 w-4" />Scan and extract information</>}</Button>
      </CardContent></Card>
      <div className="space-y-4">
        <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-6"><Sparkles className="h-5 w-5 text-teal-300" /><h3 className="mt-5 font-semibold">Referrals and Hospital Facesheets are supported</h3><p className="mt-2 text-sm leading-6 text-slate-400">CareFlow separates patient details from hospital contacts, guarantors, insurers, facilities, providers, admissions, diagnoses, and procedures across both facesheet layouts.</p></CardContent></Card>
        <Alert className="rounded-2xl border-amber-200 bg-amber-50"><LockKeyhole className="h-4 w-4 text-amber-700" /><AlertTitle>Human review is mandatory</AlertTitle><AlertDescription className="leading-6 text-amber-800">AI results may be incomplete or incorrect. An authorized staff member must verify the source images before creating a record.</AlertDescription></Alert>
      </div>
    </div> : <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-400/15 text-teal-300"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-semibold">Extraction confidence: {confidence}%</p><p className="text-sm text-slate-400">{documentTypeLabel(result.documentCategory)} · review against {files.length} original image{files.length === 1 ? "" : "s"}</p></div></div><div className="w-full sm:w-56"><Progress value={confidence} className="h-2 bg-slate-800" /></div></div>
      {result.reviewWarnings.length > 0 && <Alert className="min-w-0 rounded-2xl border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertTitle>Items that need extra attention</AlertTitle><AlertDescription><ul className="mt-2 min-w-0 list-disc space-y-1 pl-4 text-amber-800">{result.reviewWarnings.map(warning => <li key={warning} className="break-words [overflow-wrap:anywhere]">{warning}</li>)}</ul></AlertDescription></Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="space-y-8 p-4 sm:p-8">
          <section><h2 className="mb-5 text-lg font-semibold tracking-tight">Patient information</h2><div className="grid gap-5 sm:grid-cols-2"><Field label="First name *" value={result.firstName} onChange={v => update("firstName", v)} /><Field label="Last name *" value={result.lastName} onChange={v => update("lastName", v)} /><Field label="Email" type="email" value={result.email} onChange={v => update("email", v)} /><Field label="Phone" value={result.phone} onChange={v => update("phone", v)} /><Field label="Date of birth" value={result.dateOfBirth} onChange={v => update("dateOfBirth", v)} /><Field label="Sex" value={result.sex} onChange={v => update("sex", v)} /><Field label="Medical record number" value={result.medicalRecordNumber} onChange={v => update("medicalRecordNumber", v)} /></div></section>
          <section className="border-t border-slate-100 pt-8"><h2 className="mb-5 text-lg font-semibold tracking-tight">Address</h2><div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Street address" value={result.address} onChange={v => update("address", v)} /></div><Field label="City" value={result.city} onChange={v => update("city", v)} /><Field label="State / Province" value={result.stateProvince} onChange={v => update("stateProvince", v)} /><Field label="Postal code" value={result.postalCode} onChange={v => update("postalCode", v)} /><Field label="Country" value={result.country} onChange={v => update("country", v)} /></div></section>
          <section className="border-t border-slate-100 pt-8"><div className="mb-5 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-rose-600" /><h2 className="text-lg font-semibold tracking-tight">Protected clinical information</h2></div><div className="space-y-5"><div className="space-y-2"><Label>Diagnosis</Label><Textarea value={result.diagnosis} onChange={e => update("diagnosis", e.target.value)} rows={3} /></div><div className="space-y-2"><Label>Clinical notes</Label><Textarea value={result.clinicalNotes} onChange={e => update("clinicalNotes", e.target.value)} rows={4} /></div></div></section>
          {isReferralDocument(result.documentCategory) && <ReferralReview value={result.referral} onChange={updateReferral} documentCategory={result.documentCategory} onDocumentCategoryChange={value => update("documentCategory", value)} />}
          {isHospitalFacesheet(result.documentCategory) && <FacesheetReview value={result.facesheet} onChange={updateFacesheet} documentCategory={result.documentCategory} onDocumentCategoryChange={value => update("documentCategory", value)} />}
          {result.additionalInformation.length > 0 && <section className="border-t border-slate-100 pt-8"><h2 className="mb-5 text-lg font-semibold tracking-tight">Additional extracted information</h2><div className="grid gap-4 sm:grid-cols-2">{result.additionalInformation.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</span><span className="text-xs text-slate-400">{Math.round(item.confidence * 100)}%</span></div><Input value={item.value} onChange={e => setResult(current => current ? { ...current, additionalInformation: current.additionalInformation.map((field, i) => i === index ? { ...field, value: e.target.value } : field) } : current)} className="mt-2 border-0 bg-white" /></div>)}</div></section>}
        </CardContent></Card>
        <div className="space-y-5"><Card className="sticky top-6 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="space-y-5 p-6"><div><h3 className="font-semibold">Confirm record</h3><p className="mt-1 text-sm leading-6 text-slate-500">Select the operational classification manually before saving. CareFlow then checks identity duplicates and attaches the source images.</p></div><div className={`rounded-xl p-3 text-xs leading-5 ${nameDobReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{nameDobReady ? "First name + last name + date of birth are ready for the mandatory duplicate check." : "Enter first name, last name, and date of birth before this lead can be created."}</div>{duplicate && <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertTitle>Possible duplicate blocked</AlertTitle><AlertDescription className="leading-6">{duplicate.leadId ? <>Matches Lead #{duplicate.leadId} — {duplicate.firstName} {duplicate.lastName} by {duplicate.matchedBy.join(", ")}.<Button variant="link" className="mt-1 h-auto p-0 text-amber-900" onClick={() => navigate(`/leads/${duplicate.leadId}`)}>Open existing lead</Button></> : <>A matching lead already exists, but you do not have access to that record. Contact the Super Admin.</>}</AlertDescription></Alert>}<div className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200"><p className="text-xs font-semibold uppercase tracking-[.14em] text-teal-700">Required classification</p><div className="mt-3 space-y-3"><div className="space-y-2"><Label>Diagnosis group</Label><Select value={diagnosisCategory} onValueChange={setDiagnosisCategory}><SelectTrigger className="bg-white"><SelectValue placeholder="Select Oncology or Hematology" /></SelectTrigger><SelectContent>{DIAGNOSIS_CATEGORY_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>State</Label><Select value={stateCode} onValueChange={setStateCode}><SelectTrigger className="bg-white"><SelectValue placeholder="Select state" /></SelectTrigger><SelectContent>{STATE_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></div><div className="space-y-2"><Label>Lead language</Label><Select value={preferredLanguage} onValueChange={setPreferredLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LANGUAGE_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-500">Lead reminder emails use this language. Staff reminders stay in English.</p></div><div className="space-y-2"><Label>Initial business status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-500">This is the only status set during creation. Later status changes are always manual and audited.</p></div><div className="space-y-2"><Label>Interest level</Label><Select value={interestLevel} onValueChange={setInterestLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button onClick={saveLead} disabled={create.isPending || duplicateCheck.isPending || !nameDobReady || !diagnosisCategory || !stateCode} className="w-full bg-teal-700 hover:bg-teal-800">{create.isPending || duplicateCheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Check duplicates and create lead</Button><Button variant="outline" className="w-full" onClick={() => { setDuplicate(null); setResult(null); }}><ArrowLeft className="mr-2 h-4 w-4" />Back to images</Button></CardContent></Card></div>
      </div>
    </div>}
  </div>;
}
