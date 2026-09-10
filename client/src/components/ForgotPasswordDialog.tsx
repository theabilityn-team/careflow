import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, HelpCircle, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ForgotPasswordDialog({ initialEmail }: { initialEmail?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [submitted, setSubmitted] = useState(false);
  const request = trpc.staff.requestPasswordReset.useMutation();

  async function submit() {
    try {
      const result = await request.mutateAsync({ email });
      setSubmitted(true);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit the request.");
    }
  }

  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) setEmail(initialEmail ?? ""); else setSubmitted(false); }}>
    <DialogTrigger asChild><button type="button" className="text-sm font-medium text-teal-300 transition-colors hover:text-teal-200"><HelpCircle className="mr-1.5 inline h-4 w-4" />Forgot password?</button></DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Request a password reset</DialogTitle><DialogDescription>Enter your staff login email. For security, the Super Admin reviews each request and provides a one-time reset link.</DialogDescription></DialogHeader>
      {submitted ? <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-emerald-200"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" />Request received</div><p className="mt-2 text-sm leading-6">If this email belongs to a staff account, the request is now visible to the Super Admin. Ask them to send you the one-time reset link.</p></div> : <div className="space-y-2 py-2"><Label htmlFor="reset-email">Staff email</Label><Input id="reset-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" className="h-11" /></div>}
      <DialogFooter>{submitted ? <Button onClick={() => setOpen(false)}>Close</Button> : <Button onClick={submit} disabled={request.isPending || !email} className="bg-teal-700 hover:bg-teal-800">{request.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send reset request</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
