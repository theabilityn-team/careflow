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
import { trpc } from "@/lib/trpc";
import { Archive, CheckCircle2, Library, Loader2, Mail, Package, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emptyProduct = { name: "", description: "", sortOrder: 0, isActive: true };
const emptyTemplate = { productId: "", name: "", description: "", subject: "", bodyText: "Hello {{leadFirstName}},\n\n", sortOrder: 0, isActive: true };

type ProductForm = typeof emptyProduct;
type TemplateForm = typeof emptyTemplate;

export default function EmailTemplates() {
  const { data: access, isLoading: accessLoading } = trpc.dashboard.access.useQuery();
  const library = trpc.emailLibrary.adminList.useQuery(undefined, { enabled: access?.role === "super_admin" });
  const createProduct = trpc.emailLibrary.createProduct.useMutation();
  const updateProduct = trpc.emailLibrary.updateProduct.useMutation();
  const createTemplate = trpc.emailLibrary.createTemplate.useMutation();
  const updateTemplate = trpc.emailLibrary.updateTemplate.useMutation();
  const [productDialog, setProductDialog] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number>();
  const [editingTemplateId, setEditingTemplateId] = useState<number>();
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplate);

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
      productId: String(template.productId), name: template.name, description: template.description ?? "", subject: template.subject,
      bodyText: template.bodyText, sortOrder: template.sortOrder, isActive: template.isActive,
    } : { ...emptyTemplate, productId: String(productId) });
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

  async function saveTemplate() {
    const productId = Number(templateForm.productId);
    if (!productId) return toast.error("Select a product.");
    const payload = { ...templateForm, productId };
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

  async function toggleProduct(product: (typeof products)[number]) {
    try {
      await updateProduct.mutateAsync({ id: product.id, product: { name: product.name, description: product.description, sortOrder: product.sortOrder, isActive: !product.isActive } });
      await library.refetch();
      toast.success(product.isActive ? "Product archived. Staff can no longer select its templates." : "Product activated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Product could not be updated."); }
  }

  async function toggleTemplate(template: (typeof products)[number]["templates"][number]) {
    try {
      await updateTemplate.mutateAsync({ id: template.id, template: { productId: template.productId, name: template.name, description: template.description, subject: template.subject, bodyText: template.bodyText, sortOrder: template.sortOrder, isActive: !template.isActive } });
      await library.refetch();
      toast.success(template.isActive ? "Template archived." : "Template activated.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Template could not be updated."); }
  }

  return <div className="mx-auto max-w-[1280px]">
    <PageHeader eyebrow="Super Admin library" title="Email templates" description="Organize reusable staff email messages by product and control which choices are available in Compose." actions={<Button onClick={() => openProduct()} className="bg-teal-700 hover:bg-teal-800"><Plus className="mr-2 h-4 w-4" />Add product</Button>} />
    <Alert className="mb-6 border-cyan-200 bg-cyan-50 text-cyan-950"><Library className="h-4 w-4" /><AlertTitle>Staff can select active templates but cannot manage this library</AlertTitle><AlertDescription>Choosing a template fills the subject and message. Staff can still personalize the draft before sending. Archived products and templates remain in historical records but disappear from Compose.</AlertDescription></Alert>

    {library.isLoading ? <PageLoading /> : !products.length ? <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><EmptyState title="No email products yet" description="Create the first product, then add one or more reusable email templates." /></CardContent></Card> : <div className="space-y-5">{products.map(product => <Card key={product.id} className={`rounded-2xl border-0 bg-white shadow-sm ${!product.isActive ? "opacity-70" : ""}`}>
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Package className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{product.name}</CardTitle><Badge variant="outline" className={product.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{product.isActive ? "Active" : "Archived"}</Badge><Badge variant="outline">{product.templates.length} template{product.templates.length === 1 ? "" : "s"}</Badge></div><p className="mt-1 text-sm leading-6 text-slate-500">{product.description || "No product description."}</p></div></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openProduct(product)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit product</Button><Button variant="outline" size="sm" onClick={() => toggleProduct(product)} disabled={updateProduct.isPending}>{product.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{product.isActive ? "Archive" : "Activate"}</Button><Button size="sm" onClick={() => openTemplate(product.id)} className="bg-slate-950 text-white hover:bg-slate-800"><Plus className="mr-2 h-3.5 w-3.5" />Add template</Button></div></div></CardHeader>
      <CardContent className="p-0">{!product.templates.length ? <p className="p-6 text-sm text-slate-500">No templates in this product yet.</p> : <div className="divide-y divide-slate-100">{product.templates.map(template => <div key={template.id} className={`flex flex-col gap-4 p-5 lg:flex-row lg:items-center ${!template.isActive ? "bg-slate-50/70" : ""}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><Mail className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{template.name}</p><Badge variant="outline" className={template.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}>{template.isActive ? "Available to staff" : "Archived"}</Badge></div><p className="mt-1 truncate text-sm font-medium text-slate-700">{template.subject}</p><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{template.description || template.bodyText}</p></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => openTemplate(product.id, template)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button><Button variant="outline" size="sm" onClick={() => toggleTemplate(template)} disabled={updateTemplate.isPending}>{template.isActive ? <Archive className="mr-2 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}{template.isActive ? "Archive" : "Activate"}</Button></div></div>)}</div>}</CardContent>
    </Card>)}</div>}

    <Dialog open={productDialog} onOpenChange={setProductDialog}><DialogContent><DialogHeader><DialogTitle>{editingProductId ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>Products group related email templates in the staff composer.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Product name *</Label><Input value={productForm.name} onChange={event => setProductForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: MB Aura" /></div><div className="space-y-2"><Label>Description</Label><Textarea value={productForm.description} onChange={event => setProductForm(current => ({ ...current, description: event.target.value }))} rows={3} maxLength={2_000} placeholder="Explain when staff should use this product." /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={productForm.sortOrder} onChange={event => setProductForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></div><div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label>Active</Label><p className="text-xs text-slate-500">Visible in staff Compose</p></div><Switch checked={productForm.isActive} onCheckedChange={isActive => setProductForm(current => ({ ...current, isActive }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setProductDialog(false)}>Cancel</Button><Button onClick={saveProduct} disabled={savingProduct || !productForm.name.trim()} className="bg-teal-700 hover:bg-teal-800">{savingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save product</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={templateDialog} onOpenChange={setTemplateDialog}><DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{editingTemplateId ? "Edit email template" : "Add email template"}</DialogTitle><DialogDescription>Staff can select this draft, personalize it, and review the final subject and message before sending.</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Product *</Label><Select value={templateForm.productId} onValueChange={productId => setTemplateForm(current => ({ ...current, productId }))}><SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger><SelectContent>{products.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}{product.isActive ? "" : " · archived"}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Template name *</Label><Input value={templateForm.name} onChange={event => setTemplateForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: Initial introduction" /></div></div><div className="space-y-2"><Label>Internal description</Label><Textarea value={templateForm.description} onChange={event => setTemplateForm(current => ({ ...current, description: event.target.value }))} rows={2} maxLength={2_000} placeholder="When should staff use this template?" /></div><div className="space-y-2"><Label>Email subject *</Label><Input value={templateForm.subject} onChange={event => setTemplateForm(current => ({ ...current, subject: event.target.value }))} maxLength={240} placeholder="Information about {{leadFirstName}}'s request" /></div><div className="space-y-2"><Label>Email message *</Label><Textarea value={templateForm.bodyText} onChange={event => setTemplateForm(current => ({ ...current, bodyText: event.target.value }))} rows={12} maxLength={20_000} /><p className="text-xs leading-5 text-slate-400">Tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. Account header and footer are added during sending.</p></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Sort order</Label><Input type="number" value={templateForm.sortOrder} onChange={event => setTemplateForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} /></div><div className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><Label>Active</Label><p className="text-xs text-slate-500">Available in staff Compose</p></div><Switch checked={templateForm.isActive} onCheckedChange={isActive => setTemplateForm(current => ({ ...current, isActive }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setTemplateDialog(false)}>Cancel</Button><Button onClick={saveTemplate} disabled={savingTemplate || !templateForm.productId || !templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.bodyText.trim()} className="bg-teal-700 hover:bg-teal-800">{savingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save template</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
