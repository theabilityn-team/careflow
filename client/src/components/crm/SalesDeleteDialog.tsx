import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { salesTrpc, errorMessage } from "@/lib/sales";
import { Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type SalesDeleteTarget =
  | { kind: "customer"; id: number; name: string; orderCount: number; leadId: number }
  | { kind: "order"; id: number; name: string; customerId: number };

export function SalesDeleteButton({ kind, onClick }: { kind: "customer" | "order"; onClick: () => void }) {
  return <Button variant="outline" size="sm" className="min-h-11 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={onClick}><Trash2 className="mr-1.5 h-4 w-4" />Delete {kind}</Button>;
}

export function SalesDeleteDialog({ target, deleting, error, onCancel, onConfirm }: {
  target: SalesDeleteTarget | null;
  deleting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open && !deleting) onCancel(); }}>
    <AlertDialogContent className="sm:max-w-xl">
      <AlertDialogHeader className="text-left">
        <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {target?.kind} “{target?.name}”?</AlertDialogTitle>
        <AlertDialogDescription className="text-left [overflow-wrap:anywhere]">
          {target?.kind === "customer"
            ? `This permanently deletes this customer and all ${target.orderCount} associated orders. The original Lead #${target.leadId}, its status, documents, communications, and follow-ups remain unchanged.`
            : "This permanently deletes only this order. Its customer, original lead, and other orders remain unchanged."}
          {" "}Audit history is preserved and this deletion is recorded. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 [overflow-wrap:anywhere]">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-rose-700 text-white hover:bg-rose-800" disabled={deleting || !target} onClick={event => { event.preventDefault(); void onConfirm(); }}>
          {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          {deleting ? "Deleting…" : target?.kind === "customer" ? target.orderCount ? "Delete customer & orders" : "Delete customer" : "Delete order"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}

export function useSalesDeletion(canManage: boolean, onDeleted?: (target: SalesDeleteTarget) => void) {
  const [target, setTarget] = useState<SalesDeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const utils = salesTrpc.useUtils();
  const customerDelete = salesTrpc.customers.delete.useMutation();
  const orderDelete = salesTrpc.orders.delete.useMutation();
  const refresh = () => Promise.allSettled([utils.customers.invalidate(), utils.orders.invalidate(), utils.leads.invalidate(), utils.dashboard.invalidate()]);
  const openDelete = (next: SalesDeleteTarget) => { if (canManage && !submitting.current) { setError(null); setTarget(next); } };
  const cancel = () => { if (!submitting.current) { setError(null); setTarget(null); } };
  const confirm = async () => {
    if (!canManage || !target || submitting.current) return;
    const current = target;
    submitting.current = true; setDeleting(true); setError(null);
    try {
      if (current.kind === "customer") await customerDelete.mutateAsync({ id: current.id, expectedOrderCount: current.orderCount });
      else await orderDelete.mutateAsync({ id: current.id });
      setTarget(null);
      onDeleted?.(current);
      toast.success(current.kind === "customer" ? "Customer and associated orders deleted. Original lead preserved." : "Order deleted. Customer and other orders preserved.");
      await refresh();
    } catch (failure) {
      const message = errorMessage(failure, "Deletion failed. Please try again.");
      const code = (failure as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT" || code === "NOT_FOUND") {
        setTarget(null);
        if (code === "NOT_FOUND") onDeleted?.(current);
        await refresh();
        toast.error(message);
      } else setError(message);
    } finally { submitting.current = false; setDeleting(false); }
  };
  return { openDelete, dialog: <SalesDeleteDialog target={target} deleting={deleting} error={error} onCancel={cancel} onConfirm={confirm} /> };
}
