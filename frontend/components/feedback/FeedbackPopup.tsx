"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import FeedbackForm, { type FeedbackSettings } from "./FeedbackForm";
import type { FeedbackQuestion } from "./FeedbackForm";

interface FeedbackPopupProps {
  settings: FeedbackSettings;
  questions?: FeedbackQuestion[];
  pageType: string;
  pageUrl: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function FeedbackPopup({
  settings,
  questions,
  pageType,
  pageUrl,
  onClose,
  onSuccess,
}: FeedbackPopupProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="نموذج التغذية الراجعة"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
        <FeedbackForm
          settings={settings}
          questions={questions}
          pageType={pageType}
          pageUrl={pageUrl}
          onSuccess={() => {
            onSuccess?.();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
