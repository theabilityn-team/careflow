import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { EmailTemplateEditorDialog } from "@/components/crm/EmailTemplateEditorDialog";
import { TemplateTestEmailDialog, type TestEmailTemplate } from "@/components/crm/TemplateTestEmailDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { looksLikeEmailHtml, preferredTestSenderUserId } from "@/lib/emailTemplateEditor";
import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, FileCode2, Library, Loader2, Mail, Package, Pencil, Plus, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_HTML_FILE_BYTES = 250_000;
const emptyProduct = { name: "", description: "", sortOrder: 0, isActive: true };
const emptyTemplate = {
  productId: "",
  name: "",
  description: "",
  subject: "",
  contentMode: "plain" as "plain" | "html",
  bodyText: "Hello {{leadFirstName}},\n\n",
  bodyHtml: "",
  sourceFileName: "",
  sortOrder: 0,
  isActive: true,
};

type ProductForm = typeof emptyProduct;
type TemplateForm = typeof emptyTemplate;
export default function EmailTemplates() {
  const { data: access, isLoading: accessLoading } = trpc.dashboard.access.useQuery();
  const library = trpc.emailLibrary.adminList.useQuery(undefined, { enabled: access?.role === "super_admin" });
  const createProduct = trpc.emailLibrary.createProduct.useMutation();
  const updateProduct = trpc.emailLibrary.updateProduct.useMutation();
  const createTemplate = trpc.emailLibrary.createTemplate.useMutation();
  const updateTemplate = trpc.emailLibrary.updateTemplate.useMutation();
  const smtpAccounts = trpc.emailSettings.managedAccounts.useQuery(undefined, { enabled: access?.role === "super_admin" });
  const sendTestEmail = trpc.emailSettings.sendTestEmail.useMutation();
  const htmlFileInput = useRef<HTMLInputElement>(null);
  const [productDialog, setProductDialog] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number>();
  const [editingTemplateId, setEditingTemplateId] = useState<number>();
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplate);
  const [previewMode, setPreviewMode] = useState(false);
  const [testDialog, setTestDialog] = useState(false);
  const [testTemplate, setTestTemplate] = useState<TestEmailTemplate>();
  const [testSenderUserId, setTestSenderUserId] = useState("");
  const [testRecipientEmail, setTestRecipientEmail] = useState("");

  if (accessLoading) return <PageLoading />;
  if (access?.role !== "super_admin") return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><h1 className="text-xl font-semibold">Email templates unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">Only Super Admin can manage products and reusable email templates.</p></CardContent></Card>;

  const products = library.data ?? [];
  const savingProduct = createProduct.isPending || updateProduct.isPending;
  const savingTemplate = createTemplate.isPending || updateTemplate.isPending;

  function openProduct(product?: (typeof products)[number]) {
    setEditingProductId(product?.id);
    setProductForm(product ? { name: product.name, description: product.description ?? "", sortOrder: product.sortOrder, isActive: product.isActive } : { ...emptyProduct });
    setProductDialog(true);
  }

  function openTemplate(productId: number, template?: (typeof products)[number]["templates"][number]) {
    setEditingTemplateId(template?.id);
    setTemplateForm(template ? {
      productId: String(template.productId),
      name: template.name,
      description: template.description ?? "",
      subject: template.subject,
      contentMode: template.contentMode,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml ?? "",
      sourceFileName: template.sourceFileName ?? "",
      sortOrder: template.sortOrder,
      isActive: template.isActive,
    } : { ...emptyTemplate, productId: String(productId) });
    setPreviewMode(false);
    setTemplateDialog(true);
  }

  async function saveProduct() {
    try {
      if (editingProductId) await updateProduct.mutateAsync({ id: editingProductId, product: productForm });
      else await createProduct.mutateAsync(productForm);
      await library.refetch();
      setProductDialog(false);
      toast.success(editingProductId ? "Product updated." : "Product created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product could not be saved.");
    }
  }

  async function saveMessageTemplate() {
    const productId = Number(templateForm.productId);
    if (!productId) return toast.error("Select a product.");
    const payload = {
      ...templateForm,
      productId,
      bodyHtml: templateForm.contentMode === "html" ? templateForm.bodyHtml : null,
      sourceFileName: templateForm.contentMode === "html" ? templateForm.sourceFileName || null : null,
    };
    try {
      if (editingTemplateId) await updateTemplate.mutateAsync({ id: editingTemplateId, template: payload });
      else await createTemplate.mutateAsync(payload);
      await library.refetch();
      setTemplateDialog(false);
      toast.success(editingTemplateId ? "Email template updated." : "Email template created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Email template could not be saved.");
    }
  }

  async function readHtmlFile(file?: File) {
    if (!file) return;
    const validExtension = /\.html?$/i.test(file.name);
    if (!validExtension) return toast.error("Choose an .html or .htm file.");
    if (file.size > MAX_HTML_FILE_BYTES) return toast.error("HTML files must be 250 KB or smaller.");
    try {
      const bodyHtml = (await file.text()).replace(/^\uFEFF/, "");
      if (!bodyHtml.trim()) return toast.error("The HTML file is empty.");
      setTemplateForm(current => ({ ...current, contentMode: "html", bodyHtml, sourceFileName: file.name }));
      setPreviewMode(true);
      toast.success(`${file.name} attached. Review the preview before saving.`);
    } catch {
      toast.error("The HTML file could not be read.");
    } finally {
      if (htmlFileInput.current) htmlFileInput.current.value = "";
    }
  }

  function changeTemplateMode(contentMode: TemplateForm["contentMode"]) {
    setTemplateForm(current => ({ ...current, contentMode }));
    setPreviewMode(false);
  }

  function updatePlainMessage(value: string) {
    if (looksLikeEmailHtml(value)) {
      setTemplateForm(current => ({ ...current, contentMode: "html", bodyHtml: value, sourceFileName: "Pasted HTML" }));
      setPreviewMode(false);
      toast.success("HTML detected. Switched to the HTML editor.");
      return;
    }
    setTemplateForm(current => ({ ...current, bodyText: value }));
  }

  function openTestEmail(template: TestEmailTemplate) {
    const preferredUserId = preferredTestSenderUserId(smtpAccounts.data);
    setTestTemplate(template);
    setTestSenderUserId(preferredUserId ? String(preferredUserId) : "");
    setTestRecipientEmail("");
    setTestDialog(true);
  }

  async function sendTemplateTestEmail() {
    if (!testTemplate) return;
    if (!testSenderUserId) return toast.error("Select an SMTP sender account.");
    if (!testRecipientEmail.trim()) return toast.error("Enter the recipient email address.");
    try {
      const result = await sendTestEmail.mutateAsync({
        userId: Number(testSenderUserId),
        recipientEmail: testRecipientEmail.trim(),
        messageTemplateId: testTemplate.id,
      });
      await smtpAccounts.refetch();
      setTestDialog(false);
      toast.success(`Test email sent to ${result.recipientEmail} using ${result.templateName}.`);
    } catch (error) {
      await smtpAccounts.refetch();
      toast.error(error instanceof Error ? error.message : "Test email could not be sent.");
    }
  }

  async function toggleProduct(product: (typeof products)[number]) {
    try {
      await updateProduct.mutateAsync({ id: product.id, product: { name: product.name, description: product.description, sortOrder: product.sortOrder, isActive: !product.isActive } });
      await library.refetch();
      toast.success(product.isActive ? "Product archived. Staff can no longer select its templates." : "Product activated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Product could not be updated."); }
  }

  async function toggleTemplate(template: (typeof products)[number]["templates"][number]) {
    try {
      await updateTemplate.mutateAsync({ id: template.id, template: {
        productId: template.productId,
        name: template.name,
        description: template.description,
        subject: template.subject,
        contentMode: template.contentMode,
        bodyText: template.bodyText,
        bodyHtml: template.bodyHtml,
        sourceFileName: template.sourceFileName,
        sortOrder: template.sortOrder,
        isActive: !template.isActive,
      } });
      await library.refetch();
      toast.success(template.isActive ? "Template archived." : "Template activated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Template could not be updated."); }
  }

  const templateBodyValid = templateForm.contentMode === "html" ? Boolean(templateForm.bodyHtml.trim()) : Boolean(templateForm.bodyText.trim());

  return <div className="mx-auto max-w-[1280px]">
    <PageHeader eyebrow="Super Admin library" title="Email templates" description="Organize reusable staff email messages by product and control which choices are available in Compose." actions={<Button onClick={() => openProduct()} className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add product</Button>} />
    <Alert className="mb-6 border-cyan-200 bg-cyan-50 text-cyan-950"><Library className="h-4 w-4" /><AlertTitle>Plain text and uploaded HTML templates</AlertTitle><AlertDescription>Only Super Admin manages this library. HTML is sanitized when saved. Use Send test on any active template to choose an SMTP sender and deliver a real preview to any recipient address.</AlertDescription></Alert>

    {library.isLoading ? <PageLoading /> : !products.length ? <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><EmptyState title="No email products yet" description="Create the first product, then add one or more plain-text or HTML email templates." /></CardContent></Card> : <div className="space-y-5">{products.map(product => <Card key={product.id} className={`rounded-2xl border-0 bg-white shadow-sm ${!product.isActive ? "opacity-70" : ""}`}>
      <CardHeader className="border-b border-slate-100"><div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Package className="h-5 w-5" /></div><div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2"><CardTitle className="break-words [overflow-wrap:anywhere]">{product.name}</CardTitle><Badge variant="outline" className={product.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{product.isActive ? "Active" : "Archived"}</Badge><Badge variant="outline">{product.templates.length} template{product.templates.length === 1 ? "" : "s"}</Badge></div><p className="mt-1 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{product.description || "No product description."}</p></div></div><div className="grid w-full gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap"><Button variant="outline" size="sm" onClick={() => openProduct(product)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit product</Button><Button variant="outline" size="sm" onClick={() => toggleProduct(product)} disabled={updateProduct.isPending}>{product.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{product.isActive ? "Archive" : "Activate"}</Button><Button size="sm" onClick={() => openTemplate(product.id)} className="min-[360px]:col-span-2 bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-3.5 w-3.5" />Add template</Button></div></div></CardHeader>
      <CardContent className="p-0">{!product.templates.length ? <p className="p-6 text-sm text-slate-500">No templates in this product yet.</p> : <div className="divide-y divide-slate-100">{product.templates.map(template => <div key={template.id} className={`flex min-w-0 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center ${!template.isActive ? "bg-slate-50/70" : ""}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${template.contentMode === "html" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>{template.contentMode === "html" ? <FileCode2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">{template.name}</p><Badge variant="outline" className={template.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{template.isActive ? "Available to staff" : "Archived"}</Badge><Badge variant="outline" className={template.contentMode === "html" ? "border-violet-200 bg-violet-50 text-violet-700" : ""}>{template.contentMode === "html" ? "HTML" : "Plain text"}</Badge></div><p className="mt-1 break-words text-sm font-medium text-slate-700 [overflow-wrap:anywhere]">{template.subject}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{template.description || template.bodyText}</p>{template.sourceFileName && <p className="mt-1 break-all text-xs text-slate-400">Source: {template.sourceFileName}</p>}</div><div className="grid w-full shrink-0 gap-2 min-[360px]:grid-cols-3 lg:flex lg:w-auto lg:flex-wrap"><Button variant="outline" size="sm" onClick={() => openTestEmail({ id: template.id, name: template.name, contentMode: template.contentMode })} disabled={!template.isActive}><Send className="mr-2 h-3.5 w-3.5" />Send test</Button><Button variant="outline" size="sm" onClick={() => openTemplate(product.id, template)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => toggleTemplate(template)} disabled={updateTemplate.isPending}>{template.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{template.isActive ? "Archive" : "Activate"}</Button></div></div>)}</div>}</CardContent>
    </Card>)}</div>}

    <Dialog open={productDialog} onOpenChange={setProductDialog}><DialogContent><DialogHeader><DialogTitle>{editingProductId ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>Products group related email templates in the staff composer.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Product name *</Label><Input value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: MB Aura" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} rows={3} maxLength={2_000} placeholder="Explain when staff should use this product." /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={productForm.sortOrder} onChange={event => setProductForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></div><div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label>Active</Label><p className="text-xs text-slate-500">Visible in staff Compose</p></div><Switch checked={productForm.isActive} onCheckedChange={isActive => setProductForm(current => ({ ...current, isActive }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setProductDialog(false)}>Cancel</Button><Button onClick={saveProduct} disabled={savingProduct || !productForm.name.trim()} className="bg-teal-700 hover:bg-teal-800">{savingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save product</Button></DialogFooter></DialogContent></Dialog>

    <TemplateTestEmailDialog
      open={testDialog}
      onOpenChange={setTestDialog}
      template={testTemplate}
      accounts={smtpAccounts.data}
      accountsLoading={smtpAccounts.isLoading}
      senderUserId={testSenderUserId}
      onSenderChange={setTestSenderUserId}
      recipientEmail={testRecipientEmail}
      onRecipientChange={setTestRecipientEmail}
      onSend={sendTemplateTestEmail}
      sending={sendTestEmail.isPending}
    />

    <EmailTemplateEditorDialog
      open={templateDialog}
      onOpenChange={setTemplateDialog}
      editing={Boolean(editingTemplateId)}
      products={products}
      form={templateForm}
      setForm={setTemplateForm}
      previewMode={previewMode}
      setPreviewMode={setPreviewMode}
      htmlFileInput={htmlFileInput}
      onReadHtmlFile={readHtmlFile}
      onChangeMode={changeTemplateMode}
      onUpdatePlainMessage={updatePlainMessage}
      onSave={saveMessageTemplate}
      saving={savingTemplate}
      bodyValid={templateBodyValid}
    />
  </div>;
}
