import { CopyContactButton } from "@/components/crm/CopyContactButton";
import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import ExportLeadsDialog from "@/components/crm/ExportLeadsDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFollowUpTiming } from "@/lib/contactTracking";
import { INTEREST_OPTIONS, STATUS_OPTIONS, formatDate, initials } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { ChevronRight, Flame, Mail, Phone, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Leads() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data: access } = trpc.dashboard.access.useQuery();
  const { data, isLoading, error } = trpc.leads.list.useQuery({ search: search || undefined, status });

  return <div className="mx-auto max-w-[1500px]">
    <PageHeader
      eyebrow="Lead management"
      title="Every relationship, one clear record."
      description="Search, qualify, and advance leads while preserving a complete operational history."
      actions={<>
        {access?.permissions.exportData && <ExportLeadsDialog currentStatus={status} />}
        {access?.permissions.scanDocuments && access.permissions.viewClinical && <Button onClick={() => navigate("/scan")} className="bg-teal-700 hover:bg-teal-800"><Plus className="mr-2 h-4 w-4" />New lead</Button>}
      </>}
    />
    <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => setSearch(event.target.value)} className="h-11 border-slate-200 pl-10" placeholder="Search by name, email, or phone…" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-11 w-full sm:w-[210px]"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
        {isLoading ? <div className="p-6"><PageLoading /></div> : error ? <div className="m-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error.message}</div> : !data?.length ? <div className="p-6"><EmptyState title="No matching leads" description="Try another filter or scan documents to create a new reviewed record." action={access?.permissions.scanDocuments && access.permissions.viewClinical ? <Button onClick={() => navigate("/scan")} variant="outline">Scan documents</Button> : undefined} /></div> : <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="border-slate-100 hover:bg-transparent"><TableHead className="pl-6">Lead</TableHead><TableHead>Status</TableHead><TableHead>Interest</TableHead><TableHead>Contact — click to copy</TableHead><TableHead>Follow-up reminder</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>{data.map(lead => {
              const timing = getFollowUpTiming(lead.nextFollowUpAt);
              return <TableRow key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} className="cursor-pointer border-slate-100">
                <TableCell className="py-4 pl-6"><div className="flex items-center gap-3"><Avatar className="h-10 w-10"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div><p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><p className="text-xs text-slate-400">Added {formatDate(lead.createdAt)}</p></div></div></TableCell>
                <TableCell><StatusPill value={lead.status} /></TableCell>
                <TableCell><span className={`inline-flex items-center gap-1.5 text-sm font-medium ${lead.interestLevel === "hot" ? "text-amber-700" : "text-slate-600"}`}>{lead.interestLevel === "hot" && <Flame className="h-3.5 w-3.5" />}{INTEREST_OPTIONS.find(([value]) => value === lead.interestLevel)?.[1]}</span></TableCell>
                <TableCell><div className="min-w-52 space-y-1">{lead.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{lead.email}</span><CopyContactButton value={lead.email} label="email" compact /></div>}{lead.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{lead.phone}</span><CopyContactButton value={lead.phone} label="phone" compact /></div>}{!lead.email && !lead.phone && <span className="text-sm text-slate-400">No contact details</span>}</div></TableCell>
                <TableCell><div><p className={`text-sm font-medium ${timing === "overdue" ? "text-amber-700" : "text-slate-700"}`}>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt, true) : "No reminder"}</p><p className="mt-1 text-xs text-slate-400">{timing === "overdue" ? "Overdue" : timing === "scheduled" ? "Scheduled" : "Set from Log contact or Edit lead"}</p></div></TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-slate-300" /></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
