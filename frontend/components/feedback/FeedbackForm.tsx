"use client";

import { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

export interface FeedbackSettings {
  headingText?: string;
  thankYouMessage?: string;
  successMessage?: string;
  enableProblemQuestion?: boolean;
  enableCommentField?: boolean;
}

export interface FeedbackQuestion {
  id: number;
  question_text_ar: string;
  question_type: string;
  options: { value: string; label: string }[] | null;
  is_required: boolean;
}

interface FeedbackFormProps {
  settings: FeedbackSettings;
  questions?: FeedbackQuestion[];
  pageType: string;
  pageUrl: string;
  onSuccess?: () => void;
  compact?: boolean;
}

export default function FeedbackForm({
  settings,
  questions = [],
  pageType,
  pageUrl,
  onSuccess,
  compact = false,
}: FeedbackFormProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [hadIssue, setHadIssue] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          rating: rating ?? undefined,
          had_issue: hadIssue,
          comment: settings.enableCommentField !== false ? comment : undefined,
          page_url: pageUrl,
          page_type: pageType,
          device_type: typeof navigator !== "undefined" ? (navigator as any).userAgent?.slice(0, 100) : undefined,
        }),
      });
      if (!res.ok) throw new Error("فشل الإرسال");
      setSent(true);
      onSuccess?.();
    } catch {
      setSubmitting(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="p-4 text-center text-[#002845] font-medium">
        {settings.thankYouMessage || "شكراً لمساهمتك!"}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-bold text-[#002845]">
        {settings.headingText || "كيف كانت تجربتك؟"}
      </h3>

      <div>
        <p className="text-sm text-[#002845]/80 mb-2">التقييم (1–5)</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = rating != null && n <= rating;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className={`p-2 rounded-lg transition ${
                  active
                    ? "bg-[#D4AF37] text-[#002845]"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
                aria-label={`${n} نجوم`}
              >
                <Star className={`w-5 h-5 ${active ? "fill-current" : ""}`} />
              </button>
            );
          })}
        </div>
      </div>

      {settings.enableProblemQuestion !== false && (
        <div>
          <p className="text-sm text-[#002845]/80 mb-2">هل واجهت مشكلة؟</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHadIssue(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                hadIssue === true ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              نعم
            </button>
            <button
              type="button"
              onClick={() => setHadIssue(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                hadIssue === false ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              لا
            </button>
          </div>
        </div>
      )}

      {settings.enableCommentField !== false && (
        <div>
          <label className="text-sm text-[#002845]/80 block mb-1">ملاحظتك (اختياري)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={compact ? 2 : 3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-[#002845] focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37]"
            placeholder="أضف ملاحظة..."
          />
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-[#D4AF37] text-[#002845] font-bold hover:bg-[#c49f2e] disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          "إرسال"
        )}
      </button>
    </form>
  );
}
