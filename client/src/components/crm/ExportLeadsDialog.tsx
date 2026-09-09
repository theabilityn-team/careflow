import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { STATUS_OPTIONS } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type LeadStatus = (typeof STATUS_OPTIONS)[number][0];
type ExportFormat = "csv" | "xlsx" | "pdf";

const formats: Array<{ value: ExportFormat; label: string; description: string; icon: typeof FileText }> = [
  { value: "csv", label: "CSV", description: "Universal data file", icon: Sheet },
  { value: "xlsx", label: "Excel", description: "Formatted workbook", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", description: "Printable report", icon: FileText },
];

function downloadBase64(dataBase64: string, mimeType: string, fileName: string) {
  const binary = window.atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExportLeadsDialog({ currentStatus }: { currentStatus: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selected, setSelected] = useState<LeadStatus[]>([]);
  const summary = trpc.leads.exportSummary.useQuery(undefined, { enabled: open, retry: false });
  const exportFile = trpc.leads.export.useMutation();
  const allStatuses = useMemo(() => STATUS_OPTIONS.map(([value]) => value), []);

  useEffect(() => {
    if (!open) return;
    setSelected(currentStatus !== "all" && allStatuses.includes(currentStatus as LeadStatus)
      ? [currentStatus as LeadStatus]
      : allStatuses);
  }, [open, currentStatus, allStatuses]);

  const selectedCount = selected.reduce((sum, status) => sum + Number(summary.data?.counts[status] ?? 0), 0);
  const allSelected = selected.length === allStatuses.length;

  function toggleStatus(status: LeadStatus, checked: boolean) {
    setSelected(current => checked ? Array.from(new Set([...current, status])) : current.filter(value => value !== status));
  }

  async function startExport() {
    if (!selected.length) return toast.error("Select at least one lead status.");
    try {
      const result = await exportFile.mutateAsync({ statuses: selected, format });
      downloadBase64(result.dataBase64, result.mimeType, result.fileName);
      toast.success(`${result.count} lead${result.count === 1 ? "" : "s"} exported to ${format === "xlsx" ? "Excel" : format.toUpperCase()}.`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export leads.");
    }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="bg-white"><Download className="mr-2 h-4 w-4" />Export leads</Button></DialogTrigger>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Export leads</DialogTitle><DialogDescription>Choose statuses and a file format. Exports include basic lead information only; clinical data and source documents are always excluded.</DialogDescription></DialogHeader>
      <div className="space-y-6 py-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">Lead statuses</p><p className="mt-1 text-xs text-slate-500">Select one or more pipeline stages.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setSelected(allSelected ? [] : allStatuses)}>{allSelected ? "Clear all" : "Select all"}</Button></div>
          {summary.isLoading ? <div className="grid min-h-36 place-items-center rounded-xl bg-slate-50"><Loader2 className="h-5 w-5 animate-spin text-teal-700" /></div> : <div className="grid gap-2 sm:grid-cols-2">{STATUS_OPTIONS.map(([value, label]) => {
            const count = Number(summary.data?.counts[value] ?? 0);
            const checked = selected.includes(value);
            return <Label key={value} htmlFor={`export-${value}`} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-teal-200 bg-teal-50/70" : "border-slate-100 hover:bg-slate-50"}`}><Checkbox id={`export-${value}`} checked={checked} onCheckedChange={state => toggleStatus(value, state === true)} /><span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{label}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-slate-500 ring-1 ring-slate-200">{count}</span></Label>;
          })}</div>}
        </section>
        <section><p className="mb-3 text-sm font-semibold text-slate-900">File format</p><div className="grid gap-3 sm:grid-cols-3">{formats.map(option => <button key={option.value} type="button" onClick={() => setFormat(option.value)} className={`rounded-xl border p-4 text-left transition-all ${format === option.value ? "border-teal-600 bg-teal-50 ring-2 ring-teal-600/10" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}><div className="flex items-center justify-between"><option.icon className={`h-5 w-5 ${format === option.value ? "text-teal-700" : "text-slate-400"}`} />{format === option.value && <CheckCircle2 className="h-4 w-4 text-teal-700" />}</div><p className="mt-3 text-sm font-semibold text-slate-900">{option.label}</p><p className="mt-1 text-xs text-slate-500">{option.description}</p></button>)}</div></section>
        <div className="rounded-xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-slate-400">Ready to export</p><p className="mt-1 text-sm font-semibold">{selectedCount} matching lead{selectedCount === 1 ? "" : "s"}</p></div><p className="text-right text-xs leading-5 text-slate-400">Maximum {summary.data?.limit ?? 5000} rows<br />Status included as a column</p></div></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={startExport} disabled={exportFile.isPending || !selected.length || selectedCount === 0} className="bg-teal-700 hover:bg-teal-800">{exportFile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export {format === "xlsx" ? "Excel" : format.toUpperCase()}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
