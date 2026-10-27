import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Eye, FileCode2, Library, Mail, Package, Send } from "lucide-react";
import { useState } from "react";

type StaffEmailAccess = {
  role?: string;
  isActive?: boolean;
  permissions?: {
    manageEmails?: boolean;
    useEmailTemplates?: boolean;
  };
};

type StaffEmailTemplatesProps = {
  access?: StaffEmailAccess | null;
};

type PreviewTarget = {
  name: string;
  subject: string;
  contentMode: "plain" | "html";
  bodyText: string;
  bodyHtml?: string | null;
};

export default function StaffEmailTemplates({ access }: StaffEmailTemplatesProps) {
  const canUseTemplates = Boolean(
    access?.role === "technical_staff" &&
    access.isActive &&
    access.permissions?.manageEmails &&
    access.permissions?.useEmailTemplates,
  );
  const library = trpc.emailLibrary.library.useQuery(undefined, {
    enabled: canUseTemplates,
    refetchOnMount: "always",
  });
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  if (!canUseTemplates) {
    return (
      <Card className="rounded-2xl border-0 bg-white shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <h1 className="break-words text-xl font-semibold text-slate-950">Email templates unavailable</h1>
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-500">
            An active Technical Staff account with both Emails and Use email templates permissions is required to view this library.
          </p>
        </CardContent>
      </Card>
    );
  }

  const products = library.data ?? [];

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Approved library"
        title="Email templates"
        description="Browse the active messages approved for staff. Open Mails to choose a template while composing an email."
        actions={
          <Button asChild className="w-full bg-teal-700 hover:bg-teal-800 sm:w-auto">
            <a href="/mails"><Send className="mr-2 h-4 w-4" />Open Mails</a>
          </Button>
        }
      />

      <Alert className="mb-6 border-cyan-200 bg-cyan-50 text-cyan-950">
        <Library className="h-4 w-4" />
        <AlertTitle>Read-only approved templates</AlertTitle>
        <AlertDescription>Only active products and templates are shown here. Super Admin manages the library; this page does not edit, copy, archive, delete, test, or send messages.</AlertDescription>
      </Alert>

      {library.isLoading ? <PageLoading /> : library.isError ? (
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-slate-950">Templates could not be loaded</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Please try again later or open Mails to continue with a manual message.</p>
          </CardContent>
        </Card>
      ) : !products.length ? (
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="p-6 sm:p-8"><EmptyState title="No active templates yet" description="A Super Admin must activate a product and template before it appears in this library." /></CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {products.map(product => (
            <Card key={product.id} className="rounded-2xl border-0 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Package className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <CardTitle className="break-words [overflow-wrap:anywhere]">{product.name}</CardTitle>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge>
                        <Badge variant="outline">{product.templates.length} template{product.templates.length === 1 ? "" : "s"}</Badge>
                      </div>
                      <p className="mt-1 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{product.description || "No product description."}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!product.templates.length ? <p className="p-6 text-sm text-slate-500">No active templates in this product yet.</p> : <div className="divide-y divide-slate-100">
                  {product.templates.map(template => (
                    <div key={template.id} className="flex min-w-0 flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
                      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${template.contentMode === "html" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>
                        {template.contentMode === "html" ? <FileCode2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">{template.name}</p>
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Available to staff</Badge>
                          <Badge variant="outline" className={template.contentMode === "html" ? "border-violet-200 bg-violet-50 text-violet-700" : ""}>{template.contentMode === "html" ? "HTML" : "Plain text"}</Badge>
                        </div>
                        <p className="mt-1 break-words text-sm font-medium text-slate-700 [overflow-wrap:anywhere]">{template.subject}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{template.description || template.bodyText}</p>
                      </div>
                      <div className="w-full shrink-0 lg:w-auto">
                        <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setPreview({ name: template.name, subject: template.subject, contentMode: template.contentMode, bodyText: template.bodyText, bodyHtml: template.bodyHtml })}>
                          <Eye className="mr-2 h-3.5 w-3.5" />View preview
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-4xl sm:max-w-4xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-5 pr-12 text-left sm:px-6">
            <DialogTitle className="break-words text-xl [overflow-wrap:anywhere]">{preview?.name}</DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">Subject: {preview?.subject}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overflow-x-hidden bg-slate-50 p-4 sm:p-6">
            {preview?.contentMode === "html" ? <iframe title={`${preview.name} HTML preview`} sandbox="" srcDoc={preview.bodyHtml || "<p>No HTML content available.</p>"} className="h-[min(65dvh,620px)] w-full max-w-full rounded-xl border border-slate-200 bg-white" /> : <pre className="min-h-40 whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{preview?.bodyText}</pre>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
