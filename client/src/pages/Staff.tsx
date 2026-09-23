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
import { Check, Clipboard, KeyRound, Link2, Loader2, MailPlus, ShieldCheck, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const defaultPermissions: Record<PermissionKey, boolean> = {
  viewLeads: true,
  createLeads: true,
  editLeads: true,
  scanDocuments: false,
  viewClinical: false,
  manageContacts: true,
  changeStatus: true,
  exportData: false,
};

export default function Staff() {
  const utils = trpc.useUtils();
  const staff = trpc.staff.list.useQuery();
  const invites = trpc.staff.invites.useQuery();
  const resets = trpc.staff.passwordResetRequests.useQuery();
  const update = trpc.staff.update.useMutation({ onSuccess: () => utils.staff.list.invalidate() });

  if (staff.isLoading || invites.isLoading || resets.isLoading) return <PageLoading />;
  if (staff.error || invites.error || resets.error) {
    const error = staff.error ?? invites.error ?? resets.error;
    return <div className="mx-auto max-w-3xl break-words rounded-2xl bg-rose-50 p-6 text-rose-700 [overflow-wrap:anywhere]">{error?.message}</div>;
  }

  const openResetCount = resets.data?.filter(item => item.status === "pending" || item.status === "ready").length ?? 0;

  return <div className="mx-auto max-w-[1300px]">
    <PageHeader eyebrow="Super Admin" title="Staff and access control" description="Invite technical staff, manage access, review password resets, and monitor each staff SMTP sender." actions={<InviteDialog onCreated={() => invites.refetch()} />} />
    <Tabs defaultValue="staff" className="space-y-5">
      <TabsList className="h-auto w-full flex-nowrap justify-start overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
        <TabsTrigger value="staff" className="rounded-lg">Active directory ({staff.data?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="invites" className="rounded-lg">Invitations ({invites.data?.length ?? 0})</TabsTrigger>
        <TabsTrigger value="password-resets" className="rounded-lg">Password resets ({openResetCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="staff" className="mt-0">
        <div className="space-y-4">
          {!staff.data?.length ? <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><EmptyState title="No technical staff" description="Invite a technical staff member to create the first staff account." /></CardContent></Card> : staff.data.map(member => <StaffCard key={member.id} member={member} onSave={async values => {
            try {
              await update.mutateAsync(values);
              toast.success("Staff access updated.");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Unable to update access.");
            }
          }} />)}
        </div>
      </TabsContent>
      <TabsContent value="invites" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6">
          {!invites.data?.length ? <EmptyState title="No staff invitations" description="Create an invitation to provision a technical staff member with defined permissions." /> : <div className="divide-y divide-slate-100">{invites.data.map(invite => <div key={invite.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><MailPlus className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{invite.fullName}</p><p className="break-words text-sm text-slate-500 [overflow-wrap:anywhere]"><span className="break-all">{invite.email}</span> · {invite.jobTitle}</p></div><Badge variant="outline" className="w-fit capitalize">{invite.status}</Badge><p className="text-xs text-slate-400">Expires {formatDate(invite.expiresAt)}</p></div>)}</div>}
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="password-resets" className="mt-0"><PasswordResetRequests requests={resets.data ?? []} onChanged={() => resets.refetch()} /></TabsContent>
    </Tabs>
  </div>;
}

function StaffCard({ member, onSave }: { member: any; onSave: (values: any) => Promise<void> }) {
  const [jobTitle, setJobTitle] = useState(member.jobTitle);
  const [active, setActive] = useState(member.isActive);
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(member.permissions);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setJobTitle(member.jobTitle); setActive(member.isActive); setPermissions(member.permissions); }, [member]);

  return <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.04)]"><CardContent className="p-4 sm:p-6"><div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start">
    <div className="flex min-w-0 items-start gap-4 xl:min-w-64"><Avatar className="h-12 w-12 shrink-0"><AvatarFallback className="bg-slate-100 text-sm font-semibold">{initials(member.name?.split(" ")[0], member.name?.split(" ").slice(1).join(" "))}</AvatarFallback></Avatar><div className="min-w-0"><p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{member.name || "Unnamed staff member"}</p><p className="break-all text-sm text-slate-500">{member.email || member.loginIdentifier || "No login identifier"}</p><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline" className={member.smtpEnabled && member.smtpVerifiedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : member.smtpEnabled ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-500"}>{member.smtpEnabled && member.smtpVerifiedAt ? "SMTP ready" : member.smtpEnabled ? "SMTP not verified" : "SMTP not configured"}</Badge></div><p className="mt-2 break-words text-xs text-slate-400">Last sign-in {formatDate(member.lastSignedIn, true)}</p>{member.smtpLastTestError && <p className="mt-1 break-words text-xs text-rose-500 [overflow-wrap:anywhere]">SMTP: {member.smtpLastTestError}</p>}</div></div>
    <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-2 sm:col-span-2"><Label>Job title</Label><Input value={jobTitle} onChange={event => setJobTitle(event.target.value)} /></div>
      <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 sm:col-span-2"><div className="min-w-0"><p className="text-sm font-medium">Active account</p><p className="break-words text-xs text-slate-500">Allow this staff member to use assigned features</p></div><Switch className="shrink-0" checked={active} onCheckedChange={setActive} /></div>
      {(Object.entries(PERMISSION_LABELS) as Array<[PermissionKey, readonly [string, string]]>).map(([key, [label, description]]) => <div key={key} className="flex min-h-24 min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"><div className="min-w-0"><p className="break-words text-sm font-medium text-slate-800">{label}</p><p className="mt-1 break-words text-xs leading-5 text-slate-400">{description}</p></div><Switch className="shrink-0" checked={permissions[key]} onCheckedChange={checked => setPermissions(current => ({ ...current, [key]: checked }))} /></div>)}
      <div className="flex justify-end sm:col-span-2 xl:col-span-4"><Button className="w-full sm:w-auto" disabled={saving} onClick={async () => { setSaving(true); try { await onSave({ userId: member.id, jobTitle, isActive: active, permissions }); } finally { setSaving(false); } }}><Check className="mr-2 h-4 w-4" />Save access</Button></div>
    </div>
  </div></CardContent></Card>;
}

function PasswordResetRequests({ requests, onChanged }: { requests: any[]; onChanged: () => void }) {
  const [links, setLinks] = useState<Record<number, string>>({});
  const prepare = trpc.staff.preparePasswordReset.useMutation();
  const reject = trpc.staff.rejectPasswordReset.useMutation();
  if (!requests.length) return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6"><EmptyState title="No password reset requests" description="Requests submitted from the staff login screen will appear here for Super Admin review." /></CardContent></Card>;

  return <div className="space-y-4">{requests.map(request => {
    const actionable = request.status === "pending" || request.status === "ready";
    const link = links[request.id];
    return <Card key={request.id} className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700"><KeyRound className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{request.staffName || "Staff member"}</p><Badge variant="outline" className="capitalize">{request.status}</Badge>{!request.isActive && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Inactive</Badge>}</div><p className="mt-1 break-all text-sm text-slate-500">{request.email}</p><p className="mt-1 break-words text-xs text-slate-400">Requested {formatDate(request.requestedAt, true)}{request.expiresAt ? ` · Link expires ${formatDate(request.expiresAt, true)}` : ""}</p></div>
        {actionable && <div className="grid w-full gap-2 min-[360px]:grid-cols-2 lg:flex lg:w-auto"><Button variant="outline" disabled={reject.isPending} onClick={async () => { try { await reject.mutateAsync({ requestId: request.id }); setLinks(current => { const next = { ...current }; delete next[request.id]; return next; }); onChanged(); toast.success("Password reset request rejected."); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to reject request."); } }}><X className="mr-2 h-4 w-4" />Reject</Button><Button disabled={prepare.isPending} className="bg-teal-700 hover:bg-teal-800" onClick={async () => { try { const result = await prepare.mutateAsync({ requestId: request.id, origin: window.location.origin }); setLinks(current => ({ ...current, [request.id]: result.resetUrl })); onChanged(); toast.success("One-time reset link generated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to generate reset link."); } }}>{prepare.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}{request.status === "ready" ? "Generate new link" : "Generate reset link"}</Button></div>}
      </div>
      {link && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200"><p className="text-sm font-semibold text-emerald-900">One-time link ready</p><p className="mt-1 text-xs leading-5 text-emerald-800">Send this link only to {request.email}. It expires in one hour and can be used once.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input readOnly value={link} className="bg-white" /><Button onClick={() => { navigator.clipboard.writeText(link); toast.success("Reset link copied."); }}><Clipboard className="mr-2 h-4 w-4" />Copy link</Button></div></div>}
    </CardContent></Card>;
  })}</div>;
}

function InviteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("Technical Staff");
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [url, setUrl] = useState("");
  const create = trpc.staff.createInvite.useMutation();

  async function submit() {
    try {
      const result = await create.mutateAsync({ fullName: name, email, jobTitle, permissions, origin: window.location.origin });
      setUrl(result.inviteUrl);
      onCreated();
      toast.success("Staff invitation created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create invitation.");
    }
  }

  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) setUrl(""); }}><DialogTrigger asChild><Button className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><UserPlus className="mr-2 h-4 w-4" />Invite technical staff</Button></DialogTrigger><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Create technical staff account</DialogTitle><DialogDescription>Set the staff member's access before sharing their secure invitation link.</DialogDescription></DialogHeader>{url ? <div className="min-w-0 py-4"><div className="min-w-0 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:p-5"><div className="flex items-center gap-2 font-semibold text-emerald-900"><Check className="h-4 w-4" />Invitation ready</div><p className="mt-2 break-words text-sm leading-6 text-emerald-800 [overflow-wrap:anywhere]">Send this link only to {email}. It expires in seven days.</p><div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"><Input readOnly value={url} className="min-w-0 bg-white" /><Button onClick={() => { navigator.clipboard.writeText(url); toast.success("Invitation link copied."); }}><Clipboard className="mr-2 h-4 w-4" />Copy</Button></div></div></div> : <><div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2"><Label>Full name</Label><Input value={name} onChange={event => setName(event.target.value)} /></div><div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={event => setEmail(event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label>Job title</Label><Input value={jobTitle} onChange={event => setJobTitle(event.target.value)} /></div><div className="sm:col-span-2"><p className="mb-3 text-sm font-semibold">Initial permissions</p><div className="grid gap-3 sm:grid-cols-2">{(Object.entries(PERMISSION_LABELS) as Array<[PermissionKey, readonly [string, string]]>).map(([key, [label, description]]) => <div key={key} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"><div className="min-w-0"><p className="break-words text-sm font-medium">{label}</p><p className="mt-1 break-words text-xs leading-5 text-slate-400">{description}</p></div><Switch className="shrink-0" checked={permissions[key]} onCheckedChange={checked => setPermissions(current => ({ ...current, [key]: checked }))} /></div>)}</div></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit} disabled={create.isPending || !name || !email}><MailPlus className="mr-2 h-4 w-4" />Create invitation</Button></DialogFooter></>}</DialogContent></Dialog>;
}
