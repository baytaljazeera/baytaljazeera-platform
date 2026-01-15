"use client";

import { useState } from "react";
import { X, Star, ThumbsUp, Minus, ThumbsDown, Loader2, Gift, CheckCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  advertiserId: string;
  listingId?: string;
  advertiserName?: string;
}

export default function RatingModal({ isOpen, onClose, advertiserId, listingId, advertiserName }: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [quickRating, setQuickRating] = useState<"positive" | "neutral" | "negative" | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);

  if (!isOpen) return null;

  async function handleSubmit() {
    if (rating === 0) {
      setError("يرجى اختيار تقييم");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ratings/submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          listing_id: listingId || null,
          rating,
          quick_rating: quickRating,
          comment: comment.trim() || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setPointsEarned(data.points_earned || 10);
      } else {
        setError(data.error || "حدث خطأ");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setRating(0);
    setQuickRating(null);
    setComment("");
    setSuccess(false);
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div 
        className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#002845] to-[#01375e] p-4 text-white flex justify-between items-center">
          <h3 className="font-bold text-lg">قيّم تجربتك</h3>
          <button onClick={handleClose} className="p-1 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h4 className="text-xl font-bold text-[#002845] mb-2">شكراً لتقييمك!</h4>
            <p className="text-slate-600 mb-4">
              تقييمك يساعد الآخرين على اتخاذ قرارات أفضل
            </p>
            <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#D4AF37]/20 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-center gap-2 text-[#D4AF37]">
                <Gift className="w-5 h-5" />
                <span className="font-bold">+{pointsEarned} نقطة مكافأة</span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="bg-[#002845] text-white px-8 py-2 rounded-full hover:bg-[#01375e]"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <div className="p-6">
            <div className="text-center mb-6">
              <p className="text-slate-600 mb-4">
                كيف كانت تجربتك مع {advertiserName || "المعلن"}؟
              </p>
              
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-10 h-10 ${
                        star <= (hoverRating || rating)
                          ? "fill-[#D4AF37] text-[#D4AF37]"
                          : "text-slate-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              
              <div className="text-sm text-slate-500">
                {rating === 1 && "سيء جداً"}
                {rating === 2 && "سيء"}
                {rating === 3 && "متوسط"}
                {rating === 4 && "جيد"}
                {rating === 5 && "ممتاز"}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">تقييم سريع (اختياري):</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setQuickRating(quickRating === "positive" ? null : "positive")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition ${
                    quickRating === "positive"
                      ? "bg-green-100 border-green-500 text-green-700"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>إيجابي</span>
                </button>
                <button
                  onClick={() => setQuickRating(quickRating === "neutral" ? null : "neutral")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition ${
                    quickRating === "neutral"
                      ? "bg-slate-100 border-slate-500 text-slate-700"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Minus className="w-4 h-4" />
                  <span>محايد</span>
                </button>
                <button
                  onClick={() => setQuickRating(quickRating === "negative" ? null : "negative")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition ${
                    quickRating === "negative"
                      ? "bg-red-100 border-red-500 text-red-700"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>سلبي</span>
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm text-slate-600 block mb-2">
                تعليق (اختياري):
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="شاركنا تجربتك..."
                className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                maxLength={500}
              />
              <div className="text-xs text-slate-400 text-left">{comment.length}/500</div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-700 flex items-center gap-2">
              <Gift className="w-4 h-4 flex-shrink-0" />
              <span>ستحصل على 10 نقاط مكافأة عند إرسال تقييمك!</span>
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || rating === 0}
              className="w-full bg-gradient-to-r from-[#D4AF37] to-[#c9a431] text-white py-3 rounded-full font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                "إرسال التقييم"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
