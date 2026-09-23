import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { statusClass, statusLabel } from "@/lib/crm";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex min-w-0 flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 break-words text-[11px] font-semibold uppercase tracking-[.2em] text-teal-700">{eyebrow}</p>}
        <h1 className="break-words text-3xl font-semibold tracking-[-.035em] text-slate-950 [overflow-wrap:anywhere] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  return <Badge variant="outline" className={`rounded-full border-0 px-2.5 py-1 font-medium ring-1 ${statusClass(value)}`}>{statusLabel(value)}</Badge>;
}

export function PageLoading() {
  return <div className="space-y-6"><Skeleton className="h-10 w-64" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-80 rounded-2xl" /></div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="grid min-h-56 min-w-0 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center sm:p-8"><div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{title}</h3><p className="mx-auto mt-2 max-w-sm break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{description}</p>{action && <div className="mt-5">{action}</div>}</div></div>;
}
