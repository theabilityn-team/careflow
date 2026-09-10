import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSuperLoginParameter } from "@/lib/loginMode";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, LockKeyhole, Mail, ScanLine, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

export default function LoginScreen() {
  const utils = trpc.useUtils();
  const superAdminMode = hasSuperLoginParameter(window.location.search);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.login.useMutation();

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await login.mutateAsync(superAdminMode
        ? { mode: "super_admin", password }
        : { mode: "staff", identifier: email, password });
      await utils.auth.me.invalidate();
      toast.success("Signed in securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#f4f7f6] text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(15,118,110,.15),transparent_28%),radial-gradient(circle_at_82%_76%,rgba(14,165,233,.11),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="mb-8 inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <span className="font-semibold tracking-tight">CareFlow CRM</span>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[.24em] text-teal-700">Secure lead operations</p>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.06] tracking-[-.045em] sm:text-6xl">Turn documents into trusted customer records.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Scan multiple document images, review every extracted field, and manage the complete journey from new lead to buyer.</p>
        </div>
        <div className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-2xl shadow-slate-900/15 sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300">{superAdminMode ? <KeyRound /> : <ScanLine />}</div>
          <h2 className="text-2xl font-semibold tracking-tight">{superAdminMode ? "Restricted system access" : "Staff sign in"}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{superAdminMode ? "Enter the private system administrator password." : "Use the email address and password from your staff invitation."}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {!superAdminMode && <div className="space-y-2"><Label htmlFor="login-email" className="text-slate-200">Email address</Label><div className="relative"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="login-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" required className="h-11 border-slate-700 bg-slate-900 pl-10 text-white placeholder:text-slate-600" /></div></div>}
            <div className="space-y-2"><Label htmlFor="login-password" className="text-slate-200">Password</Label><div className="relative"><LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} className="h-11 border-slate-700 bg-slate-900 pl-10 text-white" /></div></div>
            <Button type="submit" disabled={login.isPending || (!superAdminMode && !email)} size="lg" className="w-full bg-teal-500 text-slate-950 hover:bg-teal-400">{login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}{superAdminMode ? "Sign in to system administration" : "Sign in securely"}</Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Five failed attempts temporarily lock the account for 15 minutes.</p>
        </div>
      </div>
    </div>
  );
}
