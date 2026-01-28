"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { 
  Building2, Plus, Edit2, Trash2, Eye, EyeOff, 
  MapPin, Calendar, Clock, CheckCircle, XCircle, 
  AlertCircle, Loader2, Home, Search, Filter,
  TrendingUp, Star, Crown, Handshake, Archive, ChevronDown
} from "lucide-react";
import { getImageUrl } from "@/lib/imageUrl";

type EliteReservation = {
  id: string;
  property_id: string;
  tier: string;
  days_remaining: number;
  effective_ends_at: string;
  status: string;
  pending_extension_count: number;
};

type Listing = {
  id: string;
  title: string;
  property_type: string;
  purpose: string;
  city: string;
  district: string;
  price: number;
  status: string;
  deal_status?: string;
  created_at: string;
  expires_at: string | null;
  is_featured: boolean;
  cover_image: string | null;
  image_url: string | null;
  images: string[] | null;
  land_area: number | null;
  building_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  elite_reservation?: EliteReservation;
};

const dealStatusConfig: Record<string, { label: string; color: string; icon: any; bgColor: string }> = {
  active: { label: "نشط", color: "text-emerald-600", icon: CheckCircle, bgColor: "bg-emerald-500" },
  negotiating: { label: "قيد التفاوض", color: "text-amber-600", icon: Handshake, bgColor: "bg-amber-500" },
  sold: { label: "تمت الصفقة", color: "text-blue-600", icon: CheckCircle, bgColor: "bg-blue-500" },
  rented: { label: "تم التأجير", color: "text-blue-600", icon: CheckCircle, bgColor: "bg-blue-500" },
  archived: { label: "مؤرشف", color: "text-gray-500", icon: Archive, bgColor: "bg-gray-500" },
};

const statusConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  pending: { label: "قيد المراجعة", color: "text-amber-600", icon: Clock, bg: "bg-amber-50 border-amber-200" },
  approved: { label: "نشط", color: "text-emerald-600", icon: CheckCircle, bg: "bg-emerald-50 border-emerald-200" },
  rejected: { label: "غير مقبول", color: "text-red-600", icon: XCircle, bg: "bg-red-50 border-red-200" },
  hidden: { label: "مخفي", color: "text-slate-500", icon: EyeOff, bg: "bg-slate-50 border-slate-200" },
  expired: { label: "منتهي", color: "text-gray-500", icon: AlertCircle, bg: "bg-gray-50 border-gray-200" },
};

