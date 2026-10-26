import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import { impersonationInfo, notifyAccountSwitch } from "@/lib/impersonation";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Search, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type ImpersonationTarget = { id: number; name: string | null; email: string | null; jobTitle?: string | null; isLeader?: boolean };

export function ImpersonateButton({ member }: { member: ImpersonationTarget }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const start = trpc.impersonation.start.useMutation();
  if (impersonationInfo(user) || member.id === user?.id) return null;
  async function submit() {
    try {
      await start.mutateAsync({ userId: member.id });
      await clearAccountQueries(queryClient);
      notifyAccountSwitch();
      window.location.assign("/");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to start impersonation."); }
  }
  return <AlertDialog open={open} onOpenChange={value => { if (!start.isPending) setOpen(value); }}>
    <AlertDialogTrigger asChild><Button variant="outline" className="w-full min-w-0 whitespace-normal sm:w-auto"><UserRoundCog className="mr-2 h-4 w-4 shrink-0" />Impersonate</Button></AlertDialogTrigger>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Sign in as {member.name || "staff member"}?</AlertDialogTitle><AlertDialogDescription className="space-y-3"><span className="block break-all font-medium text-slate-700">{member.email}</span><span className="block">You will use this staff member's permissions and workspace, not your own. Changes are logged with your original identity. No password is revealed or changed.</span><span className="block">Use Return to my account to end this session. It ends automatically after one hour or when access is revoked.</span></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={start.isPending}>Cancel</AlertDialogCancel><Button disabled={start.isPending} onClick={submit} className="bg-indigo-700 hover:bg-indigo-800">{start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRoundCog className="mr-2 h-4 w-4" />}Sign in as staff</Button></AlertDialogFooter></AlertDialogContent>
  </AlertDialog>;
}

export function ImpersonationDirectory() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const active = !impersonationInfo(user);
  const targets = trpc.impersonation.targets.useQuery(undefined, { enabled: active, refetchOnWindowFocus: true });
  if (!active) return <EmptyState title="Already impersonating staff" description="Return to your own account before choosing another staff member." />;
  if (targets.isLoading) return <PageLoading />;
  if (targets.error) return <EmptyState title="Staff impersonation is unavailable" description={targets.error.message} />;
  const query = search.trim().toLowerCase();
  const items = (targets.data ?? []).filter(member => `${member.name ?? ""} ${member.email ?? ""} ${member.jobTitle ?? ""}`.toLowerCase().includes(query));
  return <div className="mx-auto max-w-5xl"><PageHeader eyebrow="Leader" title="Staff accounts" description="Sign in as an ordinary staff member to use their exact workspace. Leaders and Super Admin cannot be impersonated here. Account settings and passwords remain Super Admin-only." /><div className="relative mb-5"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search eligible staff" placeholder="Search staff name or email…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" /></div><div className="space-y-3">{items.length ? items.map(member => <Card key={member.id} className="min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6"><Avatar className="h-11 w-11 shrink-0"><AvatarFallback className="bg-indigo-50 text-indigo-700">{member.name?.slice(0, 1).toUpperCase() || "S"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="break-words font-semibold [overflow-wrap:anywhere]">{member.name || "Staff member"}</p><p className="break-all text-sm text-slate-500">{member.email}</p><p className="mt-1 break-words text-xs text-slate-400">{member.jobTitle || "Technical Staff"}</p></div><ImpersonateButton member={member} /></CardContent></Card>) : <EmptyState title="No eligible staff" description={query ? "No staff match this search." : "There are no active ordinary staff accounts available for impersonation."} />}</div></div>;
}

export function ImpersonationBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stop = trpc.impersonation.stop.useMutation();
  const info = impersonationInfo(user);
  if (!info) return null;
  async function finish() {
    try {
      await stop.mutateAsync();
      await clearAccountQueries(queryClient);
      notifyAccountSwitch();
      window.location.assign("/staff");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to return to your account.");
      await clearAccountQueries(queryClient);
      notifyAccountSwitch();
      window.location.assign("/");
    }
  }
  return <div role="status" aria-live="polite" className="relative z-50 flex min-w-0 flex-col gap-3 border-b border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:px-5"><UserRoundCog className="hidden h-5 w-5 shrink-0 sm:block" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">Impersonating: {info.target.name || info.target.email}</p><p className="mt-0.5 break-words text-xs [overflow-wrap:anywhere]">Signed in by {info.actor.name}. You are using this staff member's permissions. All changes retain your original identity.</p></div><Button variant="outline" className="w-full shrink-0 border-amber-400 bg-white sm:w-auto" onClick={finish} disabled={stop.isPending}>{stop.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}Return to my account</Button></div>;
}
