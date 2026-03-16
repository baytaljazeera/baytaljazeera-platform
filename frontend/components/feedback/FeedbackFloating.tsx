"use client";

import { useState, useEffect } from "react";
import { MessageCirclePlus, X } from "lucide-react";
import FeedbackForm, { type FeedbackSettings } from "./FeedbackForm";
import type { FeedbackQuestion } from "./FeedbackForm";

interface FeedbackFloatingProps {
  settings: FeedbackSettings;
  questions?: FeedbackQuestion[];
  pageType: string;
  pageUrl: string;
  delaySeconds: number;
  onSuccess?: () => void;
}

export default function FeedbackFloating({
  settings,
  questions,
  pageType,
  pageUrl,
  delaySeconds,
  onSuccess,
}: FeedbackFloatingProps) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delaySeconds * 1000);
    return () => clearTimeout(t);
  }, [delaySeconds]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-[9000] flex flex-col items-end gap-2"
      style={{ direction: "ltr" }}
    >
      {expanded ? (
        <div className="w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-[#002845]">رأيك يهمنا</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="طي"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <FeedbackForm
            settings={settings}
            questions={questions}
            pageType={pageType}
            pageUrl={pageUrl}
            compact={true}
            onSuccess={() => {
              setExpanded(false);
              onSuccess?.();
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-[#D4AF37] text-[#002845] font-bold shadow-lg hover:bg-[#c49f2e]"
          aria-label="شاركنا رأيك"
        >
          <MessageCirclePlus className="w-5 h-5" />
          شاركنا رأيك
        </button>
      )}
    </div>
  );
}
