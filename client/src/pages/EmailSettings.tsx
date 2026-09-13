import { PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Database, Loader2, MailCheck, Send, ServerCog } from "lucide-react";
import { useEffect, useState } from "react";
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
  const settings = trpc.emailSettings.get.useQuery(undefined, { enabled: access.data?.role === "technical_staff" });
  const [form, setForm] = useState(empty);
  const save = trpc.emailSettings.save.useMutation();
  const test = trpc.emailSettings.testConnection.useMutation();
  const sendTest = trpc.emailSettings.sendTestEmail.useMutation();

  useEffect(() => {
    if (!settings.data) return;
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

  if (access.isLoading) return <PageLoading />;
  if (access.data?.role !== "technical_staff") return <div className="mx-auto max-w-3xl"><Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-8"><h1 className="text-xl font-semibold">Technical staff only</h1><p className="mt-2 text-sm leading-6 text-slate-500">Each technical staff member manages the SMTP account used for that staff member's assigned lead reminders.</p></CardContent></Card></div>;
  if (settings.isLoading) return <PageLoading />;
  if (settings.error) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Unable to load email settings</AlertTitle><AlertDescription>{settings.error.message}</AlertDescription></Alert>;

  const verified = Boolean(settings.data?.verifiedAt);
  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));

  async function saveSettings() {
    try {
      await save.mutateAsync({
        ...form,
        smtpPassword: form.smtpPassword || undefined,
        replyToEmail: form.replyToEmail || undefined,
      });
      setForm(current => ({ ...current, smtpPassword: "" }));
      await Promise.all([settings.refetch(), utils.dashboard.reminderAutomationStatus.invalidate(), utils.staff.list.invalidate()]);
      toast.success("SMTP settings saved. Test the connection before relying on automatic email.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save SMTP settings.");
    }
  }

  async function testConnection() {
    try {
      await test.mutateAsync();
      await Promise.all([settings.refetch(), utils.dashboard.reminderAutomationStatus.invalidate(), utils.staff.list.invalidate()]);
      toast.success("SMTP connection verified.");
    } catch (error) {
      await settings.refetch();
      toast.error(error instanceof Error ? error.message : "SMTP connection failed.");
    }
  }

  async function sendTestEmail() {
    try {
      await sendTest.mutateAsync();
      await Promise.all([settings.refetch(), utils.dashboard.reminderAutomationStatus.invalidate(), utils.staff.list.invalidate()]);
      toast.success("Test email sent to your staff email address.");
    } catch (error) {
      await settings.refetch();
      toast.error(error instanceof Error ? error.message : "Test email could not be sent.");
    }
  }

  return <div className="mx-auto max-w-[1050px]">
    <PageHeader eyebrow="Personal sender" title="Email settings" description="Connect the SMTP mailbox that CareFlow should use for your assigned lead reminders." />

    <div className="mb-6 grid gap-4 md:grid-cols-3">
      <Card className="rounded-2xl border-0 bg-slate-950 text-white"><CardContent className="p-5"><ServerCog className="h-5 w-5 text-teal-300" /><p className="mt-4 text-sm font-semibold">One mailbox per staff member</p><p className="mt-2 text-xs leading-5 text-slate-400">Your settings apply only to reminders assigned to you.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5"><Database className="h-5 w-5 text-teal-700" /><p className="mt-4 text-sm font-semibold">Editable database row</p><p className="mt-2 text-xs leading-5 text-slate-500">Values are stored in <code>staff_smtp_settings</code>. The saved password is never returned by the API.</p></CardContent></Card>
      <Card className="rounded-2xl border-0 bg-white shadow-sm"><CardContent className="p-5">{verified ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}<p className="mt-4 text-sm font-semibold">{verified ? "Connection verified" : "Connection not verified"}</p><p className="mt-2 text-xs leading-5 text-slate-500">{settings.data?.lastTestedAt ? `Last tested ${new Date(settings.data.lastTestedAt).toLocaleString()}` : "Save the mailbox, then test the connection."}</p></CardContent></Card>
    </div>

    {settings.data?.lastTestError && <Alert variant="destructive" className="mb-6"><AlertTriangle className="h-4 w-4" /><AlertTitle>Last SMTP test failed</AlertTitle><AlertDescription>{settings.data.lastTestError}</AlertDescription></Alert>}

    <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>SMTP mailbox</CardTitle><p className="mt-1 text-sm text-slate-500">Use the settings supplied by the staff member's email provider.</p></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3"><div><p className="text-sm font-medium">Automatic sending</p><p className="text-xs text-slate-400">Disabled settings are never used</p></div><Switch checked={form.isEnabled} onCheckedChange={value => update("isEnabled", value)} /></div></div></CardHeader>
      <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label>SMTP host</Label><Input value={form.smtpHost} onChange={event => update("smtpHost", event.target.value)} placeholder="smtp.example.com" /></div>
        <div className="space-y-2"><Label>Port</Label><Input type="number" min={1} max={65535} value={form.smtpPort} onChange={event => update("smtpPort", Number(event.target.value))} /></div>
        <div className="space-y-2"><Label>Connection security</Label><Select value={form.smtpSecurity} onValueChange={value => update("smtpSecurity", value as typeof form.smtpSecurity)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tls">TLS / SSL (usually port 465)</SelectItem><SelectItem value="starttls">STARTTLS (usually port 587)</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>SMTP username</Label><Input value={form.smtpUsername} onChange={event => update("smtpUsername", event.target.value)} autoComplete="username" placeholder="staff@example.com" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>SMTP password</Label><Input type="password" value={form.smtpPassword} onChange={event => update("smtpPassword", event.target.value)} autoComplete="new-password" placeholder={settings.data?.hasPassword ? "Saved — leave blank to keep it" : "Enter SMTP password or app password"} /><p className="text-xs leading-5 text-slate-400">After saving, CareFlow reports only whether a password exists. It never sends the saved value back to the browser.</p></div>
        <div className="space-y-2"><Label>Sender email</Label><Input type="email" value={form.fromEmail} onChange={event => update("fromEmail", event.target.value)} placeholder="staff@example.com" /></div>
        <div className="space-y-2"><Label>Sender name</Label><Input value={form.fromName} onChange={event => update("fromName", event.target.value)} placeholder="Staff name" /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Reply-to email (optional)</Label><Input type="email" value={form.replyToEmail} onChange={event => update("replyToEmail", event.target.value)} placeholder="Defaults to sender email" /></div>
        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:col-span-2 sm:flex-row sm:justify-end"><Button variant="outline" disabled={test.isPending || save.isPending} onClick={testConnection}>{test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}Test connection</Button><Button variant="outline" disabled={sendTest.isPending || save.isPending} onClick={sendTestEmail}>{sendTest.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send test email</Button><Button disabled={save.isPending} onClick={saveSettings} className="bg-teal-700 hover:bg-teal-800">{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save settings</Button></div>
      </CardContent>
    </Card>
    {verified && <div className="mt-5 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Verified SMTP settings are ready for scheduled follow-up emails.</div>}
  </div>;
}
