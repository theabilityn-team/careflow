import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PERMISSION_LABELS, type PermissionKey } from "@/lib/crm";
import { DEFAULT_STAFF_ACCOUNT_PERMISSIONS, matchingStaffAccountPassword, normalizeStaffAccountEmail, STAFF_PASSWORD_HINT, validStaffAccountIdentity } from "@/lib/staffAccountForms";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, KeyRound, Loader2, Pencil, UserPlus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

type StaffIdentity = { id: number; name?: string | null; email?: string | null; loginIdentifier?: string | null };
const blankAccount = { fullName: "", email: "", jobTitle: "Technical Staff", password: "", confirmation: "", isActive: true };
const contentClass = "flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl sm:p-0";
const footerClass = "shrink-0 border-t border-slate-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4";

function PasswordField({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={200} value={value} disabled={disabled} className="pr-12" onChange={event => onChange(event.target.value)} />
      <button type="button" aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600" disabled={disabled} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
    </div>
  </div>;
}

async function refreshAccountQueries(utils: ReturnType<typeof trpc.useUtils>) {
  await Promise.all([utils.staff.invalidate(), utils.emailSettings.invalidate(), utils.dashboard.invalidate()]).catch(() => undefined);
}

export function CreateStaffAccountDialog() {
  const utils = trpc.useUtils();
  const create = trpc.staff.createAccount.useMutation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blankAccount });
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>({ ...DEFAULT_STAFF_ACCOUNT_PERMISSIONS });
  const submitting = useRef(false);
  const id = useId();
  const canSave = validStaffAccountIdentity(form.fullName, form.email) && form.jobTitle.trim().length >= 2 && matchingStaffAccountPassword(form.password, form.confirmation);

  function changeOpen(next: boolean) {
    if (create.isPending || submitting.current) return;
    setOpen(next);
    if (!next) {
      setForm({ ...blankAccount });
      setPermissions({ ...DEFAULT_STAFF_ACCOUNT_PERMISSIONS });
      create.reset();
    }
  }

  async function submit() {
    if (!canSave || create.isPending || submitting.current) return;
    submitting.current = true;
    try {
      await create.mutateAsync({ fullName: form.fullName.trim(), email: normalizeStaffAccountEmail(form.email), password: form.password, jobTitle: form.jobTitle.trim(), isActive: form.isActive, permissions });
      setOpen(false);
      setForm({ ...blankAccount });
      setPermissions({ ...DEFAULT_STAFF_ACCOUNT_PERMISSIONS });
      create.reset();
      toast.success("Staff account created. Share the login details securely with the staff member.");
      await refreshAccountQueries(utils);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The staff account could not be created.");
      create.reset();
    } finally {
      submitting.current = false;
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><UserPlus className="mr-2 h-4 w-4" />Create account</Button></DialogTrigger>
    <DialogContent className={contentClass} showCloseButton={!create.isPending} onEscapeKeyDown={event => { if (create.isPending) event.preventDefault(); }} onInteractOutside={event => { if (create.isPending) event.preventDefault(); }}>
      <DialogHeader className="shrink-0 border-b border-slate-100 p-4 pr-14 text-left sm:p-6 sm:pr-16"><DialogTitle>Create staff account</DialogTitle><DialogDescription>Create a login directly, without an invitation link. Choose the initial access and share the email and password securely. No email is sent.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor={`${id}-name`}>Full name *</Label><Input id={`${id}-name`} value={form.fullName} maxLength={160} autoComplete="name" disabled={create.isPending} onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor={`${id}-email`}>Login email *</Label><Input id={`${id}-email`} type="email" value={form.email} maxLength={320} autoComplete="off" autoCapitalize="none" disabled={create.isPending} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /><p className="text-xs text-slate-500">This will be the staff sign-in identifier.</p></div>
          <PasswordField label="Password *" value={form.password} disabled={create.isPending} onChange={password => setForm(current => ({ ...current, password }))} />
          <PasswordField label="Confirm password *" value={form.confirmation} disabled={create.isPending} onChange={confirmation => setForm(current => ({ ...current, confirmation }))} />
          <p className="break-words text-xs text-slate-500 sm:col-span-2">{STAFF_PASSWORD_HINT}{form.confirmation && form.password !== form.confirmation && <span className="mt-1 block text-rose-700">Passwords do not match.</span>}</p>
          <div className="space-y-2"><Label htmlFor={`${id}-job`}>Job title *</Label><Input id={`${id}-job`} value={form.jobTitle} maxLength={120} disabled={create.isPending} onChange={event => setForm(current => ({ ...current, jobTitle: event.target.value }))} /></div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4"><div className="min-w-0"><Label htmlFor={`${id}-active`}>Active account</Label><p className="mt-1 text-xs text-slate-500">Allow access immediately after creation</p></div><Switch id={`${id}-active`} checked={form.isActive} disabled={create.isPending} onCheckedChange={isActive => setForm(current => ({ ...current, isActive }))} /></div>
          <div className="sm:col-span-2"><h3 className="mb-3 text-sm font-semibold">Initial permissions</h3><div className="grid gap-3 sm:grid-cols-2">{(Object.entries(PERMISSION_LABELS) as Array<[PermissionKey, readonly [string, string]]>).map(([key, [label, description]]) => <div key={key} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-4"><div className="min-w-0"><Label htmlFor={`${id}-${key}`} className="break-words leading-5">{label}</Label><p className="mt-1 break-words text-xs leading-5 text-slate-500">{description}</p></div><Switch id={`${id}-${key}`} className="shrink-0" checked={permissions[key]} disabled={create.isPending} onCheckedChange={checked => setPermissions(current => ({ ...current, [key]: checked }))} /></div>)}</div></div>
          <p className="rounded-xl bg-cyan-50 p-3 text-xs leading-5 text-cyan-900 sm:col-span-2">An inactive SMTP profile is prepared for this account. Configure and verify its mailbox separately in Email settings before sending emails.</p>
        </div>
      </div>
      <DialogFooter className={footerClass}><Button variant="outline" disabled={create.isPending} onClick={() => changeOpen(false)}>Cancel</Button><Button className="bg-teal-700 hover:bg-teal-800" disabled={create.isPending || !canSave} onClick={submit}>{create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Create account</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function EditStaffAccountDialog({ member }: { member: StaffIdentity }) {
  const utils = trpc.useUtils();
  const edit = trpc.staff.editAccount.useMutation();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const submitting = useRef(false);
  const id = useId();
  const oldEmail = normalizeStaffAccountEmail(member.email || member.loginIdentifier || "");
  const emailChanged = normalizeStaffAccountEmail(email) !== oldEmail;

  function changeOpen(next: boolean) {
    if (edit.isPending || submitting.current) return;
    setOpen(next);
    setFullName(next ? member.name || "" : "");
    setEmail(next ? member.email || member.loginIdentifier || "" : "");
    if (!next) edit.reset();
  }

  async function submit() {
    if (edit.isPending || submitting.current || !validStaffAccountIdentity(fullName, email)) return;
    submitting.current = true;
    try {
      const result = await edit.mutateAsync({ userId: member.id, fullName: fullName.trim(), email: normalizeStaffAccountEmail(email) });
      setOpen(false);
      setFullName("");
      setEmail("");
      edit.reset();
      toast.success(result.emailChanged ? "Account updated. The staff member must sign in again using the new login email." : "Staff account updated.");
      await refreshAccountQueries(utils);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The staff account could not be updated.");
      edit.reset();
    } finally {
      submitting.current = false;
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="w-full justify-start"><Pencil className="mr-2 h-4 w-4" />Edit account</Button></DialogTrigger>
    <DialogContent className={`${contentClass} sm:max-w-xl`} showCloseButton={!edit.isPending}>
      <DialogHeader className="shrink-0 border-b border-slate-100 p-4 pr-14 text-left sm:p-6 sm:pr-16"><DialogTitle>Edit staff account</DialogTitle><DialogDescription>Update the staff member's name and login email. Their leads, groups, permissions, and history remain attached to the same account.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-2"><Label htmlFor={`${id}-name`}>Full name *</Label><Input id={`${id}-name`} value={fullName} maxLength={160} disabled={edit.isPending} onChange={event => setFullName(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-email`}>Login email *</Label><Input id={`${id}-email`} type="email" value={email} maxLength={320} autoCapitalize="none" disabled={edit.isPending} onChange={event => setEmail(event.target.value)} /></div>
        {emailChanged && <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Changing the login email signs this staff member out and invalidates outstanding password reset links. Share the new login email with them before saving.</p>}
        <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Login email and SMTP sender are separate. Existing SMTP credentials and sender settings are not changed here. Use Save access on the staff card for job title, activation, and permissions.</p>
      </div>
      <DialogFooter className={footerClass}><Button variant="outline" disabled={edit.isPending} onClick={() => changeOpen(false)}>Cancel</Button><Button className="bg-teal-700 hover:bg-teal-800" disabled={edit.isPending || !validStaffAccountIdentity(fullName, email)} onClick={submit}>{edit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save account</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function StaffPasswordDialog({ member }: { member: StaffIdentity }) {
  const utils = trpc.useUtils();
  const change = trpc.staff.setAccountPassword.useMutation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const submitting = useRef(false);
  const match = matchingStaffAccountPassword(password, confirmation);

  function changeOpen(next: boolean) {
    if (change.isPending || submitting.current) return;
    setOpen(next);
    setPassword("");
    setConfirmation("");
    change.reset();
  }

  async function submit() {
    if (!match || change.isPending || submitting.current) return;
    submitting.current = true;
    try {
      await change.mutateAsync({ userId: member.id, password });
      setOpen(false);
      setPassword("");
      setConfirmation("");
      change.reset();
      toast.success("Password changed. Existing sessions and reset links were revoked; share the new password securely.");
      await refreshAccountQueries(utils);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The password could not be changed.");
      change.reset();
    } finally {
      submitting.current = false;
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm" className="w-full justify-start"><KeyRound className="mr-2 h-4 w-4" />Change password</Button></DialogTrigger>
    <DialogContent className={`${contentClass} sm:max-w-xl`} showCloseButton={!change.isPending}>
      <DialogHeader className="shrink-0 border-b border-slate-100 p-4 pr-14 text-left sm:p-6 sm:pr-16"><DialogTitle>Change staff password</DialogTitle><DialogDescription className="[overflow-wrap:anywhere]">Set a new password for {member.name || "this staff member"} ({member.email || member.loginIdentifier}). Their current password is never displayed.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-6">
        <PasswordField label="New password *" value={password} disabled={change.isPending} onChange={setPassword} />
        <PasswordField label="Confirm new password *" value={confirmation} disabled={change.isPending} onChange={setConfirmation} />
        <p className="text-xs text-slate-500">{STAFF_PASSWORD_HINT}</p>
        {confirmation && password !== confirmation && <p className="text-sm text-rose-700">Passwords do not match.</p>}
        <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">Saving signs this staff member out of all devices, invalidates outstanding password reset links, and clears failed-login lockouts. Account activation, permissions, and SMTP settings stay unchanged. No email is sent.</p>
      </div>
      <DialogFooter className={footerClass}><Button variant="outline" disabled={change.isPending} onClick={() => changeOpen(false)}>Cancel</Button><Button className="bg-teal-700 hover:bg-teal-800" disabled={change.isPending || !match} onClick={submit}>{change.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Save password</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
