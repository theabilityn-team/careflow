import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatEasternDate } from "@shared/time";
import { Eye, MousePointerClick, ShieldCheck } from "lucide-react";

export type EmailEngagement = {
  status: "sent" | "failed";
  trackingEnabled?: boolean;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  openCount: number;
  firstClickedAt: number | null;
  lastClickedAt: number | null;
  clickCount: number;
};

export function EmailEngagementBadges({ email }: { email: EmailEngagement }) {
  if (email.status !== "sent") return null;
  if (!email.trackingEnabled) return <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500"><ShieldCheck className="mr-1 h-3 w-3" />Tracking unavailable for this older email</Badge>;
  return <div className="flex flex-wrap items-center gap-1.5">
    <Badge variant="outline" className={email.openCount > 0 ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-slate-50 text-slate-500"}><Eye className="mr-1 h-3 w-3" />{email.openCount > 0 ? `${email.openCount} open${email.openCount === 1 ? "" : "s"}` : "Not opened"}</Badge>
    <Badge variant="outline" className={email.clickCount > 0 ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-500"}><MousePointerClick className="mr-1 h-3 w-3" />{email.clickCount > 0 ? `${email.clickCount} click${email.clickCount === 1 ? "" : "s"}` : "No clicks"}</Badge>
  </div>;
}

export function EmailEngagementDetails({ email }: { email: EmailEngagement }) {
  if (!email.trackingEnabled) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">This email was sent before CareFlow engagement tracking was enabled. No open or click conclusion can be made.</div>;
  return <div className="grid gap-3 sm:grid-cols-2">
    <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-sky-900"><Eye className="h-4 w-4" />Open tracking</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{email.openCount}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{email.firstOpenedAt ? `First detected ${formatEasternDate(email.firstOpenedAt, true)}` : "No image load detected."}</p>
      {email.lastOpenedAt && email.openCount > 1 && <p className="text-xs leading-5 text-slate-500">Latest detected {formatEasternDate(email.lastOpenedAt, true)}</p>}
    </div>
    <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-violet-900"><MousePointerClick className="h-4 w-4" />Click tracking</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{email.clickCount}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{email.firstClickedAt ? `First detected ${formatEasternDate(email.firstClickedAt, true)}` : "No tracked link click detected."}</p>
      {email.lastClickedAt && email.clickCount > 1 && <p className="text-xs leading-5 text-slate-500">Latest detected {formatEasternDate(email.lastClickedAt, true)}</p>}
    </div>
  </div>;
}

export function EmailEngagementNotice({ className = "" }: { className?: string }) {
  return <Alert className={`border-amber-200 bg-amber-50 text-amber-950 ${className}`}><ShieldCheck className="h-4 w-4" /><AlertTitle>Engagement tracking is approximate</AlertTitle><AlertDescription>Opens require the recipient's email app to load images. Privacy protection and security scanners can create automatic opens or clicks. CareFlow stores only first/last timestamps and counts—never recipient IP addresses, devices, or browser fingerprints.</AlertDescription></Alert>;
}
