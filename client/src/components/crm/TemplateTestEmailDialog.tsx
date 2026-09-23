import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, Send } from "lucide-react";

export type TestEmailTemplate = { id: number; name: string; contentMode: "plain" | "html" };
export type TestEmailSender = {
  userId: number;
  name: string;
  accountEmail: string | null;
  isActive: boolean;
  smtpEnabled: boolean;
  smtpFromEmail: string | null;
  smtpVerifiedAt: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TestEmailTemplate;
  accounts?: TestEmailSender[];
  accountsLoading: boolean;
  senderUserId: string;
  onSenderChange: (value: string) => void;
  recipientEmail: string;
  onRecipientChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
};

export function TemplateTestEmailDialog({
  open,
  onOpenChange,
  template,
  accounts,
  accountsLoading,
  senderUserId,
  onSenderChange,
  recipientEmail,
  onRecipientChange,
  onSend,
  sending,
}: Props) {
  const hasActiveSender = accounts?.some(account => account.isActive && account.smtpEnabled);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bottom-0 left-0 top-auto flex max-h-[94dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-b-none rounded-t-[26px] border-x-0 border-b-0 p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
      <DialogHeader className="shrink-0 border-b border-slate-100 px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pb-5 sm:pt-6">
        <DialogTitle className="text-xl leading-7 sm:text-2xl">Send template test</DialogTitle>
        <DialogDescription className="max-w-md text-sm leading-5 sm:leading-6">Send one real test email through a selected SMTP mailbox. Enter the exact recipient below.</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-5 py-5 overscroll-contain sm:px-6">
        <div className="min-w-0 rounded-2xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-violet-500">Selected template</p>
          <p className="mt-2 break-words text-base font-semibold leading-6 text-violet-950">{template?.name}</p>
          <p className="mt-1 break-words text-xs leading-5 text-violet-700">{template?.contentMode === "html" ? "HTML email" : "Plain-text email"} · Lead tokens render as Test Recipient</p>
        </div>

        <div className="min-w-0 space-y-2">
          <Label>SMTP sender *</Label>
          <Select value={senderUserId} onValueChange={onSenderChange}>
            <SelectTrigger className="h-11 w-full min-w-0 overflow-hidden bg-white text-left [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
              <SelectValue placeholder={accountsLoading ? "Loading sender accounts…" : "Select sender account"} />
            </SelectTrigger>
            <SelectContent align="start" className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              {accounts?.map(account => <SelectItem key={account.userId} value={String(account.userId)} disabled={!account.isActive || !account.smtpEnabled} className="max-w-[calc(100vw-3rem)] sm:max-w-lg">
                <span className="block min-w-0 truncate">{account.name} · {account.smtpFromEmail || account.accountEmail || "No sender email"}{!account.isActive ? " · inactive" : !account.smtpEnabled ? " · disabled" : account.smtpVerifiedAt ? " · verified" : " · not verified"}</span>
              </SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="template-test-recipient">Recipient email *</Label>
          <Input id="template-test-recipient" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={recipientEmail} onChange={event => onRecipientChange(event.target.value)} placeholder="recipient@example.com" className="h-11 w-full min-w-0" autoFocus />
        </div>

        {!accountsLoading && !hasActiveSender && <Alert variant="destructive" className="min-w-0"><Mail className="h-4 w-4" /><AlertTitle>No active SMTP sender</AlertTitle><AlertDescription className="break-words">Enable and save at least one SMTP mailbox in Email settings before sending a template test.</AlertDescription></Alert>}
      </div>

      <DialogFooter className="grid shrink-0 grid-cols-1 gap-2 border-t border-slate-100 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex sm:px-6 sm:py-5">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending} className="h-11 w-full sm:w-auto">Cancel</Button>
        <Button onClick={onSend} disabled={sending || !senderUserId || !recipientEmail.trim()} className="h-11 w-full bg-teal-700 hover:bg-teal-800 sm:w-auto">{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send test email</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
