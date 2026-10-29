import { TemplateTestEmailDialog, templateTestRecipientError, type TestEmailTemplate } from "@/components/crm/TemplateTestEmailDialog";
import { normalizeMailRecipients } from "@shared/emailRecipients";
import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { EmailTemplateEditorDialog, type EmailTemplateFormState } from "@/components/crm/EmailTemplateEditorDialog";
import { EmailLibraryDeleteDialog, type EmailLibraryDeleteTarget } from "@/components/crm/EmailLibraryDeleteDialog";
import { TrackingLinkNotice } from "@/components/crm/TrackingLinkNotice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { looksLikeEmailHtml, nextEmailCopyName } from "@/lib/emailTemplateEditor";
import { trpc } from "@/lib/trpc";
import { SYSTEM_ADMIN_ACTOR_ID } from "@shared/const";
import { Archive, CheckCircle2, Copy, Eye, Library, Package, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type StaffEmailAccess = { role?: string; isActive?: boolean; permissions?: { manageEmails?: boolean; useEmailTemplates?: boolean } };
type PreviewTarget = { name: string; subject: string; contentMode: "plain" | "html"; bodyText: string; bodyHtml?: string | null };
const emptyForm: EmailTemplateFormState = { productId: "", name: "", description: "", subject: "", contentMode: "plain", bodyText: "Hello {{leadFirstName}},\n\n", bodyHtml: "", sourceFileName: "", sortOrder: 0, isActive: true };

export default function StaffEmailTemplates({ access }: { access?: StaffEmailAccess | null }) {
  const allowed = access?.role === "technical_staff" && access.isActive && access.permissions?.manageEmails && access.permissions?.useEmailTemplates;
  if (!allowed) return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-6 sm:p-8"><h1 className="break-words text-xl font-semibold text-slate-950">Email templates unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">An active staff account with both Emails and Use email templates permissions is required.</p></CardContent></Card>;
  return <PersonalTemplateWorkspace />;
}

function PersonalTemplateWorkspace() {
  const utils = trpc.useUtils();
  const library = trpc.emailLibrary.personalLibrary.useQuery(undefined, { refetchOnMount: "always" });
  const create = trpc.emailLibrary.createPersonalTemplate.useMutation();
  const update = trpc.emailLibrary.updatePersonalTemplate.useMutation();
  const remove = trpc.emailLibrary.deletePersonalTemplate.useMutation();
  const testSend = trpc.emailLibrary.sendTestEmail.useMutation();
  const testSubmitting = useRef(false);
  const [testTemplate, setTestTemplate] = useState<TestEmailTemplate>();
  const [testRecipient, setTestRecipient] = useState("");
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number>();
  const [copying, setCopying] = useState(false);
  const [form, setForm] = useState<EmailTemplateFormState>({ ...emptyForm });
  const [previewMode, setPreviewMode] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailLibraryDeleteTarget | null>(null);
  const products = library.data ?? [];
  type Product = (typeof products)[number];
  type Template = Product["templates"][number];
  const saving = create.isPending || update.isPending;
  const isDefault = (template: Template) => template.ownerUserId === SYSTEM_ADMIN_ACTOR_ID;
  const toForm = (template: Template): EmailTemplateFormState => ({ productId: String(template.productId), name: template.name, description: template.description ?? "", subject: template.subject, contentMode: template.contentMode, bodyText: template.bodyText, bodyHtml: template.bodyHtml ?? "", sourceFileName: template.sourceFileName ?? "", sortOrder: template.sortOrder, isActive: template.isActive });

  function edit(product: Product, template?: Template, asCopy = false) {
    if (busy.current) return;
    setEditingId(template && !asCopy ? template.id : undefined); setCopying(asCopy); setPreviewMode(false);
    const draft = template ? toForm(template) : { ...emptyForm, productId: String(product.id) };
    if (asCopy) { draft.name = nextEmailCopyName(draft.name, product.templates.filter(item => !isDefault(item)).map(item => item.name)); draft.isActive = true; }
    setForm(draft); setOpen(true);
  }
  async function refresh() { await utils.emailLibrary.invalidate().catch(() => undefined); }
  async function save() {
    if (busy.current || saving) return;
    busy.current = true;
    try {
      const payload = { ...form, productId: Number(form.productId), bodyHtml: form.contentMode === "html" ? form.bodyHtml : null, sourceFileName: form.contentMode === "html" ? form.sourceFileName || null : null };
      if (editingId) await update.mutateAsync({ id: editingId, template: payload }); else await create.mutateAsync(payload);
      setOpen(false); setForm({ ...emptyForm }); toast.success(editingId ? "Your template was updated." : "Your personal template was created."); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Your template could not be saved."); }
    finally { busy.current = false; }
  }
  async function toggle(template: Template) {
    if (busy.current || isDefault(template)) return;
    busy.current = true;
    try { await update.mutateAsync({ id: template.id, template: { ...toForm(template), productId: template.productId, isActive: !template.isActive, bodyHtml: template.bodyHtml, sourceFileName: template.sourceFileName } }); await refresh(); toast.success(template.isActive ? "Your template was archived." : "Your template was activated."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Template could not be updated."); } finally { busy.current = false; }
  }
  async function deleteOwn() {
    if (!deleteTarget || busy.current) return;
    busy.current = true;
    try { await remove.mutateAsync({ id: deleteTarget.id }); setDeleteTarget(null); await refresh(); toast.success("Your template was deleted. Sent history was preserved."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Your template could not be deleted."); } finally { busy.current = false; }
  }
  async function sendTest() {
    if (!testTemplate || testSubmitting.current || testSend.isPending) return;
    const error = templateTestRecipientError(testRecipient);
    if (error) return toast.error(error);
    testSubmitting.current = true;
    try {
      const recipientEmail = normalizeMailRecipients({ to: testRecipient }).to;
      const result = await testSend.mutateAsync({ messageTemplateId: testTemplate.id, recipientEmail });
      setTestTemplate(undefined); setTestRecipient("");
      toast.success(`Test email sent to ${result.recipientEmail} using ${result.templateName}.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Test email could not be sent. Please try again."); }
    finally { testSubmitting.current = false; }
  }
  async function readHtml(file?: File) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) || file.size > 250_000) { toast.error("Choose an .html/.htm file up to 250 KB."); return; }
    try { const bodyHtml = (await file.text()).replace(/^\uFEFF/, ""); if (!bodyHtml.trim()) throw new Error("The HTML file is empty."); setForm(current => ({ ...current, contentMode: "html", bodyHtml, sourceFileName: file.name })); setPreviewMode(true); }
    catch (error) { toast.error(error instanceof Error ? error.message : "The HTML file could not be read."); }
    finally { if (fileInput.current) fileInput.current.value = ""; }
  }
  function row(product: Product, template: Template) {
    const defaults = isDefault(template);
    return <div key={template.id} className={`flex min-w-0 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center ${!template.isActive ? "bg-slate-50" : ""}`}>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">{template.name}</p><Badge variant="outline" className={defaults ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-violet-200 bg-violet-50 text-violet-800"}>{defaults ? "Default · read-only" : "My template"}</Badge><Badge variant="outline">{template.contentMode === "html" ? "HTML" : "Plain text"}</Badge>{!template.isActive && <Badge variant="outline">Archived</Badge>}</div><p className="mt-1 break-words text-sm font-medium text-slate-700 [overflow-wrap:anywhere]">{template.subject}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-500 [overflow-wrap:anywhere]">{template.description || template.bodyText}</p></div>
      <div className="grid w-full gap-2 min-[360px]:grid-cols-2 lg:flex lg:w-auto lg:max-w-[48%] lg:flex-wrap lg:justify-end">
        <Button variant="outline" size="sm" onClick={() => setPreview(template)}><Eye className="mr-2 h-3.5 w-3.5" />View preview</Button>
        <Button variant="outline" size="sm" disabled={!template.isActive || testSend.isPending} onClick={() => { setTestRecipient(""); setTestTemplate(template); }}><Send className="mr-2 h-3.5 w-3.5" />Send test</Button>
        <Button variant="outline" size="sm" disabled={saving || remove.isPending} onClick={() => edit(product, template, true)}><Copy className="mr-2 h-3.5 w-3.5" />Copy to my templates</Button>
        {!defaults && <><Button variant="outline" size="sm" disabled={saving || remove.isPending} onClick={() => edit(product, template)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit my template</Button><Button variant="outline" size="sm" disabled={saving || remove.isPending} onClick={() => void toggle(template)}>{template.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{template.isActive ? "Archive" : "Activate"}</Button><Button variant="outline" size="sm" className="text-rose-700 min-[360px]:col-span-2" disabled={saving || remove.isPending} onClick={() => setDeleteTarget({ kind: "template", id: template.id, name: template.name })}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete my template</Button></>}
      </div>
    </div>;
  }
  return <div className="mx-auto max-w-[1280px]">
    <PageHeader eyebrow="Default and personal library" title="Email templates" description="Use Super Admin defaults or create your own templates for each product. Only your personal templates can be edited here." actions={<Button asChild className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><a href="/mails"><Send className="mr-2 h-4 w-4" />Open Mails</a></Button>} />
    <TrackingLinkNotice className="mb-5" />
    <Alert className="mb-6 border-cyan-200 bg-cyan-50 text-cyan-950"><Library className="h-4 w-4" /><AlertTitle>Defaults stay unchanged. Your templates stay personal.</AlertTitle><AlertDescription>Create as many personal templates as you need for each active product. Copy a default to personalize it without changing the original. Other staff cannot see or edit your personal templates. Your global email header/footer is still managed by Super Admin. Use Send test on an active default or personal template and enter any recipient email address.</AlertDescription></Alert>
    {library.isLoading ? <PageLoading /> : library.isError ? <Card><CardContent className="p-6"><p>Templates could not be loaded.</p><Button variant="outline" className="mt-3" onClick={() => void library.refetch()}>Try again</Button></CardContent></Card> : !products.length ? <EmptyState title="No active products yet" description="Super Admin must activate a product before you can add templates." /> : <div className="space-y-5">{products.map(product => <Card key={product.id} className="rounded-2xl border-0 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><Package className="mt-1 h-6 w-6 shrink-0 text-teal-700" /><div className="min-w-0"><CardTitle className="break-words [overflow-wrap:anywhere]">{product.name}</CardTitle><p className="mt-1 break-words text-sm text-slate-500">{product.description || "No product description."}</p></div></div><Button disabled={saving || remove.isPending} onClick={() => edit(product)} className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add my template</Button></div></CardHeader>
      <CardContent className="p-0"><h3 className="bg-cyan-50/50 px-4 py-3 text-sm font-semibold text-cyan-900">Default templates</h3><div className="divide-y divide-slate-100">{product.templates.filter(isDefault).map(template => row(product, template))}</div>{!product.templates.some(isDefault) && <p className="p-4 text-sm text-slate-500">No active defaults for this product.</p>}<h3 className="bg-violet-50/50 px-4 py-3 text-sm font-semibold text-violet-900">My templates</h3><div className="divide-y divide-slate-100">{product.templates.filter(template => !isDefault(template)).map(template => row(product, template))}</div>{!product.templates.some(template => !isDefault(template)) && <p className="p-4 text-sm text-slate-500">No personal templates yet. Add one or copy a default above.</p>}</CardContent>
    </Card>)}</div>}
    <EmailTemplateEditorDialog personal open={open} onOpenChange={value => { if (!busy.current) setOpen(value); }} editing={Boolean(editingId)} copying={copying} products={products} form={form} setForm={setForm} previewMode={previewMode} setPreviewMode={setPreviewMode} htmlFileInput={fileInput} onReadHtmlFile={readHtml} onChangeMode={contentMode => { setForm(current => ({ ...current, contentMode })); setPreviewMode(false); }} onUpdatePlainMessage={bodyText => { if (looksLikeEmailHtml(bodyText)) setForm(current => ({ ...current, contentMode: "html", bodyHtml: bodyText, sourceFileName: "Pasted HTML" })); else setForm(current => ({ ...current, bodyText })); }} onSave={save} saving={saving} bodyValid={Boolean(form.contentMode === "html" ? form.bodyHtml.trim() : form.bodyText.trim())} />
    <TemplateTestEmailDialog personal open={Boolean(testTemplate)} onOpenChange={value => { if (!value && !testSubmitting.current) { setTestTemplate(undefined); setTestRecipient(""); } }} template={testTemplate} recipientEmail={testRecipient} onRecipientChange={setTestRecipient} onSend={sendTest} sending={testSend.isPending} />
    <EmailLibraryDeleteDialog target={deleteTarget} deleting={remove.isPending} onCancel={() => { if (!busy.current) setDeleteTarget(null); }} onConfirm={deleteOwn} />
    <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden p-0 sm:max-w-4xl"><DialogHeader className="shrink-0 border-b px-4 py-5 pr-12 text-left"><DialogTitle className="break-words">{preview?.name}</DialogTitle><DialogDescription className="break-words">Subject: {preview?.subject}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto p-4">{preview?.contentMode === "html" ? <iframe title="Email template preview" sandbox="" srcDoc={preview.bodyHtml || ""} className="h-[min(65dvh,620px)] w-full rounded-xl border bg-white" /> : <pre className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{preview?.bodyText}</pre>}</div></DialogContent></Dialog>
  </div>;
}
