import OrderStaffSelect from "./OrderStaffSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { salesTrpc, type CustomerChoice, type OrderDraft, type OrderOwner, type OrderRow, ORDER_STATUSES, SALES_CURRENCIES, draftFromOrder, errorMessage, orderPayloadFromDraft, validateOrderDraft, easternDateTimeInput, salesAccessAllowed, type OrderStatus, type SalesCurrency } from "@/lib/sales";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const EMPTY_DRAFT: OrderDraft = {
  customerId: "", externalReference: "", productName: "", quantity: "1", unitPrice: "",
  currency: "USD", status: "paid", orderedAt: "", ownerUserId: "", notes: "",
};

export type OrderEditorDialogProps = {
  order?: OrderRow | null;
  customer?: CustomerChoice | null;
  owners?: OrderOwner[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (orderId: number) => Promise<void> | void;
  trigger?: React.ReactNode;
};

export default function OrderEditorDialog({ order, customer, owners: ownersProp, open: controlledOpen, onOpenChange, onSaved, trigger }: OrderEditorDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (!next && saving) return;
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [form, setForm] = useState<OrderDraft>(EMPTY_DRAFT);
  const [customerSearch, setCustomerSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const utils = salesTrpc.useUtils();
  const { data: access } = salesTrpc.dashboard.access.useQuery(undefined, { retry: false });
  const canSales = salesAccessAllowed(access);
  const { data: actor } = salesTrpc.auth.me.useQuery();
  const { data: choices = [], isFetching: choicesFetching } = salesTrpc.customers.choices.useQuery(
    { search: customerSearch.trim() || undefined },
    { enabled: canSales && open && !customer, placeholderData: (previous: CustomerChoice[] | undefined) => previous ?? [] },
  );
  const { data: fetchedOwners = [] } = salesTrpc.orders.owners.useQuery(undefined, { enabled: canSales && open && !ownersProp });
  const owners = ownersProp ?? fetchedOwners;
  const ownerOptions: OrderOwner[] = order && !owners.some(owner => owner.userId === order.ownerUserId) ? [{ userId: order.ownerUserId, name: order.ownerName, email: null, isActive: false, isSuperAdmin: false }, ...owners] : owners;
  const selectedCustomer = customer ?? choices.find((item: CustomerChoice) => item.id === Number(form.customerId));
  const createOrder = salesTrpc.orders.create.useMutation();
  const updateOrder = salesTrpc.orders.update.useMutation();

  useEffect(() => {
    if (!open) return;
    setForm(order ? draftFromOrder(order) : { ...EMPTY_DRAFT, customerId: customer ? String(customer.id) : "", orderedAt: easternDateTimeInput(Date.now()) });
    setCustomerSearch("");
  }, [open, order, customer]);

  const statusOptions = useMemo(() => ORDER_STATUSES.map(status => [status, status[0].toUpperCase() + status.slice(1)] as const), []);
  function update(key: keyof OrderDraft, value: string) { setForm(current => ({ ...current, [key]: value })); }

  async function save() {
    const validation = validateOrderDraft(form);
    if (validation) { toast.error(validation); return; }
    setSaving(true);
    try {
      const payload = orderPayloadFromDraft(form, actor?.id);
      const result = order
        ? await updateOrder.mutateAsync({ id: order.id, ...payload })
        : await createOrder.mutateAsync(payload);
      toast.success(order ? "Order updated." : "Order added.");
      if (controlledOpen === undefined) setInternalOpen(false);
      onOpenChange?.(false);
      void Promise.allSettled([utils.orders.invalidate(), utils.customers.invalidate(), Promise.resolve().then(() => onSaved?.(result.orderId))]);
    } catch (error) {
      // Keep the draft intact so a duplicate reference or validation error can be corrected.
      toast.error(errorMessage(error, "Unable to save the order."));
    } finally { setSaving(false); }
  }

  const defaultTrigger = order
    ? <Button variant="outline" className="min-h-11"><Pencil className="mr-2 h-4 w-4" />Edit order</Button>
    : <Button className="min-h-11 bg-teal-700 hover:bg-teal-800"><Plus className="mr-2 h-4 w-4" />Add order</Button>;

  return <Dialog open={open} onOpenChange={setOpen}>
    {!controlledOpen && <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>}
    <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl sm:max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
      <DialogHeader className="shrink-0 border-b px-4 pb-4 pt-5 sm:px-6">
        <DialogTitle>{order ? "Edit order" : "Add order"}</DialogTitle>
        <DialogDescription>{order ? "Update business details, attribution, or status. The creator remains immutable." : "Record a manual order without connecting a payment provider."}</DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:px-6">
        <div className="space-y-2 sm:col-span-2">
          <Label>Customer *</Label>
          {customer ? <div className="rounded-lg border min-w-0 break-words [overflow-wrap:anywhere] bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800">{customer.fullName}{customer.email ? ` · ${customer.email}` : ""}</div> : <>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} placeholder="Search customers by name or email" className="pl-9" /></div>
            <Select value={form.customerId} onValueChange={value => update("customerId", value)}><SelectTrigger className="w-full sm:w-full"><SelectValue placeholder={choicesFetching ? "Loading customers…" : "Select customer"} /></SelectTrigger><SelectContent>{choices.map((item: CustomerChoice) => <SelectItem key={item.id} value={String(item.id)}>{item.fullName}{item.email ? ` · ${item.email}` : ""}</SelectItem>)}</SelectContent></Select>
          </>}
        </div>
        <div className="space-y-2"><Label>Product or service *</Label><Input value={form.productName} onChange={event => update("productName", event.target.value)} maxLength={160} /></div>
        <div className="space-y-2"><Label>External reference</Label><Input value={form.externalReference} onChange={event => update("externalReference", event.target.value)} maxLength={80} placeholder="Optional invoice or PO number" /></div>
        <div className="space-y-2"><Label>Quantity *</Label><Input inputMode="numeric" value={form.quantity} onChange={event => update("quantity", event.target.value)} /></div>
        <div className="space-y-2"><Label>Unit price *</Label><div className="flex gap-2"><Input className="min-w-0 flex-1" inputMode="decimal" value={form.unitPrice} onChange={event => update("unitPrice", event.target.value)} placeholder="0.00" /><Select value={form.currency} onValueChange={value => update("currency", value)}><SelectTrigger className="w-[92px] shrink-0"><SelectValue /></SelectTrigger><SelectContent>{SALES_CURRENCIES.map(currency => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent></Select></div><p className="text-xs text-slate-500">Totals are quantity × unit price in this currency.</p></div>
        <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={value => update("status", value as OrderStatus)}><SelectTrigger className="w-full sm:w-full"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Ordered at (Eastern Time) *</Label><Input type="datetime-local" value={form.orderedAt} onChange={event => update("orderedAt", event.target.value)} /></div>
        <div className="min-w-0 space-y-2 sm:col-span-2"><Label>Credited owner</Label><OrderStaffSelect value={form.ownerUserId || "actor"} onValueChange={value => update("ownerUserId", value === "actor" ? "" : value)} owners={ownerOptions.filter(owner => owner.isActive || owner.userId === order?.ownerUserId)} actor={actor} includeMe /><p className="text-xs text-slate-500">Credited owner can differ from the person who created the record.</p></div>
        <div className="space-y-2 sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={event => update("notes", event.target.value)} rows={4} placeholder="Business notes only; do not add clinical information." /></div>
      </div>
      <DialogFooter className="shrink-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6"><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving || !canSales}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Saving…" : order ? "Save order" : "Add order"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
