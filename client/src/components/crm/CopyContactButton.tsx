import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { Copy } from "lucide-react";
import type { MouseEvent } from "react";
import { toast } from "sonner";

export function CopyContactButton({ value, label, compact = false }: { value: string; label: "email" | "phone"; compact?: boolean }) {
  async function copy(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await copyText(value);
      toast.success(`${label === "email" ? "Email address" : "Phone number"} copied.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to copy.");
    }
  }

  return <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={copy}
    aria-label={`Copy ${label}`}
    title={`Copy ${label}`}
    className={compact ? "h-11 w-11 shrink-0 p-0 text-slate-400 hover:bg-teal-50 hover:text-teal-700 md:h-8 md:w-8" : "h-11 shrink-0 gap-1.5 px-3 text-xs text-slate-500 hover:bg-teal-50 hover:text-teal-700 md:h-8 md:px-2.5"}
  >
    <Copy className="h-3.5 w-3.5" />
    {!compact && "Copy"}
  </Button>;
}
