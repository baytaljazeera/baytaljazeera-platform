"use client";

import { useEffect, useState } from "react";
import { Star, Shield, Clock, MessageCircle, Calendar, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Minus, User } from "lucide-react";

type ReputationData = {
  total_ratings: number;
  average_rating: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  response_rate: number;
  response_speed: string;
  trusted_badge: boolean;
  member_since: string;
  advertiser_name: string;
};

type RatingItem = {
  id: number;
  rating: number;
  quick_rating: string;
  comment: string;
  advertiser_reply: string;
  advertiser_reply_at: string;
  created_at: string;
  rater_name: string;
};

interface Props {
  advertiserId: string;
  compact?: boolean;
}

export default function AdvertiserReputation({ advertiserId, compact = false }: Props) {
  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRatings, setShowRatings] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function fetchReputation() {
      try {
        const res = await fetch(`/api/ratings/advertiser/${advertiserId}?page=${page}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setReputation(data.reputation);
          setRatings(data.ratings);
          setTotal(data.pagination.total);
        }
      } catch (err) {
        console.error("Error fetching reputation:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReputation();
  }, [advertiserId, page]);

  if (loading) {
    return (
      <div className="animate-pulse bg-slate-100 rounded-lg p-4">
        <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-slate-200 rounded w-3/4"></div>
      </div>
    );
  }

  if (!reputation) return null;

  const minRatingsToShow = 3;
  const showStars = reputation.total_ratings >= minRatingsToShow;

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-4 h-4 ${
              star <= Math.round(rating)
                ? "fill-[#D4AF37] text-[#D4AF37]"
                : "text-slate-300"
            }`}
          />
        ))}
      </div>
    );
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short" });
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {reputation.trusted_badge && (
          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
            <Shield className="w-3 h-3" />
            موثوق
          </span>
        )}
        {showStars && (
          <div className="flex items-center gap-1">
            {renderStars(reputation.average_rating)}
            <span className="text-slate-600">({reputation.total_ratings})</span>
          </div>
        )}
        {reputation.response_speed && reputation.response_speed !== 'غير محدد' && (
          <span className="text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {reputation.response_speed}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-[#002845] to-[#01375e] rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-[#002845]">{reputation.advertiser_name || "المعلن"}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                <span>عضو منذ {formatDate(reputation.member_since)}</span>
              </div>
            </div>
          </div>
          {reputation.trusted_badge && (
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-lg">
              <Shield className="w-3 h-3" />
              معلن موثوق
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          {showStars ? (
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="flex justify-center mb-1">{renderStars(reputation.average_rating)}</div>
              <div className="text-lg font-bold text-[#002845]">{reputation.average_rating.toFixed(1)}</div>
              <div className="text-xs text-slate-500">{reputation.total_ratings} تقييم</div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-lg p-2">
              <div className="text-slate-400 text-xs">لا توجد تقييمات كافية</div>
            </div>
          )}
          
          <div className="bg-slate-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <Clock className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div className="text-sm font-bold text-[#002845]">{reputation.response_speed}</div>
            <div className="text-xs text-slate-500">سرعة الرد</div>
          </div>
          
          <div className="bg-slate-50 rounded-lg p-2">
            <div className="flex justify-center mb-1">
              <MessageCircle className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div className="text-sm font-bold text-[#002845]">{reputation.response_rate.toFixed(0)}%</div>
            <div className="text-xs text-slate-500">نسبة الرد</div>
          </div>
        </div>

        {showStars && reputation.total_ratings > 0 && (
          <div className="mt-3 flex justify-center gap-4 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <ThumbsUp className="w-3 h-3" />
              {reputation.positive_count} إيجابي
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <Minus className="w-3 h-3" />
              {reputation.neutral_count} محايد
            </span>
            <span className="flex items-center gap-1 text-red-500">
              <ThumbsDown className="w-3 h-3" />
              {reputation.negative_count} سلبي
            </span>
          </div>
        )}
      </div>

      {reputation.total_ratings > 0 && (
        <div>
          <button
            onClick={() => setShowRatings(!showRatings)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-[#002845] hover:bg-slate-50"
          >
            <span>عرض التقييمات ({total})</span>
            {showRatings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showRatings && (
            <div className="border-t border-slate-100">
              {ratings.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  لا توجد تقييمات معتمدة
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ratings.map((rating) => (
                    <div key={rating.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-500" />
                          </div>
                          <span className="text-sm font-medium text-[#002845]">
                            {rating.rater_name || "مستخدم"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStars(rating.rating)}
                          <span className="text-xs text-slate-400">
                            {formatDate(rating.created_at)}
                          </span>
                        </div>
                      </div>
                      {rating.comment && (
                        <p className="text-sm text-slate-600 mb-2">{rating.comment}</p>
                      )}
                      {rating.advertiser_reply && (
                        <div className="bg-blue-50 rounded-lg p-3 mt-2">
                          <div className="text-xs text-blue-600 mb-1">رد المعلن:</div>
                          <p className="text-sm text-blue-800">{rating.advertiser_reply}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {total > ratings.length && (
                <button
                  onClick={() => setPage(page + 1)}
                  className="w-full p-3 text-sm text-[#D4AF37] hover:bg-slate-50 border-t border-slate-100"
                >
                  عرض المزيد
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
