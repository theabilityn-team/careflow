import { SalesDeleteButton, useSalesDeletion } from "@/components/crm/SalesDeleteDialog";
import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { salesTrpc, salesAccessAllowed, salesReadAccessAllowed, formatSalesDate, type CustomerRow } from "@/lib/sales";
import { STATE_OPTIONS } from "@/lib/crm";
import { ChevronLeft, ChevronRight, ExternalLink, Search, UserRound } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";

function pageNumbers(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, Math.max(1, totalPages - 4)));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
}

export default function Customers() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stateCode, setStateCode] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const deferredSearch = useDeferredValue(search.trim());
  const { data: access, isLoading: accessLoading } = salesTrpc.dashboard.access.useQuery(undefined, { retry: false });
  const allowed = salesReadAccessAllowed(access);
  const canManage = salesAccessAllowed(access);
  const deletion = useSalesDeletion(canManage);
  const queryInput = useMemo(() => ({ search: deferredSearch || undefined, stateCode: stateCode === "all" ? undefined : stateCode, page, pageSize }), [deferredSearch, stateCode, page, pageSize]);
  const { data, isLoading, isFetching, error } = salesTrpc.customers.list.useQuery(queryInput, { enabled: allowed, placeholderData: (previous: any) => previous });
  const items = (data?.items ?? []) as CustomerRow[];
  if (accessLoading) return <PageLoading />;
  if (!allowed) return <Unavailable />;
  const firstResult = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastResult = data?.total ? Math.min(data.page * data.pageSize, data.total) : 0;
  const setFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  return <div className="mx-auto max-w-[1380px]">
    <PageHeader eyebrow="Sales workspace" title="Customers" description={canManage ? "All staff customers promoted from the existing lead pipeline." : "Your own customers and customers linked to orders credited to you. Read-only access."} actions={<Button onClick={() => navigate("/orders")} variant="outline" className="min-h-11 w-full bg-white sm:w-auto">View orders</Button>} />
    <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-0">
      <div className="border-b border-slate-100 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-11 pl-10" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search customer name, email, or phone" /></div><Select value={stateCode} onValueChange={setFilter(setStateCode)}><SelectTrigger className="min-h-11 w-full sm:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{STATE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><p className="mt-3 text-sm text-slate-500"><strong className="text-slate-800">{data?.total ?? 0}</strong> customer{data?.total === 1 ? "" : "s"}{isFetching && !isLoading ? " · Updating…" : ""}</p></div>
      {isLoading ? <div className="p-6"><PageLoading /></div> : error ? <div className="m-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 sm:m-6">{error.message}</div> : !items.length ? <div className="p-4 sm:p-6"><EmptyState title="No customers found" description={search || stateCode !== "all" ? "Clear or adjust the filters to widen the result set." : "Customers appear here after a Leader explicitly promotes a lead."} /></div> : <>
        <div className="divide-y divide-slate-100 md:hidden">{items.map(customer => <CustomerCard key={customer.id} customer={customer} onOpen={() => navigate(`/customers/${customer.id}`)} onDelete={canManage ? () => deletion.openDelete({ kind: "customer", id: customer.id, name: customer.fullName, leadId: customer.leadId, orderCount: customer.orderCount }) : undefined} />)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-6 py-4 font-semibold">Customer</th><th className="px-4 py-4 font-semibold">State</th><th className="px-4 py-4 font-semibold">Customer since</th><th className="px-4 py-4 font-semibold">Orders</th><th className="px-4 py-4 font-semibold">Record created by</th><th className="px-4 py-4" /></tr></thead><tbody>{items.map(customer => <tr key={customer.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="px-6 py-4"><Link href={`/customers/${customer.id}`} className="font-semibold text-slate-900 hover:text-teal-700">{customer.fullName}</Link><p className="mt-1 break-all text-xs text-slate-500">{customer.email || customer.phone || "No contact details"}</p></td><td className="px-4 py-4"><Badge variant="outline" className="bg-white">{customer.stateCode || "Not set"}</Badge></td><td className="px-4 py-4 text-slate-600">{formatSalesDate(customer.customerSince)}</td><td className="px-4 py-4 text-slate-600">{customer.orderCount}</td><td className="px-4 py-4 text-slate-600">{customer.createdByName}</td><td className="px-4 py-4"><div className="flex flex-wrap items-center justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => navigate(`/customers/${customer.id}`)}>View <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button>{canManage && <SalesDeleteButton kind="customer" onClick={() => deletion.openDelete({ kind: "customer", id: customer.id, name: customer.fullName, leadId: customer.leadId, orderCount: customer.orderCount })} />}</div></td></tr>)}</tbody></table></div>
      </>}
      {data && data.total > 0 && <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-col gap-2 text-sm text-slate-500 min-[360px]:flex-row min-[360px]:items-center"><span>Showing {firstResult}–{lastResult} of {data.total}</span><Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger className="min-h-11 w-full min-[360px]:w-[120px] md:min-h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="25">25 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:gap-1"><Button variant="outline" size="sm" className="min-h-11 min-w-0 px-2 sm:min-h-9 sm:px-3" disabled={data.page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4 sm:mr-1" /><span className="hidden min-[360px]:inline">Previous</span></Button><span className="text-center text-sm font-medium text-slate-600 sm:hidden">{data.page} / {data.totalPages}</span><div className="hidden items-center gap-1 sm:flex">{pageNumbers(data.page, data.totalPages).map(number => <Button key={number} variant={number === data.page ? "default" : "ghost"} size="icon" className={number === data.page ? "bg-teal-700 hover:bg-teal-800" : ""} onClick={() => setPage(number)}>{number}</Button>)}</div><Button variant="outline" size="sm" className="min-h-11 min-w-0 px-2 sm:min-h-9 sm:px-3" disabled={data.page >= data.totalPages} onClick={() => setPage(value => Math.min(data.totalPages, value + 1))}><span className="hidden min-[360px]:inline">Next</span><ChevronRight className="h-4 w-4 min-[360px]:ml-1" /></Button></div></div>}
    </CardContent></Card>
    {deletion.dialog}
  </div>;
}

function CustomerCard({ customer, onOpen, onDelete }: { customer: CustomerRow; onOpen: () => void; onDelete?: () => void }) {
  return <div className="min-w-0"><button type="button" onClick={onOpen} className="min-h-11 w-full p-4 text-left transition-colors hover:bg-slate-50"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><UserRound className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-950">{customer.fullName}</p><p className="mt-1 break-all text-xs text-slate-500">{customer.email || customer.phone || "No contact details"}</p></div><ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></div><div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Customer since</p><p className="mt-1 text-slate-700">{formatSalesDate(customer.customerSince)}</p></div><div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Orders</p><p className="mt-1 text-slate-700">{customer.orderCount}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline" className="bg-white">{customer.stateCode || "State not set"}</Badge><Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">Customer</Badge></div></button>{onDelete && <div className="px-4 pb-4"><SalesDeleteButton kind="customer" onClick={onDelete} /></div>}</div>;
}

function Unavailable() { return <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Sales workspace</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">Customers are unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-600">An active staff account is required to view your customers.</p></div>; }
