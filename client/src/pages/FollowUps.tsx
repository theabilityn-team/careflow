import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, initials } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3 } from "lucide-react";
import { useLocation } from "wouter";

export default function FollowUps() {
  const [, navigate] = useLocation();
  const { data, isLoading, error } = trpc.dashboard.followUps.useQuery();
  const now = Date.now();
  if (isLoading) return <PageLoading />;
  const overdue = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt < now) ?? [];
  const upcoming = data?.filter(item => item.nextFollowUpAt && item.nextFollowUpAt >= now) ?? [];

  const Group = ({ title, items, overdue = false }: { title: string; items: typeof upcoming; overdue?: boolean }) => <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardContent className="p-0"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div className="flex items-center gap-3">{overdue ? <Clock3 className="h-5 w-5 text-rose-600" /> : <CalendarClock className="h-5 w-5 text-teal-700" />}<h2 className="font-semibold">{title}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{items.length}</span></div>{!items.length ? <div className="p-6"><EmptyState title={overdue ? "Nothing overdue" : "No upcoming follow-ups"} description={overdue ? "The team is caught up with scheduled conversations." : "Follow-up dates appear here after a communication is logged."} /></div> : <div className="divide-y divide-slate-100">{items.map(lead => <button key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} className="flex w-full items-center gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50"><Avatar className="h-10 w-10"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><p className={`mt-1 text-xs ${overdue ? "font-medium text-rose-600" : "text-slate-500"}`}>{formatDate(lead.nextFollowUpAt, true)}</p></div><StatusPill value={lead.status} /><ArrowRight className="h-4 w-4 text-slate-300" /></button>)}</div>}</CardContent></Card>;

  return <div className="mx-auto max-w-[1200px]"><PageHeader eyebrow="Contact planning" title="Follow-up queue" description="Keep every promised conversation visible and act before an interested lead goes cold." actions={<Button onClick={() => navigate("/leads")} variant="outline"><CheckCircle2 className="mr-2 h-4 w-4" />View all leads</Button>} />{error ? <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div> : <div className="grid gap-6 lg:grid-cols-2"><Group title="Overdue" items={overdue} overdue /><Group title="Upcoming" items={upcoming} /></div>}</div>;
}
