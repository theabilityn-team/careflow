import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Code2, Inbox, Loader2, Mail, Search, Send } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const starterSubject = "A message from {{senderName}}";
const starterBody = "Hello {{leadFirstName}},\n\n";

export default function Mails() {
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.dashboard.access.useQuery();
  const canSend = Boolean(access?.permissions.manageContacts);
  const [recipientSearch, setRecipientSearch] = useState("");
  const deferredSearch = useDeferredValue(recipientSearch.trim());
  const recipientInput = useMemo(() => ({ search: deferredSearch || undefined }), [deferredSearch]);
  const recipients = trpc.mail.recipients.useQuery(recipientInput, { enabled: canSend });
  const template = trpc.mail.template.useQuery(undefined, { enabled: canSend });
  const history = trpc.mail.history.useQuery(undefined, { enabled: canSend });
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [subject, setSubject] = useState(starterSubject);
  const [bodyText, setBodyText] = useState(starterBody);
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<number>();
  const message = trpc.mail.message.useQuery({ id: selectedMessageId ?? 0 }, { enabled: Boolean(selectedMessageId) });
  const saveTemplate = trpc.mail.saveTemplate.useMutation();
  const send = trpc.mail.send.useMutation();

  useEffect(() => {
    if (!template.data) return;
    setHeaderHtml(template.data.headerHtml);
    setFooterHtml(template.data.footerHtml);
  }, [template.data]);

  if (accessLoading) return <PageLoading />;
  if (!canSend) return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><h1 className="text-xl font-semibold">Mails unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">The Manage communications permission is required.</p></CardContent></Card>;

  const selectedRecipient = recipients.data?.find(item => item.id.toString() === selectedLeadId);

  async function sendEmail() {
    if (!selectedLeadId) return toast.error("Select a lead with an email address.");
    try {
      const result = await send.mutateAsync({ leadId: Number(selectedLeadId), subject, bodyText });
      await Promise.all([history.refetch(), utils.leads.invalidate(), utils.dashboard.invalidate()]);
      setSubject(starterSubject);
      setBodyText(starterBody);
      if (result.communicationLogged) toast.success("Email sent and added to Communication history.");
      else toast.warning("Email sent and saved in Sent history, but the lead Communication history could not be updated.");
    } catch (error) {
      await history.refetch();
      toast.error(error instanceof Error ? error.message : "Email could not be sent.");
    }
  }

  async function saveEmailTemplate() {
    try {
      const result = await saveTemplate.mutateAsync({ headerHtml, footerHtml });
      setHeaderHtml(result.headerHtml);
      setFooterHtml(result.footerHtml);
      await template.refetch();
      toast.success("Email header and footer saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Template could not be saved.");
    }
  }

  return <div className="mx-auto max-w-[1180px]">
    <PageHeader eyebrow="Outbound communication" title="Mails" description="Send email to accessible leads, maintain your reusable HTML frame, and review delivery history." />

    <Alert className="mb-6 border-sky-200 bg-sky-50 text-sky-950"><Inbox className="h-4 w-4" /><AlertTitle>Received messages are read in your mailbox</AlertTitle><AlertDescription>CareFlow sends and records outbound email only. To read replies or other received messages, sign in directly to the email account assigned to you by Super Admin.</AlertDescription></Alert>

    <Tabs defaultValue="compose" className="gap-5">
      <TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="compose"><Send />Compose</TabsTrigger><TabsTrigger value="history"><Mail />Sent history</TabsTrigger><TabsTrigger value="template"><Code2 />Header & footer</TabsTrigger></TabsList>

      <TabsContent value="compose" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><CardTitle>New lead email</CardTitle><p className="text-sm text-slate-500">The selected lead must be accessible to you and have an email address.</p></CardHeader><CardContent className="space-y-5">
          <div className="space-y-2"><Label>Find recipient</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} placeholder="Search by lead name or email" /></div></div>
          <div className="space-y-2"><Label>Lead recipient</Label><Select value={selectedLeadId} onValueChange={setSelectedLeadId}><SelectTrigger><SelectValue placeholder={recipients.isLoading ? "Loading leads…" : "Select a lead"} /></SelectTrigger><SelectContent>{recipients.data?.map(lead => <SelectItem key={lead.id} value={lead.id.toString()}>{lead.firstName} {lead.lastName} · {lead.email}</SelectItem>)}</SelectContent></Select>{selectedRecipient && <p className="text-xs text-slate-500">To: <strong>{selectedRecipient.email}</strong></p>}</div>
          <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={event => setSubject(event.target.value)} maxLength={240} /></div>
          <div className="space-y-2"><Label>Message</Label><Textarea value={bodyText} onChange={event => setBodyText(event.target.value)} rows={11} maxLength={20_000} placeholder="Write the email message" /><p className="text-xs leading-5 text-slate-400">Available tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. Your saved HTML header and footer are added automatically.</p></div>
          <div className="flex justify-end"><Button onClick={sendEmail} disabled={send.isPending || !selectedLeadId || !subject.trim() || !bodyText.trim()} className="bg-teal-700 hover:bg-teal-800">{send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send email</Button></div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Sent email history</CardTitle><p className="text-sm text-slate-500">{access?.role === "super_admin" ? "All outbound emails across CareFlow." : "Emails sent from your assigned account."}</p></CardHeader><CardContent>{history.isLoading ? <PageLoading /> : !history.data?.length ? <EmptyState title="No emails sent yet" description="Successful and failed send attempts will appear here." /> : <div className="divide-y divide-slate-100">{history.data.map(item => <button key={item.id} onClick={() => setSelectedMessageId(item.id)} className="flex w-full flex-col gap-3 py-4 text-left transition-opacity hover:opacity-70 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{item.subject}</p><p className="mt-1 text-sm text-slate-500">To {item.recipientName} · {item.recipientEmail}</p><p className="mt-1 text-xs text-slate-400">From {item.senderName} · {item.fromEmail}</p></div><div className="flex items-center gap-3"><Badge variant="outline" className={item.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>{item.status === "sent" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{item.status}</Badge><span className="text-xs text-slate-400">{new Date(item.sentAt).toLocaleString()}</span></div></button>)}</div>}</CardContent></Card>
      </TabsContent>

      <TabsContent value="template" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Reusable HTML header and footer</CardTitle><p className="text-sm leading-6 text-slate-500">These sections are added automatically to every email you send. Unsafe scripts, forms, and unsupported markup are removed when saved.</p></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label>Header HTML</Label><Textarea className="font-mono text-xs" value={headerHtml} onChange={event => setHeaderHtml(event.target.value)} rows={9} maxLength={50_000} /></div><div className="space-y-2"><Label>Footer HTML</Label><Textarea className="font-mono text-xs" value={footerHtml} onChange={event => setFooterHtml(event.target.value)} rows={9} maxLength={50_000} /></div><p className="text-xs leading-5 text-slate-400">Templates support the same four personalization tokens as the message composer. Each CareFlow account has its own header and footer.</p><div className="flex justify-end"><Button onClick={saveEmailTemplate} disabled={saveTemplate.isPending} className="bg-teal-700 hover:bg-teal-800">{saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save header & footer</Button></div></CardContent></Card>
      </TabsContent>
    </Tabs>

    <Dialog open={Boolean(selectedMessageId)} onOpenChange={open => { if (!open) setSelectedMessageId(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{message.data?.subject || "Email details"}</DialogTitle><DialogDescription>{message.data ? `To ${message.data.recipientName} · ${message.data.recipientEmail} · ${new Date(message.data.sentAt).toLocaleString()}` : "Loading email…"}</DialogDescription></DialogHeader>{message.data && <div className="space-y-4"><div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">From {message.data.fromEmail}</Badge><Badge variant="outline">{message.data.status}</Badge></div>{message.data.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Delivery failed</AlertTitle><AlertDescription>{message.data.error}</AlertDescription></Alert>}<iframe title="Sent email preview" sandbox="" srcDoc={message.data.bodyHtml} className="h-[420px] w-full rounded-xl border border-slate-200 bg-white" /></div>}</DialogContent></Dialog>
  </div>;
}
