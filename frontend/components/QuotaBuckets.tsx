"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

import { useEffect, useState } from "react";
import { Package, Calendar, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type QuotaBucket = {
  id: number;
  planId: number;
  planName: string;
  planNameEn: string;
  planSlug: string;
  planColor: string;
  planLogo: string | null;
  planIcon: string | null;
  source: string;
  totalSlots: number;
  usedSlots: number;
  remainingSlots: number;
  expiresAt: string | null;
  active: boolean;
  benefits: {
    maxPhotos: number;
    maxVideos: number;
    showOnMap: boolean;
    aiSupportLevel: number;
    highlightsAllowed: number;
  };
};

type QuotaData = {
  buckets: QuotaBucket[];
  availableBuckets: QuotaBucket[];
  totalRemaining: number;
  byPlan: {
    planId: number;
    planName: string;
    planSlug: string;
    planColor: string;
    planLogo: string | null;
    totalRemaining: number;
    buckets: QuotaBucket[];
  }[];
};

export function QuotaBuckets() {
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuotas();
  }, []);

  async function fetchQuotas() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/quota/my-quotas`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("يجب تسجيل الدخول");
          return;
        }
        throw new Error("Failed to fetch quotas");
      }

      const data = await res.json();
      setQuotaData(data);
    } catch (err) {
      console.error("Error fetching quotas:", err);
      setError("حدث خطأ في جلب بيانات الرصيد");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "غير محدد";
    const date = new Date(dateStr);
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function getDaysRemaining(dateStr: string | null) {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const now = new Date();
    const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  }

  function getSourceLabel(source: string) {
    switch (source) {
      case "subscription":
        return "اشتراك";
      case "upgrade":
        return "ترقية";
      case "bonus":
        return "هدية";
      case "admin":
        return "إضافة يدوية";
      default:
        return source;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-red-600">
        {error}
      </div>
    );
  }

  if (!quotaData || quotaData.buckets.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <p className="text-slate-600">لا يوجد رصيد إعلانات متاح</p>
        <p className="mt-2 text-sm text-slate-500">
          اشترك في إحدى الباقات للحصول على رصيد إعلانات
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-l from-[#002845] to-[#01375e] p-4 text-white">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-[#D4AF37]" />
          <span className="font-semibold">إجمالي الرصيد المتاح</span>
        </div>
        <div className="text-2xl font-bold text-[#D4AF37]">
          {quotaData.totalRemaining} إعلان
        </div>
      </div>

      <div className="space-y-3">
        {quotaData.byPlan.map((planGroup) => (
          <div
            key={planGroup.planId}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div
              className="flex items-center justify-between p-4"
              style={{
                background: `linear-gradient(135deg, ${planGroup.planColor}15, ${planGroup.planColor}30)`,
                borderBottom: `2px solid ${planGroup.planColor}`,
              }}
            >
              <div className="flex items-center gap-3">
                {planGroup.planLogo ? (
                  <img
                    src={planGroup.planLogo}
                    alt={planGroup.planName}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: planGroup.planColor }}
                  >
                    <Package className="h-4 w-4 text-white" />
                  </div>
                )}
                <span className="font-bold" style={{ color: planGroup.planColor }}>
                  باقة {planGroup.planName}
                </span>
              </div>
              <div
                className="rounded-full px-3 py-1 text-sm font-bold text-white"
                style={{ backgroundColor: planGroup.planColor }}
              >
                {planGroup.totalRemaining} متبقي
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {planGroup.buckets.map((bucket) => {
                const daysLeft = getDaysRemaining(bucket.expiresAt);
                const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft > 0;
                const isExpired = daysLeft !== null && daysLeft <= 0;

                return (
                  <div key={bucket.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {getSourceLabel(bucket.source)}
                        </span>
                        <span className="text-sm text-slate-500">
                          {bucket.usedSlots}/{bucket.totalSlots} مستخدم
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {bucket.remainingSlots > 0 ? (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            {bucket.remainingSlots} متبقي
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-600">
                            مكتمل
                          </span>
                        )}
                      </div>
                    </div>

                    {bucket.expiresAt && (
                      <div
                        className={`mt-2 flex items-center gap-1 text-xs ${
                          isExpired
                            ? "text-red-600"
                            : isExpiringSoon
                            ? "text-amber-600"
                            : "text-slate-500"
                        }`}
                      >
                        {isExpiringSoon && !isExpired && (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        <Calendar className="h-3 w-3" />
                        <span>
                          {isExpired
                            ? "منتهي الصلاحية"
                            : `ينتهي ${formatDate(bucket.expiresAt)}`}
                          {daysLeft !== null && daysLeft > 0 && ` (${daysLeft} يوم)`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QuotaSummaryBadge() {
  const [totalRemaining, setTotalRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/quota/summary-by-plan`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        setTotalRemaining(data.totalRemaining);
      }
    } catch (err) {
      console.error("Error fetching quota summary:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || totalRemaining === null) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-3 py-1.5 text-sm font-semibold text-white shadow-md">
      <Package className="h-4 w-4" />
      <span>{totalRemaining} إعلان متاح</span>
    </div>
  );
}
