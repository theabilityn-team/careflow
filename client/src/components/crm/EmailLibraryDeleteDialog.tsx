import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Trash2 } from "lucide-react";

export type EmailLibraryDeleteTarget =
  | { kind: "product"; id: number; name: string; templateCount: number }
  | { kind: "template"; id: number; name: string };

type Props = {
  target: EmailLibraryDeleteTarget | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function EmailLibraryDeleteDialog({ target, deleting, onCancel, onConfirm }: Props) {
  const product = target?.kind === "product";
  return <AlertDialog open={Boolean(target)} onOpenChange={open => { if (!open && !deleting) onCancel(); }}>
    <AlertDialogContent>
      <AlertDialogHeader className="text-left">
        <AlertDialogTitle className="[overflow-wrap:anywhere]">Delete {product ? "product" : "template"} “{target?.name}”?</AlertDialogTitle>
        <AlertDialogDescription>
          {target?.kind === "product"
            ? `This permanently deletes this product and all of its ${target.templateCount} templates, including archived templates. Staff will no longer be able to select them.`
            : "This permanently deletes this email template. Its product and other templates remain unchanged, but staff will no longer be able to select this template."}
          {" "}Previously sent emails, their saved content, and open/click tracking history are preserved. This cannot be undone. Use Archive instead if you may need it again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-rose-700 text-white hover:bg-rose-800" disabled={deleting || !target} onClick={event => { event.preventDefault(); void onConfirm(); }}>
          {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          {deleting ? "Deleting…" : product ? "Delete product" : "Delete template"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
