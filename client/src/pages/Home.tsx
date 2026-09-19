import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, initials } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Flame, ScanLine, ShoppingBag, Sparkles, UserRoundPlus, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.dashboard.summary.useQuery();
  const { data: followUps } = trpc.dashboard.followUps.useQuery();
  const { data: access } = trpc.dashboard.access.useQuery();
  if (isLoading) return <PageLoading />;

  const stats = [
    { label: "Total leads", value: data?.total ?? 0, icon: UsersRound, tone: "bg-sky-50 text-sky-700" },
    { label: "Hot leads", value: data?.hot ?? 0, icon: Flame, tone: "bg-amber-50 text-amber-700" },
    { label: "Follow-ups due", value: data?.followUps ?? 0, icon: Sparkles, tone: "bg-violet-50 text-violet-700" },
    { label: "Completed buyers", value: data?.buyers ?? 0, icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader eyebrow="Operations overview" title="Good work starts with a clear queue." description="Monitor lead momentum, review recent records, and keep every follow-up on schedule." actions={access?.permissions.scanDocuments && access.permissions.viewClinical ? <Button onClick={() => navigate("/scan")} className="bg-teal-700 hover:bg-teal-800"><ScanLine className="mr-2 h-4 w-4" />Add lead from images</Button> : undefined} />
      {error ? <div className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">{error.message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => <Card key={stat.label} className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{stat.label}</p><p className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">{stat.value}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${stat.tone}`}><stat.icon className="h-5 w-5" /></div></div></CardContent></Card>)}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6"><div><CardTitle className="text-lg tracking-tight">Recently updated</CardTitle><p className="mt-1 text-sm text-slate-500">Latest activity across your pipeline</p></div><Button variant="ghost" size="sm" onClick={() => navigate("/leads")}>View all <ArrowRight className="ml-2 h-4 w-4" /></Button></CardHeader>
          <CardContent className="px-6 pb-6">
            {!data?.recent.length ? <EmptyState title="No leads yet" description="Upload images for one person, review the extracted details, and create the first lead." action={<Button onClick={() => navigate("/scan")} variant="outline"><UserRoundPlus className="mr-2 h-4 w-4" />Add first lead</Button>} /> : <div className="divide-y divide-slate-100">{data.recent.map(lead => <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} className="flex w-full items-center gap-4 py-4 text-left transition-colors hover:bg-slate-50/70"><Avatar className="h-10 w-10"><AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><p className="truncate text-xs text-slate-500">{lead.email || lead.phone || "No contact information"}</p></div><StatusPill value={lead.status} /><span className="hidden w-24 text-right text-xs text-slate-400 sm:block">{formatDate(lead.updatedAt)}</span></button>)}</div>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 bg-slate-950 text-white shadow-[0_12px_40px_rgba(15,23,42,.14)]">
          <CardHeader className="p-6"><CardTitle className="text-lg tracking-tight">Next follow-ups</CardTitle><p className="text-sm text-slate-400">Priority conversations ahead</p></CardHeader>
          <CardContent className="px-6 pb-6">
            {!followUps?.length ? <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm leading-6 text-slate-400">No follow-ups are scheduled. Add the next action while logging a contact.</div> : <div className="space-y-3">{followUps.slice(0, 5).map(item => <button key={item.followUpId} onClick={() => navigate(`/leads/${item.leadId}`)} className="flex w-full items-center justify-between gap-4 rounded-xl bg-white/[.06] p-4 text-left transition-colors hover:bg-white/[.1]"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.firstName} {item.lastName}</p><p className="mt-1 text-xs text-slate-400">{formatDate(item.scheduledFor, true)}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-teal-300" /></button>)}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
