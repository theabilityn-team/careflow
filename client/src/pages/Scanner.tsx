import { PageHeader } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INTEREST_OPTIONS, STATUS_OPTIONS } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, Check, FileImage, Loader2, LockKeyhole, ScanLine, ShieldCheck, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type UploadFile = { name: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataUrl: string; size: number };
type ExtraField = { label: string; value: string; confidence: number };
type Extraction = {
  firstName: string; lastName: string; email: string; phone: string; dateOfBirth: string;
  address: string; city: string; stateProvince: string; postalCode: string; country: string;
  diagnosis: string; clinicalNotes: string; documentTypes: string[]; additionalInformation: ExtraField[];
  overallConfidence: number; reviewWarnings: string[];
};

const empty: Extraction = { firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", address: "", city: "", stateProvince: "", postalCode: "", country: "", diagnosis: "", clinicalNotes: "", documentTypes: [], additionalInformation: [], overallConfidence: 0, reviewWarnings: [] };

const readFile = (file: File) => new Promise<UploadFile>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, mimeType: file.type as UploadFile["mimeType"], dataUrl: String(reader.result), size: file.size });
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

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
  const extract = trpc.scanner.extract.useMutation();
  const duplicateCheck = trpc.leads.duplicateCheck.useMutation();
  const create = trpc.leads.create.useMutation();
  const confidence = useMemo(() => Math.round((result?.overallConfidence ?? 0) * 100), [result]);

  async function addFiles(list: FileList | File[]) {
    const remaining = 6 - files.length;
    const selected = Array.from(list).slice(0, remaining);
    const invalid = selected.find(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 6_000_000);
    if (invalid) return toast.error("Use JPG, PNG, or WebP images up to 6 MB each.");
    const loaded = await Promise.all(selected.map(readFile));
    setFiles(current => [...current, ...loaded]);
  }

  async function startScan() {
    try {
      const data = await extract.mutateAsync({ files: files.map(({ name, mimeType, dataUrl }) => ({ name, mimeType, dataUrl })) });
      setResult({ ...empty, ...(data as Extraction) });
      setDuplicate(null);
      toast.success("Extraction complete. Review every field before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The documents could not be scanned.");
    }
  }

  async function saveLead() {
    if (!result?.firstName.trim() || !result.lastName.trim()) return toast.error("First and last name are required.");
    try {
      const checked = await duplicateCheck.mutateAsync({ firstName: result.firstName, lastName: result.lastName, email: result.email || null, phone: result.phone || null, dateOfBirth: result.dateOfBirth || null, address: result.address || null, postalCode: result.postalCode || null });
      if (checked.duplicate) {
        setDuplicate(checked.duplicate);
        toast.error(`Duplicate detected: Lead #${checked.duplicate.leadId}.`);
        return;
      }
      setDuplicate(null);
      const saved = await create.mutateAsync({
        lead: {
          firstName: result.firstName, lastName: result.lastName, email: result.email || null,
          phone: result.phone || null, dateOfBirth: result.dateOfBirth || null, address: result.address || null,
          city: result.city || null, stateProvince: result.stateProvince || null, postalCode: result.postalCode || null,
          country: result.country || null, diagnosis: result.diagnosis || null, clinicalNotes: result.clinicalNotes || null,
          additionalInformation: result.additionalInformation.length ? JSON.stringify(result.additionalInformation) : null,
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

  return <div className="mx-auto max-w-[1380px]">
    <PageHeader eyebrow="Document intelligence" title={result ? "Review extracted information" : "Add lead from images"} description={result ? "Confirm every value, correct any uncertainty, and save only when the record is accurate. Duplicate protection runs before creation." : "Upload up to six images for one person. CareFlow combines visible information into one reviewed lead draft."} />

    {!result ? <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
      <Card className="rounded-[1.5rem] border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-6 sm:p-8">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => e.target.files && addFiles(e.target.files)} />
        <button onClick={() => inputRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }} className="group grid min-h-72 w-full place-items-center rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-8 text-center transition-all hover:border-teal-500 hover:bg-teal-50">
          <div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-teal-100"><UploadCloud className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-semibold text-slate-900">Drop document images here</h2><p className="mt-2 text-sm text-slate-500">or click to browse · JPG, PNG, WebP · max 6 MB each</p><Badge variant="outline" className="mt-4 bg-white">{files.length}/6 images selected</Badge></div>
        </button>
        {files.length > 0 && <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{files.map((file, index) => <div key={`${file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><img src={file.dataUrl} alt="Document preview" className="h-36 w-full object-cover" /><div className="flex items-center gap-2 p-3"><FileImage className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{file.name}</span><button onClick={() => setFiles(current => current.filter((_, i) => i !== index))} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${file.name}`}><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
        <Button onClick={startScan} disabled={!files.length || extract.isPending} size="lg" className="mt-6 w-full bg-teal-700 hover:bg-teal-800">{extract.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reading {files.length} document{files.length === 1 ? "" : "s"}…</> : <><ScanLine className="mr-2 h-4 w-4" />Scan and extract information</>}</Button>
      </CardContent></Card>
      <div className="space-y-4">
        <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-6"><Sparkles className="h-5 w-5 text-teal-300" /><h3 className="mt-5 font-semibold">What CareFlow extracts</h3><p className="mt-2 text-sm leading-6 text-slate-400">Names, contact details, addresses, dates, diagnoses, clinical notes, document types, and any other visible information.</p></CardContent></Card>
        <Alert className="rounded-2xl border-amber-200 bg-amber-50"><LockKeyhole className="h-4 w-4 text-amber-700" /><AlertTitle>Human review is mandatory</AlertTitle><AlertDescription className="leading-6 text-amber-800">AI results may be incomplete or incorrect. An authorized staff member must verify the source images before creating a record.</AlertDescription></Alert>
      </div>
    </div> : <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-400/15 text-teal-300"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-semibold">Extraction confidence: {confidence}%</p><p className="text-sm text-slate-400">Review against {files.length} original image{files.length === 1 ? "" : "s"}</p></div></div><div className="w-full sm:w-56"><Progress value={confidence} className="h-2 bg-slate-800" /></div></div>
      {result.reviewWarnings.length > 0 && <Alert className="rounded-2xl border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertTitle>Items that need extra attention</AlertTitle><AlertDescription><ul className="mt-2 list-disc space-y-1 pl-4 text-amber-800">{result.reviewWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="space-y-8 p-6 sm:p-8">
          <section><h2 className="mb-5 text-lg font-semibold tracking-tight">Personal information</h2><div className="grid gap-5 sm:grid-cols-2"><Field label="First name *" value={result.firstName} onChange={v => update("firstName", v)} /><Field label="Last name *" value={result.lastName} onChange={v => update("lastName", v)} /><Field label="Email" type="email" value={result.email} onChange={v => update("email", v)} /><Field label="Phone" value={result.phone} onChange={v => update("phone", v)} /><Field label="Date of birth" value={result.dateOfBirth} onChange={v => update("dateOfBirth", v)} /></div></section>
          <section className="border-t border-slate-100 pt-8"><h2 className="mb-5 text-lg font-semibold tracking-tight">Address</h2><div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Street address" value={result.address} onChange={v => update("address", v)} /></div><Field label="City" value={result.city} onChange={v => update("city", v)} /><Field label="State / Province" value={result.stateProvince} onChange={v => update("stateProvince", v)} /><Field label="Postal code" value={result.postalCode} onChange={v => update("postalCode", v)} /><Field label="Country" value={result.country} onChange={v => update("country", v)} /></div></section>
          <section className="border-t border-slate-100 pt-8"><div className="mb-5 flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-rose-600" /><h2 className="text-lg font-semibold tracking-tight">Protected clinical information</h2></div><div className="space-y-5"><div className="space-y-2"><Label>Diagnosis</Label><Textarea value={result.diagnosis} onChange={e => update("diagnosis", e.target.value)} rows={3} /></div><div className="space-y-2"><Label>Clinical notes</Label><Textarea value={result.clinicalNotes} onChange={e => update("clinicalNotes", e.target.value)} rows={4} /></div></div></section>
          {result.additionalInformation.length > 0 && <section className="border-t border-slate-100 pt-8"><h2 className="mb-5 text-lg font-semibold tracking-tight">Additional extracted information</h2><div className="grid gap-4 sm:grid-cols-2">{result.additionalInformation.map((item, index) => <div key={`${item.label}-${index}`} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</span><span className="text-xs text-slate-400">{Math.round(item.confidence * 100)}%</span></div><Input value={item.value} onChange={e => setResult(current => current ? { ...current, additionalInformation: current.additionalInformation.map((field, i) => i === index ? { ...field, value: e.target.value } : field) } : current)} className="mt-2 border-0 bg-white" /></div>)}</div></section>}
        </CardContent></Card>
        <div className="space-y-5"><Card className="sticky top-6 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="space-y-5 p-6"><div><h3 className="font-semibold">Confirm record</h3><p className="mt-1 text-sm leading-6 text-slate-500">CareFlow first checks email, phone, and profile identity for duplicates. If unique, it records the reviewed values and attaches all source images.</p></div>{duplicate && <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-700" /><AlertTitle>Possible duplicate blocked</AlertTitle><AlertDescription className="leading-6">Matches Lead #{duplicate.leadId} — {duplicate.firstName} {duplicate.lastName} by {duplicate.matchedBy.join(", ")}.<Button variant="link" className="mt-1 h-auto p-0 text-amber-900" onClick={() => navigate(`/leads/${duplicate.leadId}`)}>Open existing lead</Button></AlertDescription></Alert>}<div className="space-y-2"><Label>Initial business status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-5 text-slate-500">This is the only status set during creation. Later status changes are always manual and audited.</p></div><div className="space-y-2"><Label>Interest level</Label><Select value={interestLevel} onValueChange={setInterestLevel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button onClick={saveLead} disabled={create.isPending || duplicateCheck.isPending} className="w-full bg-teal-700 hover:bg-teal-800">{create.isPending || duplicateCheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Check duplicates and create lead</Button><Button variant="outline" className="w-full" onClick={() => { setDuplicate(null); setResult(null); }}><ArrowLeft className="mr-2 h-4 w-4" />Back to images</Button></CardContent></Card></div>
      </div>
    </div>}
  </div>;
}
