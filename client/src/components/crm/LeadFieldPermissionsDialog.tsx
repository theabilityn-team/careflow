import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyStaffAccessUpdated } from "@/lib/accessRefresh";
import { confirmLeadFieldSave, createLeadFieldSaveGuard, leadFieldModeLabel, type LeadFieldStaffIdentity } from "@/lib/leadFieldEditor";
import { trpc } from "@/lib/trpc";
import { LEAD_FIELD_DEFINITIONS, LEAD_FIELD_MODES, normalizeLeadFields, type LeadFieldMode, type LeadFieldPermissions } from "@shared/leadFieldPermissions";
import { Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Props = { member: LeadFieldStaffIdentity; compact?: boolean };

export function LeadFieldPermissionsDialog({ member, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeLeadFields(member.leadFields));
  const confirmed = useRef(draft);
  const guard = useRef(createLeadFieldSaveGuard());
  const [search, setSearch] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(false);
  const update = trpc.staff.updateLeadFields.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    const next = normalizeLeadFields(member.leadFields);
    confirmed.current = next;
    if (!open) setDraft(next);
  }, [member.leadFields, open]);

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return LEAD_FIELD_DEFINITIONS.reduce<Record<string, typeof LEAD_FIELD_DEFINITIONS[number][]>>((result, field) => {
      if (query && !`${field.label} ${field.key} ${field.group}`.toLowerCase().includes(query)) return result;
      (result[field.group] ||= []).push(field);
      return result;
    }, {});
  }, [search]);

  async function save(key: string, mode: LeadFieldMode) {
    if (savingKey) return;
    await saveMap({ [key]: mode }, key);
  }

  async function saveMap(delta: Partial<LeadFieldPermissions>, statusKey: string) {
    await guard.current(async () => {
      const previous = confirmed.current;
      setDraft(normalizeLeadFields({ ...previous, ...delta }));
      setSavingKey(statusKey); setSaveError(null); setLastSaved(false);
      try {
        const result = await update.mutateAsync({ userId: member.id, leadFields: delta });
        const applied = confirmLeadFieldSave(delta, result);
        confirmed.current = applied; setDraft(applied); setLastSaved(true);
        notifyStaffAccessUpdated();
        await Promise.all([utils.staff.leadFieldStaff.invalidate(), utils.staff.list.invalidate(), utils.dashboard.access.invalidate()]).catch(() => undefined);
      } catch (error) {
        setDraft(previous);
        const message = error instanceof Error ? error.message : "Lead field access could not be saved. The change was restored.";
        setSaveError(message); toast.error(message);
      } finally { setSavingKey(null); }
    });
  }

  function setAll(mode: LeadFieldMode, group?: string) {
    const keys = LEAD_FIELD_DEFINITIONS.filter(field => !group || field.group === group).map(field => field.key);
    if (!keys.length || savingKey) return;
    const delta = Object.fromEntries(keys.map(key => [key, mode === "edit" && (LEAD_FIELD_DEFINITIONS.find(field => field.key === key) as { readOnly?: boolean }).readOnly ? "view" : mode])) as LeadFieldPermissions;
    void saveMap(delta, group ? `group:${group}` : "all");
  }

  return <Dialog open={open} onOpenChange={value => { if (!savingKey) { setOpen(value); if (value) { const next = normalizeLeadFields(member.leadFields); confirmed.current = next; setDraft(next); setSearch(""); setSaveError(null); } } }}>
    <DialogTrigger asChild><Button type="button" variant="outline" className={compact ? "w-full" : "w-full sm:w-auto"} data-testid={`lead-field-permissions-${member.id}`}><SlidersHorizontal className="mr-2 h-4 w-4" />Lead information access</Button></DialogTrigger>
    <DialogContent className="max-h-[95dvh] w-[calc(100%-1rem)] max-w-[min(100%-1rem,72rem)] sm:max-w-6xl overflow-y-auto p-4 sm:p-6" data-testid="lead-field-permissions-dialog">
      <DialogHeader><DialogTitle>Lead information access{member.name ? ` · ${member.name}` : ""}</DialogTitle><DialogDescription>Choose the highest level this staff member may use for each lead field. Hide removes the field entirely; View only is read-only; Edit permits changes.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-1">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>Master permissions remain the upper bound.</strong> These settings never grant Leads, Clinical, Edit, Status, Contacts, or Documents access. A field may still be View only or hidden when its master permission is off.</div>
        <div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Search lead fields" placeholder="Search fields or categories…" value={search} onChange={event => setSearch(event.target.value)} /><div className="flex shrink-0 flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={Boolean(savingKey)} onClick={() => setAll("hide")}>All hide</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(savingKey)} onClick={() => setAll("view")}>All view</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(savingKey)} onClick={() => setAll("edit")}>All edit</Button></div></div>
        {Object.entries(groups).map(([group, fields]) => <section key={group} className="rounded-2xl border border-slate-200 p-3 sm:p-4"><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold text-slate-900">{group}</h3><p className="text-xs text-slate-500">{fields.length} field{fields.length === 1 ? "" : "s"}</p></div><div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="ghost" disabled={Boolean(savingKey)} onClick={() => setAll("hide", group)}>Hide group</Button><Button type="button" size="sm" variant="ghost" disabled={Boolean(savingKey)} onClick={() => setAll("view", group)}>View group</Button><Button type="button" size="sm" variant="ghost" disabled={Boolean(savingKey)} onClick={() => setAll("edit", group)}>Edit group</Button></div></div><div className="grid gap-2">{fields.map(field => { const mode = draft[field.key]; const blocked = field.clinical && !Boolean(member.permissions && typeof member.permissions === "object" && (member.permissions as any).viewClinical); const readOnly = Boolean((field as { readOnly?: boolean }).readOnly); return <div key={field.key} className="flex min-w-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-medium text-slate-800">{field.label}</p>{readOnly && <Badge variant="outline">Automatic; Edit unavailable</Badge>}{blocked && <Badge variant="outline" className="border-amber-300 text-amber-800">Master blocked</Badge>}</div><p className="mt-1 break-all text-[11px] text-slate-400">{field.key}</p></div><Select value={readOnly && mode === "edit" ? "view" : mode} onValueChange={value => void save(field.key, value as LeadFieldMode)} disabled={Boolean(savingKey)}><SelectTrigger aria-label={`${field.label} access`} className="w-full bg-white sm:w-32"><SelectValue /></SelectTrigger><SelectContent>{LEAD_FIELD_MODES.filter(option => !readOnly || option !== "edit").map(option => <SelectItem key={option} value={option}>{leadFieldModeLabel[option]}</SelectItem>)}</SelectContent></Select></div>; })}</div></section>)}
        {!Object.keys(groups).length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No lead fields match this search.</p>}
        <div role="status" aria-live="polite" className="flex min-h-8 items-center gap-2 text-sm">{savingKey ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : saveError ? <span className="text-rose-700">{saveError}</span> : lastSaved ? <><ShieldCheck className="h-4 w-4 text-teal-700" /><span className="text-teal-800">Saved and verified from the server.</span></> : <span className="text-slate-500">Changes save automatically.</span>}</div>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={Boolean(savingKey)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
