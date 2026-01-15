"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Star, Send, CheckCircle, Heart, Sparkles, ExternalLink } from "lucide-react";

export default function RatePage() {
  const searchParams = useSearchParams();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleReviewLink, setGoogleReviewLink] = useState("");
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);

  useEffect(() => {
    fetchGoogleReviewLink();
  }, []);

  async function fetchGoogleReviewLink() {
    try {
      const res = await fetch("/api/marketing/google-review/link");
      if (res.ok) {
        const data = await res.json();
        setGoogleReviewLink(data.link || "");
      }
    } catch (err) {
      console.error("Error fetching Google review link:", err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("يرجى اختيار تقييم");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/marketing/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating, feedback, ratingType: "service" }),
      });

      if (res.ok) {
        setSubmitted(true);
        if (rating >= 4 && googleReviewLink) {
          setShowGooglePrompt(true);
        }
      } else {
        const data = await res.json();
        setError(data.error || "حدث خطأ");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  }

  const ratingLabels = [
    "",
    "سيء جداً",
    "سيء",
    "مقبول",
    "جيد",
    "ممتاز!",
  ];

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002845] via-[#003d5c] to-[#002845] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#002845] mb-3">شكراً لتقييمك!</h1>
          <p className="text-gray-600 mb-6">
            نقدر رأيك ونعمل دائماً على تحسين خدماتنا
          </p>
          
          {showGooglePrompt && googleReviewLink && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-amber-700">ساعدنا بالوصول لأكثر!</span>
              </div>
              <p className="text-sm text-amber-600 mb-4">
                إذا أعجبتك خدماتنا، نتمنى تقييمنا على Google أيضاً
              </p>
              <a
                href={googleReviewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl font-bold hover:from-amber-600 hover:to-yellow-600 transition shadow-lg"
              >
                <Star className="w-5 h-5" />
                قيمنا على Google
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
          
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#002845] text-white rounded-xl font-bold hover:bg-[#003d5c] transition"
          >
            <Heart className="w-5 h-5" />
            العودة للرئيسية
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#002845] via-[#003d5c] to-[#002845] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#D4AF37] to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3">
            <Star className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#002845] mb-2">قيم تجربتك معنا</h1>
          <p className="text-gray-500">رأيك يهمنا لتحسين خدماتنا</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center">
            <div className="flex justify-center gap-3 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-125 active:scale-95"
                >
                  <Star
                    className={`w-12 h-12 transition-all ${
                      star <= (hoverRating || rating)
                        ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className={`text-lg font-medium transition-all ${
              rating >= 4 ? "text-green-600" : rating >= 3 ? "text-yellow-600" : rating > 0 ? "text-red-500" : "text-gray-400"
            }`}>
              {ratingLabels[hoverRating || rating] || "اختر تقييمك"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              تعليقك (اختياري)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="شاركنا رأيك وملاحظاتك..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || rating === 0}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#D4AF37] to-amber-600 text-white rounded-xl font-bold hover:from-[#c4a030] hover:to-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                إرسال التقييم
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          جميع التقييمات سرية ولن يتم مشاركتها
        </p>
      </div>
    </div>
  );
}
