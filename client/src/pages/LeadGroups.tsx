import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { diagnosisCategoryLabel, formatDate, initials, stateLabel } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, FolderKanban, FolderPlus, Share2, Trash2, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function LeadGroups() {
  const [, params] = useRoute("/groups/:id");
  const groupId = Number(params?.id);
  return Number.isFinite(groupId) && groupId > 0 ? <GroupDetail id={groupId} /> : <GroupList />;
}

function GroupList() {
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = trpc.groups.list.useQuery();
  if (isLoading) return <PageLoading />;
  return <div className="mx-auto max-w-[1400px]">
    <PageHeader eyebrow="Scoped collaboration" title="Lead groups" description="Organize your leads into private groups. Only you, Super Admin, and staff you explicitly share with can open them." actions={<CreateGroupDialog onCreated={id => { refetch(); navigate(`/groups/${id}`); }} />} />
    {error ? <div className="break-words rounded-xl bg-rose-50 p-4 text-rose-700 [overflow-wrap:anywhere]">{error.message}</div> : !data?.length ? <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-7"><EmptyState title="No lead groups yet" description="Create your first group, then attach any lead you own or can access." action={<CreateGroupDialog onCreated={id => navigate(`/groups/${id}`)} />} /></CardContent></Card> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.map(group => <button key={group.id} onClick={() => navigate(`/groups/${group.id}`)} className="min-w-0 text-left"><Card className="h-full min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)] transition-transform hover:-translate-y-0.5"><CardContent className="min-w-0 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><FolderKanban className="h-5 w-5" /></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /></div><h2 className="mt-5 break-words text-lg font-semibold text-slate-950 [overflow-wrap:anywhere]">{group.name}</h2><p className="mt-2 min-h-10 break-words text-sm leading-5 text-slate-500 [overflow-wrap:anywhere]">{group.description || "No group description."}</p><div className="mt-5 flex flex-wrap gap-2"><Badge variant="outline">{group.memberCount} lead{Number(group.memberCount) === 1 ? "" : "s"}</Badge><Badge variant="outline"><Share2 className="mr-1 h-3 w-3" />{group.shareCount} shared</Badge></div><p className="mt-4 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">Owner: {group.ownerName || "Super Administrator"} · Updated {formatDate(group.updatedAt)}</p></CardContent></Card></button>)}</div>}
  </div>;
}

function GroupDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.groups.get.useQuery({ id });
  const { data: staff = [] } = trpc.leads.assignees.useQuery();
  const [staffId, setStaffId] = useState("");
  const share = trpc.groups.shareGroup.useMutation({ onSuccess: () => utils.groups.get.invalidate({ id }) });
  const unshare = trpc.groups.unshareGroup.useMutation({ onSuccess: () => utils.groups.get.invalidate({ id }) });
  const removeLead = trpc.groups.removeLead.useMutation({ onSuccess: () => utils.groups.get.invalidate({ id }) });
  if (isLoading) return <PageLoading />;
  if (error || !data) return <div className="mx-auto max-w-3xl break-words rounded-2xl bg-rose-50 p-6 text-rose-700 [overflow-wrap:anywhere]">{error?.message || "Group not found."}</div>;
  const availableStaff = staff.filter(member => member.id !== data.group.ownerId && !data.shares.some(shareItem => shareItem.userId === member.id));

  return <div className="mx-auto max-w-[1400px]">
    <button onClick={() => navigate("/groups")} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-900 md:min-h-8"><ArrowLeft className="h-4 w-4" />Back to groups</button>
    <PageHeader eyebrow="Lead group" title={data.group.name} description={`${data.group.description || "No description"} · Owner: ${data.ownerName || "Super Administrator"}`} actions={<Button className="w-full sm:w-auto" onClick={() => navigate(`/leads?group=${id}`)} variant="outline">Browse in lead list</Button>} />
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-0">{!data.members.length ? <div className="p-7"><EmptyState title="This group is empty" description="Open a lead and use Add to group to attach it here." /></div> : <div className="divide-y divide-slate-100">{data.members.map(({ lead }) => <div key={lead.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"><button onClick={() => navigate(`/leads/${lead.id}`)} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left sm:items-center sm:gap-4"><Avatar className="shrink-0"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{lead.firstName} {lead.lastName}</p><div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500"><span>{stateLabel(lead.stateCode)}</span><span>·</span><span className="break-words">{diagnosisCategoryLabel(lead.diagnosisCategory)}</span></div><div className="mt-2 sm:hidden"><StatusPill value={lead.status} /></div></div><div className="hidden shrink-0 sm:block"><StatusPill value={lead.status} /></div></button>{data.canManage && <Button className="w-full sm:w-auto" size="sm" variant="ghost" onClick={async () => { await removeLead.mutateAsync({ groupId: id, leadId: lead.id }); toast.success("Lead removed from group."); }}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>}</div>)}</div>}</CardContent></Card>
      <Card className="h-fit min-w-0 rounded-2xl border-0 bg-slate-950 text-white shadow-sm"><CardContent className="min-w-0 p-5 sm:p-6"><div className="flex items-center gap-2"><Share2 className="h-5 w-5 shrink-0 text-teal-300" /><h2 className="font-semibold">Group access</h2></div><p className="mt-2 break-words text-sm leading-6 text-slate-400">Sharing this group gives the selected staff member access to every current lead in it.</p><div className="mt-5 space-y-3">{data.shares.map(item => <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-white/[.06] p-2 pl-3"><UsersRound className="h-4 w-4 shrink-0 text-teal-300" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{item.name || item.email}</p><p className="break-all text-xs text-slate-400">{item.email}</p></div>{data.canManage && <button className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10 md:h-8 md:w-8" onClick={async () => { await unshare.mutateAsync({ groupId: id, staffId: item.userId }); toast.success("Group access removed."); }} aria-label="Remove group access"><Trash2 className="h-4 w-4 text-slate-400" /></button>}</div>)}{!data.shares.length && <p className="rounded-xl bg-white/[.06] p-4 text-sm text-slate-400">Not shared with other staff.</p>}</div>{data.canManage && <div className="mt-5 min-w-0 space-y-3 border-t border-slate-800 pt-5"><Label className="text-slate-300">Share with staff</Label><Select value={staffId} onValueChange={setStaffId}><SelectTrigger className="w-full min-w-0 border-slate-700 bg-slate-900"><SelectValue placeholder="Select staff member" /></SelectTrigger><SelectContent>{availableStaff.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name || member.email}</SelectItem>)}</SelectContent></Select><Button disabled={!staffId || share.isPending} onClick={async () => { await share.mutateAsync({ groupId: id, staffId: Number(staffId) }); setStaffId(""); toast.success("Group shared."); }} className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400"><UserPlus className="mr-2 h-4 w-4" />Share group</Button></div>}</CardContent></Card>
    </div>
  </div>;
}

function CreateGroupDialog({ onCreated }: { onCreated: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = trpc.groups.create.useMutation();
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><FolderPlus className="mr-2 h-4 w-4" />Create group</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create lead group</DialogTitle><DialogDescription>This group is private to you until you explicitly share it with another staff member.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label>Group name</Label><Input value={name} onChange={event => setName(event.target.value)} placeholder="Florida Oncology — Priority" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} placeholder="Purpose, campaign, or workflow notes" /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={create.isPending || name.trim().length < 2} onClick={async () => { try { const result = await create.mutateAsync({ name, description: description || null }); setOpen(false); onCreated(result.id); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create group."); } }}>Create group</Button></DialogFooter></DialogContent></Dialog>;
}
