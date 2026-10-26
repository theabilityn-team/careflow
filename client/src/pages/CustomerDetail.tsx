import OrderDetailsDialog from "@/components/crm/OrderDetailsDialog";
import OrderEditorDialog from "@/components/crm/OrderEditorDialog";
import { PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { salesTrpc, salesAccessAllowed, salesReadAccessAllowed, centsToMoney, displayOrderReference, formatSalesDate, errorMessage, type CustomerRow, type OrderRow } from "@/lib/sales";
import { ArrowLeft, ExternalLink, Loader2, Plus, ShoppingBag } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { data: access, isLoading: accessLoading } = salesTrpc.dashboard.access.useQuery(undefined, { retry: false });
  const allowed = salesReadAccessAllowed(access);
  const canManage = salesAccessAllowed(access);
  const { data, isLoading, error, refetch } = salesTrpc.customers.get.useQuery({ id }, { enabled: allowed && Number.isInteger(id) && id > 0 });
  if (accessLoading) return <PageLoading />;
  if (!allowed) return <Unavailable />;
  if (isLoading) return <PageLoading />;
  if (error || !data) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-700">{error?.message ?? "Customer not found."}</div>;
  const customer = data.customer as CustomerRow;
  const orders = (data.orders ?? []) as OrderRow[];
  return <div className="mx-auto max-w-[1280px]">
    <button type="button" onClick={() => navigate("/customers")} className="mb-5 flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to customers</button>
    <PageHeader eyebrow={`Customer #${customer.id}`} title={customer.fullName} description={`Customer since ${formatSalesDate(customer.customerSince)} · Record updated ${formatSalesDate(customer.updatedAt, true)}`} actions={<div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto">{data.canOpenLead && <Button variant="outline" className="min-h-11" onClick={() => navigate(`/leads/${customer.leadId}`)}><ExternalLink className="mr-2 h-4 w-4" />Open lead</Button>}{canManage && <OrderEditorDialog customer={customer} onSaved={async () => { await refetch(); }} trigger={<Button className="min-h-11 bg-teal-700 hover:bg-teal-800"><Plus className="mr-2 h-4 w-4" />Add order</Button>} />}</div>} />
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary label="Customer since" value={formatSalesDate(customer.customerSince)} /><Summary label="Orders" value={String(customer.orderCount)} /><Summary label="State" value={customer.stateCode || "Not set"} /><Summary label="Created by" value={customer.createdByName} /></div>
    <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle className="text-lg">Customer record</CardTitle></CardHeader><CardContent className="space-y-5"><Info label="Email" value={customer.email} /><Info label="Phone" value={customer.phone} /><Info label="Lead status" value={customer.leadStatus} /><Info label="Customer notes" value={customer.notes} /><p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">This record is linked to Lead #{customer.leadId}. Sales pages intentionally do not expose diagnosis, clinical notes, or documents.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">Recent orders</CardTitle><p className="mt-1 text-sm text-slate-500">{canManage ? "Latest 100 orders for this customer." : "Latest 100 orders credited to you for this customer."}</p></div><ShoppingBag className="h-5 w-5 text-teal-700" /></div></CardHeader><CardContent>{!orders.length ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center"><p className="font-medium text-slate-800">No orders yet</p><p className="mt-1 text-sm text-slate-500">{canManage ? "Add the first manual order when the customer purchase is confirmed." : "No orders for this customer have been credited to you yet."}</p>{canManage && <div className="mt-4"><OrderEditorDialog customer={customer} onSaved={async () => { await refetch(); }} trigger={<Button variant="outline" className="min-h-11"><Plus className="mr-2 h-4 w-4" />Add order</Button>} /></div>}</div> : <div className="space-y-3">{orders.map(order => <OrderRowCard key={order.id} order={order} />)}</div>}</CardContent></Card>
    </div>
  </div>;
}

function OrderRowCard({ order }: { order: OrderRow }) { return <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{displayOrderReference(order)}</p><Badge variant="outline" className="capitalize">{order.status}</Badge></div><p className="mt-1 break-words text-sm text-slate-700">{order.productName} · {order.quantity} × {centsToMoney(order.unitPriceCents, order.currency)}</p><p className="mt-1 text-xs text-slate-500">{formatSalesDate(order.orderedAt, true)} · Credited owner: {order.ownerName}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><p className="font-semibold text-slate-950">{centsToMoney(order.totalCents, order.currency)}</p><OrderDetailsDialog order={order} trigger={<Button variant="outline" size="sm" className="min-h-11">Details</Button>} /></div></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 break-words font-semibold text-slate-900">{value}</p></CardContent></Card>; }
function Info({ label, value }: { label: string; value: string | null | undefined }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm text-slate-800">{value || "Not provided"}</p></div>; }
function Unavailable() { return <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Sales workspace</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">Customer details are unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">An active staff account is required to view your customer details.</p></div>; }
