"use client";

import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("scroll-locked");
    } else {
      document.body.classList.remove("scroll-locked");
      // Reset scroll immediately — ref is always valid since element stays in DOM
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }
    return () => {
      document.body.classList.remove("scroll-locked");
    };
  }, [isOpen]);

  // Reset scroll when opening too
  useEffect(() => {
    if (isOpen && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop — always in DOM, opacity controlled */}
      <motion.div
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]",
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sheet — always in DOM, slides via y transform */}
      <motion.div
        animate={{ y: isOpen ? 0 : "100%" }}
        initial={{ y: "100%" }}
        transition={{
          type: "spring",
          damping: 30,
          stiffness: 300,
        }}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[9999]",
          "bg-white rounded-t-3xl shadow-2xl",
          "flex flex-col",
          "max-h-[80vh]",
          "safe-area-inset-bottom"
        )}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            {title && (
              <h2 className="text-mobile-xl font-bold text-[#003366]">
                {title}
              </h2>
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

        {/* Content — ref always valid */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-6 py-4"
          dir="rtl"
        >
          {children}
        </div>
      </motion.div>
    </>
  );
}
