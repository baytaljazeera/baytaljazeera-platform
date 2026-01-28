"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, BedDouble, Bath, Square } from "lucide-react";
import { getImageUrl } from "@/lib/imageUrl";

type Listing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  price?: number | string;
  land_area?: number;
  building_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  type?: string;
  purpose?: string;
  image_url?: string;
};

function ReportContent() {
  const searchParams = useSearchParams();
  const listingId = searchParams?.get("listingId") || searchParams?.get("listing");
  
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!listingId) {
      setLoading(false);
      return;
    }

    async function loadListing() {
      try {
        const res = await fetch(`/api/listings/${listingId}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        setListing(data);
      } catch (e) {
        console.error("خطأ في تحميل الإعلان:", e);
      } finally {
        setLoading(false);
      }
    }

    loadListing();
  }, [listingId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const form = new FormData(e.currentTarget);
      const reason = form.get("reason");
      const details = form.get("details");
      const reporterName = form.get("reporterName");
      const reporterPhone = form.get("reporterPhone");

      const res = await fetch(`${API_URL}/api/report-listing`, {
        method: "POST",
        body: JSON.stringify({
          listingId,
          reason,
          details,
          reporterName,
          reporterPhone,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        setSent(true);
      }
    } catch (e) {
      console.error("خطأ في إرسال البلاغ:", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-[#002845]">جاري تحميل الإعلان...</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6" dir="rtl">
      <h1 className="text-2xl font-extrabold text-[#002845] mb-6">
        إبلاغ عن إعلان
      </h1>

      {/* إذا تم إرسال البلاغ */}
      {sent && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl mb-6">
          ✅ تم استلام البلاغ، شكرًا لتعاونك!
          <br />
          فريق الدعم سيقوم بمراجعة الإعلان في أسرع وقت.
        </div>
      )}

      {/* معلومات الإعلان */}
      {listing ? (
        <div className="bg-white shadow-lg rounded-2xl border border-[#f6d879]/50 mb-6 overflow-hidden">
          {/* الصورة */}
          {listing.image_url && (
            <div className="relative w-full bg-gray-200" style={{aspectRatio: "16/10"}}>
              <img
                src={getImageUrl(listing.image_url)}
                alt={listing.title}
                className="object-cover w-full h-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://picsum.photos/400/250?random=${listing.id}`;
                }}
              />
            </div>
          )}

          {/* التفاصيل */}
          <div className="p-6 space-y-3">
            {/* العنوان */}
            <h2 className="text-xl font-bold text-[#002845]">
              {listing.title}
            </h2>

            {/* الوصف */}
            {listing.description && (
              <p className="text-sm text-slate-600">{listing.description}</p>
            )}

            {/* الموقع */}
            {listing.city && (
              <p className="text-sm text-[#002845] flex items-center gap-2 font-semibold">
                <MapPin className="w-4 h-4" />
                {listing.city}
                {listing.district ? ` - ${listing.district}` : ""}
              </p>
            )}

            {/* السعر */}
            {listing.price && (
              <div className="text-2xl font-extrabold text-[#002845]">
                {typeof listing.price === "number"
                  ? `${listing.price.toLocaleString("en-US")} ريال`
                  : `${listing.price} ريال`}
              </div>
            )}

            {/* التفاصيل الإضافية */}
            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-200">
              {listing.land_area && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Square className="w-4 h-4 text-[#002845]" />
                    <span className="text-xs text-slate-600">المساحة</span>
                  </div>
                  <p className="text-sm font-semibold text-[#002845]">
                    {listing.land_area} م²
                  </p>
                </div>
              )}
              {listing.bedrooms && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <BedDouble className="w-4 h-4 text-[#002845]" />
                    <span className="text-xs text-slate-600">الغرف</span>
                  </div>
                  <p className="text-sm font-semibold text-[#002845]">
                    {listing.bedrooms}
                  </p>
                </div>
              )}
              {listing.bathrooms && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Bath className="w-4 h-4 text-[#002845]" />
                    <span className="text-xs text-slate-600">الدورات</span>
                  </div>
                  <p className="text-sm font-semibold text-[#002845]">
                    {listing.bathrooms}
                  </p>
                </div>
              )}
            </div>

            {/* النوع والغرض */}
            <div className="flex gap-2 pt-3">
              {listing.type && (
                <span className="px-3 py-1 bg-[#f6d879]/20 text-[#002845] text-xs rounded-full font-semibold">
                  {listing.type}
                </span>
              )}
              {listing.purpose && (
                <span className="px-3 py-1 bg-[#002845]/10 text-[#002845] text-xs rounded-full font-semibold">
                  {listing.purpose}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 mb-6">
          ❌ الإعلان غير موجود أو تم حذفه
        </div>
      )}

      {/* نموذج الإبلاغ */}
      {!sent && listing && (
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-xl shadow border border-[#f6d879]/30">
          <h3 className="text-lg font-bold text-[#002845]">نموذج الإبلاغ</h3>

          {/* معلومات المبلّغ (اختياري) */}
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-[#002845] mb-1 block">
                اسمك (اختياري)
              </span>
              <input
                type="text"
                name="reporterName"
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-[#002845] focus:ring-1 focus:ring-[#002845]"
                placeholder="مثال: أحمد محمد"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-[#002845] mb-1 block">
                رقم الجوال (اختياري)
              </span>
              <input
                type="tel"
                name="reporterPhone"
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-[#002845] focus:ring-1 focus:ring-[#002845]"
                placeholder="05XXXXXXXX"
                dir="ltr"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-[#002845] mb-2 block">
              سبب الإبلاغ: <span className="text-red-500">*</span>
            </span>
            <select
              name="reason"
              required
              className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-[#002845] focus:ring-1 focus:ring-[#002845]"
            >
              <option value="">اختر السبب…</option>
              <optgroup label="🏷️ مشاكل في المعلومات">
                <option value="wrong_price">السعر غير صحيح</option>
                <option value="wrong_location">الموقع غير صحيح</option>
                <option value="wrong_specs">المواصفات غير مطابقة للواقع</option>
                <option value="fake_images">الصور غير حقيقية أو مضللة</option>
              </optgroup>
              <optgroup label="⚠️ مشاكل في الإعلان">
                <option value="sold_rented">العقار مباع أو مؤجر</option>
                <option value="duplicate">إعلان مكرر</option>
                <option value="spam">إعلان مزعج أو ترويجي</option>
                <option value="inappropriate">محتوى غير لائق</option>
              </optgroup>
              <optgroup label="🚨 مخاوف أمنية">
                <option value="fraud">محاولة احتيال</option>
                <option value="fake_listing">إعلان وهمي</option>
              </optgroup>
              <optgroup label="📞 مشاكل في التواصل">
                <option value="no_response">المعلن لا يرد</option>
                <option value="wrong_contact">بيانات التواصل خاطئة</option>
              </optgroup>
              <option value="other">سبب آخر</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-[#002845] mb-2 block">
              تفاصيل إضافية (اختياري):
            </span>
            <textarea
              name="details"
              className="w-full border border-gray-300 rounded-xl p-3 h-32 text-sm focus:border-[#002845] focus:ring-1 focus:ring-[#002845] resize-none"
              placeholder="اكتب أي ملاحظات أو تفاصيل تساعدنا في التحقيق…"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#002845] text-white py-3 rounded-full font-bold hover:bg-[#01375e] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "جاري الإرسال..." : "إرسال البلاغ"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-xl">جاري التحميل...</div></div>}>
      <ReportContent />
    </Suspense>
  );
}
