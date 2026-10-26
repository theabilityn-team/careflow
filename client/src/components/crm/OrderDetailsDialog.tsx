import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { centsToMoney, displayOrderReference, formatSalesDate, type OrderRow } from "@/lib/sales";
import { Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { salesTrpc } from "@/lib/sales";

const statusClass: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 hover:bg-amber-50",
  paid: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  fulfilled: "bg-sky-50 text-sky-700 hover:bg-sky-50",
  cancelled: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  refunded: "bg-rose-50 text-rose-700 hover:bg-rose-50",
};

export default function OrderDetailsDialog({ order, trigger }: { order: OrderRow; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = salesTrpc.orders.get.useQuery({ id: order.id }, { enabled: open });
  const current = data?.order ?? order;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>{trigger ?? <Button variant="outline" className="min-h-11"><Eye className="mr-2 h-4 w-4" />Details</Button>}</DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-4 sm:max-h-[calc(100dvh-2rem)] sm:p-6">
      <DialogHeader><DialogTitle>Order {displayOrderReference(current)}</DialogTitle><DialogDescription>Business order details and the order-specific audit history.</DialogDescription></DialogHeader>
      {isLoading ? <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading details…</div> : error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Unable to load order details.</div> : <div className="space-y-4">
        <Card className="rounded-xl border-slate-100 shadow-none"><CardContent className="grid gap-4 p-4 sm:grid-cols-2"><Detail label="Customer" value={current.customerName} /><Detail label="Product or service" value={current.productName} /><Detail label="Quantity" value={String(current.quantity)} /><Detail label="Unit price" value={centsToMoney(current.unitPriceCents, current.currency)} /><Detail label="Total" value={centsToMoney(current.totalCents, current.currency)} strong /><Detail label="Currency" value={current.currency} /><Detail label="Ordered at" value={formatSalesDate(current.orderedAt, true)} /><Detail label="External reference" value={current.externalReference || "None"} /><Detail label="Credited owner" value={current.ownerName} /><Detail label="Created by" value={current.createdByName} /><Detail label="Created at" value={formatSalesDate(current.createdAt, true)} /><div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p><Badge className={`mt-1 capitalize ${statusClass[current.status] ?? ""}`}>{current.status}</Badge></div><div className="sm:col-span-2"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{current.notes || "No business notes."}</p></div></CardContent></Card>
        <section><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Order audit history</h3><span className="text-xs text-slate-400">{data?.auditEvents?.length ?? 0} event{data?.auditEvents?.length === 1 ? "" : "s"}</span></div>{!data?.auditEvents?.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No order-specific audit events are available.</p> : <div className="space-y-3">{data.auditEvents.map((event: any, index: number) => <div key={event.id ?? index} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium capitalize text-slate-800">{String(event.action ?? "Order update").replaceAll(".", " ")}</p><span className="text-xs text-slate-400">{formatSalesDate(event.occurredAt, true)}</span></div><p className="mt-1 text-xs text-slate-500">{event.actorName || event.actorEmail || "System"}</p>{event.detail && <p className="mt-2 break-words text-xs leading-5 text-slate-600">{event.detail}</p>}<div className="mt-2 space-y-1">{Array.isArray(event.changes) && event.changes.filter((change: any) => AUDIT_LABELS[change.field]).map((change: any) => <p key={change.field} className="break-words text-xs leading-5 text-slate-600"><strong>{AUDIT_LABELS[change.field]}:</strong> {auditValue(change.field, change.before, event.snapshotBefore)} → {auditValue(change.field, change.after, event.snapshotAfter)}</p>)}</div></div>)}</div>}</section>
      </div>}
    </DialogContent>
  </Dialog>;
}

function Detail({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 break-words text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>{value}</p></div>;
}

const AUDIT_LABELS: Record<string, string> = { productName: "Product", quantity: "Quantity", unitPriceCents: "Unit price", currency: "Currency", status: "Status", orderedAt: "Ordered at", ownerName: "Credited owner" };
function auditValue(field: string, value: unknown, snapshot: any): string {
  if (value === null || value === undefined) return "Not set";
  if (field === "unitPriceCents") return centsToMoney(Number(value), String(snapshot?.currency || "USD"));
  if (field === "orderedAt") return formatSalesDate(Number(value), true);
  return String(value);
}
