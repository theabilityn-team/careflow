import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function Invite() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const token = params?.token ?? "";
  const utils = trpc.useUtils();
  const invite = trpc.staff.inspectInvite.useQuery({ token }, { enabled: token.length === 48 });
  const accept = trpc.staff.acceptInvite.useMutation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);

  async function acceptInvite() {
    if (password !== confirmPassword) return toast.error("Passwords do not match.");
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return toast.error("Use at least 10 characters with uppercase, lowercase, and a number.");
    }
    try {
      await accept.mutateAsync({ token, password });
      await utils.auth.me.invalidate();
      toast.success("Your email account is active.");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The invitation could not be accepted.");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#f4f7f6] p-6">
      <Card className="w-full max-w-lg rounded-[2rem] border-0 bg-white shadow-2xl shadow-slate-900/10">
        <CardContent className="p-8 sm:p-10">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
          {invite.isLoading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div> : !invite.data ? <>
            <h1 className="mt-7 text-2xl font-semibold tracking-tight">Invitation unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">This invitation is invalid, expired, or has already been accepted.</p>
            <Button onClick={() => navigate("/")} variant="outline" className="mt-6 w-full">Return to CareFlow</Button>
          </> : <>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-teal-700">Technical staff invitation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">Create your CareFlow account</h1>
            <p className="mt-4 text-sm leading-6 text-slate-500">Welcome, <strong className="text-slate-800">{invite.data.fullName}</strong>. You were invited as {invite.data.jobTitle}. This link expires {formatDate(invite.data.expiresAt, true)}.</p>
            <div className="mt-6 rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Login email</p><p className="mt-1 font-medium text-slate-900">{invite.data.email}</p></div>
            <div className="mt-6 space-y-4">
              <div className="space-y-2"><Label htmlFor="new-password">Create password</Label><div className="relative"><Input id="new-password" type={visible ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className="h-11 pr-11" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type={visible ? "text" : "password"} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className="h-11" /></div>
              <p className="text-xs leading-5 text-slate-500">At least 10 characters, including uppercase, lowercase, and a number.</p>
            </div>
            <Button onClick={acceptInvite} disabled={accept.isPending || !password || !confirmPassword} className="mt-6 w-full bg-teal-700 hover:bg-teal-800">{accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Activate account</Button>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
