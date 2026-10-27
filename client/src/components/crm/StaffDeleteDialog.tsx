import { useRef, useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { notifyStaffAccessUpdated } from "@/lib/accessRefresh";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
export default function StaffDeleteDialog({ member, disabled }: { member: { id: number; name?: string | null; email?: string | null }; disabled?: boolean }) {
 const [open, setOpen] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const submitting = useRef(false);
 const remove = trpc.staff.deleteAccount.useMutation();
 const utils = trpc.useUtils();
 async function confirm() {
  if (submitting.current) return;
  submitting.current = true; setError(null);
  try { await remove.mutateAsync({ userId: member.id }); notifyStaffAccessUpdated(); await Promise.allSettled([utils.staff.list.invalidate(), utils.emailSettings.invalidate(), utils.leads.assignees.invalidate(), utils.impersonation.invalidate(), utils.orders.owners.invalidate()]); setOpen(false); toast.success("Staff account deleted. Leads, orders and audit history were preserved."); }
  catch (e) { setError(e instanceof Error ? e.message : "The account could not be deleted. Please try again."); }
  finally { submitting.current = false; }
 }
 return <><Button variant="outline" className="w-full justify-start border-rose-200 text-rose-700 hover:bg-rose-50" disabled={disabled} onClick={() => { setError(null); setOpen(true); }}><Trash2 className="mr-2 h-4 w-4" />Delete staff</Button><AlertDialog open={open} onOpenChange={value => { if (!submitting.current) setOpen(value); }}><AlertDialogContent onEscapeKeyDown={event => { if (submitting.current) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>Delete staff account?</AlertDialogTitle><AlertDialogDescription><span className="block break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{member.name || "Staff member"}</span><span className="block break-all">{member.email}</span><span className="mt-3 block">This account will disappear from Staff &amp; access and cannot sign in. Its login, sessions, reset links and SMTP credentials will be removed.</span><span className="mt-3 block">Leads, documents, customers, orders, groups and audit history will NOT be deleted. Historical staff attribution is preserved; Super Admin or a Leader can reassign existing leads or sales when needed.</span><span className="mt-3 block">This action cannot be undone. The previous email may be used to create a new account.</span></AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800 [overflow-wrap:anywhere]">{error}</p>}<AlertDialogFooter><Button variant="outline" disabled={remove.isPending} onClick={() => { if (!submitting.current) setOpen(false); }}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={confirm}>{remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete staff account</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
