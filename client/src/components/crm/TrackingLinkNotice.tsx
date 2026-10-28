import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link2 } from "lucide-react";

export function TrackingLinkNotice({ className = "" }: { className?: string }) {
  return <Alert className={`border-amber-200 bg-amber-50 text-amber-950 ${className}`}>
    <Link2 className="h-4 w-4" />
    <AlertTitle>Keep tracking codes in links</AlertTitle>
    <AlertDescription className="break-words [overflow-wrap:anywhere]"><p>Do not delete or change the tracking or referral code in a URL. Keep the full original link, including parameters such as <code>?ref=…</code> and everything after <code>?</code>. Removing these codes can lose referral attribution. CareFlow adds email open/click tracking automatically when sending.</p></AlertDescription>
  </Alert>;
}
