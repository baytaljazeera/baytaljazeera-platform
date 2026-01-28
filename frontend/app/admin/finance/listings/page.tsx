"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { FileText, Search, Plus, Trash2, Eye, EyeOff, RefreshCw, MapPin, Home, Check, X, Loader2, Image as ImageIcon, Video, ChevronLeft, ChevronRight, Clock, DollarSign, Maximize2, User, Mail, Phone, Crown } from "lucide-react";
import Link from "next/link";
import { getImageUrl } from "@/lib/imageUrl";

interface MediaItem {
  id: string;
  url: string;
  kind?: string;
  is_cover?: boolean;
  sort_order?: number;
}

interface Listing {
  id: string;
  title: string;
  description?: string;
  city: string;
  district: string;
  price: number;
  land_area: number;
  building_area?: number;
  bedrooms: number;
  bathrooms: number;
  type: string;
  purpose?: string;
  status: string;
  images?: string[] | MediaItem[];
  video_url?: string;
  videos?: string[] | MediaItem[];
  created_at: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  rejection_reason?: string;
  reviewer_name?: string;
  reviewed_at?: string;
  direction?: string;
  property_age?: number;
  floor_number?: number;
  parking_spaces?: number;
}

interface Stats {
  total: number;
  pending: number;
  in_review: number;
  approved: number;
  rejected: number;
  hidden: number;
  cities: number;
}

// Helper functions
const getListingImages = (listing: Listing): string[] => {
  if (!listing.images || listing.images.length === 0) {
    return ["/images/property1.jpg"];
  }
  if (Array.isArray(listing.images)) {
    return listing.images.map((img: any) => {
      if (typeof img === "string") return getImageUrl(img);
      if (img.url) return getImageUrl(img.url);
      return "/images/property1.jpg";
    });
  }
  return ["/images/property1.jpg"];
};

