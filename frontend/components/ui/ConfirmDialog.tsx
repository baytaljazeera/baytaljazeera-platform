"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: "default" | "danger";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  onConfirm,
  variant = "default",
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Keep dialog open on error - parent shows toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} dir="rtl">
      <DialogContent showCloseButton={!loading}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "جاري..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
