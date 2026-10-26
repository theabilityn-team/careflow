import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { salesTrpc, errorMessage, salesAccessAllowed, salesReadAccessAllowed } from "@/lib/sales";
import { CheckCircle2, Loader2, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export type LeadCustomerActionsProps = { lead: { id: number; firstName: string; lastName: string; status: string } };

export function LeadCustomerActions({ lead }: LeadCustomerActionsProps) {
  const [, navigate] = useLocation();
  const utils = salesTrpc.useUtils();
  const { data: access } = salesTrpc.dashboard.access.useQuery(undefined, { retry: false });
  const allowed = salesAccessAllowed(access);
  const canRead = salesReadAccessAllowed(access);
  const { data: customer, isLoading } = salesTrpc.customers.byLead.useQuery({ leadId: lead.id }, { enabled: canRead });
  const promote = salesTrpc.customers.promote.useMutation();
  const [open, setOpen] = useState(false);
  if (!canRead) return null;
  if (isLoading) return <Button variant="outline" className="min-h-11 min-w-0 whitespace-normal px-3" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</Button>;
  if (customer) return <Button variant="outline" className="min-h-11 min-w-0 whitespace-normal px-3" onClick={() => navigate(`/customers/${customer.id}`)}><CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />View customer</Button>;
  if (!allowed) return null;
  async function confirmPromotion() {
    try {
      const result = await promote.mutateAsync({ leadId: lead.id });
      await Promise.all([
        utils.customers.byLead.invalidate({ leadId: lead.id }),
        utils.customers.list.invalidate(),
        utils.dashboard.invalidate(),
        utils.leads.get.invalidate({ id: lead.id }),
      ]);
      setOpen(false);
      toast.success("Lead promoted to customer.");
      navigate(`/customers/${result.customerId}`);
    } catch (error) { toast.error(errorMessage(error, "Unable to promote this lead.")); }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!promote.isPending) setOpen(value); }}><AlertDialogTrigger asChild><Button className="min-h-11 min-w-0 whitespace-normal bg-teal-700 px-3 hover:bg-teal-800"><UserRoundPlus className="mr-2 h-4 w-4" />Mark as customer</Button></AlertDialogTrigger><AlertDialogContent className="w-[calc(100%-1rem)] max-w-lg"><AlertDialogHeader><AlertDialogTitle>Mark {lead.firstName} {lead.lastName} as a customer?</AlertDialogTitle><AlertDialogDescription>This is an explicit promotion. It keeps the existing lead, changes its business status to Customer, and creates one linked customer record. No order or email will be created.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={promote.isPending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); void confirmPromotion(); }} disabled={promote.isPending}>{promote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Promote to customer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

export default LeadCustomerActions;