const formatPrice = (price: number): string => {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-red-100", text: "text-red-700", label: "جديد" },
  in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "قيد المراجعة" },
  approved: { bg: "bg-green-100", text: "text-green-700", label: "مقبول" },
  rejected: { bg: "bg-slate-100", text: "text-slate-600", label: "مرفوض" },
  hidden: { bg: "bg-slate-100", text: "text-slate-600", label: "مخفي" },
  expired: { bg: "bg-slate-100", text: "text-slate-600", label: "منتهي" },
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, in_review: 0, approved: 0, rejected: 0, hidden: 0, cities: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmModal, setConfirmModal] = useState<{ action: string; id: string; title: string } | null>(null);
  const [elitePendingCount, setElitePendingCount] = useState(0);
  const [reviewModal, setReviewModal] = useState<Listing | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [deleteMediaModal, setDeleteMediaModal] = useState<{ listingId: string; mediaId: string; url: string; type: 'image' | 'video' } | null>(null);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const url = statusFilter === "all" ? "/api/admin/listings" : `/api/admin/listings?status=${statusFilter}`;
      const res = await fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
      }
    } catch (error) {
      console.error("Error fetching listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/admin/listings/stats`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchElitePendingCount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/elite-slots/pending-count`);
      if (res.ok) {
        const data = await res.json();
        setElitePendingCount(data.count || 0);
      }
    } catch (error) {
      console.error("Error fetching elite pending count:", error);
    }
  };

  const openReviewModal = async (listingId: string) => {
    setReviewLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${listingId}`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReviewModal(data.listing);
        setCurrentImageIndex(0);
      } else {
        setMessage({ type: "error", text: "فشل في تحميل تفاصيل الإعلان" });
      }
    } catch (error) {
      console.error("Error fetching listing details:", error);
      setMessage({ type: "error", text: "حدث خطأ أثناء تحميل التفاصيل" });
    } finally {
      setReviewLoading(false);
    }
  };

  const openDeleteMediaModal = (listingId: string, mediaId: string, url: string, type: 'image' | 'video' = 'image') => {
    setDeleteMediaModal({ listingId, mediaId, url, type });
  };

  const handleDeleteMedia = async () => {
    if (!deleteMediaModal) return;
    const { listingId, mediaId } = deleteMediaModal;
    
    setDeletingMediaId(mediaId);
    setDeleteMediaModal(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${listingId}/media/${mediaId}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage({ type: "success", text: data.message || "تم حذف الصورة بنجاح" });
        if (reviewModal) {
          const updatedImages = data.images || [];
          const updatedVideos = data.videos || [];
          setReviewModal({ 
            ...reviewModal, 
            images: updatedImages,
            videos: updatedVideos 
          });
          if (currentImageIndex >= updatedImages.length && currentImageIndex > 0) {
            setCurrentImageIndex(currentImageIndex - 1);
          }
        }
        fetchListings();
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "فشل في حذف الصورة" });
      }
    } catch (error) {
      console.error("Error deleting media:", error);
      setMessage({ type: "error", text: "حدث خطأ أثناء حذف الصورة" });
    } finally {
      setDeletingMediaId(null);
    }
  };

  useEffect(() => {
    fetchListings();
    fetchStats();
    fetchElitePendingCount();
  }, [statusFilter]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
        if (selectedListing?.id === id) {
          setSelectedListing({ ...selectedListing, status: "approved" });
        }
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}/reject`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
        setRejectModal(null);
        setRejectReason("");
        if (selectedListing?.id === id) {
          setSelectedListing({ ...selectedListing, status: "rejected" });
        }
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleHide = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}/hide`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleShow = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}/show`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleInReview = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}/in-review`, {
        method: "PATCH",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
        if (selectedListing?.id === id) {
          setSelectedListing({ ...selectedListing, status: "in_review" });
        }
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/listings/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: data.message });
        fetchListings();
        fetchStats();
        if (selectedListing?.id === id) {
          setSelectedListing(null);
        }
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: "حدث خطأ" });
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const filteredListings = listings.filter((l) => {
    const matchesSearch =
      l.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.owner_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ar-SA").format(price) + " ريال";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getListingImages = (listing: Listing): string[] => {
    if (listing.images && listing.images.length > 0) {
      if (typeof listing.images[0] === 'string') {
        return (listing.images as string[]).map(url => getImageUrl(url));
      }
      return (listing.images as MediaItem[]).map(img => getImageUrl(img.url));
    }
    return [`/images/property${(parseInt(listing.id.slice(-1), 16) % 5) + 1}.jpg`];
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg ${
          message.type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#002845]">إدارة الإعلانات</h1>
          <p className="text-sm text-slate-500 mt-1">عرض وإدارة جميع إعلانات العقارات</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/elite-slots"
            className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition font-semibold shadow-lg"
          >
            <Crown className="w-4 h-4" />
            ✈️ نخبة الإعلانات
            {elitePendingCount > 0 && (
              <span className="absolute -top-2 -left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center animate-pulse">
                {elitePendingCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => { fetchListings(); fetchStats(); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
            تحديث
          </button>
          <Link
            href="/listings/new"
            className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#002845] rounded-xl hover:bg-[#c9a432] transition font-semibold"
          >
            <Plus className="w-4 h-4" />
            إضافة إعلان
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("all")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#002845]">{stats.total}</p>
              <p className="text-xs text-slate-500">إجمالي الإعلانات</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("pending")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{stats.pending}</p>
              <p className="text-xs text-slate-500">جديد</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("in_review")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Eye className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.in_review || 0}</p>
              <p className="text-xs text-slate-500">قيد المراجعة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("approved")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-xs text-slate-500">مقبولة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("rejected")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <X className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-600">{stats.rejected}</p>
              <p className="text-xs text-slate-500">غير مقبولة</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-orange-200 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => setStatusFilter("hidden")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <EyeOff className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{stats.hidden}</p>
              <p className="text-xs text-slate-500">مخفي</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <Home className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{stats.cities}</p>
              <p className="text-xs text-slate-500">مدن</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                statusFilter === "all" ? "bg-[#002845] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              الكل ({stats.total})
            </button>
            {Object.entries(statusColors).map(([key, value]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  statusFilter === key ? `${value.bg} ${value.text}` : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {value.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="بحث عن عقار..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 pl-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37] w-64"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37] mx-auto" />
            <p className="text-slate-500 mt-3 text-sm">جاري التحميل...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">لا توجد إعلانات</p>
          </div>
        ) : (
          <>
            {/* Mobile: Card View */}
            <div className="md:hidden grid grid-cols-1 gap-4">
              {filteredListings.map((listing) => (
                <div key={listing.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="relative h-48 bg-slate-100">
                    <img
                      src={getListingImages(listing)[0]}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/images/property1.jpg"; }}
                    />
                    <div className="absolute top-3 right-3 flex flex-wrap gap-2">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[listing.status]?.bg} ${statusColors[listing.status]?.text}`}>
                        {statusColors[listing.status]?.label}
                      </span>
                      {listing.video_url && (
                        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                          <Video className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    {listing.images && listing.images.length > 1 && (
                      <div className="absolute bottom-3 left-3 bg-black/70 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {listing.images.length}
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-bold text-[#002845] mb-1 text-base">{listing.title}</h3>
                      <p className="text-sm text-slate-600 flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        {listing.city} - {listing.district}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-[#D4AF37]">{formatPrice(listing.price)}</span>
                      <span className="text-sm text-slate-500 flex items-center gap-1">
                        <Maximize2 className="w-4 h-4" />
                        {listing.land_area} م²
                      </span>
                      {listing.bedrooms && (
                        <span className="text-sm text-slate-500">{listing.bedrooms} غرف</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(listing.created_at)}
                      </span>
                      <span>#{listing.id.slice(0, 8)}</span>
                    </div>
                    {listing.rejection_reason && (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                        <p className="text-xs text-red-600 mb-1 font-medium">سبب الرفض:</p>
                        <p className="text-sm text-red-800">{listing.rejection_reason}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => openReviewModal(listing.id)}
                        disabled={reviewLoading}
                        className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition text-sm font-medium touch-manipulation"
                      >
                        {reviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        <span className="hidden sm:inline">مراجعة</span>
                      </button>
                      {listing.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(listing.id)}
                            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium touch-manipulation"
                          >
                            <Check className="w-4 h-4" />
                            <span className="hidden sm:inline">موافقة</span>
                          </button>
                          <button
                            onClick={() => setRejectModal(listing.id)}
                            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium touch-manipulation"
                          >
                            <X className="w-4 h-4" />
                            <span className="hidden sm:inline">رفض</span>
                          </button>
                        </>
                      )}
                      {listing.status === "approved" && (
                        <button
                          onClick={() => handleHide(listing.id)}
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 bg-yellow-100 text-yellow-700 rounded-xl hover:bg-yellow-200 transition text-sm font-medium touch-manipulation"
                        >
                          <EyeOff className="w-4 h-4" />
                          <span className="hidden sm:inline">إخفاء</span>
                        </button>
                      )}
                      {listing.status === "hidden" && (
                        <button
                          onClick={() => handleShow(listing.id)}
                          className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium touch-manipulation"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden sm:inline">إظهار</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: List View */}
            <div className="hidden md:block divide-y divide-slate-100">
              {filteredListings.map((listing) => (
                <div key={listing.id} className="p-5 hover:bg-slate-50 transition">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[listing.status]?.bg} ${statusColors[listing.status]?.text}`}>
                          {statusColors[listing.status]?.label}
                        </span>
                        <span className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs">
                          {listing.type || "عقار"}
                        </span>
                        <span className="text-xs text-slate-400">#{listing.id.slice(0, 8)}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(listing.created_at)}
                      </span>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 relative">
                        <img
                          src={getListingImages(listing)[0]}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/images/property1.jpg"; }}
                        />
                        {listing.video_url && (
                          <div className="absolute bottom-1 right-1 bg-red-500 text-white px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                            <Video className="w-3 h-3" />
                          </div>
                        )}
                        {listing.images && listing.images.length > 1 && (
                          <div className="absolute bottom-1 left-1 bg-black/70 text-white px-1.5 py-0.5 rounded text-xs flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />
                            {listing.images.length}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-[#002845] mb-2">{listing.title}</h3>
                        <p className="text-sm text-slate-600 flex items-center gap-1">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          {listing.city} - {listing.district}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-lg font-bold text-[#D4AF37]">{formatPrice(listing.price)}</span>
                          <span className="text-sm text-slate-500 flex items-center gap-1">
                            <Maximize2 className="w-4 h-4" />
                            {listing.land_area} م²
                          </span>
                          <span className="text-sm text-slate-500">{listing.bedrooms} غرف</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm">
                      {listing.owner_name && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <User className="w-4 h-4 text-slate-400" />
                          <span>{listing.owner_name}</span>
                        </div>
                      )}
                      {listing.owner_phone && (
                        <a href={`tel:${listing.owner_phone}`} className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition">
                          <Phone className="w-4 h-4" />
                          <span dir="ltr">{listing.owner_phone}</span>
                        </a>
                      )}
                    </div>

                    {listing.rejection_reason && (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                        <p className="text-xs text-red-600 mb-1 font-medium">سبب الرفض:</p>
                        <p className="text-sm text-red-800">{listing.rejection_reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex md:flex-col gap-2 md:w-44">
                    {actionLoading === listing.id ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => openReviewModal(listing.id)}
                          disabled={reviewLoading}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition text-sm font-medium"
                        >
                          {reviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                          مراجعة تفصيلية
                        </button>
                        {listing.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleApprove(listing.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <Check className="w-4 h-4" />
                              موافقة
                            </button>
                            <button
                              onClick={() => handleInReview(listing.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition text-sm font-medium"
                            >
                              <Eye className="w-4 h-4" />
                              قيد المراجعة
                            </button>
                            <button
                              onClick={() => setRejectModal(listing.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                            >
                              <X className="w-4 h-4" />
                              رفض
                            </button>
                          </>
                        )}
                        {listing.status === "in_review" && (
                          <>
                            <button
                              onClick={() => handleApprove(listing.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                            >
                              <Check className="w-4 h-4" />
                              موافقة
                            </button>
                            <button
                              onClick={() => setRejectModal(listing.id)}
                              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition text-sm font-medium"
                            >
                              <X className="w-4 h-4" />
                              رفض
                            </button>
                          </>
                        )}
                        {listing.status === "approved" && (
                          <button
                            onClick={() => handleHide(listing.id)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-100 text-yellow-700 rounded-xl hover:bg-yellow-200 transition text-sm font-medium"
                          >
                            <EyeOff className="w-4 h-4" />
                            إخفاء
                          </button>
                        )}
                        {listing.status === "hidden" && (
                          <button
                            onClick={() => handleShow(listing.id)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                          >
                            <Eye className="w-4 h-4" />
                            إظهار
                          </button>
                        )}
                        {listing.status === "rejected" && (
                          <button
                            onClick={() => handleApprove(listing.id)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 transition text-sm font-medium"
                          >
                            <Check className="w-4 h-4" />
                            موافقة
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmModal({ action: "delete", id: listing.id, title: listing.title })}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition text-sm font-medium"
                        >
                          <Trash2 className="w-4 h-4" />
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-bold text-[#002845] mb-4">رفض الإعلان</h3>
            <div className="mb-4">
              <label className="block text-sm text-slate-600 mb-2">سبب الرفض (اختياري)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اكتب سبب الرفض هنا..."
                className="w-full p-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleReject(rejectModal)}
                disabled={actionLoading === rejectModal}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                {actionLoading === rejectModal ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "تأكيد الرفض"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-lg font-bold text-[#002845]">مراجعة تفصيلية</h3>
                <p className="text-sm text-slate-500">فحص الإعلان قبل القبول أو الرفض</p>
              </div>
              <button
                onClick={() => setReviewModal(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[reviewModal.status]?.bg} ${statusColors[reviewModal.status]?.text}`}>
                    {statusColors[reviewModal.status]?.label}
                  </span>
                  <span className="text-sm text-slate-400">#{reviewModal.id.slice(0, 8)}</span>
                </div>
                <h2 className="text-xl font-bold text-[#002845] mb-2">{reviewModal.title}</h2>
                <p className="text-slate-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {reviewModal.city} - {reviewModal.district}
                </p>
              </div>

              <div className="mb-6">
                <h4 className="font-bold text-[#002845] mb-3 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  الصور ({(reviewModal.images as MediaItem[])?.length || 0})
                </h4>
                {(reviewModal.images as MediaItem[])?.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {(reviewModal.images as MediaItem[]).map((img, idx) => (
                      <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100">
                        <img
                          src={getImageUrl(img.url)}
                          alt={`صورة ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/images/property1.jpg"; }}
                        />
                        {img.is_cover && (
                          <span className="absolute top-2 right-2 bg-[#D4AF37] text-white text-xs px-2 py-1 rounded-full">
                            غلاف
                          </span>
                        )}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <button
                            onClick={() => openDeleteMediaModal(reviewModal.id, img.id, img.url, 'image')}
                            disabled={deletingMediaId === img.id}
                            className="bg-red-500/90 hover:bg-red-600 text-white p-3 rounded-full transition shadow-lg backdrop-blur-sm disabled:opacity-50"
                            title="حذف الصورة"
                          >
                            {deletingMediaId === img.id ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Trash2 className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">لا توجد صور</p>
                )}
              </div>

              <div className="mb-6">
                <h4 className="font-bold text-[#002845] mb-3 flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  الفيديوهات ({(reviewModal.videos as MediaItem[])?.length || 0})
                </h4>
                {(reviewModal.videos as MediaItem[])?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(reviewModal.videos as MediaItem[]).map((vid, idx) => (
                      <div key={vid.id} className="relative group rounded-xl overflow-hidden bg-slate-900 aspect-video">
                        <video
                          src={vid.url.startsWith('/') ? `/api${vid.url}` : vid.url}
                          controls
                          className="w-full h-full object-contain"
                          preload="metadata"
                        >
                          متصفحك لا يدعم تشغيل الفيديو
                        </video>
                        <div className="absolute top-2 left-2 flex gap-2">
                          <span className="bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                            فيديو {idx + 1}
                          </span>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openDeleteMediaModal(reviewModal.id, vid.id, vid.url, 'video')}
                            disabled={deletingMediaId === vid.id}
                            className="bg-red-500/90 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-2"
                          >
                            {deletingMediaId === vid.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4" />
                                حذف الفيديو
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">لا توجد فيديوهات</p>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-slate-50 rounded-xl p-4">
                  <h4 className="font-bold text-[#002845] mb-3">تفاصيل العقار</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">النوع:</span><span className="font-medium">{reviewModal.type || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">الغرض:</span><span className="font-medium">{reviewModal.purpose || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">السعر:</span><span className="font-medium text-[#D4AF37]">{formatPrice(reviewModal.price)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">مساحة الأرض:</span><span className="font-medium">{reviewModal.land_area} م²</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">مساحة البناء:</span><span className="font-medium">{reviewModal.building_area || "-"} م²</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">غرف النوم:</span><span className="font-medium">{reviewModal.bedrooms}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">الحمامات:</span><span className="font-medium">{reviewModal.bathrooms}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">الاتجاه:</span><span className="font-medium">{reviewModal.direction || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">عمر العقار:</span><span className="font-medium">{reviewModal.property_age || "-"} سنة</span></div>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4">
                  <h4 className="font-bold text-[#002845] mb-3">معلومات المعلن</h4>
                  <div className="space-y-3">
                    {reviewModal.owner_name && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span>{reviewModal.owner_name}</span>
                      </div>
                    )}
                    {reviewModal.owner_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{reviewModal.owner_email}</span>
                      </div>
                    )}
                    {reviewModal.owner_phone && (
                      <a href={`tel:${reviewModal.owner_phone}`} className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37]">
                        <Phone className="w-4 h-4" />
                        <span dir="ltr">{reviewModal.owner_phone}</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {reviewModal.description && (
                <div className="mb-6">
                  <h4 className="font-bold text-[#002845] mb-2">الوصف</h4>
                  <p className="text-slate-600 text-sm whitespace-pre-line bg-slate-50 rounded-xl p-4">{reviewModal.description}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
                {(reviewModal.status === "pending" || reviewModal.status === "in_review") && (
                  <>
                    <button
                      onClick={() => { handleApprove(reviewModal.id); setReviewModal(null); }}
                      disabled={actionLoading === reviewModal.id}
                      className="flex-1 min-w-[150px] flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition font-medium"
                    >
                      <Check className="w-5 h-5" />
                      قبول الإعلان
                    </button>
                    <button
                      onClick={() => { setReviewModal(null); setRejectModal(reviewModal.id); }}
                      className="flex-1 min-w-[150px] flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition font-medium"
                    >
                      <X className="w-5 h-5" />
                      رفض الإعلان
                    </button>
                  </>
                )}
                <button
                  onClick={() => setReviewModal(null)}
                  className="flex-1 min-w-[150px] px-6 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-[#002845] mb-2">حذف الإعلان</h3>
            <p className="text-slate-600 text-sm mb-4">
              هل أنت متأكد من حذف "{confirmModal.title}"؟ هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDelete(confirmModal.id)}
                disabled={actionLoading === confirmModal.id}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                {actionLoading === confirmModal.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteMediaModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  {deleteMediaModal.type === 'video' ? <Video className="w-6 h-6 text-white" /> : <Trash2 className="w-6 h-6 text-white" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{deleteMediaModal.type === 'video' ? 'حذف الفيديو' : 'حذف الصورة'}</h3>
                  <p className="text-white/80 text-sm">تأكيد الحذف النهائي</p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-4 rounded-xl overflow-hidden border-2 border-red-100 shadow-inner bg-slate-900">
                {deleteMediaModal.type === 'video' ? (
                  <video
                    src={deleteMediaModal.url.startsWith('/') ? `/api${deleteMediaModal.url}` : deleteMediaModal.url}
                    controls
                    className="w-full h-40 object-contain"
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={deleteMediaModal.url.startsWith('/') ? `/api${deleteMediaModal.url}` : deleteMediaModal.url}
                    alt="الصورة المراد حذفها"
                    className="w-full h-40 object-cover"
                  />
                )}
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-800 mb-1">هل أنت متأكد؟</p>
                    <p className="text-red-600 text-sm">
                      {deleteMediaModal.type === 'video' 
                        ? 'سيتم حذف هذا الفيديو نهائياً ولا يمكن استرجاعه.'
                        : 'سيتم حذف هذه الصورة نهائياً ولا يمكن استرجاعها.'}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteMediaModal(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-medium"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleDeleteMedia}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition font-medium shadow-lg shadow-red-500/25 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {deleteMediaModal.type === 'video' ? 'حذف الفيديو' : 'حذف الصورة'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
