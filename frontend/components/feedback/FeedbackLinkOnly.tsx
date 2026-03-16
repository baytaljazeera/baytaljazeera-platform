"use client";

import { useState } from "react";
import { MessageCirclePlus, X } from "lucide-react";
import FeedbackForm, { type FeedbackSettings } from "./FeedbackForm";
import type { FeedbackQuestion } from "./FeedbackForm";

interface FeedbackLinkOnlyProps {
  settings: FeedbackSettings;
  questions?: FeedbackQuestion[];
  pageUrl: string;
}

export default function FeedbackLinkOnly({ settings, questions, pageUrl }: FeedbackLinkOnlyProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm text-[#D4AF37] hover:text-[#c49f2e] font-medium underline underline-offset-2"
        aria-label="شاركنا رأيك"
      >
        <MessageCirclePlus className="w-4 h-4" />
        شاركنا رأيك
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-label="نموذج التغذية الراجعة"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 left-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
            <FeedbackForm
              settings={settings}
              questions={questions}
              pageType="home"
              pageUrl={pageUrl}
              onSuccess={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
