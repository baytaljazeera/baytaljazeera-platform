"use client";

import FeedbackForm, { type FeedbackSettings } from "./FeedbackForm";
import type { FeedbackQuestion } from "./FeedbackForm";

interface FeedbackBlockProps {
  settings: FeedbackSettings;
  questions?: FeedbackQuestion[];
  pageType: string;
  pageUrl: string;
}

export default function FeedbackBlock({
  settings,
  questions,
  pageType,
  pageUrl,
}: FeedbackBlockProps) {
  return (
    <div className="rounded-2xl border border-[#D4AF37]/30 bg-white/80 backdrop-blur p-6 shadow-lg max-w-lg mx-auto">
      <FeedbackForm
        settings={settings}
        questions={questions}
        pageType={pageType}
        pageUrl={pageUrl}
        compact={false}
      />
    </div>
  );
}
