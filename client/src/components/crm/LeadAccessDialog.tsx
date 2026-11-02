import { SharingRemovalButton } from "@/components/crm/SharingRemovalButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { FolderPlus, Share2, UserPlus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Props = { leadId: number; ownerId?: number; staff: Array<{ id: number; name: string | null; email: string | null }> };

export function LeadAccessDialog({ leadId, ownerId, staff }: Props) {
  const [open, setOpen] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [adding, setAdding] = useState(false);
  const addLock = useRef(false);
  const utils = trpc.useUtils();
  const sharingQuery = trpc.groups.leadSharing.useQuery({ leadId }, { refetchInterval: 15_000, retry: false });
  const { data: sharing } = sharingQuery;
  const { data: groups = [] } = trpc.groups.list.useQuery();
  const share = trpc.groups.shareLead.useMutation();
  const unshare = trpc.groups.unshareLead.useMutation();
  const addToGroup = trpc.groups.addLead.useMutation();
  const removeFromGroup = trpc.groups.removeLead.useMutation();
  const availableStaff = staff.filter(member => member.id !== ownerId && !sharing?.shares.some(item => item.userId === member.id));
  const availableGroups = groups.filter(group => group.canManageMembership && !sharing?.groups.some(item => item.id === group.id));
  const busy = adding || unshare.isPending || removeFromGroup.isPending;

  async function refresh() {
    await Promise.all([utils.groups.invalidate(), utils.leads.invalidate(), utils.dashboard.invalidate()]);
  }

  async function add(action: () => Promise<unknown>, message: string) {
    if (addLock.current || busy) return;
    addLock.current = true;
    setAdding(true);
    try {
      await action();
      setStaffId(""); setGroupId("");
      toast.success(message);
      try { await refresh(); } catch { toast.info("The change was saved. Refresh this page to see updated access."); }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update sharing. Please try again.");
    } finally { addLock.current = false; setAdding(false); }
  }

  if (!sharing?.canManage && !sharing?.groups.some(group => group.canRemove) && !availableGroups.length) return null;
  return <Dialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); if (value) { setStaffId(""); setGroupId(""); } } }}>
    <DialogTrigger asChild><Button variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"><Share2 className="mr-2 h-4 w-4" />Groups & sharing</Button></DialogTrigger>
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader><DialogTitle>Groups and staff access</DialogTitle><DialogDescription>Add or remove direct staff sharing and group membership. Removing sharing never deletes the lead, its documents, or its history.</DialogDescription></DialogHeader>
      <div className="min-w-0 space-y-6 py-2">
        {sharingQuery.isError ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">Unable to load current sharing. <Button type="button" variant="outline" onClick={() => void sharingQuery.refetch()}>Retry</Button></div> : <>
          {availableGroups.length > 0 && <section className="min-w-0">
            <Label>Add to a group you manage</Label>
            <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
              <Select value={groupId} onValueChange={setGroupId} disabled={busy}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Select group" /></SelectTrigger><SelectContent>{availableGroups.map(group => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select>
              <Button className="w-full sm:w-auto" disabled={!groupId || busy} onClick={() => void add(() => addToGroup.mutateAsync({ groupId: Number(groupId), leadId }), "Lead added to group.")}><FolderPlus className="mr-2 h-4 w-4" />{adding ? "Saving…" : "Add"}</Button>
            </div>
          </section>}
          <section className="min-w-0">
            <Label>Current groups</Label>
            <div className="mt-3 space-y-2">{sharing?.groups.length ? sharing.groups.map(group => <div key={group.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{group.name}</p>{group.canRemove && <a href={`/groups/${group.id}`} className="text-xs font-medium text-teal-700 underline">Manage group sharing</a>}</div>
              {group.canRemove && <SharingRemovalButton label="Remove from group" title="Remove lead from group?" description={`Remove this lead from “${group.name}”. The lead and all documents stay in the CRM. Staff may retain access through direct sharing, another group, ownership, assignment, or Leader access.`} successMessage="Lead removed from group. Lead and documents preserved." disabled={busy} onRemove={() => removeFromGroup.mutateAsync({ groupId: group.id, leadId })} onRemoved={refresh} />}
            </div>) : <p className="text-sm text-slate-500">Not added to a group.</p>}</div>
          </section>
          {sharing?.canManage && <section className="min-w-0 border-t border-slate-100 pt-5">
            <Label>Direct staff access</Label>
            <p className="mt-2 text-xs leading-5 text-slate-500">Removing a direct share only removes that access path. Access through shared groups, ownership, assignment, or a Leader role remains until separately changed.</p>
            <div className="mt-3 space-y-2">{sharing.shares.length ? sharing.shares.map(item => <div key={item.id} className="flex min-w-0 flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{item.name || item.email || `Staff #${item.userId}`}</p><p className="break-all text-xs text-slate-500">{item.email}</p></div>
              <SharingRemovalButton label="Remove direct access" title="Remove direct staff access?" description={`Remove the direct share for ${item.name || item.email || `Staff #${item.userId}`}. The lead, documents, and history are preserved. Shared groups, ownership, assignment, or Leader access can still grant access.`} successMessage="Direct sharing removed. Other access paths are unchanged." disabled={busy} onRemove={() => unshare.mutateAsync({ leadId, staffId: item.userId })} onRemoved={refresh} />
            </div>) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No direct staff shares.</p>}</div>
            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
              <Select value={staffId} onValueChange={setStaffId} disabled={busy || !availableStaff.length}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder={availableStaff.length ? "Select staff member" : "No other staff available"} /></SelectTrigger><SelectContent>{availableStaff.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name || member.email}</SelectItem>)}</SelectContent></Select>
              <Button className="w-full sm:w-auto" disabled={!staffId || busy} onClick={() => void add(() => share.mutateAsync({ leadId, staffId: Number(staffId) }), "Lead shared.")}><UserPlus className="mr-2 h-4 w-4" />{adding ? "Sharing…" : "Share"}</Button>
            </div>
          </section>}
        </>}
      </div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Done</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
