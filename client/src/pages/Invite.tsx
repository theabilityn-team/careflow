import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { startLogin } from "@/const";
import { formatDate } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function Invite() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const token = params?.token ?? "";
  const { user, loading } = useAuth();
  const invite = trpc.staff.inspectInvite.useQuery({ token }, { enabled: token.length === 48 });
  const accept = trpc.staff.acceptInvite.useMutation();

  async function acceptInvite() {
    try { await accept.mutateAsync({ token }); toast.success("Your staff access is active."); navigate("/"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "The invitation could not be accepted."); }
  }

  return <div className="grid min-h-screen place-items-center bg-[#f4f7f6] p-6"><Card className="w-full max-w-lg rounded-[2rem] border-0 bg-white shadow-2xl shadow-slate-900/10"><CardContent className="p-8 sm:p-10"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div>{loading || invite.isLoading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div> : !invite.data ? <><h1 className="mt-7 text-2xl font-semibold tracking-tight">Invitation unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-500">This invitation is invalid, expired, or has already been accepted.</p><Button onClick={() => navigate("/")} variant="outline" className="mt-6 w-full">Return to CareFlow</Button></> : <><p className="mt-7 text-xs font-semibold uppercase tracking-[.2em] text-teal-700">Technical staff invitation</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em]">Welcome to CareFlow, {invite.data.fullName}.</h1><p className="mt-4 text-sm leading-6 text-slate-500">You have been invited as <strong className="text-slate-800">{invite.data.jobTitle}</strong>. This invitation is assigned to {invite.data.email} and expires {formatDate(invite.data.expiresAt, true)}.</p>{user ? <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm"><p className="text-slate-500">Signed in as</p><p className="mt-1 font-medium text-slate-900">{user.email}</p></div> : null}{!user ? <Button onClick={() => startLogin()} className="mt-6 w-full bg-teal-700 hover:bg-teal-800">Sign in to accept</Button> : <Button onClick={acceptInvite} disabled={accept.isPending} className="mt-6 w-full bg-teal-700 hover:bg-teal-800">{accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Accept staff access</Button>}</>}</CardContent></Card></div>;
}
