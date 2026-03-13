"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxHeight?: string;
  showCloseButton?: boolean;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = "80vh",
  showCloseButton = true,
}: MobileBottomSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-3xl shadow-2xl flex flex-col animate-slide-up"
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            {title && (
              <h2 className="text-xl font-bold text-[#003366]">{title}</h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors touch-manipulation"
                aria-label="إغلاق"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            )}
          </div>
        )}

        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-6 py-4"
          dir="rtl"
        >
          {children}
        </div>
      </div>
    </>
  );
}
