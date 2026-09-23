import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatEasternDate } from "@shared/time";
import { AlertTriangle, Check, Code2, Copy, Eye, Loader2, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function GlobalEmailFrameEditor() {
  const template = trpc.mail.template.useQuery();
  const preview = trpc.mail.previewTemplate.useMutation();
  const saveTemplate = trpc.mail.saveTemplate.useMutation();
  const [headerHtml, setHeaderHtml] = useState("");
  const [footerHtml, setFooterHtml] = useState("");
  const [savedHeaderHtml, setSavedHeaderHtml] = useState("");
  const [savedFooterHtml, setSavedFooterHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [mobileMode, setMobileMode] = useState<"code" | "preview">("code");
  const previewRequestId = useRef(0);

  useEffect(() => {
    if (!template.data) return;
    setHeaderHtml(template.data.headerHtml);
    setFooterHtml(template.data.footerHtml);
    setSavedHeaderHtml(template.data.headerHtml);
    setSavedFooterHtml(template.data.footerHtml);
  }, [template.data]);

  useEffect(() => {
    if (!template.data) return;
    const requestId = ++previewRequestId.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await preview.mutateAsync({ headerHtml, footerHtml });
        if (requestId !== previewRequestId.current) return;
        setPreviewHtml(result.html);
        setPreviewError("");
      } catch (error) {
        if (requestId !== previewRequestId.current) return;
        setPreviewError(error instanceof Error ? error.message : "Preview could not be generated.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
    // The mutation is intentionally omitted: the preview refresh is driven only by source changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerHtml, footerHtml, template.data]);

  const hasChanges = headerHtml !== savedHeaderHtml || footerHtml !== savedFooterHtml;
  const previewStatus = useMemo(() => {
    if (preview.isPending) return "Refreshing preview…";
    if (previewError) return "Preview unavailable";
    return "Sanitized preview is current";
  }, [preview.isPending, previewError]);

  async function handleCopy(label: "Header" | "Footer", value: string) {
    try {
      await copyText(value);
      toast.success(`${label} HTML copied.`);
    } catch {
      toast.error(`${label} HTML could not be copied.`);
    }
  }

  async function handleSave() {
    try {
      const result = await saveTemplate.mutateAsync({ headerHtml, footerHtml });
      setHeaderHtml(result.headerHtml);
      setFooterHtml(result.footerHtml);
      setSavedHeaderHtml(result.headerHtml);
      setSavedFooterHtml(result.footerHtml);
      await template.refetch();
      toast.success("Global email header and footer saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Header and footer could not be saved.");
    }
  }

  if (template.isLoading) {
    return <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></CardContent></Card>;
  }

  return <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.055)]">
    <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-teal-50/50 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-0 bg-teal-100 text-teal-800 hover:bg-teal-100">Super Admin only</Badge>
            <Badge variant="outline" className={hasChanges ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{hasChanges ? "Unsaved changes" : "Saved"}</Badge>
          </div>
          <CardTitle>Global email header and footer</CardTitle>
          <p className="mt-2 text-sm leading-6 text-slate-600">Edit the HTML code and review the exact sanitized email frame before saving. This frame is added automatically to every outgoing CareFlow email.</p>
          {template.data?.updatedAt && <p className="mt-2 text-xs text-slate-400">Last saved {formatEasternDate(template.data.updatedAt, true)}</p>}
        </div>
        <Button onClick={handleSave} disabled={saveTemplate.isPending || !hasChanges} className="w-full bg-teal-700 hover:bg-teal-800 lg:w-auto">
          {saveTemplate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : hasChanges ? <Save className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
          {saveTemplate.isPending ? "Saving…" : hasChanges ? "Save header & footer" : "Saved"}
        </Button>
      </div>
    </CardHeader>

    <CardContent className="p-0">
      <div className="grid grid-cols-2 border-b border-slate-100 p-2 md:hidden">
        <Button type="button" variant={mobileMode === "code" ? "default" : "ghost"} className={mobileMode === "code" ? "bg-slate-950 hover:bg-slate-900" : ""} onClick={() => setMobileMode("code")}><Code2 className="mr-2 h-4 w-4" />HTML code</Button>
        <Button type="button" variant={mobileMode === "preview" ? "default" : "ghost"} className={mobileMode === "preview" ? "bg-slate-950 hover:bg-slate-900" : ""} onClick={() => setMobileMode("preview")}><Eye className="mr-2 h-4 w-4" />Live preview</Button>
      </div>

      <div className="grid min-w-0 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <section className={`${mobileMode === "code" ? "block" : "hidden"} min-w-0 border-slate-100 p-4 sm:p-6 md:block md:border-r`}>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-teal-700">HTML code</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Edit both global sections</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Code is sanitized when previewed and saved. Scripts, forms, event handlers, and unsupported markup are removed.</p>
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div><Label htmlFor="global-email-header-html" className="text-sm font-semibold text-white">Header HTML</Label><p className="mt-0.5 text-xs text-slate-400">Appears above the email content.</p></div>
                <Button type="button" variant="ghost" size="sm" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => handleCopy("Header", headerHtml)}><Copy className="mr-2 h-3.5 w-3.5" />Copy</Button>
              </div>
              <Textarea id="global-email-header-html" aria-label="Global email header HTML code" className="min-h-52 resize-y rounded-none border-0 bg-slate-950 px-4 py-4 font-mono text-[12px] leading-6 text-slate-100 shadow-none focus-visible:ring-0" value={headerHtml} onChange={event => setHeaderHtml(event.target.value)} maxLength={50_000} spellCheck={false} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div><Label htmlFor="global-email-footer-html" className="text-sm font-semibold text-white">Footer HTML</Label><p className="mt-0.5 text-xs text-slate-400">Appears below the email content.</p></div>
                <Button type="button" variant="ghost" size="sm" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => handleCopy("Footer", footerHtml)}><Copy className="mr-2 h-3.5 w-3.5" />Copy</Button>
              </div>
              <Textarea id="global-email-footer-html" aria-label="Global email footer HTML code" className="min-h-64 resize-y rounded-none border-0 bg-slate-950 px-4 py-4 font-mono text-[12px] leading-6 text-slate-100 shadow-none focus-visible:ring-0" value={footerHtml} onChange={event => setFooterHtml(event.target.value)} maxLength={50_000} spellCheck={false} />
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-400">Tokens: <code>{"{{leadFirstName}}"}</code>, <code>{"{{leadFullName}}"}</code>, <code>{"{{senderName}}"}</code>, <code>{"{{senderEmail}}"}</code>. Technical staff cannot view or edit this code.</p>
        </section>

        <section className={`${mobileMode === "preview" ? "block" : "hidden"} min-w-0 bg-slate-50/70 p-4 sm:p-6 md:block`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-700">Live preview</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Complete email frame</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Header + sample message + footer, using the same sanitizing and composition rules as a sent email.</p>
            </div>
            <Badge variant="outline" className={previewError ? "w-fit border-rose-200 bg-rose-50 text-rose-700" : preview.isPending ? "w-fit border-sky-200 bg-sky-50 text-sky-700" : "w-fit border-emerald-200 bg-emerald-50 text-emerald-700"}>{preview.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : previewError ? <AlertTriangle className="mr-1 h-3 w-3" /> : <RefreshCw className="mr-1 h-3 w-3" />}{previewStatus}</Badge>
          </div>

          {previewError ? <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Preview unavailable</AlertTitle><AlertDescription>{previewError}</AlertDescription></Alert> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,.08)]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <div><p className="text-sm font-semibold text-slate-900">Recipient preview</p><p className="text-xs text-slate-400">Sample data only — nothing is sent</p></div>
              <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /></div>
            </div>
            {previewHtml ? <iframe title="Global email header and footer live preview" sandbox="" srcDoc={previewHtml} className="h-[620px] w-full bg-white md:h-[720px]" /> : <div className="grid h-[420px] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-teal-700" /></div>}
          </div>

          <Alert className="mt-4 border-violet-200 bg-violet-50 text-violet-950"><Eye className="h-4 w-4" /><AlertTitle>Exact saved-email preview</AlertTitle><AlertDescription>The preview is generated on the server after unsupported HTML is removed. It uses sample names and does not send an email.</AlertDescription></Alert>
        </section>
      </div>
    </CardContent>
  </Card>;
}
