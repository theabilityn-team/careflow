import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ChangeSuperAdminPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const change = trpc.auth.changeSuperAdminPassword.useMutation();

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setVisible(false);
  }

  async function submit() {
    if (newPassword !== confirmPassword) return toast.error("New passwords do not match.");
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return toast.error("Use at least 12 characters with uppercase, lowercase, a number, and a symbol.");
    }
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      toast.success("Super Admin password changed. Sign in again with the new password.");
      reset();
      onOpenChange(false);
      window.location.assign("/?super-login=1");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to change the password.");
    }
  }

  return <Dialog open={open} onOpenChange={value => { onOpenChange(value); if (!value) reset(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Change Super Admin password</DialogTitle><DialogDescription>Enter the current password, then choose a new private password. All administrator sessions will be signed out immediately.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-2">
        <PasswordField id="current-admin-password" label="Current password" value={currentPassword} onChange={setCurrentPassword} visible={visible} autoComplete="current-password" />
        <PasswordField id="new-admin-password" label="New password" value={newPassword} onChange={setNewPassword} visible={visible} autoComplete="new-password" />
        <PasswordField id="confirm-admin-password" label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} visible={visible} autoComplete="new-password" />
        <button type="button" onClick={() => setVisible(value => !value)} className="inline-flex items-center gap-2 text-sm font-medium text-teal-700">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{visible ? "Hide passwords" : "Show passwords"}</button>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">At least 12 characters with uppercase, lowercase, a number, and a symbol. The original setup password will no longer overwrite your new password after a restart.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} disabled={change.isPending || !currentPassword || !newPassword || !confirmPassword} className="bg-teal-700 hover:bg-teal-800">{change.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}Change password</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function PasswordField({ id, label, value, onChange, visible, autoComplete }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; autoComplete: string }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="h-11" /></div>;
}
