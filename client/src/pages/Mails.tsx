import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { EmailEngagementBadges, EmailEngagementDetails, EmailEngagementNotice } from "@/components/crm/EmailEngagement";
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
import { formatEasternDate } from "@shared/time";
import { AlertTriangle, CheckCircle2, Code2, Eye, FileCode2, Inbox, Library, Loader2, Mail, Search, Send } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const starterSubject = "A message from {{senderName}}";
const starterBody = "Hello {{leadFirstName}},\n\n";

export default function Mails() {
  const utils = trpc.useUtils();
  const { data: access, isLoading: accessLoading } = trpc.dashboard.access.useQuery();
  const canSend = Boolean(access?.permissions.manageContacts);
  const isSuperAdmin = access?.role === "super_admin";
  const [recipientSearch, setRecipientSearch] = useState("");
  const deferredSearch = useDeferredValue(recipientSearch.trim());
  const recipientInput = useMemo(() => ({ search: deferredSearch || undefined }), [deferredSearch]);
  const recipients = trpc.mail.recipients.useQuery(recipientInput, { enabled: canSend });
  const emailLibrary = trpc.emailLibrary.library.useQuery(undefined, { enabled: canSend });
  const template = trpc.mail.template.useQuery(undefined, { enabled: canSend && isSuperAdmin });
  const history = trpc.mail.history.useQuery(undefined, { enabled: canSend, refetchInterval: canSend ? 30_000 : false });
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedMessageTemplateId, setSelectedMessageTemplateId] = useState<string>("");
  const [subject, setSubject] = useState(starterSubject);
  const [contentMode, setContentMode] = useState<"plain" | "html">("plain");
  const [bodyText, setBodyText] = useState(starterBody);
  const [bodyHtml, setBodyHtml] = useState("");
  const [htmlPreview, setHtmlPreview] = useState(true);
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<number>();
  const message = trpc.mail.message.useQuery({ id: selectedMessageId ?? 0 }, { enabled: Boolean(selectedMessageId), refetchInterval: selectedMessageId ? 30_000 : false });
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
  const selectedProduct = emailLibrary.data?.find(item => item.id.toString() === selectedProductId);
  const selectedMessageTemplate = selectedProduct?.templates.find(item => item.id.toString() === selectedMessageTemplateId);
  const openedMessages = history.data?.filter(item => item.firstOpenedAt).length ?? 0;
  const clickedMessages = history.data?.filter(item => item.firstClickedAt).length ?? 0;

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setSelectedMessageTemplateId("");
  }

  function applyMessageTemplate(templateId: string) {
    setSelectedMessageTemplateId(templateId);
    const selected = selectedProduct?.templates.find(item => item.id.toString() === templateId);
    if (!selected) return;
    setSubject(selected.subject);
    setContentMode(selected.contentMode);
    setBodyText(selected.bodyText);
    setBodyHtml(selected.bodyHtml ?? "");
    setHtmlPreview(selected.contentMode === "html");
    toast.success(`Applied ${selected.name}. Review and personalize it before sending.`);
  }

  function clearMessageTemplate() {
    setSelectedMessageTemplateId("");
    if (contentMode === "html") setBodyText(selectedMessageTemplate?.bodyText || starterBody);
    setContentMode("plain");
    setBodyHtml("");
    toast.success("Template detached. The readable message remains editable as plain text.");
  }

  async function sendEmail() {
    if (!selectedLeadId) return toast.error("Select a lead with an email address.");
    try {
      const result = await send.mutateAsync({ leadId: Number(selectedLeadId), messageTemplateId: selectedMessageTemplateId ? Number(selectedMessageTemplateId) : null, subject, contentMode, bodyText, bodyHtml: contentMode === "html" ? bodyHtml : null });
      await Promise.all([history.refetch(), utils.leads.invalidate(), utils.dashboard.invalidate()]);
      setSubject(starterSubject);
      setContentMode("plain");
      setBodyText(starterBody);
      setBodyHtml("");
      setSelectedProductId("");
      setSelectedMessageTemplateId("");
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
    <PageHeader eyebrow="Outbound communication" title="Mails" description={isSuperAdmin ? "Send email to accessible leads, start from a product template, manage the global HTML frame, and review delivery history." : "Send email to accessible leads, start from an approved product template, and review your delivery history."} />

    <Alert className="mb-6 border-sky-200 bg-sky-50 text-sky-950"><Inbox className="h-4 w-4" /><AlertTitle>Received messages are read in your mailbox</AlertTitle><AlertDescription>CareFlow sends and records outbound email only. To read replies or other received messages, sign in directly to the email account assigned to you by Super Admin.</AlertDescription></Alert>

    <Tabs defaultValue="compose" className="gap-5">
      <TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="compose"><Send />Compose</TabsTrigger><TabsTrigger value="history"><Mail />Sent history</TabsTrigger>{isSuperAdmin && <TabsTrigger value="template"><Code2 />Header & footer</TabsTrigger>}</TabsList>

      <TabsContent value="compose" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]"><CardHeader><CardTitle>New lead email</CardTitle><p className="text-sm text-slate-500">The selected lead must be accessible to you and have an email address.</p></CardHeader><CardContent className="space-y-5">
          <div className="space-y-2"><Label>Find recipient</Label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={recipientSearch} onChange={event => setRecipientSearch(event.target.value)} placeholder="Search by lead name or email" /></div></div>
          <div className="space-y-2"><Label>Lead recipient</Label><Select value={selectedLeadId} onValueChange={setSelectedLeadId}><SelectTrigger><SelectValue placeholder={recipients.isLoading ? "Loading leads…" : "Select a lead"} /></SelectTrigger><SelectContent>{recipients.data?.map(lead => <SelectItem key={lead.id} value={lead.id.toString()}>{lead.firstName} {lead.lastName} · {lead.email}</SelectItem>)}</SelectContent></Select>{selectedRecipient && <p className="text-xs text-slate-500">To: <strong>{selectedRecipient.email}</strong></p>}</div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4"><div className="mb-4 flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-cyan-800 shadow-sm"><Library className="h-4 w-4" /></div><div><p className="font-semibold text-slate-900">Start from an approved template</p><p className="text-sm leading-6 text-slate-600">Choose a product, then a Super Admin plain-text or HTML template. Review and personalize it before sending.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Product</Label><Select value={selectedProductId} onValueChange={selectProduct}><SelectTrigger className="bg-white"><SelectValue placeholder={emailLibrary.isLoading ? "Loading products…" : "Select a product"} /></SelectTrigger><SelectContent>{emailLibrary.data?.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Email template</Label><Select value={selectedMessageTemplateId} onValueChange={applyMessageTemplate} disabled={!selectedProductId || !selectedProduct?.templates.length}><SelectTrigger className="bg-white"><SelectValue placeholder={!selectedProductId ? "Select a product first" : selectedProduct?.templates.length ? "Select a template" : "No active templates"} /></SelectTrigger><SelectContent>{selectedProduct?.templates.map(item => <SelectItem key={item.id} value={String(item.id)}>{item.name} · {item.contentMode === "html" ? "HTML" : "Plain text"}</SelectItem>)}</SelectContent></Select></div></div>{selectedMessageTemplate && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5 text-xs leading-5 text-cyan-900">{selectedMessageTemplate.contentMode === "html" && <FileCode2 className="h-3.5 w-3.5" />}<span><strong>Applied:</strong> {selectedMessageTemplate.name}{selectedMessageTemplate.description ? ` · ${selectedMessageTemplate.description}` : ""}</span></p><Button type="button" variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs text-cyan-900 hover:bg-cyan-100" onClick={clearMessageTemplate}>Clear template</Button></div>}</div>
          <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={event => setSubject(event.target.value)} maxLength={240} /></div>
          {contentMode === "html" ? <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><Label>HTML message</Label><p className="mt-1 text-xs text-slate-400">This source is sanitized again when the email is sent.</p></div><div className="flex gap-2"><Button type="button" variant={!htmlPreview ? "default" : "outline"} size="sm" onClick={() => setHtmlPreview(false)}><Code2 className="mr-2 h-3.5 w-3.5" />Edit HTML</Button><Button type="button" variant={htmlPreview ? "default" : "outline"} size="sm" onClick={() => setHtmlPreview(true)}><Eye className="mr-2 h-3.5 w-3.5" />Preview</Button></div></div>{htmlPreview ? <iframe title="Email draft preview" sandbox="" srcDoc={bodyHtml} className="h-[460px] w-full rounded-xl border border-slate-200 bg-white" /> : <Textarea className="font-mono text-xs" value={bodyHtml} onChange={event => setBodyHtml(event.target.value)} rows={20} maxLength={250_000} />}</div> : <div className="space-y-2"><Label>Message</Label><Textarea value={bodyText} onChange={event => setBodyText(event.target.value)} rows={11} maxLength={50_000} placeholder="Write the email message" /></div>}
          <p className="text-xs leading-5 text-slate-400">Available tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. The Super Admin-managed HTML header and footer are added automatically.</p>
          <div className="flex justify-end"><Button onClick={sendEmail} disabled={send.isPending || !selectedLeadId || !subject.trim() || (contentMode === "html" ? !bodyHtml.trim() : !bodyText.trim())} className="bg-teal-700 hover:bg-teal-800">{send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send email</Button></div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Sent email history</CardTitle><p className="mt-1 text-sm text-slate-500">{access?.role === "super_admin" ? "All outbound emails across CareFlow." : "Emails sent from your assigned account."}</p></div><div className="flex flex-wrap gap-2"><Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">{openedMessages} opened</Badge><Badge className="bg-violet-50 text-violet-700 hover:bg-violet-50">{clickedMessages} clicked</Badge></div></div></CardHeader><CardContent><EmailEngagementNotice className="mb-4" />{history.isLoading ? <PageLoading /> : !history.data?.length ? <EmptyState title="No emails sent yet" description="Successful and failed send attempts will appear here." /> : <div className="divide-y divide-slate-100">{history.data.map(item => <button key={item.id} onClick={() => setSelectedMessageId(item.id)} className="flex w-full flex-col gap-3 py-4 text-left transition-opacity hover:opacity-70 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-slate-900">{item.subject}</p>{item.productName && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">{item.productName}</Badge>}{item.templateName && <Badge variant="outline">{item.templateName}</Badge>}</div><p className="mt-1 text-sm text-slate-500">To {item.recipientName} · {item.recipientEmail}</p><p className="mt-1 text-xs text-slate-400">From {item.senderName} · {item.fromEmail}</p><div className="mt-2"><EmailEngagementBadges email={item} /></div></div><div className="flex items-center gap-3"><Badge variant="outline" className={item.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>{item.status === "sent" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{item.status}</Badge><span className="text-xs text-slate-400">{formatEasternDate(item.sentAt, true)}</span></div></button>)}</div>}</CardContent></Card>
      </TabsContent>

      {isSuperAdmin && <TabsContent value="template" className="mt-0">
        <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Global HTML header and footer</CardTitle><p className="text-sm leading-6 text-slate-500">Super Admin controls these sections. They are added automatically to emails sent from every CareFlow account. Unsafe scripts, forms, and unsupported markup are removed when saved.</p></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label>Header HTML</Label><Textarea className="font-mono text-xs" value={headerHtml} onChange={event => setHeaderHtml(event.target.value)} rows={9} maxLength={50_000} /></div><div className="space-y-2"><Label>Footer HTML</Label><Textarea className="font-mono text-xs" value={footerHtml} onChange={event => setFooterHtml(event.target.value)} rows={9} maxLength={50_000} /></div><p className="text-xs leading-5 text-slate-400">The global frame supports the same four personalization tokens as the message composer. Technical staff cannot view or edit this configuration.</p><div className="flex justify-end"><Button onClick={saveEmailTemplate} disabled={saveTemplate.isPending} className="bg-teal-700 hover:bg-teal-800">{saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save header & footer</Button></div></CardContent></Card>
      </TabsContent>}
    </Tabs>

    <Dialog open={Boolean(selectedMessageId)} onOpenChange={open => { if (!open) setSelectedMessageId(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{message.data?.subject || "Email details"}</DialogTitle><DialogDescription>{message.data ? `To ${message.data.recipientName} · ${message.data.recipientEmail} · ${formatEasternDate(message.data.sentAt, true)}` : "Loading email…"}</DialogDescription></DialogHeader>{message.data && <div className="space-y-4"><div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">From {message.data.fromEmail}</Badge>{message.data.productName && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">Product: {message.data.productName}</Badge>}{message.data.templateName && <Badge variant="outline">Template: {message.data.templateName}</Badge>}<Badge variant="outline">{message.data.status}</Badge></div>{message.data.status === "sent" && <EmailEngagementDetails email={message.data} />}{message.data.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Delivery failed</AlertTitle><AlertDescription>{message.data.error}</AlertDescription></Alert>}<iframe title="Sent email preview" sandbox="" srcDoc={message.data.bodyHtml} className="h-[420px] w-full rounded-xl border border-slate-200 bg-white" /></div>}</DialogContent></Dialog>
  </div>;
}
