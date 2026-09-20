import { EmptyState, PageLoading } from "@/components/crm/CrmUi";
import { EmailEngagementBadges, EmailEngagementDetails, EmailEngagementNotice } from "@/components/crm/EmailEngagement";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatEasternDate } from "@shared/time";
import { AlertTriangle, CheckCircle2, Code2, Eye, FileCode2, Library, Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STARTER_SUBJECT = "A message from {{senderName}}";
const STARTER_BODY = "Hello {{leadFirstName}},\n\n";

type LeadRecipient = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
};

type LeadEmailHistoryData = {
  total: number;
  sentCount: number;
  failedCount: number;
  openedCount: number;
  clickedCount: number;
  messages: Array<{
    id: number;
    senderName: string;
    fromEmail: string;
    recipientEmail: string;
    productName: string | null;
    templateName: string | null;
    subject: string;
    status: "sent" | "failed";
    error: string | null;
    trackingEnabled: boolean;
    firstOpenedAt: number | null;
    lastOpenedAt: number | null;
    openCount: number;
    firstClickedAt: number | null;
    lastClickedAt: number | null;
    clickCount: number;
    sentAt: number;
  }>;
};

export function LeadEmailComposerDialog({ lead, onSent }: { lead: LeadRecipient; onSent: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const library = trpc.emailLibrary.library.useQuery(undefined, { enabled: open });
  const sendEmail = trpc.mail.send.useMutation();
  const [productId, setProductId] = useState("");
  const [messageTemplateId, setMessageTemplateId] = useState("");
  const [subject, setSubject] = useState(STARTER_SUBJECT);
  const [contentMode, setContentMode] = useState<"plain" | "html">("plain");
  const [bodyText, setBodyText] = useState(STARTER_BODY);
  const [bodyHtml, setBodyHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState(true);
  const selectedProduct = library.data?.find(item => String(item.id) === productId);
  const selectedTemplate = selectedProduct?.templates.find(item => String(item.id) === messageTemplateId);

  function resetDraft() {
    setProductId("");
    setMessageTemplateId("");
    setSubject(STARTER_SUBJECT);
    setContentMode("plain");
    setBodyText(STARTER_BODY);
    setBodyHtml("");
    setPreviewHtml(true);
  }

  function selectProduct(value: string) {
    setProductId(value);
    setMessageTemplateId("");
  }

  function applyTemplate(value: string) {
    setMessageTemplateId(value);
    const template = selectedProduct?.templates.find(item => String(item.id) === value);
    if (!template) return;
    setSubject(template.subject);
    setContentMode(template.contentMode);
    setBodyText(template.bodyText);
    setBodyHtml(template.bodyHtml ?? "");
    setPreviewHtml(template.contentMode === "html");
    toast.success(`Applied ${template.name}. Review the draft before sending.`);
  }

  function clearTemplate() {
    setMessageTemplateId("");
    if (contentMode === "html") setBodyText(selectedTemplate?.bodyText || STARTER_BODY);
    setContentMode("plain");
    setBodyHtml("");
    toast.success("Template detached. The readable draft remains editable as plain text.");
  }

  async function send() {
    if (!lead.email?.trim()) return toast.error("Add an email address to this lead before sending.");
    try {
      const result = await sendEmail.mutateAsync({
        leadId: lead.id,
        messageTemplateId: messageTemplateId ? Number(messageTemplateId) : null,
        subject,
        contentMode,
        bodyText,
        bodyHtml: contentMode === "html" ? bodyHtml : null,
      });
      await onSent();
      setOpen(false);
      resetDraft();
      if (result.communicationLogged) toast.success("Email sent and added to this lead's history.");
      else toast.warning("Email sent and recorded, but Communication history could not be updated.");
    } catch (error) {
      await onSent();
      toast.error(error instanceof Error ? error.message : "Email could not be sent.");
    }
  }

  const disabledReason = !lead.email?.trim() ? "Add an email address to this lead before sending." : undefined;
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value && !sendEmail.isPending) resetDraft(); }}>
    <DialogTrigger asChild>
      <Button variant="outline" disabled={Boolean(disabledReason)} title={disabledReason}><Mail className="mr-2 h-4 w-4" />Send email</Button>
    </DialogTrigger>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Send email to {lead.firstName} {lead.lastName}</DialogTitle>
        <DialogDescription>To {lead.email}. Choose an approved product template or write a plain-text message, then review the final draft.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 py-2">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
          <div className="mb-4 flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-cyan-800 shadow-sm"><Library className="h-4 w-4" /></div><div><p className="font-semibold text-slate-900">Start from an approved template</p><p className="text-sm leading-6 text-slate-600">Choose a product and an active Super Admin template. The subject and message remain editable.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Product</Label><Select value={productId} onValueChange={selectProduct}><SelectTrigger className="bg-white"><SelectValue placeholder={library.isLoading ? "Loading products…" : "Select a product"} /></SelectTrigger><SelectContent>{library.data?.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Email template</Label><Select value={messageTemplateId} onValueChange={applyTemplate} disabled={!productId || !selectedProduct?.templates.length}><SelectTrigger className="bg-white"><SelectValue placeholder={!productId ? "Select a product first" : selectedProduct?.templates.length ? "Select a template" : "No active templates"} /></SelectTrigger><SelectContent>{selectedProduct?.templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name} · {template.contentMode === "html" ? "HTML" : "Plain text"}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {selectedTemplate && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-1.5 text-xs leading-5 text-cyan-900">{selectedTemplate.contentMode === "html" && <FileCode2 className="h-3.5 w-3.5" />}<span><strong>Applied:</strong> {selectedTemplate.name}{selectedTemplate.description ? ` · ${selectedTemplate.description}` : ""}</span></p><Button type="button" variant="ghost" size="sm" className="h-7 justify-start px-2 text-xs text-cyan-900 hover:bg-cyan-100" onClick={clearTemplate}>Clear template</Button></div>}
        </div>
        <div className="space-y-2"><Label>Subject</Label><Input value={subject} onChange={event => setSubject(event.target.value)} maxLength={240} /></div>
        {contentMode === "html" ? <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><Label>HTML message</Label><p className="mt-1 text-xs text-slate-400">The source is sanitized again immediately before sending.</p></div><div className="flex gap-2"><Button type="button" variant={!previewHtml ? "default" : "outline"} size="sm" onClick={() => setPreviewHtml(false)}><Code2 className="mr-2 h-3.5 w-3.5" />Edit HTML</Button><Button type="button" variant={previewHtml ? "default" : "outline"} size="sm" onClick={() => setPreviewHtml(true)}><Eye className="mr-2 h-3.5 w-3.5" />Preview</Button></div></div>
          {previewHtml ? <iframe title="Lead email draft preview" sandbox="" srcDoc={bodyHtml} className="h-[420px] w-full rounded-xl border border-slate-200 bg-white" /> : <Textarea className="font-mono text-xs" value={bodyHtml} onChange={event => setBodyHtml(event.target.value)} rows={18} maxLength={250_000} />}
        </div> : <div className="space-y-2"><Label>Message</Label><Textarea value={bodyText} onChange={event => setBodyText(event.target.value)} rows={10} maxLength={50_000} placeholder="Write the email message" /></div>}
        <p className="text-xs leading-5 text-slate-400">Available tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. The global Super Admin header and footer are added automatically.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={sendEmail.isPending}>Cancel</Button><Button onClick={send} disabled={sendEmail.isPending || !subject.trim() || (contentMode === "html" ? !bodyHtml.trim() : !bodyText.trim())} className="bg-teal-700 hover:bg-teal-800">{sendEmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send email</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function LeadEmailHistory({ leadId, history, isLoading }: { leadId: number; history?: LeadEmailHistoryData; isLoading: boolean }) {
  const [messageId, setMessageId] = useState<number>();
  const message = trpc.mail.leadMessage.useQuery({ leadId, id: messageId ?? 0 }, { enabled: Boolean(messageId), refetchInterval: messageId ? 30_000 : false });
  if (isLoading) return <PageLoading />;
  return <>
    <Card className="rounded-2xl border-0 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-lg">Lead email history</CardTitle><p className="mt-1 text-sm text-slate-500">Every outbound email attempt for this lead, regardless of which staff account sent it.</p></div><div className="flex flex-wrap gap-2"><Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{history?.sentCount ?? 0} sent</Badge><Badge className="bg-sky-50 text-sky-700 hover:bg-sky-50">{history?.openedCount ?? 0} opened</Badge><Badge className="bg-violet-50 text-violet-700 hover:bg-violet-50">{history?.clickedCount ?? 0} clicked</Badge>{Boolean(history?.failedCount) && <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-50">{history?.failedCount} failed</Badge>}<Badge variant="outline">{history?.total ?? 0} total attempts</Badge></div></div></CardHeader>
      <CardContent><EmailEngagementNotice className="mb-4 mt-5" />{!history?.messages.length ? <EmptyState title="No emails recorded" description="Emails sent from this lead profile, automatic lead reminders, or the Mails workspace will appear here for every authorized staff member." /> : <div className="divide-y divide-slate-100">{history.messages.map(item => <button key={item.id} onClick={() => setMessageId(item.id)} className="flex w-full flex-col gap-3 py-4 text-left transition-opacity hover:opacity-70 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold text-slate-900">{item.subject}</p>{item.productName && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">{item.productName}</Badge>}{item.templateName && <Badge variant="outline">{item.templateName}</Badge>}</div><p className="mt-1 text-sm text-slate-500">Sent by {item.senderName} · {item.fromEmail}</p><p className="mt-1 text-xs text-slate-400">To {item.recipientEmail}</p><div className="mt-2"><EmailEngagementBadges email={item} /></div></div><div className="flex items-center gap-3"><Badge variant="outline" className={item.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}>{item.status === "sent" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}{item.status}</Badge><span className="text-xs text-slate-400">{formatEasternDate(item.sentAt, true)}</span></div></button>)}</div>}</CardContent>
    </Card>
    <Dialog open={Boolean(messageId)} onOpenChange={value => { if (!value) setMessageId(undefined); }}>
      <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{message.data?.subject || "Email details"}</DialogTitle><DialogDescription>{message.data ? `Sent by ${message.data.senderName} from ${message.data.fromEmail} · ${formatEasternDate(message.data.sentAt, true)}` : "Loading email…"}</DialogDescription></DialogHeader>{message.isLoading ? <PageLoading /> : message.data && <div className="space-y-4"><div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">To {message.data.recipientEmail}</Badge>{message.data.productName && <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">Product: {message.data.productName}</Badge>}{message.data.templateName && <Badge variant="outline">Template: {message.data.templateName}</Badge>}<Badge variant="outline">{message.data.status}</Badge></div>{message.data.status === "sent" && <EmailEngagementDetails email={message.data} />}{message.data.error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Delivery failed</AlertTitle><AlertDescription>{message.data.error}</AlertDescription></Alert>}<iframe title="Lead sent email preview" sandbox="" srcDoc={message.data.bodyHtml} className="h-[420px] w-full rounded-xl border border-slate-200 bg-white" /></div>}</DialogContent>
    </Dialog>
  </>;
}
