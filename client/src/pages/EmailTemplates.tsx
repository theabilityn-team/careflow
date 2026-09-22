import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
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
import { looksLikeEmailHtml } from "@/lib/emailTemplateEditor";
import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, Code2, Eye, FileCode2, Library, Loader2, Mail, Package, Pencil, Plus, Upload } from "lucide-react";
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
  const htmlFileInput = useRef<HTMLInputElement>(null);
  const [productDialog, setProductDialog] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number>();
  const [editingTemplateId, setEditingTemplateId] = useState<number>();
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplate);
  const [previewMode, setPreviewMode] = useState(false);

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
    <PageHeader eyebrow="Super Admin library" title="Email templates" description="Organize reusable staff email messages by product and control which choices are available in Compose." actions={<Button onClick={() => openProduct()} className="bg-teal-700 hover:bg-teal-800"><Plus className="mr-2 h-4 w-4" />Add product</Button>} />
    <Alert className="mb-6 border-cyan-200 bg-cyan-50 text-cyan-950"><Library className="h-4 w-4" /><AlertTitle>Plain text and uploaded HTML templates</AlertTitle><AlertDescription>Only Super Admin manages this library. HTML files are sanitized when saved: scripts, forms, event handlers, and unsupported markup are removed. Staff can apply active templates and edit the draft before sending.</AlertDescription></Alert>

    {library.isLoading ? <PageLoading /> : !products.length ? <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><EmptyState title="No email products yet" description="Create the first product, then add one or more plain-text or HTML email templates." /></CardContent></Card> : <div className="space-y-5">{products.map(product => <Card key={product.id} className={`rounded-2xl border-0 bg-white shadow-sm ${!product.isActive ? "opacity-70" : ""}`}>
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Package className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{product.name}</CardTitle><Badge variant="outline" className={product.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{product.isActive ? "Active" : "Archived"}</Badge><Badge variant="outline">{product.templates.length} template{product.templates.length === 1 ? "" : "s"}</Badge></div><p className="mt-1 text-sm leading-6 text-slate-500">{product.description || "No product description."}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openProduct(product)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit product</Button><Button variant="outline" size="sm" onClick={() => toggleProduct(product)} disabled={updateProduct.isPending}>{product.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{product.isActive ? "Archive" : "Activate"}</Button><Button size="sm" onClick={() => openTemplate(product.id)} className="bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-3.5 w-3.5" />Add template</Button></div></div></CardHeader>
      <CardContent className="p-0">{!product.templates.length ? <p className="p-6 text-sm text-slate-500">No templates in this product yet.</p> : <div className="divide-y divide-slate-100">{product.templates.map(template => <div key={template.id} className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center ${!template.isActive ? "bg-slate-50/70" : ""}`}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${template.contentMode === "html" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>{template.contentMode === "html" ? <FileCode2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{template.name}</p><Badge variant="outline" className={template.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{template.isActive ? "Available to staff" : "Archived"}</Badge><Badge variant="outline" className={template.contentMode === "html" ? "border-violet-200 bg-violet-50 text-violet-700" : ""}>{template.contentMode === "html" ? "HTML" : "Plain text"}</Badge></div><p className="mt-1 truncate text-sm font-medium text-slate-700">{template.subject}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{template.description || template.bodyText}</p>{template.sourceFileName && <p className="mt-1 text-xs text-slate-400">Source: {template.sourceFileName}</p>}</div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => openTemplate(product.id, template)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => toggleTemplate(template)} disabled={updateTemplate.isPending}>{template.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{template.isActive ? "Archive" : "Activate"}</Button></div></div>)}</div>}</CardContent>
    </Card>)}</div>}

    <Dialog open={productDialog} onOpenChange={setProductDialog}><DialogContent><DialogHeader><DialogTitle>{editingProductId ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>Products group related email templates in the staff composer.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Product name *</Label><Input value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: MB Aura" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} rows={3} maxLength={2_000} placeholder="Explain when staff should use this product." /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={productForm.sortOrder} onChange={event => setProductForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></div><div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label>Active</Label><p className="text-xs text-slate-500">Visible in staff Compose</p></div><Switch checked={productForm.isActive} onCheckedChange={isActive => setProductForm(current => ({ ...current, isActive }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setProductDialog(false)}>Cancel</Button><Button onClick={saveProduct} disabled={savingProduct || !productForm.name.trim()} className="bg-teal-700 hover:bg-teal-800">{savingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save product</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={templateDialog} onOpenChange={setTemplateDialog}><DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{editingTemplateId ? "Edit email template" : "Add email template"}</DialogTitle><DialogDescription>Create a simple message or attach a complete HTML design. Staff reviews and personalizes it before sending.</DialogDescription></DialogHeader><div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Product *</Label><Select value={templateForm.productId} onValueChange={productId => setTemplateForm(current => ({ ...current, productId }))}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}{product.isActive ? "" : " · archived"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Template name *</Label><Input value={templateForm.name} onChange={event => setTemplateForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: Initial introduction" /></div></div><div className="space-y-2"><Label>Internal description</Label><Textarea value={templateForm.description} onChange={event => setTemplateForm(current => ({ ...current, description: event.target.value }))} rows={2} maxLength={2_000} placeholder="When should staff use this template?" /></div><div className="space-y-2"><Label>Email subject *</Label><Input value={templateForm.subject} onChange={event => setTemplateForm(current => ({ ...current, subject: event.target.value }))} maxLength={240} placeholder="Information about {{leadFirstName}}'s request" /></div>

      <div className="space-y-3"><div><Label>Message format</Label><p className="mt-1 text-sm text-slate-500">Choose plain text, paste HTML directly, or upload a complete .html file.</p></div><div className="grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={templateForm.contentMode === "plain"} onClick={() => changeTemplateMode("plain")} className={`rounded-2xl border p-4 text-left transition-colors ${templateForm.contentMode === "plain" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${templateForm.contentMode === "plain" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}><Mail className="h-4 w-4" /></span><span><span className="block font-semibold text-slate-950">Plain text</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Write a simple message. Pasting HTML switches automatically.</span></span></div></button><button type="button" aria-pressed={templateForm.contentMode === "html"} onClick={() => changeTemplateMode("html")} className={`rounded-2xl border p-4 text-left transition-colors ${templateForm.contentMode === "html" ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${templateForm.contentMode === "html" ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-600"}`}><FileCode2 className="h-4 w-4" /></span><span><span className="block font-semibold text-slate-950">HTML email</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">Paste source, upload a design, and preview it before saving.</span></span></div></button></div><div className="flex flex-col gap-3 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-violet-950">Have a complete HTML file?</p><p className="mt-1 text-xs leading-5 text-violet-700">Upload .html or .htm, maximum 250 KB. Uploading switches to HTML automatically.</p></div><Button type="button" variant="outline" onClick={() => htmlFileInput.current?.click()} className="shrink-0 border-violet-300 bg-white text-violet-800 hover:bg-violet-100"><Upload className="mr-2 h-4 w-4" />Upload HTML</Button><input ref={htmlFileInput} type="file" accept=".html,.htm,text/html" className="sr-only" onChange={event => void readHtmlFile(event.target.files?.[0])} /></div></div>

      {templateForm.contentMode === "plain" ? <div className="space-y-2"><Label>Email message *</Label><Textarea value={templateForm.bodyText} onChange={event => updatePlainMessage(event.target.value)} rows={12} maxLength={50_000} placeholder="Write plain text or paste complete HTML here…" /><p className="text-xs text-slate-400">If pasted content contains HTML markup, CareFlow opens it in the HTML source editor automatically.</p></div> : <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><Label>HTML source *</Label><p className="mt-1 text-xs text-slate-400">{templateForm.sourceFileName ? `Source: ${templateForm.sourceFileName}` : "Paste complete HTML below or use Upload HTML above."}</p></div><div className="flex gap-2"><Button type="button" variant={!previewMode ? "default" : "outline"} size="sm" onClick={() => setPreviewMode(false)}><Code2 className="mr-2 h-3.5 w-3.5" />Edit HTML</Button><Button type="button" variant={previewMode ? "default" : "outline"} size="sm" onClick={() => setPreviewMode(true)} disabled={!templateForm.bodyHtml.trim()}><Eye className="mr-2 h-3.5 w-3.5" />Preview</Button></div></div>{previewMode ? <iframe title="HTML email template preview" sandbox="" srcDoc={templateForm.bodyHtml} className="h-[460px] w-full rounded-xl border border-slate-200 bg-white" /> : <Textarea className="font-mono text-xs" value={templateForm.bodyHtml} onChange={event => setTemplateForm(current => ({ ...current, bodyHtml: event.target.value, sourceFileName: current.sourceFileName || "Pasted HTML" }))} rows={20} maxLength={250_000} placeholder="<!doctype html>\n<html>\n  <body>…</body>\n</html>" />}<Alert className="border-amber-200 bg-amber-50 text-amber-950"><Upload className="h-4 w-4" /><AlertTitle>HTML is accepted and sanitized when saved</AlertTitle><AlertDescription>CareFlow keeps safe email layout, links, HTTPS images, tables, and inline styles. Scripts, forms, event handlers, embedded objects, and unsupported markup are removed.</AlertDescription></Alert></div>}

      <p className="text-xs leading-5 text-slate-400">Tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. The global Super Admin-managed header and footer are added during sending.</p><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={templateForm.sortOrder} onChange={event => setTemplateForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></div><div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label>Active</Label><p className="text-xs text-slate-500">Available in staff Compose</p></div><Switch checked={templateForm.isActive} onCheckedChange={isActive => setTemplateForm(current => ({ ...current, isActive }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button><Button onClick={saveMessageTemplate} disabled={savingTemplate || !templateForm.productId || !templateForm.name.trim() || !templateForm.subject.trim() || !templateBodyValid} className="bg-teal-700 hover:bg-teal-800">{savingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save template</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