export default function MyListingsPage() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; listing: Listing | null }>({ open: false, listing: null });
  const [openDealDropdown, setOpenDealDropdown] = useState<string | null>(null);
  const [updatingDealStatus, setUpdatingDealStatus] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState<string | null>(null);
  const [hideConfirmModal, setHideConfirmModal] = useState<{ open: boolean; listing: Listing | null }>({ open: false, listing: null });
  const [showConfirmModal, setShowConfirmModal] = useState<{ open: boolean; listing: Listing | null }>({ open: false, listing: null });

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (openDealDropdown && !(e.target as Element).closest('.deal-status-dropdown')) {
        setOpenDealDropdown(null);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDealDropdown]);

  async function fetchListings() {
    try {
      const token = localStorage.getItem("token");
      
      const [listingsRes, eliteRes] = await Promise.all([
        fetch(`${API_URL}/api/account/my-listings`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch(`${API_URL}/api/elite-slots/my-reservations`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).catch(() => null)
      ]);

      if (!listingsRes.ok) {
        if (listingsRes.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("فشل في جلب الإعلانات");
      }

      const listingsData = await listingsRes.json();
      let listingsWithElite = listingsData.listings || [];
      
      if (eliteRes && eliteRes.ok) {
        const eliteData = await eliteRes.json();
        const eliteReservations: EliteReservation[] = eliteData.reservations || [];
        
        listingsWithElite = listingsWithElite.map((listing: Listing) => {
          const eliteReservation = eliteReservations.find(
            (r) => r.property_id === String(listing.id)
          );
          return { ...listing, elite_reservation: eliteReservation };
        });
      }
      
      setListings(listingsWithElite);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openDeleteModal(listing: Listing) {
    setDeleteModal({ open: true, listing });
  }

  function closeDeleteModal() {
    setDeleteModal({ open: false, listing: null });
  }

  async function confirmDelete() {
    const listing = deleteModal.listing;
    if (!listing) return;

    setDeleting(listing.id);
    closeDeleteModal();
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/listings/${listing.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "فشل في حذف الإعلان");
      }

      setListings(prev => prev.filter(l => l.id !== listing.id));
      toast.success('تم حذف الإعلان بنجاح');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDealStatusChange(id: string, newStatus: string, purpose: string) {
    setUpdatingDealStatus(id);
    setOpenDealDropdown(null);
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/listings/${id}/deal-status`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ dealStatus: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل في تحديث حالة الصفقة");
      }

      setListings(prev => prev.map(l => 
        l.id === id ? { ...l, deal_status: newStatus } : l
      ));
      toast.success('تم تحديث حالة الصفقة');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingDealStatus(null);
    }
  }

  function openHideConfirmModal(listing: Listing) {
    setHideConfirmModal({ open: true, listing });
  }

  function closeHideConfirmModal() {
    setHideConfirmModal({ open: false, listing: null });
  }

  function openShowConfirmModal(listing: Listing) {
    setShowConfirmModal({ open: true, listing });
  }

  function closeShowConfirmModal() {
    setShowConfirmModal({ open: false, listing: null });
  }

  async function confirmHide() {
    const listing = hideConfirmModal.listing;
    if (!listing) return;
    
    closeHideConfirmModal();
    await performVisibilityChange(listing.id, listing.status);
  }

  async function confirmShow() {
    const listing = showConfirmModal.listing;
    if (!listing) return;
    
    closeShowConfirmModal();
    await performVisibilityChange(listing.id, listing.status);
  }

  async function performVisibilityChange(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'hidden' ? 'approved' : 'hidden';
    const actionText = newStatus === 'hidden' ? 'إخفاء' : 'إظهار';
    
    setUpdatingVisibility(id);
    
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/listings/${id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `فشل في ${actionText} الإعلان`);
      }

      const data = await res.json();
      
      setListings(prev => prev.map(l => 
        l.id === id ? { ...l, status: newStatus, elite_reservation: newStatus === 'hidden' ? undefined : l.elite_reservation } : l
      ));
      
      if (data.eliteReleased) {
        toast.success('تم إخفاء الإعلان وتحرير موقع النخبة', { duration: 4000 });
      } else {
        toast.success(newStatus === 'hidden' ? 'تم إخفاء الإعلان' : 'تم إظهار الإعلان');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingVisibility(null);
    }
  }

  function getDealStatusOptions(purpose: string) {
    const baseOptions = [
      { key: 'active', label: 'نشط' },
      { key: 'negotiating', label: 'قيد التفاوض' },
    ];
    
    if (purpose === 'للبيع') {
      baseOptions.push({ key: 'sold', label: 'تم البيع' });
    } else {
      baseOptions.push({ key: 'rented', label: 'تم التأجير' });
    }
    
    baseOptions.push({ key: 'archived', label: 'أرشفة' });
    return baseOptions;
  }

  const filteredListings = filter === "all" 
    ? listings 
    : filter === "featured"
    ? listings.filter(l => l.is_featured)
    : listings.filter(l => l.status === filter);

  const stats = {
    total: listings.length,
    active: listings.filter(l => l.status === "approved").length,
    pending: listings.filter(l => l.status === "pending").length,
    featured: listings.filter(l => l.is_featured).length,
  };

  function formatPrice(price: number) {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)} مليون ر.س`;
    }
    return `${price.toLocaleString("en-US")} ر.س`;
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#D4AF37] mx-auto mb-4" />
          <p className="text-slate-600">جاري تحميل إعلاناتك...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold text-[#003366] flex items-center gap-3">
                <Building2 className="w-8 h-8 text-[#D4AF37]" />
                إعلاناتي
              </h1>
              <p className="text-slate-600 mt-1">إدارة جميع إعلاناتك العقارية</p>
            </div>
            
            <Link
              href="/listings/new"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#f4c365] hover:from-[#f4c365] hover:to-[#D4AF37] text-[#003366] font-bold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-5 h-5" />
              إضافة إعلان جديد
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilter("all")}
              className={`bg-white rounded-2xl p-4 shadow-lg border cursor-pointer transition-all ${
                filter === "all" ? "ring-2 ring-[#003366] border-[#003366]" : "border-slate-100 hover:border-[#003366]/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#003366]/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-[#003366]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#003366]">{stats.total}</p>
                  <p className="text-sm text-slate-500">إجمالي الإعلانات</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilter("approved")}
              className={`bg-white rounded-2xl p-4 shadow-lg border cursor-pointer transition-all ${
                filter === "approved" ? "ring-2 ring-emerald-500 border-emerald-500" : "border-emerald-100 hover:border-emerald-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
                  <p className="text-sm text-slate-500">إعلانات نشطة</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilter("pending")}
              className={`bg-white rounded-2xl p-4 shadow-lg border cursor-pointer transition-all ${
                filter === "pending" ? "ring-2 ring-amber-500 border-amber-500" : "border-amber-100 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                  <p className="text-sm text-slate-500">قيد المراجعة</p>
                </div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setFilter("featured")}
              className={`bg-white rounded-2xl p-4 shadow-lg border cursor-pointer transition-all ${
                filter === "featured" ? "ring-2 ring-[#D4AF37] border-[#D4AF37]" : "border-[#D4AF37]/20 hover:border-[#D4AF37]/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#D4AF37]">{stats.featured}</p>
                  <p 
                    className="text-sm text-slate-500 select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    في النخبة
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {[
              { key: "all", label: "الكل" },
              { key: "approved", label: "نشط" },
              { key: "pending", label: "قيد المراجعة" },
              { key: "hidden", label: "مخفي" },
              { key: "rejected", label: "غير مقبول" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  filter === f.key
                    ? "bg-[#003366] text-white shadow-lg"
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
                }`}
              >
                {f.label}
                {f.key !== "all" && (
                  <span className="mr-2 text-xs opacity-70">
                    ({listings.filter(l => l.status === f.key).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {filteredListings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-xl p-12 text-center"
          >
            <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Home className="w-12 h-12 text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-[#003366] mb-2">
              {filter === "all" ? "لا توجد إعلانات بعد" : "لا توجد إعلانات بهذا الفلتر"}
            </h2>
            <p className="text-slate-600 mb-6">
              {filter === "all" 
                ? "ابدأ بإضافة إعلانك الأول لعرضه على المنصة"
                : "جرب فلتر آخر لعرض إعلاناتك"}
            </p>
            {filter === "all" && (
              <Link
                href="/listings/new"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#f4c365] text-[#003366] font-bold px-8 py-4 rounded-xl transition-all hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                إضافة إعلان جديد
              </Link>
            )}
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredListings.map((listing, index) => {
                const status = statusConfig[listing.status] || statusConfig.pending;
                const StatusIcon = status.icon;
                
                return (
                  <motion.div
                    key={listing.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 hover:shadow-xl transition-all group"
                  >
                    <div className="relative h-48 bg-slate-200">
                      {listing.image_url || listing.cover_image ? (
                        <img
                          src={getImageUrl(listing.image_url || listing.cover_image)}
                          alt={listing.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                          <Building2 className="w-16 h-16 text-slate-300" />
                        </div>
                      )}
                      
                      <div className="absolute top-3 right-3 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${status.bg} ${status.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {status.label}
                        </span>
                        
                        {(listing.status === 'approved' || listing.status === 'hidden') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (listing.status === 'approved') {
                                openHideConfirmModal(listing);
                              } else {
                                openShowConfirmModal(listing);
                              }
                            }}
                            disabled={updatingVisibility === listing.id}
                            className={`flex items-center justify-center w-8 h-8 rounded-full backdrop-blur-sm transition-all shadow-lg ${
                              listing.status === 'hidden'
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                : 'bg-white/90 hover:bg-white text-slate-600 hover:text-slate-800'
                            }`}
                            title={listing.status === 'hidden' ? 'إظهار الإعلان' : 'إخفاء الإعلان'}
                          >
                            {updatingVisibility === listing.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : listing.status === 'hidden' ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {(listing.is_featured || listing.elite_reservation) && (
                        <div className="absolute top-3 left-3">
                          {listing.elite_reservation ? (
                            <div className="flex flex-col gap-1">
                              <span 
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#D4AF37] to-[#f4c365] text-[#003366] select-none"
                                onContextMenu={(e) => e.preventDefault()}
                                style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                              >
                                <Crown className="w-3.5 h-3.5" />
                                نخبة
                              </span>
                              {listing.elite_reservation.status === 'confirmed' && (
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold text-center ${
                                  listing.elite_reservation.days_remaining <= 2 
                                    ? 'bg-red-500 text-white animate-pulse' 
                                    : listing.elite_reservation.days_remaining <= 5 
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-white/90 text-gray-700'
                                }`}>
                                  {Math.max(0, Math.ceil(listing.elite_reservation.days_remaining))} يوم متبقي
                                </span>
                              )}
                              {listing.elite_reservation.status === 'pending_approval' && (
                                <span className="px-2 py-1 rounded-lg text-[10px] font-bold text-center bg-amber-500 text-white">
                                  بانتظار الموافقة
                                </span>
                              )}
                            </div>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#D4AF37] to-[#f4c365] text-[#003366] select-none"
                              onContextMenu={(e) => e.preventDefault()}
                              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                            >
                              <Crown className="w-3.5 h-3.5" />
                              نخبة
                            </span>
                          )}
                        </div>
                      )}

                      <div className="absolute bottom-3 right-3">
                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#003366]/90 text-white backdrop-blur-sm">
                          {listing.purpose === "للبيع" ? "للبيع" : "للإيجار"}
                        </span>
                      </div>

                      <div className="absolute bottom-3 left-3 deal-status-dropdown">
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDealDropdown(openDealDropdown === listing.id ? null : listing.id);
                              }}
                              disabled={updatingDealStatus === listing.id}
                              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md transition-all shadow-lg border-2 ${
                                listing.deal_status === 'negotiating' 
                                  ? 'bg-amber-400 border-amber-500 text-amber-900'
                                  : listing.deal_status === 'sold' || listing.deal_status === 'rented'
                                  ? 'bg-blue-400 border-blue-500 text-blue-900'
                                  : listing.deal_status === 'archived'
                                  ? 'bg-gray-400 border-gray-500 text-gray-900'
                                  : 'bg-emerald-400 border-emerald-500 text-emerald-900'
                              } hover:scale-105`}
                            >
                              {updatingDealStatus === listing.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  {(() => {
                                    const DealIcon = dealStatusConfig[listing.deal_status || 'active']?.icon || CheckCircle;
                                    return <DealIcon className="w-4 h-4" />;
                                  })()}
                                </>
                              )}
                              {dealStatusConfig[listing.deal_status || 'active']?.label || 'نشط'}
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            
                            {openDealDropdown === listing.id && (
                              <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border-2 border-slate-200 overflow-hidden min-w-[180px] z-[100]">
                                <div className="p-3 bg-gradient-to-r from-[#003366] to-[#01273C] border-b border-slate-200">
                                  <span className="text-sm font-bold text-white">تغيير حالة الصفقة</span>
                                </div>
                                {getDealStatusOptions(listing.purpose).map((option) => {
                                  const isActive = (listing.deal_status || 'active') === option.key;
                                  const OptionIcon = dealStatusConfig[option.key]?.icon || CheckCircle;
                                  return (
                                    <button
                                      key={option.key}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!isActive) {
                                          handleDealStatusChange(listing.id, option.key, listing.purpose);
                                        }
                                      }}
                                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-all ${
                                        isActive 
                                          ? 'bg-emerald-50 text-emerald-700' 
                                          : 'hover:bg-slate-50 text-slate-700 hover:translate-x-1'
                                      }`}
                                    >
                                      <OptionIcon className={`w-5 h-5 ${dealStatusConfig[option.key]?.color}`} />
                                      {option.label}
                                      {isActive && <CheckCircle className="w-4 h-4 mr-auto text-emerald-500" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-[#003366] text-lg mb-2 line-clamp-1">
                        {listing.title || listing.property_type}
                      </h3>

                      <div className="flex items-center gap-1 text-slate-500 text-sm mb-3">
                        <MapPin className="w-4 h-4" />
                        <span>{listing.district}، {listing.city}</span>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <span className="text-lg font-bold text-[#D4AF37]">
                          {formatPrice(listing.price)}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(listing.created_at)}
                        </span>
                      </div>

                      {(listing.land_area || listing.bedrooms) && (
                        <div className="flex items-center gap-3 text-xs text-slate-500 mb-4 pb-4 border-b border-slate-100">
                          {listing.land_area && (
                            <span className="flex items-center gap-1">
                              📐 {listing.land_area.toLocaleString()} م²
                            </span>
                          )}
                          {listing.bedrooms && (
                            <span className="flex items-center gap-1">
                              🛏️ {listing.bedrooms} غرف
                            </span>
                          )}
                          {listing.bathrooms && (
                            <span className="flex items-center gap-1">
                              🚿 {listing.bathrooms} حمام
                            </span>
                          )}
                        </div>
                      )}

                      {listing.elite_reservation && listing.elite_reservation.status === 'confirmed' && listing.elite_reservation.days_remaining <= 5 && listing.elite_reservation.pending_extension_count === 0 && (
                        <Link
                          href={`/elite-booking/extend?reservation=${listing.elite_reservation.id}`}
                          className="flex items-center justify-center gap-2 w-full mb-3 px-4 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#f4c365] text-[#003366] rounded-xl text-sm font-bold hover:shadow-lg transition"
                        >
                          <Clock className="w-4 h-4" />
                          <span 
                            onContextMenu={(e) => e.preventDefault()}
                            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                          >
                            تمديد النخبة - 30 ريال/يوم
                          </span>
                        </Link>
                      )}
                      
                      {listing.elite_reservation && listing.elite_reservation.pending_extension_count > 0 && (
                        <div className="flex items-center justify-center gap-2 w-full mb-3 px-4 py-2.5 bg-amber-100 text-amber-700 rounded-xl text-sm font-bold">
                          <Clock className="w-4 h-4" />
                          طلب تمديد قيد المراجعة
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/listing/${listing.id}`}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition"
                        >
                          <Eye className="w-4 h-4" />
                          عرض
                        </Link>
                        
                        <Link
                          href={`/edit-listing/${listing.id}`}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] rounded-xl text-sm font-medium transition"
                        >
                          <Edit2 className="w-4 h-4" />
                          تعديل
                        </Link>
                        
                        <button
                          onClick={() => openDeleteModal(listing)}
                          disabled={deleting === listing.id}
                          className="flex items-center justify-center p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition disabled:opacity-50"
                          title="حذف الإعلان"
                        >
                          {deleting === listing.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Show Confirmation Modal (Green) */}
      <AnimatePresence>
        {showConfirmModal.open && showConfirmModal.listing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={closeShowConfirmModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Success Colors */}
              <div className="bg-gradient-to-l from-emerald-500 via-green-500 to-emerald-500 p-6 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-4">
                  <Eye className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">تأكيد إظهار الإعلان</h3>
              </div>
              
              {/* Content */}
              <div className="p-6">
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-right flex-1">
                      <p className="font-bold text-emerald-700 mb-2">هل تريد إظهار هذا الإعلان؟</p>
                      <p className="text-sm text-emerald-600 leading-relaxed">
                        سيظهر الإعلان في نتائج البحث والصفحة الرئيسية. يمكن للمستخدمين رؤيته والاتصال بك.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 mb-4">
                  <p className="font-bold text-[#003366] text-lg mb-1">
                    {showConfirmModal.listing.title}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {showConfirmModal.listing.district}، {showConfirmModal.listing.city}
                  </p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 p-6 pt-0">
                <button
                  onClick={closeShowConfirmModal}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmShow}
                  className="flex-1 px-4 py-3 bg-gradient-to-l from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <Eye className="w-4 h-4" />
                  إظهار الإعلان
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hide Confirmation Modal */}
      <AnimatePresence>
        {hideConfirmModal.open && hideConfirmModal.listing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={closeHideConfirmModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - Warning Colors */}
              <div className="bg-gradient-to-l from-amber-500 via-yellow-500 to-amber-500 p-6 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-4">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">تأكيد إخفاء الإعلان</h3>
              </div>
              
              {/* Content */}
              <div className="p-6">
                <div className="bg-gradient-to-br from-red-50 to-amber-50 border-2 border-red-200 rounded-xl p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-right flex-1">
                      <p className="font-bold text-red-700 mb-2">هل تريد إخفاء هذا الإعلان؟</p>
                      <p className="text-sm text-red-600 leading-relaxed">
                        <span 
                          onContextMenu={(e) => e.preventDefault()}
                          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                        >
                          سيتم تحرير موقع النخبة إذا كان محجوزاً. لن يظهر الإعلان في نتائج البحث أو الصفحة الرئيسية.
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 mb-4">
                  <p className="font-bold text-[#003366] text-lg mb-1">
                    {hideConfirmModal.listing.title}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {hideConfirmModal.listing.district}، {hideConfirmModal.listing.city}
                  </p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 p-6 pt-0">
                <button
                  onClick={closeHideConfirmModal}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmHide}
                  className="flex-1 px-4 py-3 bg-gradient-to-l from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <EyeOff className="w-4 h-4" />
                  إخفاء الإعلان
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteModal.open && deleteModal.listing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={closeDeleteModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-l from-red-500 to-red-600 p-6 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-4">
                  <Trash2 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">تأكيد حذف الإعلان</h3>
              </div>
              
              {/* Content */}
              <div className="p-6 text-center">
                <p className="text-gray-600 mb-4">
                  هل أنت متأكد من حذف هذا الإعلان؟
                </p>
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <p className="font-bold text-[#003366] text-lg mb-1">
                    {deleteModal.listing.title}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {deleteModal.listing.district}، {deleteModal.listing.city}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-amber-600 bg-amber-50 rounded-xl p-3">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">لا يمكن التراجع عن هذا الإجراء</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-red-600 bg-red-50 rounded-xl p-3">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">هذا الإعلان محسوب من رصيدك ولن يُسترد عند الحذف</span>
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-3 p-6 pt-0">
                <button
                  onClick={closeDeleteModal}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف الإعلان
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
