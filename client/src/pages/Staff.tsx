import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERMISSION_LABELS, PermissionKey, formatDate, initials } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { Check, Clipboard, MailPlus, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const defaultPermissions: Record<PermissionKey, boolean> = { viewLeads: true, createLeads: true, editLeads: true, scanDocuments: false, viewClinical: false, manageContacts: true, changeStatus: true, exportData: false };

export default function Staff() {
  const utils = trpc.useUtils();
  const staff = trpc.staff.list.useQuery();
  const invites = trpc.staff.invites.useQuery();
  const update = trpc.staff.update.useMutation({ onSuccess: () => utils.staff.list.invalidate() });
  if (staff.isLoading || invites.isLoading) return <PageLoading />;
  if (staff.error) return <div className="mx-auto max-w-3xl rounded-2xl bg-rose-50 p-6 text-rose-700">{staff.error.message}</div>;

  return <div className="mx-auto max-w-[1300px]">
    <PageHeader eyebrow="Super Admin" title="Staff and access control" description="Invite technical staff, activate accounts, and define exactly which information and actions each person can access." actions={<InviteDialog onCreated={() => invites.refetch()} />} />
    <Tabs defaultValue="staff" className="space-y-5"><TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="staff" className="rounded-lg">Active directory ({staff.data?.length ?? 0})</TabsTrigger><TabsTrigger value="invites" className="rounded-lg">Invitations ({invites.data?.length ?? 0})</TabsTrigger></TabsList>
      <TabsContent value="staff" className="mt-0"><div className="space-y-4">{staff.data?.map(member => <StaffCard key={member.id} member={member} onSave={async values => { try { await update.mutateAsync(values); toast.success("Staff access updated."); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to update access."); } }} />)}</div></TabsContent>
      <TabsContent value="invites" className="mt-0"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6">{!invites.data?.length ? <EmptyState title="No staff invitations" description="Create an invitation to provision a technical staff member with defined permissions." /> : <div className="divide-y divide-slate-100">{invites.data.map(invite => <div key={invite.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><MailPlus className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{invite.fullName}</p><p className="truncate text-sm text-slate-500">{invite.email} · {invite.jobTitle}</p></div><Badge variant="outline" className="w-fit capitalize">{invite.status}</Badge><p className="text-xs text-slate-400">Expires {formatDate(invite.expiresAt)}</p></div>)}</div>}</CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}

function StaffCard({ member, onSave }: { member: any; onSave: (values: any) => Promise<void> }) {
  const [jobTitle, setJobTitle] = useState(member.jobTitle);
  const [active, setActive] = useState(member.isActive);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(member.permissions);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setJobTitle(member.jobTitle); setActive(member.isActive); setPermissions(member.permissions); }, [member]);
  const isAdmin = member.accessRole === "super_admin";
  return <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.04)]"><CardContent className="p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-start"><div className="flex min-w-64 items-center gap-4"><Avatar className="h-12 w-12"><AvatarFallback className="bg-slate-100 text-sm font-semibold">{initials(member.name?.split(" ")[0], member.name?.split(" ").slice(1).join(" "))}</AvatarFallback></Avatar><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-semibold text-slate-900">{member.name || "Unnamed staff member"}</p>{isAdmin && <ShieldCheck className="h-4 w-4 text-teal-700" />}</div><p className="truncate text-sm text-slate-500">{member.email || "No email"}</p><p className="mt-1 text-xs text-slate-400">Last sign-in {formatDate(member.lastSignedIn, true)}</p></div></div><div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{isAdmin ? <div className="rounded-xl bg-teal-50 p-4 sm:col-span-2 xl:col-span-4"><p className="font-medium text-teal-900">Super Administrator</p><p className="mt-1 text-sm text-teal-700">Full system access is always enabled for this account.</p></div> : <><div className="space-y-2 sm:col-span-2"><Label>Job title</Label><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></div><div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 sm:col-span-2"><div><p className="text-sm font-medium">Active account</p><p className="text-xs text-slate-500">Allow this staff member to use assigned features</p></div><Switch checked={active} onCheckedChange={setActive} /></div>{(Object.entries(PERMISSION_LABELS) as Array<[PermissionKey, readonly [string, string]]>).map(([key, [label, description]]) => <div key={key} className="flex min-h-24 items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"><div><p className="text-sm font-medium text-slate-800">{label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div><Switch checked={permissions[key]} onCheckedChange={checked => setPermissions(current => ({ ...current, [key]: checked }))} /></div>)}<div className="sm:col-span-2 xl:col-span-4 flex justify-end"><Button disabled={saving} onClick={async () => { setSaving(true); await onSave({ userId: member.id, jobTitle, isActive: active, permissions }); setSaving(false); }}><Check className="mr-2 h-4 w-4" />Save access</Button></div></>}</div></div></CardContent></Card>;
}

function InviteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [jobTitle, setJobTitle] = useState("Technical Staff"); const [permissions, setPermissions] = useState(defaultPermissions); const [url, setUrl] = useState("");
  const create = trpc.staff.createInvite.useMutation();
  async function submit() { try { const result = await create.mutateAsync({ fullName: name, email, jobTitle, permissions, origin: window.location.origin }); setUrl(result.inviteUrl); onCreated(); toast.success("Staff invitation created."); } catch (e) { toast.error(e instanceof Error ? e.message : "Unable to create invitation."); } }
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setUrl(""); }}><DialogTrigger asChild><Button className="bg-teal-700 hover:bg-teal-800"><UserPlus className="mr-2 h-4 w-4" />Invite technical staff</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Create technical staff account</DialogTitle><DialogDescription>Set the staff member's access before sharing their secure invitation link.</DialogDescription></DialogHeader>{url ? <div className="py-4"><div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200"><div className="flex items-center gap-2 font-semibold text-emerald-900"><Check className="h-4 w-4" />Invitation ready</div><p className="mt-2 text-sm leading-6 text-emerald-800">Send this link only to {email}. It expires in seven days and can be accepted only by the matching signed-in email.</p><div className="mt-4 flex gap-2"><Input readOnly value={url} className="bg-white" /><Button onClick={() => { navigator.clipboard.writeText(url); toast.success("Invitation link copied."); }}><Clipboard className="mr-2 h-4 w-4" />Copy</Button></div></div></div> : <><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label>Job title</Label><Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} /></div><div className="sm:col-span-2"><p className="mb-3 text-sm font-semibold">Initial permissions</p><div className="grid gap-3 sm:grid-cols-2">{(Object.entries(PERMISSION_LABELS) as Array<[PermissionKey, readonly [string, string]]>).map(([key, [label, description]]) => <div key={key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"><div><p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-slate-400">{description}</p></div><Switch checked={permissions[key]} onCheckedChange={checked => setPermissions(current => ({ ...current, [key]: checked }))} /></div>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={create.isPending || !name || !email}><MailPlus className="mr-2 h-4 w-4" />Create invitation</Button></DialogFooter></>}</DialogContent></Dialog>;
}
