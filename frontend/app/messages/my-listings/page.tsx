"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { 
  MapPin, BedDouble, Bath, Square, Plus, Edit, Eye, EyeOff, 
  RotateCcw, Trash2, MoreVertical, AlertCircle, CheckCircle,
  Clock, XCircle, Crown, Star
} from "lucide-react";
import { getImageUrl } from "@/lib/imageUrl";

type Listing = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  type?: string;
  purpose?: string;
  price?: number;
  land_area?: number;
  building_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  image_url?: string;
  status?: string;
  created_at?: string;
};

export default function MyListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "hidden" | "pending" | "all">("all");
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{id: string; action: string} | null>(null);
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);

  useEffect(() => {
    fetchListings();
    fetchPlanInfo();
    // تحديث آخر زيارة للإعلانات
    fetch('/api/account/pending-counts/listings/seen', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }).catch(() => {});
  }, []);

  async function fetchListings() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/account/my-listings`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        return;
      }

      const data = await res.json();
      setListings(data.listings || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPlanInfo() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch('/api/elite-slots/check-eligibility', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setIsBusinessPlan(data.allowed === true);
      }
    } catch (err) {
      console.error('Error checking plan eligibility:', err);
    }
  }

  async function toggleVisibility(listingId: string, currentStatus: string) {
    try {
      const token = localStorage.getItem("token");
      const newStatus = currentStatus === "hidden" ? "approved" : "hidden";
      
      const res = await fetch(`/api/listings/${listingId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setListings(listings.map(l => 
          l.id === listingId ? { ...l, status: newStatus } : l
        ));
      }
    } catch (err) {
      console.error(err);
    }
    setActionMenu(null);
    setConfirmAction(null);
  }

  async function deleteListing(listingId: string) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        setListings(listings.filter(l => l.id !== listingId));
      }
    } catch (err) {
      console.error(err);
    }
    setActionMenu(null);
    setConfirmAction(null);
  }

  function getStatusBadge(status?: string) {
    switch (status) {
      case "approved":
        return (
          <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
            <CheckCircle className="w-3 h-3" />
            نشط
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full">
            <Clock className="w-3 h-3" />
            قيد المراجعة
          </span>
        );
      case "hidden":
        return (
          <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
            <EyeOff className="w-3 h-3" />
            مخفي
          </span>
        );
      case "rejected":
        return (
          <span className="flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
            <XCircle className="w-3 h-3" />
            غير مقبول
          </span>
        );
      case "expired":
        return (
          <span className="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-full">
            <AlertCircle className="w-3 h-3" />
            منتهي
          </span>
        );
      default:
        return null;
    }
  }

  const filteredListings = listings.filter(listing => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return listing.status === "approved";
    if (activeTab === "hidden") return listing.status === "hidden";
    if (activeTab === "pending") return listing.status === "pending" || listing.status === "rejected";
    return true;
  });

  const counts = {
    all: listings.length,
    active: listings.filter(l => l.status === "approved").length,
    hidden: listings.filter(l => l.status === "hidden").length,
    pending: listings.filter(l => l.status === "pending" || l.status === "rejected").length,
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-white">إعلاناتي</h1>
            <p className="text-white/70 text-sm mt-1">إدارة جميع إعلاناتك العقارية</p>
          </div>
          <Link
            href="/listings/new"
            className="flex items-center justify-center gap-2 bg-[#D4AF37] text-[#002845] font-bold px-6 py-3 rounded-full hover:bg-[#e5c868] shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            إضافة إعلان جديد
          </Link>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-1 mb-6 flex flex-wrap gap-1">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "all" 
                ? "bg-white text-[#002845] shadow-sm" 
                : "text-white hover:bg-white/10"
            }`}
          >
            الكل ({counts.all})
          </button>
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "active" 
                ? "bg-white text-[#002845] shadow-sm" 
                : "text-white hover:bg-white/10"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              نشط ({counts.active})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("hidden")}
            className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "hidden" 
                ? "bg-white text-[#002845] shadow-sm" 
                : "text-white hover:bg-white/10"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <EyeOff className="w-4 h-4 text-red-400" />
              مخفي ({counts.hidden})
            </span>
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex-1 min-w-[100px] py-2 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === "pending" 
                ? "bg-white text-[#002845] shadow-sm" 
                : "text-white hover:bg-white/10"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-yellow-400" />
              قيد المراجعة ({counts.pending})
            </span>
          </button>
        </div>

        {filteredListings.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-lg">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              {activeTab === "hidden" ? (
                <EyeOff className="w-10 h-10 text-slate-400" />
              ) : activeTab === "pending" ? (
                <Clock className="w-10 h-10 text-slate-400" />
              ) : (
                <Plus className="w-10 h-10 text-slate-400" />
              )}
            </div>
            <h3 className="text-lg font-bold text-[#002845] mb-2">
              {activeTab === "hidden" 
                ? "لا توجد إعلانات مخفية" 
                : activeTab === "pending"
                ? "لا توجد إعلانات قيد المراجعة"
                : activeTab === "active"
                ? "لا توجد إعلانات نشطة"
                : "لا يوجد لديك إعلانات"
              }
            </h3>
            <p className="text-slate-600 mb-6">
              {activeTab === "hidden" 
                ? "الإعلانات التي تخفيها ستظهر هنا ويمكنك إعادة نشرها في أي وقت"
                : activeTab === "pending"
                ? "الإعلانات الجديدة تظهر هنا حتى تتم مراجعتها"
                : "ابدأ بإضافة إعلانك العقاري الأول"
              }
            </p>
            {activeTab === "all" && (
              <Link
                href="/listings/new"
                className="inline-flex items-center gap-2 bg-[#002845] text-white font-bold px-6 py-3 rounded-full hover:bg-[#01375e] shadow-lg"
              >
                <Plus className="w-5 h-5" />
                إضافة إعلان جديد
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredListings.map((listing) => (
              <div
                key={listing.id}
                className={`bg-white rounded-2xl overflow-hidden shadow-lg border-2 transition-all ${
                  listing.status === "hidden" 
                    ? "border-red-200 opacity-80" 
                    : listing.status === "pending"
                    ? "border-yellow-200"
                    : "border-transparent"
                }`}
              >
                <div className="relative h-48">
                  <Image
                    src={getImageUrl(listing.image_url) || `/images/property${(parseInt(listing.id.slice(-2), 16) % 10) + 1}.jpg`}
                    alt={listing.title}
                    fill
                    className={`object-cover ${listing.status === "hidden" ? "grayscale" : ""}`}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.src = "/images/property1.jpg";
                    }}
                  />
                  
                  {listing.status === "hidden" && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="bg-red-500 text-white px-4 py-2 rounded-full font-bold flex items-center gap-2">
                        <EyeOff className="w-5 h-5" />
                        مخفي من العرض
                      </span>
                    </div>
                  )}
                  
                  <div className="absolute top-3 right-3">
                    {getStatusBadge(listing.status)}
                  </div>
                  
                  {listing.type && (
                    <span className="absolute bottom-3 right-3 bg-[#002845]/80 text-white text-xs px-3 py-1 rounded-full">
                      {listing.type}
                    </span>
                  )}

                  <div className="absolute top-3 left-3">
                    <div className="relative">
                      <button
                        onClick={() => setActionMenu(actionMenu === listing.id ? null : listing.id)}
                        className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-all"
                        title="خيارات"
                      >
                        <MoreVertical className="w-4 h-4 text-[#002845]" />
                      </button>
                      
                      {actionMenu === listing.id && (
                        <div className="absolute left-0 top-full mt-2 bg-white rounded-xl shadow-xl border z-10 min-w-[160px] overflow-hidden">
                          <Link
                            href={`/listing/${listing.id}`}
                            className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            عرض الإعلان
                          </Link>
                          <Link
                            href={`/edit-listing/${listing.id}`}
                            className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm"
                          >
                            <Edit className="w-4 h-4" />
                            تعديل
                          </Link>
                          <button
                            onClick={() => setConfirmAction({ id: listing.id, action: "toggle" })}
                            className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 text-slate-700 text-sm w-full"
                          >
                            {listing.status === "hidden" ? (
                              <>
                                <RotateCcw className="w-4 h-4 text-green-600" />
                                <span className="text-green-600">إعادة النشر</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-4 h-4 text-orange-600" />
                                <span className="text-orange-600">إخفاء</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmAction({ id: listing.id, action: "delete" })}
                            className="flex items-center gap-2 px-4 py-3 hover:bg-red-50 text-red-600 text-sm w-full border-t"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف نهائي
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-bold text-[#002845] line-clamp-1">{listing.title}</h3>

                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {listing.city}{listing.district ? ` - ${listing.district}` : ""}
                  </p>

                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {listing.land_area && (
                      <span className="flex items-center gap-1">
                        <Square className="w-3 h-3" />
                        {listing.land_area} م²
                      </span>
                    )}
                    {listing.bedrooms && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="w-3 h-3" />
                        {listing.bedrooms} غرف
                      </span>
                    )}
                    {listing.bathrooms && (
                      <span className="flex items-center gap-1">
                        <Bath className="w-3 h-3" />
                        {listing.bathrooms}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="font-extrabold text-[#002845]">
                      {listing.price?.toLocaleString()} ريال
                    </span>
                    <div className="flex gap-2">
                      {isBusinessPlan && listing.status === "approved" && (
                        <Link
                          href={`/elite-booking?propertyId=${listing.id}`}
                          className="group relative p-2 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-lg hover:from-amber-400 hover:to-yellow-400 transition-all border border-amber-300"
                        >
                          <Crown className="w-4 h-4 text-amber-600 group-hover:text-white" />
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">
                            حجز في النخبة
                          </span>
                        </Link>
                      )}
                      <Link
                        href={`/listing/${listing.id}`}
                        className="group relative p-2 bg-slate-100 rounded-lg hover:bg-[#002845] transition-all"
                      >
                        <Eye className="w-4 h-4 text-[#002845] group-hover:text-white" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#002845] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">
                          عرض الإعلان
                        </span>
                      </Link>
                      <Link
                        href={`/edit-listing/${listing.id}`}
                        className="group relative p-2 bg-slate-100 rounded-lg hover:bg-[#D4AF37] transition-all"
                      >
                        <Edit className="w-4 h-4 text-[#002845] group-hover:text-white" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#002845] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">
                          تعديل الإعلان
                        </span>
                      </Link>
                      <button
                        onClick={() => toggleVisibility(listing.id, listing.status || "")}
                        className={`group relative p-2 rounded-lg transition-all ${
                          listing.status === "hidden"
                            ? "bg-green-100 hover:bg-green-500"
                            : "bg-slate-100 hover:bg-orange-500"
                        }`}
                      >
                        {listing.status === "hidden" ? (
                          <RotateCcw className="w-4 h-4 text-green-600 group-hover:text-white" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-[#002845] group-hover:text-white" />
                        )}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#002845] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">
                          {listing.status === "hidden" ? "إعادة النشر" : "إخفاء الإعلان"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {listing.created_at && (
                    <p className="text-xs text-slate-400 pt-1">
                      تم النشر: {new Date(listing.created_at).toLocaleDateString("ar-SA")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmAction && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setConfirmAction(null)}
        >
          <div 
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmAction.action === "delete" ? "bg-red-100" : "bg-orange-100"
            }`}>
              {confirmAction.action === "delete" ? (
                <Trash2 className="w-8 h-8 text-red-500" />
              ) : (
                <EyeOff className="w-8 h-8 text-orange-500" />
              )}
            </div>
            <h3 className="text-lg font-bold text-center text-[#002845] mb-2">
              {confirmAction.action === "delete" 
                ? "هل أنت متأكد من الحذف؟" 
                : listings.find(l => l.id === confirmAction.id)?.status === "hidden"
                ? "إعادة نشر الإعلان؟"
                : "إخفاء الإعلان؟"
              }
            </h3>
            <p className="text-slate-600 text-center text-sm mb-6">
              {confirmAction.action === "delete" 
                ? "لا يمكن التراجع عن هذا الإجراء وسيتم حذف الإعلان نهائياً"
                : listings.find(l => l.id === confirmAction.id)?.status === "hidden"
                ? "سيظهر الإعلان مجدداً للجميع ويمكنك إخفاءه لاحقاً"
                : "سيختفي الإعلان من العرض العام ويمكنك إعادة نشره لاحقاً"
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  const listing = listings.find(l => l.id === confirmAction.id);
                  if (confirmAction.action === "delete") {
                    deleteListing(confirmAction.id);
                  } else {
                    toggleVisibility(confirmAction.id, listing?.status || "");
                  }
                }}
                className={`flex-1 py-3 rounded-xl font-medium text-white ${
                  confirmAction.action === "delete" 
                    ? "bg-red-500 hover:bg-red-600" 
                    : "bg-[#002845] hover:bg-[#01375e]"
                }`}
              >
                {confirmAction.action === "delete" ? "نعم، احذف" : "نعم، تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionMenu && (
        <div 
          className="fixed inset-0 z-[5]"
          onClick={() => setActionMenu(null)}
        />
      )}
    </div>
  );
}
