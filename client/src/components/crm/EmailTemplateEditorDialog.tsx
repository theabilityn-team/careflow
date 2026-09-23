import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Eye, FileCode2, Loader2, Mail, Upload } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";

export type EmailTemplateFormState = {
  productId: string;
  name: string;
  description: string;
  subject: string;
  contentMode: "plain" | "html";
  bodyText: string;
  bodyHtml: string;
  sourceFileName: string;
  sortOrder: number;
  isActive: boolean;
};

type ProductOption = {
  id: number;
  name: string;
  isActive: boolean;
};

type EmailTemplateEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  products: ProductOption[];
  form: EmailTemplateFormState;
  setForm: Dispatch<SetStateAction<EmailTemplateFormState>>;
  previewMode: boolean;
  setPreviewMode: (preview: boolean) => void;
  htmlFileInput: RefObject<HTMLInputElement | null>;
  onReadHtmlFile: (file?: File) => unknown | Promise<unknown>;
  onChangeMode: (mode: EmailTemplateFormState["contentMode"]) => void;
  onUpdatePlainMessage: (value: string) => void;
  onSave: () => unknown | Promise<unknown>;
  saving: boolean;
  bodyValid: boolean;
};

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div>
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
    <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
    <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
  </div>;
}

export function EmailTemplateEditorDialog({
  open,
  onOpenChange,
  editing,
  products,
  form,
  setForm,
  previewMode,
  setPreviewMode,
  htmlFileInput,
  onReadHtmlFile,
  onChangeMode,
  onUpdatePlainMessage,
  onSave,
  saving,
  bodyValid,
}: EmailTemplateEditorDialogProps) {
  const canSave = Boolean(form.productId && form.name.trim() && form.subject.trim() && bodyValid);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bottom-0 left-0 top-auto flex h-[96dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-[26px] border-x-0 border-b-0 p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-[min(94dvh,1000px)] sm:w-[calc(100vw-2rem)] sm:max-w-none sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border xl:w-[min(94vw,1480px)]">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-5 sm:px-7 sm:py-5">
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="text-xl leading-tight sm:text-2xl">{editing ? "Edit email template" : "Add email template"}</DialogTitle>
          <DialogDescription className="max-w-3xl text-sm leading-6 sm:text-base">
            Set the template details, then write plain text or build and preview a complete HTML email.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-50/70">
        <div className="mx-auto w-full max-w-[1360px] p-4 sm:p-6 lg:p-8">
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.5fr)] xl:items-start xl:gap-6">
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <SectionHeading eyebrow="Template details" title="Name and availability" description="These details help staff identify the right message before sending." />

              <div className="mt-5 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email-template-product">Product *</Label>
                  <Select value={form.productId} onValueChange={productId => setForm(current => ({ ...current, productId }))}>
                    <SelectTrigger id="email-template-product" className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}{product.isActive ? "" : " · archived"}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-template-name">Template name *</Label>
                  <Input id="email-template-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} maxLength={160} placeholder="Example: Initial introduction" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-template-description">Internal description</Label>
                  <Textarea id="email-template-description" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} rows={4} maxLength={2_000} placeholder="When should staff use this template?" />
                  <p className="text-xs leading-5 text-slate-400">Only CareFlow users see this description.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-template-subject">Email subject *</Label>
                  <Input id="email-template-subject" value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} maxLength={240} placeholder="Information about {{leadFirstName}}'s request" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <Label htmlFor="email-template-sort-order">Sort order</Label>
                    <Input id="email-template-sort-order" type="number" value={form.sortOrder} onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} className="bg-white" />
                  </div>
                  <div className="flex min-h-[82px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="min-w-0"><Label htmlFor="email-template-active">Active</Label><p className="mt-1 text-xs leading-5 text-slate-500">Available in staff Compose</p></div>
                    <Switch id="email-template-active" checked={form.isActive} onCheckedChange={isActive => setForm(current => ({ ...current, isActive }))} />
                  </div>
                </div>
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <SectionHeading eyebrow="Email content" title="Choose how to build the message" description="Plain text is quickest. HTML supports complete branded layouts and a visual preview." />

              <div className="mt-5 space-y-5">
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <button type="button" aria-pressed={form.contentMode === "plain"} onClick={() => onChangeMode("plain")} className={`min-w-0 rounded-2xl border p-4 text-left transition-colors ${form.contentMode === "plain" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <div className="flex min-w-0 items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${form.contentMode === "plain" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}><Mail className="h-4 w-4" /></span><span className="min-w-0"><span className="block font-semibold text-slate-950">Plain text</span><span className="mt-1 block text-xs leading-5 text-slate-500">Write a simple message. Pasting HTML switches modes automatically.</span></span></div>
                  </button>
                  <button type="button" aria-pressed={form.contentMode === "html"} onClick={() => onChangeMode("html")} className={`min-w-0 rounded-2xl border p-4 text-left transition-colors ${form.contentMode === "html" ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                    <div className="flex min-w-0 items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${form.contentMode === "html" ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-600"}`}><FileCode2 className="h-4 w-4" /></span><span className="min-w-0"><span className="block font-semibold text-slate-950">HTML email</span><span className="mt-1 block text-xs leading-5 text-slate-500">Paste source, upload a design, and preview before saving.</span></span></div>
                  </button>
                </div>

                <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="font-medium text-violet-950">Upload a complete HTML file</p><p className="mt-1 text-xs leading-5 text-violet-700">Use .html or .htm up to 250 KB. CareFlow switches to HTML automatically.</p></div>
                  <Button type="button" variant="outline" onClick={() => htmlFileInput.current?.click()} className="w-full shrink-0 border-violet-300 bg-white text-violet-800 hover:bg-violet-100 sm:w-auto"><Upload className="mr-2 h-4 w-4" />Choose HTML file</Button>
                  <input ref={htmlFileInput} type="file" accept=".html,.htm,text/html" className="sr-only" onChange={event => void onReadHtmlFile(event.target.files?.[0])} />
                </div>

                {form.contentMode === "plain" ? <div className="min-w-0 space-y-2">
                  <Label htmlFor="email-template-message">Email message *</Label>
                  <Textarea id="email-template-message" value={form.bodyText} onChange={event => onUpdatePlainMessage(event.target.value)} maxLength={50_000} placeholder="Write plain text or paste complete HTML here…" className="min-h-[320px] resize-y text-sm leading-6 lg:min-h-[440px]" />
                  <p className="text-xs leading-5 text-slate-400">Pasting HTML markup opens it in the HTML source editor automatically.</p>
                </div> : <div className="min-w-0 space-y-3">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0"><Label>HTML source *</Label><p className="mt-1 break-words text-xs leading-5 text-slate-400">{form.sourceFileName ? `Source: ${form.sourceFileName}` : "Paste complete HTML below or upload a file."}</p></div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                      <Button type="button" variant={!previewMode ? "default" : "outline"} size="sm" onClick={() => setPreviewMode(false)} className="w-full"><Code2 className="mr-2 h-3.5 w-3.5" />Edit HTML</Button>
                      <Button type="button" variant={previewMode ? "default" : "outline"} size="sm" onClick={() => setPreviewMode(true)} disabled={!form.bodyHtml.trim()} className="w-full"><Eye className="mr-2 h-3.5 w-3.5" />Preview</Button>
                    </div>
                  </div>
                  {previewMode ? <iframe title="HTML email template preview" sandbox="" srcDoc={form.bodyHtml} className="h-[520px] w-full max-w-full rounded-xl border border-slate-200 bg-white" /> : <Textarea aria-label="HTML source" className="min-h-[420px] w-full max-w-full resize-y overflow-x-auto whitespace-pre font-mono text-[12px] leading-5 lg:min-h-[520px]" value={form.bodyHtml} onChange={event => setForm(current => ({ ...current, bodyHtml: event.target.value, sourceFileName: current.sourceFileName || "Pasted HTML" }))} maxLength={250_000} placeholder="<!doctype html>\n<html>\n  <body>…</body>\n</html>" />}
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950"><Upload className="h-4 w-4" /><AlertTitle>HTML is sanitized when saved</AlertTitle><AlertDescription>Safe email layouts, links, HTTPS images, tables, and inline styles are kept. Scripts, forms, event handlers, embedded objects, and unsupported markup are removed.</AlertDescription></Alert>
                </div>}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-500">
                  <p className="font-medium text-slate-700">Available personalization tokens</p>
                  <p className="mt-1 break-words"><code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code></p>
                  <p className="mt-1">The global Super Admin-managed header and footer are added during sending.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:py-4">
        <DialogFooter className="mx-auto grid w-full max-w-[1360px] grid-cols-2 gap-3 sm:flex sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={onSave} disabled={saving || !canSave} className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save template</Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>;
}
