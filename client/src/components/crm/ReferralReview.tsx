import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/crm";
import type { ReferralData } from "@shared/referralDocuments";
import { Building2, ClipboardList, CreditCard, Stethoscope } from "lucide-react";

function Field({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label><Input value={value} onChange={event => onChange(event.target.value)} className="h-10 border-slate-200 bg-white" /></div>;
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Textarea value={value} onChange={event => onChange(event.target.value)} rows={3} className="border-slate-200 bg-white" /></div>;
}

export function ReferralReview({ value, onChange, documentCategory, onDocumentCategoryChange }: {
  value: ReferralData;
  onChange: (value: ReferralData) => void;
  documentCategory: string;
  onDocumentCategoryChange: (value: string) => void;
}) {
  const set = (key: keyof ReferralData, next: string | string[]) => onChange({ ...value, [key]: next });
  return <section className="min-w-0 rounded-2xl border border-indigo-100 bg-indigo-50/45 p-4 sm:p-6">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-xs font-semibold uppercase tracking-[.16em] text-indigo-700">Referral document review</p><h3 className="mt-2 break-words text-lg font-semibold text-slate-950">Verify referral, insurance, providers, and codes</h3><p className="mt-1 break-words text-sm leading-6 text-slate-600">Patient fields remain separate from provider and facility information. Empty fields are not saved.</p></div><div className="min-w-0 w-full space-y-2 sm:w-52"><Label>Detected document type</Label><Select value={documentCategory} onValueChange={onDocumentCategoryChange}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{DOCUMENT_TYPE_OPTIONS.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div>

    <div className="mt-6 space-y-6">
      <div><div className="mb-4 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-indigo-700" /><h4 className="font-semibold">Referral order</h4></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Referral date" value={value.referralDate} onChange={next => set("referralDate", next)} /><Field label="Priority / urgency" value={value.urgency} onChange={next => set("urgency", next)} /><Field label="Requested visits" value={value.requestedVisits} onChange={next => set("requestedVisits", next)} /><Field label="Order name" value={value.orderName} onChange={next => set("orderName", next)} /><div className="sm:col-span-2"><Area label="Reason for referral" value={value.referralReason} onChange={next => set("referralReason", next)} /></div><div className="sm:col-span-2"><Area label="Appointment instructions" value={value.appointmentInstructions} onChange={next => set("appointmentInstructions", next)} /></div><Field label="ICD codes" value={value.icdCodes.join(", ")} onChange={next => set("icdCodes", next.split(",").map(item => item.trim()).filter(Boolean))} className="sm:col-span-2" /><Field label="CPT / HCPCS codes" value={value.cptCodes.join(", ")} onChange={next => set("cptCodes", next.split(",").map(item => item.trim()).filter(Boolean))} className="sm:col-span-2" /></div></div>

      <div className="border-t border-indigo-100 pt-6"><div className="mb-4 flex items-center gap-2"><CreditCard className="h-4 w-4 text-indigo-700" /><h4 className="font-semibold">Insurance and authorization</h4></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Insurance carrier" value={value.insuranceCarrier} onChange={next => set("insuranceCarrier", next)} /><Field label="Insurance plan" value={value.insurancePlan} onChange={next => set("insurancePlan", next)} /><Field label="Member ID" value={value.memberId} onChange={next => set("memberId", next)} /><Field label="Group number" value={value.groupNumber} onChange={next => set("groupNumber", next)} /><Field label="Policy holder" value={value.policyHolder} onChange={next => set("policyHolder", next)} /><Field label="Authorization number" value={value.authorizationNumber} onChange={next => set("authorizationNumber", next)} /><Field label="Authorization status" value={value.authorizationStatus} onChange={next => set("authorizationStatus", next)} /><Field label="Authorization start" value={value.authorizationStartDate} onChange={next => set("authorizationStartDate", next)} /><Field label="Authorization end" value={value.authorizationEndDate} onChange={next => set("authorizationEndDate", next)} /></div></div>

      <div className="grid gap-6 border-t border-indigo-100 pt-6 lg:grid-cols-2">
        <ProviderSection icon={Stethoscope} title="Referring provider" prefix="referring" value={value} set={set} />
        <ProviderSection icon={Building2} title="Receiving provider" prefix="receiving" value={value} set={set} />
      </div>
    </div>
  </section>;
}

function ProviderSection({ icon: Icon, title, prefix, value, set }: {
  icon: typeof Stethoscope;
  title: string;
  prefix: "referring" | "receiving";
  value: ReferralData;
  set: (key: keyof ReferralData, value: string | string[]) => void;
}) {
  const key = (suffix: string) => `${prefix}${suffix}` as keyof ReferralData;
  return <div><div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-indigo-700" /><h4 className="font-semibold">{title}</h4></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Provider name" value={String(value[key("ProviderName")])} onChange={next => set(key("ProviderName"), next)} /><Field label="Practice / facility" value={String(value[key("ProviderPractice")])} onChange={next => set(key("ProviderPractice"), next)} /><Field label="Specialty" value={String(value[key("ProviderSpecialty")])} onChange={next => set(key("ProviderSpecialty"), next)} /><Field label="NPI" value={String(value[key("ProviderNpi")])} onChange={next => set(key("ProviderNpi"), next)} /><Field label="Phone" value={String(value[key("ProviderPhone")])} onChange={next => set(key("ProviderPhone"), next)} /><Field label="Fax" value={String(value[key("ProviderFax")])} onChange={next => set(key("ProviderFax"), next)} /><Field label="Address" value={String(value[key("ProviderAddress")])} onChange={next => set(key("ProviderAddress"), next)} className="sm:col-span-2" />{prefix === "referring" && <Field label="Credentials" value={value.referringProviderCredentials} onChange={next => set("referringProviderCredentials", next)} className="sm:col-span-2" />}</div></div>;
}
