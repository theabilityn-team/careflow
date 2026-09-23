import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function ResetPassword() {
  const [, params] = useRoute("/reset-password/:token");
  const [, navigate] = useLocation();
  const token = params?.token ?? "";
  const utils = trpc.useUtils();
  const request = trpc.staff.inspectPasswordReset.useQuery({ token }, { enabled: token.length === 48 });
  const complete = trpc.staff.completePasswordReset.useMutation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);

  async function submit() {
    if (password !== confirmPassword) return toast.error("Passwords do not match.");
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return toast.error("Use at least 10 characters with uppercase, lowercase, and a number.");
    }
    try {
      await complete.mutateAsync({ token, password });
      await utils.auth.me.invalidate();
      toast.success("Password changed successfully.");
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset the password.");
    }
  }

  return <div className="grid min-h-screen place-items-center bg-[#f4f7f6] p-4 sm:p-6">
    <Card className="min-w-0 w-full max-w-lg rounded-[2rem] border-0 bg-white shadow-2xl shadow-slate-900/10"><CardContent className="min-w-0 p-6 sm:p-10">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-white"><KeyRound className="h-5 w-5" /></div>
      {request.isLoading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div> : !request.data ? <>
        <h1 className="mt-7 text-2xl font-semibold tracking-tight">Reset link unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">This one-time link is invalid, expired, or has already been used. Submit a new request from the staff login screen.</p>
        <Button onClick={() => navigate("/")} variant="outline" className="mt-6 w-full">Return to CareFlow</Button>
      </> : <>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-teal-700">Staff account recovery</p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-[-.035em] sm:text-3xl">Create a new password</h1>
        <p className="mt-4 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">This one-time link for <strong className="text-slate-800">{request.data.staffName || request.data.email}</strong> expires {formatDate(request.data.expiresAt, true)}.</p>
        <div className="mt-6 min-w-0 rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Login email</p><p className="mt-1 break-all font-medium text-slate-900">{request.data.email}</p></div>
        <div className="mt-6 space-y-4">
          <div className="space-y-2"><Label htmlFor="reset-new-password">New password</Label><div className="relative"><Input id="reset-new-password" type={visible ? "text" : "password"} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className="h-11 pr-12" /><button type="button" onClick={() => setVisible(value => !value)} className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:h-9 md:w-9" aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
          <div className="space-y-2"><Label htmlFor="reset-confirm-password">Confirm password</Label><Input id="reset-confirm-password" type={visible ? "text" : "password"} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" className="h-11" /></div>
          <p className="text-xs leading-5 text-slate-500">At least 10 characters, including uppercase, lowercase, and a number.</p>
        </div>
        <Button onClick={submit} disabled={complete.isPending || !password || !confirmPassword} className="mt-6 w-full bg-teal-700 hover:bg-teal-800">{complete.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Set new password</Button>
      </>}
    </CardContent></Card>
  </div>;
}
