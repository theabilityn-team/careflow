import { PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { formatEasternDate } from "@shared/time";
import { AlertTriangle, CheckCircle2, Database, Loader2, MailCheck, Send, ServerCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const empty = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecurity: "starttls" as "tls" | "starttls" | "none",
  smtpUsername: "",
  smtpPassword: "",
  fromEmail: "",
  fromName: "CareFlow",
  replyToEmail: "",
  isEnabled: false,
};

export default function EmailSettings() {
  const utils = trpc.useUtils();
  const access = trpc.dashboard.access.useQuery();
  const isSuperAdmin = access.data?.role === "super_admin";
  const canUseSmtp = access.data?.role === "technical_staff" || isSuperAdmin;
  const accounts = trpc.emailSettings.managedAccounts.useQuery(undefined, { enabled: isSuperAdmin });
  const [selectedUserId, setSelectedUserId] = useState<number>();
  const settingsInput = useMemo(() => isSuperAdmin && selectedUserId ? { userId: selectedUserId } : {}, [isSuperAdmin, selectedUserId]);
  const settings = trpc.emailSettings.get.useQuery(settingsInput, {
    enabled: Boolean(canUseSmtp && (!isSuperAdmin || selectedUserId)),
  });
  const testEmailTemplates = trpc.emailSettings.testEmailTemplates.useQuery(settingsInput, {
    enabled: Boolean(canUseSmtp && (!isSuperAdmin || selectedUserId)),
  });
  const [form, setForm] = useState(empty);
  const [testDialog, setTestDialog] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testProductId, setTestProductId] = useState("");
  const [testTemplateId, setTestTemplateId] = useState("");
  const save = trpc.emailSettings.save.useMutation();
  const test = trpc.emailSettings.testConnection.useMutation();
  const sendTest = trpc.emailSettings.sendTestEmail.useMutation();

  useEffect(() => {
    if (isSuperAdmin && !selectedUserId && accounts.data?.[0]) setSelectedUserId(accounts.data[0].userId);
  }, [accounts.data, isSuperAdmin, selectedUserId]);

  useEffect(() => {
    if (settings.data?.mode !== "manage") return;
    setForm({
      smtpHost: settings.data.smtpHost,
      smtpPort: settings.data.smtpPort,
      smtpSecurity: settings.data.smtpSecurity,
      smtpUsername: settings.data.smtpUsername,
      smtpPassword: "",
      fromEmail: settings.data.fromEmail,
      fromName: settings.data.fromName,
      replyToEmail: settings.data.replyToEmail,
      isEnabled: settings.data.isEnabled,
    });
  }, [settings.data]);

  const refresh = async () => {
    await Promise.all([
      settings.refetch(),
      isSuperAdmin ? accounts.refetch() : Promise.resolve(),
      utils.dashboard.reminderAutomationStatus.invalidate(),
      utils.staff.list.invalidate(),
    ]);
  };

  async function saveSettings() {
    try {
      await save.mutateAsync({
        ...form,
        userId: selectedUserId,
        smtpPassword: form.smtpPassword || undefined,
        replyToEmail: form.replyToEmail || undefined,
      });
      setForm(current => ({ ...current, smtpPassword: "" }));
      await refresh();
      toast.success("SMTP settings saved. Test the connection before relying on automatic email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save SMTP settings.");
    }
  }

  async function testConnection() {
    try {
      await test.mutateAsync(selectedUserId ? { userId: selectedUserId } : {});
      await refresh();
      toast.success("SMTP connection verified.");
    } catch (error) {
      await settings.refetch();
      toast.error(error instanceof Error ? error.message : "SMTP connection failed.");
    }
  }

  async function sendTestEmail() {
    if (!testRecipient.trim()) return toast.error("Enter a recipient email address.");
    if (!testTemplateId) return toast.error("Select an email template.");
    try {
      const result = await sendTest.mutateAsync({
        userId: selectedUserId,
        recipientEmail: testRecipient.trim(),
        messageTemplateId: Number(testTemplateId),
      });
      await refresh();
      setTestDialog(false);
      toast.success(`Test email sent to ${result.recipientEmail} using ${result.templateName}.`);
    } catch (error) {
      await settings.refetch();
      toast.error(error instanceof Error ? error.message : "Test email could not be sent.");
    }
  }

  function openTestEmailDialog() {
    const current = settings.data;
    setTestRecipient(current?.accountEmail || current?.fromEmail || "");
    setTestProductId("");
    setTestTemplateId("");
    setTestDialog(true);
  }

  if (access.isLoading || (isSuperAdmin && accounts.isLoading)) return <PageLoading />;
  if (!canUseSmtp) return <div className="mx-auto max-w-3xl"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><h1 className="text-xl font-semibold">Email settings unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-500">An active CareFlow account is required to view SMTP status.</p></CardContent></Card></div>;
  if (settings.isLoading || (isSuperAdmin && !selectedUserId)) return <PageLoading />;
  if (settings.error || accounts.error) return <Alert variant="destructive" className="min-w-0"><AlertTriangle className="h-4 w-4" /><AlertTitle>Unable to load email settings</AlertTitle><AlertDescription className="break-words [overflow-wrap:anywhere]">{settings.error?.message || accounts.error?.message}</AlertDescription></Alert>;

  const selectedTestProduct = testEmailTemplates.data?.find(product => product.id.toString() === testProductId);
  const testEmailDialog = <Dialog open={testDialog} onOpenChange={setTestDialog}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Send test email</DialogTitle><DialogDescription>Choose exactly where to send the test and which active Super Admin template to use. Lead tokens render as “Test Recipient.”</DialogDescription></DialogHeader><div className="min-w-0 space-y-4"><div className="min-w-0 space-y-2"><Label>Recipient email *</Label><Input type="email" value={testRecipient} onChange={event => setTestRecipient(event.target.value)} placeholder="recipient@example.com" /></div><div className="min-w-0 space-y-2"><Label>Product *</Label><Select value={testProductId} onValueChange={value => { setTestProductId(value); setTestTemplateId(""); }}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder={testEmailTemplates.isLoading ? "Loading products…" : "Select a product"} /></SelectTrigger><SelectContent>{testEmailTemplates.data?.map(product => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent></Select></div><div className="min-w-0 space-y-2"><Label>Email template *</Label><Select value={testTemplateId} onValueChange={setTestTemplateId} disabled={!testProductId}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder={!testProductId ? "Select a product first" : selectedTestProduct?.templates.length ? "Select a template" : "No active templates"} /></SelectTrigger><SelectContent>{selectedTestProduct?.templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name} · {template.contentMode === "html" ? "HTML" : "Plain text"}</SelectItem>)}</SelectContent></Select></div>{!testEmailTemplates.isLoading && !testEmailTemplates.data?.length && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>No active email templates</AlertTitle><AlertDescription>Super Admin must create and activate a product template before a test email can be sent.</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={() => setTestDialog(false)}>Cancel</Button><Button onClick={sendTestEmail} disabled={sendTest.isPending || !testRecipient.trim() || !testTemplateId} className="bg-teal-700 hover:bg-teal-800">{sendTest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send test email</Button></DialogFooter></DialogContent></Dialog>;

  if (settings.data?.mode === "readonly") {
    const status = settings.data;
    return <div className="mx-auto max-w-[850px]">
      <PageHeader eyebrow="Assigned sender" title="Email status" description="Review the email account assigned to you and test whether CareFlow can send from it." />
      <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
        <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Your assigned email</CardTitle><p className="mt-1 text-sm text-slate-500">Only Super Admin can change SMTP credentials and sender settings.</p></div><Badge variant="outline" className={status.isEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}>{status.isEnabled ? "Active" : "Inactive"}</Badge></div></CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-[.14em] text-slate-400">Sender email</p><p className="mt-2 break-all font-medium text-slate-900">{status.fromEmail || "Not assigned"}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium uppercase tracking-[.14em] text-slate-400">Connection</p><p className="mt-2 font-medium text-slate-900">{status.verifiedAt ? "Verified" : "Not verified"}</p><p className="mt-1 text-xs text-slate-400">{status.lastTestedAt ? `Last tested ${formatEasternDate(status.lastTestedAt, true)}` : "Not tested yet"}</p></div></div>
          {status.lastTestError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Last SMTP test failed</AlertTitle><AlertDescription>{status.lastTestError}</AlertDescription></Alert>}
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><Button variant="outline" disabled={test.isPending} onClick={testConnection}>{test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}Test connection</Button><Button disabled={sendTest.isPending} onClick={openTestEmailDialog} className="bg-teal-700 hover:bg-teal-800"><Send className="mr-2 h-4 w-4" />Send test email</Button></div>
        </CardContent>
      </Card>
      {testEmailDialog}
    </div>;
  }

  const managed = settings.data?.mode === "manage" ? settings.data : null;
  const verified = Boolean(managed?.verifiedAt);
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));

  return <div className="mx-auto max-w-[1050px]">
    <PageHeader eyebrow="Super Admin" title="SMTP account management" description="Configure the Super Admin sender or select a technical staff member and manage that person's mailbox." />

    <Card className="mb-6 min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardContent className="min-w-0 p-5"><Label>Account to configure</Label><Select value={selectedUserId?.toString()} onValueChange={value => setSelectedUserId(Number(value))}><SelectTrigger className="mt-2 w-full min-w-0"><SelectValue placeholder="Select an account" /></SelectTrigger><SelectContent>{accounts.data?.map(account => <SelectItem key={account.userId} value={account.userId.toString()}>{account.name} · {account.accountEmail || "No account email"}{!account.isActive ? " · Inactive" : ""}</SelectItem>)}</SelectContent></Select></CardContent></Card>

    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-5"><ServerCog className="h-5 w-5 text-teal-300" /><p className="mt-4 text-sm font-semibold">{managed?.isSuperAdmin ? "Super Admin mailbox" : "Staff mailbox"}</p><p className="mt-2 text-xs leading-5 text-slate-400">{managed?.isSuperAdmin ? "Used for reminders owned by Super Admin." : `Managed centrally for ${managed?.ownerName || "this staff member"}.`}</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><Database className="h-5 w-5 text-teal-700" /><p className="mt-4 text-sm font-semibold">Editable database row</p><p className="mt-2 text-xs leading-5 text-slate-500">Values are stored in <code>staff_smtp_settings</code>. The saved password is never returned by the API.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5">{verified ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}<p className="mt-4 text-sm font-semibold">{verified ? "Connection verified" : "Connection not verified"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{managed?.lastTestedAt ? `Last tested ${formatEasternDate(managed.lastTestedAt, true)}` : "Save the mailbox, then test the connection."}</p></CardContent></Card>
    </div>

    {managed?.lastTestError && <Alert variant="destructive" className="mb-6"><AlertTriangle className="h-4 w-4" /><AlertTitle>Last SMTP test failed</AlertTitle><AlertDescription>{managed.lastTestError}</AlertDescription></Alert>}

    <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>SMTP mailbox</CardTitle><p className="mt-1 text-sm text-slate-500">Use the settings supplied by the selected account's email provider.</p></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"><div><p className="text-sm font-medium">Automatic sending</p><p className="text-xs text-slate-400">Disabled settings are never used</p></div><Switch checked={form.isEnabled} onCheckedChange={value => update("isEnabled", value)} /></div></div></CardHeader>
      <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label>SMTP host</Label><Input value={form.smtpHost} onChange={event => update("smtpHost", event.target.value)} placeholder="smtp.example.com" /></div>
        <div className="space-y-2"><Label>Port</Label><Input type="number" min={1} max={65535} value={form.smtpPort} onChange={event => update("smtpPort", Number(event.target.value))} /></div>
        <div className="space-y-2"><Label>Connection security</Label><Select value={form.smtpSecurity} onValueChange={value => update("smtpSecurity", value as typeof form.smtpSecurity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tls">TLS / SSL (usually port 465)</SelectItem><SelectItem value="starttls">STARTTLS (usually port 587)</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>SMTP username</Label><Input value={form.smtpUsername} onChange={event => update("smtpUsername", event.target.value)} autoComplete="username" placeholder="user@example.com" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>SMTP password</Label><Input type="password" value={form.smtpPassword} onChange={event => update("smtpPassword", event.target.value)} autoComplete="new-password" placeholder={managed?.hasPassword ? "Saved — leave blank to keep it" : "Enter SMTP password or app password"} /><p className="text-xs leading-5 text-slate-400">CareFlow reports only whether a password exists. It never sends the saved value back to the browser or staff view.</p></div>
        <div className="space-y-2"><Label>Sender email</Label><Input type="email" value={form.fromEmail} onChange={event => update("fromEmail", event.target.value)} placeholder="user@example.com" /></div>
        <div className="space-y-2"><Label>Sender name</Label><Input value={form.fromName} onChange={event => update("fromName", event.target.value)} placeholder="Sender name" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Reply-to email (optional)</Label><Input type="email" value={form.replyToEmail} onChange={event => update("replyToEmail", event.target.value)} placeholder="Defaults to sender email" /></div>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:col-span-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={test.isPending || save.isPending} onClick={testConnection}>{test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}Test connection</Button><Button variant="outline" disabled={sendTest.isPending || save.isPending} onClick={openTestEmailDialog}><Send className="mr-2 h-4 w-4" />Send test email</Button><Button disabled={save.isPending} onClick={saveSettings} className="bg-teal-700 hover:bg-teal-800">{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save settings</Button></div>
      </CardContent>
    </Card>
    {verified && <div className="mt-5 flex min-w-0 items-start gap-2 break-words text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Verified SMTP settings are ready for scheduled follow-up emails.</span></div>}
    {testEmailDialog}
  </div>;
}
