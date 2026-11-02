import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  label: string;
  title: string;
  description: string;
  successMessage: string;
  disabled?: boolean;
  className?: string;
  onRemove: () => Promise<unknown>;
  onRemoved: () => Promise<unknown>;
};

export function SharingRemovalButton({ label, title, description, successMessage, disabled, className, onRemove, onRemoved }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);

  async function remove() {
    if (locked.current || disabled) return;
    locked.current = true;
    setPending(true);
    try {
      await onRemove();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove access. Please try again.");
      locked.current = false;
      setPending(false);
      return;
    }
    setOpen(false);
    toast.success(successMessage);
    try {
      await onRemoved();
    } catch {
      toast.info("The change was saved. Refresh this page to see the updated access.");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={value => { if (!locked.current) setOpen(value); }}>
    <Button type="button" variant="outline" size="sm" disabled={disabled || pending} className={className ?? "min-h-10 w-full shrink-0 border-rose-200 bg-white text-rose-700 hover:bg-rose-50 sm:w-auto"} onClick={() => setOpen(true)}>
      <Trash2 className="mr-2 h-4 w-4 shrink-0" />{label}
    </Button>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={disabled || pending} className="bg-rose-700 text-white hover:bg-rose-800" onClick={event => { event.preventDefault(); void remove(); }}>
          {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removing…</> : label}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
