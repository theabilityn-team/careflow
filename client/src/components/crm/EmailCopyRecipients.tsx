import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";

export function EmailCopyRecipients({ cc, bcc, onCcChange, onBccChange, disabled = false, error }: {
  cc: string; bcc: string; onCcChange: (value: string) => void; onBccChange: (value: string) => void; disabled?: boolean; error?: string | null;
}) {
  const [expanded, setExpanded] = useState(Boolean(cc || bcc));
  const id = useId();
  const visible = expanded;
  return <div className="min-w-0 space-y-3">
    <Button type="button" variant="outline" size="sm" className="min-h-11 w-full justify-between whitespace-normal text-left sm:w-auto" aria-expanded={visible} aria-controls={`${id}-copies`} disabled={disabled} onClick={() => setExpanded(value => !value)}>
      {visible ? "Hide CC / BCC" : cc || bcc ? "Show CC / BCC" : "Add CC / BCC"}{visible ? <ChevronUp className="ml-2 h-4 w-4 shrink-0" /> : <ChevronDown className="ml-2 h-4 w-4 shrink-0" />}
    </Button>
    {visible && <div id={`${id}-copies`} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-cc`}>CC</Label><Input id={`${id}-cc`} value={cc} onChange={event => onCcChange(event.target.value)} disabled={disabled} inputMode="email" autoComplete="off" maxLength={6500} placeholder="name@example.com, second@example.com" className="w-full min-w-0 bg-white" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor={`${id}-bcc`}>BCC</Label><Input id={`${id}-bcc`} value={bcc} onChange={event => onBccChange(event.target.value)} disabled={disabled} inputMode="email" autoComplete="off" maxLength={6500} placeholder="private@example.com" className="w-full min-w-0 bg-white" /></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Separate addresses with commas or semicolons; up to 20 per field. CC is visible to recipients. BCC is hidden from recipients and from other staff viewing lead history.</p>
    </div>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 [overflow-wrap:anywhere]">{error}</p>}
  </div>;
}

export function EmailRecipientsSummary({ ccEmails, bccEmails, leadId }: { ccEmails?: string[]; bccEmails?: string[]; leadId?: number | null }) {
  if (!ccEmails?.length && !bccEmails?.length && leadId !== null) return null;
  return <div className="space-y-1 text-xs leading-5 text-slate-500 [overflow-wrap:anywhere]">
    {leadId === null && <p>Direct email · Not linked to a lead</p>}
    {!!ccEmails?.length && <p><span className="font-semibold">CC:</span> {ccEmails.join(", ")}</p>}
    {!!bccEmails?.length && <p><span className="font-semibold">BCC (private):</span> {bccEmails.join(", ")}</p>}
  </div>;
}
