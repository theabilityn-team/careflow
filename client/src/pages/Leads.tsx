import { CopyContactButton } from "@/components/crm/CopyContactButton";
import { EmptyState, PageHeader, PageLoading, StatusPill } from "@/components/crm/CrmUi";
import ExportLeadsDialog from "@/components/crm/ExportLeadsDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getFollowUpTiming } from "@/lib/contactTracking";
import { DIAGNOSIS_CATEGORY_OPTIONS, INTEREST_OPTIONS, LANGUAGE_OPTIONS, STATE_OPTIONS, STATUS_OPTIONS, diagnosisCategoryLabel, documentTypeLabel, formatDate, initials, languageLabel, stateLabel } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import { easternEndOfDay, easternStartOfDay } from "@shared/time";
import { ChevronLeft, ChevronRight, Files, Flame, Mail, Phone, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useLocation } from "wouter";

const sortOptions = [
  ["updated_desc", "Recently updated"],
  ["created_desc", "Newest created"],
  ["name_asc", "Name A–Z"],
  ["name_desc", "Name Z–A"],
  ["follow_up_asc", "Next follow-up first"],
] as const;

function pageNumbers(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => Math.max(1, start) + index);
}

export default function Leads() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState("all");
  const [interest, setInterest] = useState("all");
  const [assigned, setAssigned] = useState("all");
  const [followUp, setFollowUp] = useState("all");
  const [contact, setContact] = useState("all");
  const [stateCode, setStateCode] = useState("all");
  const [preferredLanguage, setPreferredLanguage] = useState("all");
  const [diagnosisCategory, setDiagnosisCategory] = useState("all");
  const [groupId, setGroupId] = useState(() => new URLSearchParams(window.location.search).get("group") ?? "all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState<(typeof sortOptions)[number][0]>("updated_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const { data: access } = trpc.dashboard.access.useQuery();
  const { data: assignees = [] } = trpc.leads.assignees.useQuery();
  const { data: groups = [] } = trpc.groups.list.useQuery();

  const queryInput = useMemo(() => ({
    search: deferredSearch || undefined,
    status,
    interestLevel: interest === "all" ? undefined : interest as "unknown" | "cold" | "warm" | "hot",
    assignedTo: assigned === "all" ? undefined : assigned === "unassigned" ? "unassigned" as const : Number(assigned),
    followUpState: followUp === "all" ? undefined : followUp as "overdue" | "upcoming" | "none",
    contactState: contact === "all" ? undefined : contact as "contacted" | "not_contacted",
    preferredLanguage: preferredLanguage === "all" ? undefined : preferredLanguage as "en" | "es",
    stateCode: stateCode === "all" ? undefined : stateCode as "FL" | "AZ" | "NV" | "CA" | "OR",
    diagnosisCategory: diagnosisCategory === "all" ? undefined : diagnosisCategory as "oncology" | "hematology",
    groupId: groupId === "all" ? undefined : Number(groupId),
    createdFrom: createdFrom ? easternStartOfDay(createdFrom) : undefined,
    createdTo: createdTo ? easternEndOfDay(createdTo) : undefined,
    sort,
    page,
    pageSize,
  }), [deferredSearch, status, interest, assigned, followUp, contact, preferredLanguage, stateCode, diagnosisCategory, groupId, createdFrom, createdTo, sort, page, pageSize]);
  const { data, isLoading, error, isFetching } = trpc.leads.list.useQuery(queryInput, { placeholderData: previous => previous });

  const advancedFilterCount = [assigned !== "all", followUp !== "all", contact !== "all", diagnosisCategory !== "all", groupId !== "all", Boolean(createdFrom), Boolean(createdTo)].filter(Boolean).length;
  const activeFilterCount = advancedFilterCount + Number(status !== "all") + Number(interest !== "all") + Number(stateCode !== "all") + Number(preferredLanguage !== "all");
  const hasAnyFilter = Boolean(search) || activeFilterCount > 0;
  const setFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  function resetFilters() {
    setSearch(""); setStatus("all"); setInterest("all"); setAssigned("all"); setFollowUp("all"); setContact("all"); setStateCode("all"); setPreferredLanguage("all"); setDiagnosisCategory("all"); setGroupId("all"); setCreatedFrom(""); setCreatedTo(""); setSort("updated_desc"); setPage(1);
  }

  const items = data?.items ?? [];
  const firstResult = data?.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastResult = data?.total ? Math.min(data.page * data.pageSize, data.total) : 0;

  return <div className="mx-auto max-w-[1500px]">
    <PageHeader
      eyebrow="Lead management"
      title="Every relationship, one clear record."
      description="Search, filter, sort, and page through the complete lead pipeline."
      actions={<>
        {access?.permissions.exportData && <div className="w-full sm:w-auto"><ExportLeadsDialog currentStatus={status} /></div>}
        {access?.permissions.scanDocuments && access.permissions.viewClinical && <Button variant="outline" className="w-full bg-white sm:w-auto" onClick={() => navigate("/bulk-import")}><Files className="mr-2 h-4 w-4" />Bulk image import</Button>}
        {access?.permissions.scanDocuments && access.permissions.viewClinical && <Button onClick={() => navigate("/scan")} className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add lead from images</Button>}
      </>}
    />

    <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardContent className="p-0">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="h-11 border-slate-200 pl-10" placeholder="Search name, email, phone, city, or address…" /></div>
            <Select value={status} onValueChange={setFilter(setStatus)}><SelectTrigger className="h-11 w-full lg:w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUS_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={interest} onValueChange={setFilter(setInterest)}><SelectTrigger className="h-11 w-full lg:w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All interest levels</SelectItem>{INTEREST_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={stateCode} onValueChange={setFilter(setStateCode)}><SelectTrigger className="h-11 w-full lg:w-[165px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{STATE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={preferredLanguage} onValueChange={setFilter(setPreferredLanguage)}><SelectTrigger className="h-11 w-full lg:w-[165px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All languages</SelectItem>{LANGUAGE_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" className="h-11 justify-between bg-white lg:min-w-40" onClick={() => setShowFilters(value => !value)}><span className="flex items-center"><SlidersHorizontal className="mr-2 h-4 w-4" />More filters</span>{advancedFilterCount > 0 && <Badge className="ml-3 bg-teal-700 text-white hover:bg-teal-700">{advancedFilterCount}</Badge>}</Button>
            {hasAnyFilter && <Button variant="ghost" className="h-11 text-slate-500" onClick={resetFilters}><X className="mr-2 h-4 w-4" />Clear</Button>}
          </div>

          {showFilters && <div className="mt-4 grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div className="space-y-2"><Label>Diagnosis group</Label><Select value={diagnosisCategory} onValueChange={setFilter(setDiagnosisCategory)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All diagnosis groups</SelectItem>{DIAGNOSIS_CATEGORY_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Lead group</Label><Select value={groupId} onValueChange={setFilter(setGroupId)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All accessible groups</SelectItem>{groups.map(group => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Assigned staff</Label><Select value={assigned} onValueChange={setFilter(setAssigned)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All assignees</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{assignees.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name || member.email || `Staff #${member.id}`}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Follow-up</Label><Select value={followUp} onValueChange={setFilter(setFollowUp)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any follow-up</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="upcoming">Upcoming</SelectItem><SelectItem value="none">No reminder</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Contact history</Label><Select value={contact} onValueChange={setFilter(setContact)}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any contact state</SelectItem><SelectItem value="contacted">Contact logged</SelectItem><SelectItem value="not_contacted">Never contacted</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Created from</Label><Input type="date" value={createdFrom} max={createdTo || undefined} onChange={event => { setCreatedFrom(event.target.value); setPage(1); }} className="bg-white" /></div>
            <div className="space-y-2"><Label>Created to</Label><Input type="date" value={createdTo} min={createdFrom || undefined} onChange={event => { setCreatedTo(event.target.value); setPage(1); }} className="bg-white" /></div>
            <div className="space-y-2"><Label>Sort by</Label><Select value={sort} onValueChange={value => { setSort(value as typeof sort); setPage(1); }}><SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{sortOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>}

          <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-slate-800">{data?.total ?? 0}</strong> matching lead{data?.total === 1 ? "" : "s"}{isFetching && !isLoading ? " · Updating…" : ""}</p><p>Filters and sorting are applied before paging.</p></div>
        </div>

        {isLoading ? <div className="p-6"><PageLoading /></div> : error ? <div className="m-4 break-words rounded-xl bg-rose-50 p-4 text-sm text-rose-700 [overflow-wrap:anywhere] sm:m-6">{error.message}</div> : !items.length ? <div className="p-4 sm:p-6"><EmptyState title="No matching leads" description={hasAnyFilter ? "Clear or adjust filters to widen the result set." : "Add a reviewed lead from images or use Bulk image import."} action={hasAnyFilter ? <Button variant="outline" onClick={resetFilters}>Clear all filters</Button> : access?.permissions.scanDocuments && access.permissions.viewClinical ? <Button onClick={() => navigate("/bulk-import")} variant="outline">Bulk image import</Button> : undefined} /></div> : <>
          <div className="divide-y divide-slate-100 md:hidden">{items.map(lead => {
            const timing = getFollowUpTiming(lead.nextFollowUpAt);
            return <div key={lead.id} className="min-w-0 p-4">
              <button type="button" onClick={() => navigate(`/leads/${lead.id}`)} className="min-h-11 w-full min-w-0 text-left">
                <div className="flex min-w-0 items-start gap-3"><Avatar className="h-10 w-10 shrink-0"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">{lead.firstName} {lead.lastName}</p><p className="mt-1 break-words text-xs text-slate-400">Added {formatDate(lead.createdAt)} · {documentTypeLabel(lead.sourceDocumentType)}</p></div><ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300" /></div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2"><StatusPill value={lead.status} /><Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{stateLabel(lead.stateCode)}</Badge><Badge variant="outline" className="bg-white">{languageLabel(lead.preferredLanguage)}</Badge><Badge className="max-w-full whitespace-normal bg-rose-50 text-left text-rose-700 hover:bg-rose-50">{diagnosisCategoryLabel(lead.diagnosisCategory)}</Badge></div>
                <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 min-[360px]:grid-cols-2"><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Interest</p><p className={`mt-1 inline-flex items-center gap-1.5 text-sm font-medium ${lead.interestLevel === "hot" ? "text-amber-700" : "text-slate-700"}`}>{lead.interestLevel === "hot" && <Flame className="h-3.5 w-3.5" />}{INTEREST_OPTIONS.find(([value]) => value === lead.interestLevel)?.[1]}</p></div><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Follow-up</p><p className={`mt-1 break-words text-sm font-medium ${timing === "overdue" ? "text-amber-700" : "text-slate-700"}`}>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt, true) : "No reminder"}</p></div></div>
              </button>
              {(lead.email || lead.phone) && <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">{lead.email && <div className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 break-all text-sm text-slate-600">{lead.email}</span><CopyContactButton value={lead.email} label="email" compact /></div>}{lead.phone && <div className="flex min-w-0 items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 break-words text-sm text-slate-600">{lead.phone}</span><CopyContactButton value={lead.phone} label="phone" compact /></div>}</div>}
            </div>;
          })}</div>
          <div className="hidden overflow-x-auto md:block"><Table>
            <TableHeader><TableRow className="border-slate-100 hover:bg-transparent"><TableHead className="pl-6">Lead</TableHead><TableHead>State</TableHead><TableHead>Language</TableHead><TableHead>Diagnosis group</TableHead><TableHead>Status</TableHead><TableHead>Interest</TableHead><TableHead>Contact — click to copy</TableHead><TableHead>Follow-up reminder</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>{items.map(lead => {
              const timing = getFollowUpTiming(lead.nextFollowUpAt);
              return <TableRow key={lead.id} onClick={() => navigate(`/leads/${lead.id}`)} className="cursor-pointer border-slate-100">
                <TableCell className="py-4 pl-6"><div className="flex items-center gap-3"><Avatar className="h-10 w-10"><AvatarFallback className="bg-teal-50 text-xs font-semibold text-teal-800">{initials(lead.firstName, lead.lastName)}</AvatarFallback></Avatar><div><p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p><p className="text-xs text-slate-400">Added {formatDate(lead.createdAt)} · {documentTypeLabel(lead.sourceDocumentType)}</p></div></div></TableCell>
                <TableCell><Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50">{stateLabel(lead.stateCode)}</Badge></TableCell>
                <TableCell><Badge variant="outline" className="bg-white">{languageLabel(lead.preferredLanguage)}</Badge></TableCell>
                <TableCell><Badge className="bg-rose-50 text-rose-700 hover:bg-rose-50">{diagnosisCategoryLabel(lead.diagnosisCategory)}</Badge></TableCell>
                <TableCell><StatusPill value={lead.status} /></TableCell>
                <TableCell><span className={`inline-flex items-center gap-1.5 text-sm font-medium ${lead.interestLevel === "hot" ? "text-amber-700" : "text-slate-600"}`}>{lead.interestLevel === "hot" && <Flame className="h-3.5 w-3.5" />}{INTEREST_OPTIONS.find(([value]) => value === lead.interestLevel)?.[1]}</span></TableCell>
                <TableCell><div className="min-w-52 space-y-1">{lead.email && <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{lead.email}</span><CopyContactButton value={lead.email} label="email" compact /></div>}{lead.phone && <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{lead.phone}</span><CopyContactButton value={lead.phone} label="phone" compact /></div>}{!lead.email && !lead.phone && <span className="text-sm text-slate-400">No contact details</span>}</div></TableCell>
                <TableCell><div><p className={`text-sm font-medium ${timing === "overdue" ? "text-amber-700" : "text-slate-700"}`}>{lead.nextFollowUpAt ? formatDate(lead.nextFollowUpAt, true) : "No reminder"}</p><p className="mt-1 text-xs text-slate-400">{timing === "overdue" ? "Overdue" : timing === "scheduled" ? "Scheduled" : "Set from Contact & follow-up"}</p></div></TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-slate-300" /></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table></div>
        </>}

        {data && data.total > 0 && <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-col gap-2 text-sm text-slate-500 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between lg:justify-start"><span>Showing {firstResult}–{lastResult} of {data.total}</span><Select value={String(pageSize)} onValueChange={value => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger className="h-11 w-full min-[360px]:w-[120px] md:h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / page</SelectItem><SelectItem value="25">25 / page</SelectItem><SelectItem value="50">50 / page</SelectItem><SelectItem value="100">100 / page</SelectItem></SelectContent></Select></div><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:items-center sm:gap-1"><Button variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" disabled={data.page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4 sm:mr-1" /><span className="hidden min-[360px]:inline">Previous</span></Button><span className="px-1 text-center text-sm font-medium text-slate-600 sm:hidden">{data.page} / {data.totalPages}</span><div className="hidden items-center gap-1 sm:flex">{pageNumbers(data.page, data.totalPages).map(pageNumber => <Button key={pageNumber} variant={pageNumber === data.page ? "default" : "ghost"} size="icon" className={pageNumber === data.page ? "bg-teal-700 hover:bg-teal-800" : ""} onClick={() => setPage(pageNumber)}>{pageNumber}</Button>)}</div><Button variant="outline" size="sm" className="min-w-0 px-2 sm:px-3" disabled={data.page >= data.totalPages} onClick={() => setPage(value => Math.min(data.totalPages, value + 1))}><span className="hidden min-[360px]:inline">Next</span><ChevronRight className="h-4 w-4 min-[360px]:ml-1" /></Button></div></div>}
      </CardContent>
    </Card>
  </div>;
}
