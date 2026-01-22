"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { 
  MapPin, BedDouble, Bath, Square, Calendar, 
  Phone, MessageCircle, Heart, Flag,
  ChevronRight, ChevronLeft, Building2, Car,
  Compass, Layers, Clock, ArrowRight, ArrowUpRight, Eye, AlertTriangle,
  Send, X, Mail, Loader2, Crown, PlayCircle, Video, Star, Sparkles, FileText
} from "lucide-react";
import ShareButton from "@/components/shared/ShareButton";
import AdvertiserReputation from "@/components/ratings/AdvertiserReputation";
import RatingModal from "@/components/ratings/RatingModal";
import { getImageUrl } from "@/lib/imageUrl";

type ListingDetail = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  district?: string;
  formatted_address?: string;
  type?: string;
  usage_type?: string;
  purpose?: string;
  price?: number;
  land_area?: number;
  building_area?: number;
  bedrooms?: number;
  bathrooms?: number;
  property_age?: number;
  floor_number?: number;
  direction?: string;
  parking_spaces?: string;
  has_pool?: boolean;
  has_garden?: boolean;
  has_elevator?: boolean;
  latitude?: number;
  longitude?: number;
  status?: string;
  created_at?: string;
  user_id?: string;
  owner_name?: string;
  owner_phone?: string;
  images?: { id: string; url: string; is_cover: boolean }[];
  videos?: { id: string; url: string; kind: string }[];
  video_url?: string;
  video_status?: 'processing' | 'ready' | 'failed' | null;
  is_featured?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  seo_schema_enabled?: boolean;
  seo_images_optimized?: boolean;
  seo_video_enabled?: boolean;
  country?: string;
  elite_reservation?: {
    id: string;
    slot_id: number;
    status: string;
    tier: 'top' | 'middle' | 'bottom';
    row_num: number;
    col_num: number;
    expires_at?: string;
  } | null;
};

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [togglingFeatured, setTogglingFeatured] = useState(false);
  
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name?: string; hasSubscription: boolean; isAdmin: boolean; supportLevel?: number } | null>(null);
  
  const [regeneratingVideo, setRegeneratingVideo] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);
  const [pollingVideo, setPollingVideo] = useState(false);
  const [priceInUsd, setPriceInUsd] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [canRate, setCanRate] = useState(false);
  
  const SAR = { code: 'SAR', symbol: 'ريال', name: 'ريال سعودي' };
  const AED = { code: 'AED', symbol: 'درهم', name: 'درهم إماراتي' };
  const KWD = { code: 'KWD', symbol: 'د.ك', name: 'دينار كويتي' };
  const QAR = { code: 'QAR', symbol: 'ر.ق', name: 'ريال قطري' };
  const BHD = { code: 'BHD', symbol: 'د.ب', name: 'دينار بحريني' };
  const OMR = { code: 'OMR', symbol: 'ر.ع', name: 'ريال عماني' };
  const EGP = { code: 'EGP', symbol: 'ج.م', name: 'جنيه مصري' };
  const LBP = { code: 'LBP', symbol: 'ل.ل', name: 'ليرة لبنانية' };
  const TRY = { code: 'TRY', symbol: '₺', name: 'ليرة تركية' };
  
  const COUNTRY_CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
    'السعودية': SAR, 'SA': SAR, 'Saudi Arabia': SAR, 'saudi arabia': SAR, 'KSA': SAR,
    'الإمارات': AED, 'AE': AED, 'UAE': AED, 'United Arab Emirates': AED, 'uae': AED,
    'الكويت': KWD, 'KW': KWD, 'Kuwait': KWD, 'kuwait': KWD,
    'قطر': QAR, 'QA': QAR, 'Qatar': QAR, 'qatar': QAR,
    'البحرين': BHD, 'BH': BHD, 'Bahrain': BHD, 'bahrain': BHD,
    'عمان': OMR, 'OM': OMR, 'Oman': OMR, 'oman': OMR,
    'مصر': EGP, 'EG': EGP, 'Egypt': EGP, 'egypt': EGP,
    'لبنان': LBP, 'LB': LBP, 'Lebanon': LBP, 'lebanon': LBP,
    'تركيا': TRY, 'TR': TRY, 'Turkey': TRY, 'turkey': TRY, 'Türkiye': TRY,
  };
  
  const getListingCurrency = (country?: string) => {
    if (!country) return SAR;
    const normalized = country.trim();
    if (COUNTRY_CURRENCY_MAP[normalized]) return COUNTRY_CURRENCY_MAP[normalized];
    const lowerCase = normalized.toLowerCase();
    const matchingKey = Object.keys(COUNTRY_CURRENCY_MAP).find(k => k.toLowerCase() === lowerCase);
    return matchingKey ? COUNTRY_CURRENCY_MAP[matchingKey] : SAR;
  };

  useEffect(() => {
    if (params.id) {
      fetchListing(params.id as string);
      checkOwnership();
    }
  }, [params.id]);

  // 🔍 SEO: تحديث meta tags و Schema.org ديناميكياً
  // يتم التنظيف عند إلغاء التحميل لمنع تكرار العناصر
  useEffect(() => {
    if (!listing) return;

    const pageTitle = listing.seo_title || `${listing.title} | بيت الجزيرة`;
    const pageDescription = listing.seo_description || 
      `${listing.type} ${listing.purpose === "إيجار" ? "للإيجار" : "للبيع"} في ${listing.city}، ${listing.district}. السعر: ${listing.price?.toLocaleString()} ريال`;
    const coverImage = listing.images?.find(img => img.is_cover)?.url || listing.images?.[0]?.url || "";

    const originalTitle = document.title;
    document.title = pageTitle;

    // Track created meta tags for cleanup
    const createdTags: HTMLMetaElement[] = [];

    const updateMetaTag = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? "property" : "name";
      let tag = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        tag.setAttribute("data-dynamic-seo", "true");
        document.head.appendChild(tag);
        createdTags.push(tag);
      }
      tag.setAttribute("content", content);
    };

    updateMetaTag("description", pageDescription);
    updateMetaTag("keywords", listing.seo_keywords || `${listing.type}, ${listing.city}, عقارات, ${listing.purpose}`);
    updateMetaTag("og:title", pageTitle, true);
    updateMetaTag("og:description", pageDescription, true);
    updateMetaTag("og:type", "website", true);
    if (coverImage) updateMetaTag("og:image", coverImage.startsWith("http") ? coverImage : `${window.location.origin}${coverImage}`, true);
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:title", pageTitle);
    updateMetaTag("twitter:description", pageDescription);

    // Schema.org JSON-LD only for VIP Elite (seo_schema_enabled = true, requires seo_level 2)
    let schemaScript: HTMLScriptElement | null = null;
    if (listing.seo_schema_enabled) {
      schemaScript = document.querySelector('script#property-schema');
      if (!schemaScript) {
        schemaScript = document.createElement("script");
        schemaScript.setAttribute("type", "application/ld+json");
        schemaScript.setAttribute("id", "property-schema");
        document.head.appendChild(schemaScript);
      }
      const schemaData = {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        "name": listing.title,
        "description": pageDescription,
        "url": window.location.href,
        "datePosted": listing.created_at,
        "price": listing.price,
        "priceCurrency": "SAR",
        "image": coverImage ? (coverImage.startsWith("http") ? coverImage : `${window.location.origin}${coverImage}`) : undefined,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": listing.city,
          "addressRegion": listing.district,
          "addressCountry": listing.country || "السعودية"
        },
        "floorSize": {
          "@type": "QuantitativeValue",
          "value": listing.land_area || listing.building_area,
          "unitCode": "MTK"
        },
        "numberOfRooms": listing.bedrooms,
        "numberOfBathroomsTotal": listing.bathrooms,
        "geo": listing.latitude && listing.longitude ? {
          "@type": "GeoCoordinates",
          "latitude": listing.latitude,
          "longitude": listing.longitude
        } : undefined
      };
      schemaScript.textContent = JSON.stringify(schemaData);
    }

    // Cleanup function to prevent stale/duplicate meta tags
    return () => {
      document.title = originalTitle;
      createdTags.forEach(tag => tag.remove());
      document.querySelectorAll('meta[data-dynamic-seo="true"]').forEach(tag => tag.remove());
      const existingSchema = document.querySelector('script#property-schema');
      if (existingSchema) existingSchema.remove();
    };
  }, [listing?.id, listing?.seo_title, listing?.seo_description, listing?.seo_schema_enabled]);

  // 🔄 Polling تلقائي لفحص حالة الفيديو
  useEffect(() => {
    if (!listing?.id || listing?.video_status !== 'processing') {
      setPollingVideo(false);
      return;
    }
    
    setPollingVideo(true);
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/listings/${listing.id}`);
        if (res.ok) {
          const data = await res.json();
          const updatedListing = data.listing || data;
          if (updatedListing.video_status === 'ready') {
            setListing(updatedListing);
            setRegenerateMessage("✅ تم إنشاء الفيديو بنجاح!");
            setPollingVideo(false);
            clearInterval(pollInterval);
          } else if (updatedListing.video_status === 'failed') {
            setListing(updatedListing);
            setRegenerateMessage("❌ فشل إنشاء الفيديو، حاول مرة أخرى");
            setPollingVideo(false);
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 4000); // كل 4 ثواني
    
    return () => clearInterval(pollInterval);
  }, [listing?.id, listing?.video_status]);

  async function checkOwnership() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        const currentUserId = data.user?.id;
        const userRole = data.user?.role || "";
        const isAdmin = userRole.includes("admin");
        
        if (currentUserId && listing?.user_id === currentUserId) {
          setIsOwner(true);
        }
        
        let hasSubscription = false;
        let supportLevel = 0;
        if (isAdmin) {
          hasSubscription = true;
          supportLevel = 3;
        } else {
          const limitsRes = await fetch("/api/account/limits", { credentials: "include" });
          if (limitsRes.ok) {
            const limitsData = await limitsRes.json();
            hasSubscription = limitsData.planId !== null && !limitsData.isFreeUser;
          }
          const aiLevelRes = await fetch("/api/user/ai-level", { credentials: "include" });
          if (aiLevelRes.ok) {
            const aiData = await aiLevelRes.json();
            supportLevel = aiData.supportLevel || 0;
          }
        }
        
        setCurrentUser({
          id: data.user?.id,
          name: data.user?.name,
          hasSubscription,
          isAdmin,
          supportLevel
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRegenerateVideo() {
    if (!listing?.id || regeneratingVideo) return;
    
    setRegeneratingVideo(true);
    setRegenerateMessage(null);
    
    try {
      const res = await fetch(`/api/listings/${listing.id}/regenerate-video`, {
        method: "POST",
        credentials: "include"
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setRegenerateMessage("جاري إنشاء الفيديو من صورك... سيظهر تلقائياً عند الانتهاء");
        setListing(prev => prev ? { ...prev, video_status: 'processing' } : null);
      } else {
        setRegenerateMessage(data.error || "حدث خطأ");
      }
    } catch (err) {
      setRegenerateMessage("حدث خطأ في الاتصال");
    } finally {
      setRegeneratingVideo(false);
    }
  }

  async function handleSendMessage() {
    if (!messageText.trim()) return;
    
    if (!currentUser) {
      router.push("/login");
      return;
    }
    
    if (!currentUser.hasSubscription) {
      setMessageError("يجب الاشتراك في إحدى الباقات للتمكن من مراسلة المعلنين");
      return;
    }
    
    setSendingMessage(true);
    setMessageError(null);
    
    try {
      const res = await fetch("/api/messages/to-advertiser", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing?.id,
          recipientId: listing?.user_id,
          message: messageText.trim()
        })
      });
      
      if (res.ok) {
        setMessageSent(true);
        setMessageText("");
        setTimeout(() => {
          setShowMessageModal(false);
          setMessageSent(false);
        }, 2000);
      } else {
        const data = await res.json();
        setMessageError(data.error || "حدث خطأ أثناء إرسال الرسالة");
      }
    } catch (err) {
      setMessageError("حدث خطأ في الاتصال");
    } finally {
      setSendingMessage(false);
    }
  }

  function openMessageModal() {
    if (!currentUser) {
      setShowMessageModal(true);
      setMessageError("not_logged_in");
      return;
    }
    
    if (!currentUser.hasSubscription) {
      setShowMessageModal(true);
      setMessageError("no_subscription");
      return;
    }
    
    setShowMessageModal(true);
    setMessageError(null);
  }

  async function toggleFeatured() {
    if (!listing || togglingFeatured) return;
    
    setTogglingFeatured(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/listings/${listing.id}/toggle-featured`, {
        method: "POST",
        credentials: "include",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        setIsFeatured(data.is_featured);
        setListing({ ...listing, is_featured: data.is_featured });
      }
    } catch (err) {
      console.error("Error toggling featured:", err);
    } finally {
      setTogglingFeatured(false);
    }
  }

  useEffect(() => {
    if (listing?.user_id) {
      const checkIfOwner = async () => {
        try {
          const token = localStorage.getItem("token");
          if (!token) return;
          
          const res = await fetch("/api/auth/me", {
            credentials: "include",
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.user?.id === listing.user_id) {
              setIsOwner(true);
            }
          }
        } catch (err) {
          console.error(err);
        }
      };
      checkIfOwner();
    }
  }, [listing?.user_id]);

  useEffect(() => {
    if (listing?.user_id && currentUser?.id && currentUser.id !== listing.user_id) {
      const checkCanRate = async () => {
        try {
          const res = await fetch(`/api/ratings/can-rate/${listing.user_id}?listing_id=${listing.id}`, {
            credentials: "include",
          });
          if (res.ok) {
            const data = await res.json();
            setCanRate(data.can_rate);
          }
        } catch (err) {
          console.error(err);
        }
      };
      checkCanRate();
    }
  }, [listing?.user_id, listing?.id, currentUser?.id]);

  async function fetchListing(id: string) {
    try {
      const res = await fetch(`/api/listings/${id}`, {
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) {
          setError("الإعلان غير موجود");
        } else {
          setError("حدث خطأ أثناء تحميل الإعلان");
        }
        return;
      }

      const data = await res.json();
      setListing(data.listing);
      setIsFeatured(data.listing?.is_featured || false);
      
      if (data.listing?.price) {
        try {
          const currency = getListingCurrency(data.listing.country);
          const ratesRes = await fetch(`/api/exchange-rates/convert?amount=${data.listing.price}&from=${currency.code}&to=USD`);
          if (ratesRes.ok) {
            const ratesData = await ratesRes.json();
            if (ratesData.success) {
              setPriceInUsd(ratesData.usdAmount);
            }
          }
        } catch (e) {
          console.log("Could not fetch exchange rates");
        }
      }
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء تحميل الإعلان");
    } finally {
      setLoading(false);
    }
  }

  function nextImage() {
    if (listing?.images && listing.images.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % listing.images!.length);
      setImageError(false);
    }
  }

  function prevImage() {
    if (listing?.images && listing.images.length > 1) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? listing.images!.length - 1 : prev - 1
      );
      setImageError(false);
    }
  }

  function getDirectionLabel(direction?: string) {
    const directions: Record<string, string> = {
      north: "شمال",
      south: "جنوب",
      east: "شرق",
      west: "غرب",
      northeast: "شمال شرق",
      northwest: "شمال غرب",
      southeast: "جنوب شرق",
      southwest: "جنوب غرب",
    };
    return direction ? directions[direction] || direction : null;
  }

  function getPurposeLabel(purpose?: string) {
    return purpose === "sale" ? "للبيع" : purpose === "rent" ? "للإيجار" : purpose;
  }

  function getUsageLabel(usage?: string) {
    return usage === "residential" ? "سكني" : usage === "commercial" ? "تجاري" : usage;
  }

  function getStatusInfo(status?: string) {
    switch (status) {
      case "pending":
        return { label: "قيد المراجعة", color: "bg-yellow-500", icon: Clock };
      case "hidden":
        return { label: "مخفي", color: "bg-red-500", icon: AlertTriangle };
      case "rejected":
        return { label: "غير مقبول", color: "bg-red-600", icon: AlertTriangle };
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">جاري تحميل الإعلان...</p>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 text-center max-w-md mx-4 shadow-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Flag className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#002845] mb-2">
            {error || "الإعلان غير موجود"}
          </h2>
          <p className="text-slate-600 mb-6">
            قد يكون الإعلان محذوفاً أو غير متاح حالياً
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 font-medium"
            >
              رجوع
            </button>
            <Link
              href="/"
              className="px-6 py-2 bg-[#002845] text-white rounded-full hover:bg-[#01375e] font-medium"
            >
              الصفحة الرئيسية
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(listing.status);
  const isPendingOrHidden = listing.status === "pending" || listing.status === "hidden" || listing.status === "rejected";
  
  const images = listing.images && listing.images.length > 0 
    ? listing.images.map(img => ({ ...img, url: getImageUrl(img.url) }))
    : [{ id: "default", url: `/images/property${(parseInt(listing.id.slice(-2), 16) % 10) + 1}.jpg`, is_cover: true }];

  const currentImageUrl = images[currentImageIndex]?.url || "/images/property1.jpg";

  return (
    <div dir="rtl" className="min-h-screen bg-[#fdf6db]">
      {isOwner && isPendingOrHidden && statusInfo && (
        <div className={`${statusInfo.color} text-white py-3 px-4`}>
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold">معاينة تجريبية</p>
                <p className="text-sm opacity-90">
                  {listing.status === "pending" 
                    ? "هذا الإعلان قيد المراجعة ولن يظهر للآخرين حتى تتم الموافقة عليه"
                    : listing.status === "hidden"
                    ? "هذا الإعلان مخفي ولا يظهر للآخرين"
                    : "تم رفض هذا الإعلان، يرجى تعديله وإعادة إرساله"
                  }
                </p>
              </div>
            </div>
            <Link
              href="/my-listings"
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full font-medium transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              العودة لإعلاناتي
            </Link>
          </div>
        </div>
      )}

      <div className="bg-[#002845] text-white py-4 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="hover:text-[#D4AF37]">الرئيسية</Link>
            <ChevronLeft className="w-4 h-4" />
            <Link href="/search" className="hover:text-[#D4AF37]">العقارات</Link>
            <ChevronLeft className="w-4 h-4" />
            <span className="text-[#D4AF37]">{listing.title}</span>
          </div>
          
          {isOwner && (
            <Link
              href="/my-listings"
              className="flex items-center gap-2 bg-[#D4AF37] text-[#002845] px-4 py-2 rounded-full text-sm font-bold hover:bg-[#e5c868] transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              إعلاناتي
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="relative bg-slate-200 rounded-2xl overflow-hidden">
              <div className="relative h-[280px] sm:h-[400px] md:h-[500px] bg-slate-900 flex items-center justify-center">
                {!imageError ? (
                  <img
                    src={currentImageUrl}
                    alt={listing.title}
                    className="max-w-full max-h-full object-contain"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-300">
                    <div className="text-center text-slate-500">
                      <Building2 className="w-16 h-16 mx-auto mb-2 opacity-50" />
                      <p>الصورة غير متوفرة</p>
                    </div>
                  </div>
                )}
                
                {images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-lg"
                    >
                      <ChevronRight className="w-6 h-6 text-[#002845]" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-lg"
                    >
                      <ChevronLeft className="w-6 h-6 text-[#002845]" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}

                <div className="absolute top-4 right-4 flex gap-2">
                  {listing.purpose && (
                    <span className="bg-[#D4AF37] text-[#002845] px-3 py-1 rounded-full text-sm font-bold">
                      {getPurposeLabel(listing.purpose)}
                    </span>
                  )}
                  {listing.type && (
                    <span className="bg-[#002845] text-white px-3 py-1 rounded-full text-sm">
                      {listing.type}
                    </span>
                  )}
                </div>

                {statusInfo && (
                  <div className="absolute top-4 left-4">
                    <span className={`${statusInfo.color} text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1`}>
                      <statusInfo.icon className="w-4 h-4" />
                      {statusInfo.label}
                    </span>
                  </div>
                )}
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 p-4 overflow-x-auto bg-white">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      onClick={() => {
                        setCurrentImageIndex(idx);
                        setImageError(false);
                      }}
                      className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 ${
                        idx === currentImageIndex ? "border-[#D4AF37]" : "border-transparent"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={`صورة ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/property1.jpg";
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* قسم الفيديو - يظهر دائماً */}
            {listing.images && listing.images.length > 0 && (
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center shadow-lg">
                    <PlayCircle className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#002845]">استكشف العقار</h3>
                </div>
                
                {/* الفيديو الجاهز */}
                {listing.videos && listing.videos.length > 0 && listing.video_status !== 'processing' && (
                  <div className="relative rounded-xl overflow-hidden bg-slate-900">
                    <video 
                      controls 
                      className="w-full max-h-[400px] object-contain"
                      poster={images[0]?.url}
                      preload="metadata"
                    >
                      <source src={listing.videos[0].url} type="video/mp4" />
                      <source src={listing.videos[0].url} type="video/webm" />
                      <source src={listing.videos[0].url} type="video/ogg" />
                      متصفحك لا يدعم عرض الفيديو
                    </video>
                  </div>
                )}
                
                {/* حالة معالجة الفيديو */}
                {listing.video_status === 'processing' && (!listing.videos || listing.videos.length === 0) && (
                  <div className="bg-gradient-to-br from-[#002845]/5 to-[#D4AF37]/5 border-2 border-dashed border-[#D4AF37]/30 rounded-xl p-6 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 relative">
                      <div className="absolute inset-0 border-4 border-[#D4AF37]/20 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                      <PlayCircle className="absolute inset-2 w-12 h-12 text-[#D4AF37]" />
                    </div>
                    <h4 className="text-lg font-bold text-[#002845] mb-2">جاري إنشاء الفيديو...</h4>
                    <p className="text-slate-600 text-sm">يتم إنشاء فيديو ترويجي من صور العقار الفعلية</p>
                    <p className="text-[#D4AF37] text-xs mt-2">قد يستغرق هذا دقيقة أو دقيقتين</p>
                  </div>
                )}
                
                {/* حالة فشل الفيديو */}
                {listing.video_status === 'failed' && (!listing.videos || listing.videos.length === 0) && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                      <PlayCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h4 className="text-lg font-bold text-red-700 mb-2">تعذر إنشاء الفيديو</h4>
                    <p className="text-red-600 text-sm">حدث خطأ أثناء معالجة الفيديو، يرجى المحاولة لاحقاً</p>
                  </div>
                )}
                
                {/* حالة عدم وجود فيديو (placeholder) */}
                {!listing.videos && (!listing.video_status || listing.video_status === null) && (
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center relative overflow-hidden">
                    {/* Placeholder with first image as background */}
                    {images && images.length > 0 && (
                      <div className="absolute inset-0 opacity-10">
                        <img 
                          src={getImageUrl(images[0]?.url)} 
                          alt="Placeholder" 
                          className="w-full h-full object-cover blur-sm"
                        />
                      </div>
                    )}
                    <div className="relative z-10">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-[#D4AF37]/20 to-[#B8860B]/20 rounded-full flex items-center justify-center">
                        <Video className="w-8 h-8 text-[#D4AF37]" />
                      </div>
                      <h4 className="text-lg font-bold text-[#002845] mb-2">فيديو ترويجي</h4>
                      <p className="text-slate-600 text-sm mb-1">سيتم إنشاء فيديو ترويجي احترافي من صور العقار</p>
                      <p className="text-slate-500 text-xs">سيظهر هنا عند اكتمال التوليد</p>
                    </div>
                  </div>
                )}
                
                {/* زر إعادة إنشاء الفيديو للمالك */}
                {isOwner && (currentUser?.supportLevel || 0) >= 3 && (
                  <div className="mt-4">
                    {listing.video_status === 'processing' ? (
                      <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl animate-pulse">
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-xl font-bold text-amber-700">جاري إنشاء الفيديو...</span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2 mb-3">
                          <div className="bg-amber-500 h-2 rounded-full animate-[pulse_1s_ease-in-out_infinite]" style={{width: '60%'}}></div>
                        </div>
                        <p className="text-sm text-amber-600 text-center">
                          🎬 يتم الآن إنشاء فيديو احترافي من صورك... هذا يستغرق حوالي 30-60 ثانية
                        </p>
                        <p className="text-xs text-amber-500 text-center mt-2">
                          ⏳ حدّث الصفحة بعد قليل لمشاهدة الفيديو الجديد
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
                        <p className="text-sm text-emerald-700 mb-3">
                          📷 هل تريد إعادة إنشاء الفيديو من صورك الفعلية؟
                        </p>
                        <button
                          onClick={handleRegenerateVideo}
                          disabled={regeneratingVideo}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 font-medium"
                        >
                          {regeneratingVideo ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>جاري الإرسال...</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-5 h-5" />
                              <span>إعادة إنشاء الفيديو من صوري</span>
                            </>
                          )}
                        </button>
                        {regenerateMessage && (
                          <p className={`text-sm mt-2 ${
                            regenerateMessage.includes('خطأ') || regenerateMessage.includes('❌') 
                              ? 'text-red-600' 
                              : regenerateMessage.includes('✅') 
                                ? 'text-emerald-600 font-medium' 
                                : 'text-amber-600'
                          }`}>
                            {regenerateMessage}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-xl sm:text-2xl font-bold text-[#002845] flex-1">{listing.title}</h1>
                {isOwner && (
                  <Link
                    href={`/edit-listing/${listing.id}`}
                    className="flex items-center gap-2 bg-[#D4AF37] text-[#002845] px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#e5c868] transition-all shadow-lg hover:shadow-xl shrink-0"
                    title="تعديل الإعلان"
                  >
                    <FileText className="w-4 h-4" />
                    تعديل
                  </Link>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-slate-600 mb-4">
                <MapPin className="w-5 h-5 text-[#D4AF37]" />
                <span>
                  {listing.city}
                  {listing.district && ` - ${listing.district}`}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-4 mb-6">
                {listing.land_area && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base">
                    <Square className="w-4 sm:w-5 h-4 sm:h-5 text-[#002845]" />
                    <span className="font-medium">{listing.land_area} م² أرض</span>
                  </div>
                )}
                {listing.building_area && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-amber-100 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base">
                    <Layers className="w-4 sm:w-5 h-4 sm:h-5 text-[#D4AF37]" />
                    <span className="font-medium">{listing.building_area} م² بناء</span>
                  </div>
                )}
                {listing.bedrooms && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base">
                    <BedDouble className="w-4 sm:w-5 h-4 sm:h-5 text-[#002845]" />
                    <span className="font-medium">{listing.bedrooms} غرف</span>
                  </div>
                )}
                {listing.bathrooms && (
                  <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-100 px-3 sm:px-4 py-2 rounded-xl text-sm sm:text-base">
                    <Bath className="w-4 sm:w-5 h-4 sm:h-5 text-[#002845]" />
                    <span className="font-medium">{listing.bathrooms} حمام</span>
                  </div>
                )}
              </div>

              {listing.description && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-bold text-[#002845] mb-3">الوصف</h3>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {listing.description}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-[#002845] mb-4">تفاصيل العقار</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {listing.usage_type && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Building2 className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">نوع الاستخدام</p>
                      <p className="font-medium text-[#002845]">{getUsageLabel(listing.usage_type)}</p>
                    </div>
                  </div>
                )}
                {listing.property_age !== undefined && listing.property_age !== null && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Clock className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">سنة البناء</p>
                      <p className="font-medium text-[#002845]">
                        {listing.property_age >= 1900 ? listing.property_age : (listing.property_age === 0 ? "جديد" : new Date().getFullYear() - listing.property_age)}
                      </p>
                    </div>
                  </div>
                )}
                {listing.floor_number !== undefined && listing.floor_number !== null && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Layers className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">الدور</p>
                      <p className="font-medium text-[#002845]">
                        {listing.floor_number === 0 ? "أرضي" : listing.floor_number}
                      </p>
                    </div>
                  </div>
                )}
                {listing.direction && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Compass className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">الواجهة</p>
                      <p className="font-medium text-[#002845]">{getDirectionLabel(listing.direction)}</p>
                    </div>
                  </div>
                )}
                {listing.parking_spaces && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Car className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">مواقف السيارات</p>
                      <p className="font-medium text-[#002845]">
                        {listing.parking_spaces === "0" ? "لا يوجد" : listing.parking_spaces === "4+" ? "+4 مواقف" : `${listing.parking_spaces} مواقف`}
                      </p>
                    </div>
                  </div>
                )}
                {listing.has_pool && (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-blue-600">مسبح</p>
                      <p className="font-medium text-blue-800">متوفر</p>
                    </div>
                  </div>
                )}
                {listing.has_garden && (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-green-600">حديقة</p>
                      <p className="font-medium text-green-800">متوفرة</p>
                    </div>
                  </div>
                )}
                {listing.has_elevator && (
                  <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-100">
                    <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-purple-600">مصعد</p>
                      <p className="font-medium text-purple-800">متوفر</p>
                    </div>
                  </div>
                )}
                {listing.created_at && (
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <Calendar className="w-5 h-5 text-[#D4AF37]" />
                    <div>
                      <p className="text-xs text-slate-500">تاريخ النشر</p>
                      <p className="font-medium text-[#002845]">
                        {new Date(listing.created_at).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm sticky top-4">
              <div className="text-center mb-6">
                <p className="text-slate-500 text-sm mb-1">السعر</p>
                <p className="text-3xl font-extrabold text-[#002845]">
                  {listing.price?.toLocaleString()}
                  <span className="text-lg font-normal text-slate-600 mr-1">{getListingCurrency(listing.country).symbol}</span>
                </p>
                {priceInUsd && (
                  <p className="text-sm text-[#D4AF37] mt-1">
                    ≈ ${priceInUsd.toLocaleString()} USD
                  </p>
                )}
                {listing.purpose === "rent" && (
                  <p className="text-sm text-slate-500">/ شهرياً</p>
                )}
              </div>

              {!isPendingOrHidden ? (
                <div className="space-y-3">
                  <a
                    href={`tel:${listing.owner_phone || "+966500000000"}`}
                    className="flex items-center justify-center gap-2 w-full bg-[#002845] text-white py-3 rounded-xl hover:bg-[#01375e] font-bold transition-all"
                  >
                    <Phone className="w-5 h-5" />
                    اتصل الآن
                  </a>
                  <a
                    href={`https://wa.me/${(listing.owner_phone || "+966500000000").replace(/[^0-9+]/g, '').replace(/^0/, '966')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[#1B5E3A] to-[#2D7A4E] text-white py-3 rounded-xl hover:from-[#256B45] hover:to-[#3A8A5A] font-bold transition-all shadow-md"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    واتساب
                  </a>
                  {listing.user_id ? (
                    <button
                      onClick={openMessageModal}
                      className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-[#002845] py-3 rounded-xl hover:from-[#e5c868] hover:to-[#D4AF37] font-bold transition-all shadow-md shadow-amber-500/20"
                    >
                      <Mail className="w-5 h-5" />
                      مراسلة المعلن
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 w-full bg-slate-100 text-slate-500 py-3 rounded-xl text-sm">
                      <Mail className="w-5 h-5" />
                      المراسلة غير متاحة لهذا الإعلان
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-100 rounded-xl p-4 text-center">
                  <p className="text-slate-600 text-sm">
                    {listing.status === "pending" 
                      ? "سيتم تفعيل وسائل التواصل بعد الموافقة على الإعلان"
                      : "وسائل التواصل غير متاحة للإعلانات المخفية"
                    }
                  </p>
                </div>
              )}

              <div className="flex gap-2 mt-4 pt-4 border-t">
                <button
                  onClick={() => setIsFavorite(!isFavorite)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border ${
                    isFavorite 
                      ? "bg-red-50 border-red-200 text-red-500" 
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isFavorite ? "fill-current" : ""}`} />
                  <span className="text-sm">حفظ</span>
                </button>
                <ShareButton
                  title={listing.title}
                  description={`${listing.type} ${listing.purpose === "إيجار" ? "للإيجار" : "للبيع"} في ${listing.city}، ${listing.district}. السعر: ${listing.price?.toLocaleString()} ريال`}
                  url={typeof window !== "undefined" ? window.location.href : ""}
                  className="flex-1"
                />
              </div>

              {!isOwner && (
                <>
                  {canRate && (
                    <button
                      onClick={() => setShowRatingModal(true)}
                      className="flex items-center justify-center gap-2 w-full mt-4 py-2 text-[#D4AF37] hover:bg-amber-50 rounded-lg text-sm border border-[#D4AF37]"
                    >
                      <Star className="w-4 h-4" />
                      قيّم تجربتك مع المعلن
                    </button>
                  )}
                  <Link
                    href={`/report?listing=${listing.id}`}
                    className="flex items-center justify-center gap-2 w-full mt-4 py-2 text-slate-500 hover:text-red-500 text-sm"
                  >
                    <Flag className="w-4 h-4" />
                    الإبلاغ عن مشكلة
                  </Link>
                </>
              )}

              {isOwner && (
                <Link
                  href={`/edit-listing/${listing.id}`}
                  className="flex items-center justify-center gap-2 w-full mt-4 py-3 bg-[#D4AF37] text-[#002845] rounded-xl font-bold hover:bg-[#e5c868]"
                >
                  تعديل الإعلان
                </Link>
              )}
              
              {isOwner && listing.status === 'approved' && (
                listing.elite_reservation ? (
                  <div className={`mt-3 py-4 px-4 rounded-xl border-2 ${
                    listing.elite_reservation.tier === 'top' 
                      ? 'border-[#D4AF37] bg-gradient-to-l from-amber-50 to-yellow-50' 
                      : listing.elite_reservation.tier === 'middle'
                      ? 'border-slate-400 bg-gradient-to-l from-slate-50 to-gray-50'
                      : 'border-orange-400 bg-gradient-to-l from-orange-50 to-amber-50'
                  }`}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Crown className={`w-6 h-6 ${
                        listing.elite_reservation.tier === 'top' ? 'text-[#D4AF37]' 
                        : listing.elite_reservation.tier === 'middle' ? 'text-slate-500'
                        : 'text-orange-500'
                      }`} />
                      <span className={`font-bold text-lg ${
                        listing.elite_reservation.tier === 'top' ? 'text-[#D4AF37]' 
                        : listing.elite_reservation.tier === 'middle' ? 'text-slate-600'
                        : 'text-orange-600'
                      }`}>
                        {listing.elite_reservation.tier === 'top' ? 'الموقع الذهبي' 
                        : listing.elite_reservation.tier === 'middle' ? 'الموقع الفضي'
                        : 'الموقع البرونزي'}
                      </span>
                    </div>
                    <p className="text-center text-sm text-slate-600">
                      محجوز في نخبة العقارات
                    </p>
                    <p className="text-center text-xs text-slate-400 mt-1">
                      الخانة {listing.elite_reservation.row_num}-{listing.elite_reservation.col_num}
                    </p>
                    <Link
                      href={`/elite-booking?property=${listing.id}`}
                      className="flex items-center justify-center gap-2 w-full mt-3 py-2 text-sm text-[#002845] hover:bg-white/50 rounded-lg border border-slate-200"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      ترقية الموقع
                    </Link>
                  </div>
                ) : (
                  <Link
                    href={`/elite-booking?property=${listing.id}`}
                    className="flex items-center justify-center gap-2 w-full mt-3 py-3 rounded-xl font-bold transition-all bg-gradient-to-l from-[#003366] to-[#002845] text-[#D4AF37] hover:from-[#004488] hover:to-[#003366]"
                  >
                    <Sparkles className="w-5 h-5" />
                    أضف لنخبة العقارات
                  </Link>
                )
              )}
            </div>

            {listing.formatted_address && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold text-[#002845] mb-3">العنوان</h3>
                <p className="text-slate-600 text-sm">{listing.formatted_address}</p>
              </div>
            )}

            {isOwner && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <Link
                  href="/my-listings"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-slate-100 text-[#002845] rounded-xl font-bold hover:bg-slate-200"
                >
                  <ArrowRight className="w-5 h-5" />
                  العودة لإعلاناتي
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* شريط التواصل السريع للجوال */}
      {!isPendingOrHidden && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 z-40 lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="flex gap-2 max-w-lg mx-auto">
            {/* زر الاتصال */}
            <a
              href={`tel:${listing.owner_phone || "+966500000000"}`}
              className="flex-1 flex items-center justify-center gap-2 bg-[#002845] text-white py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
            >
              <Phone className="w-5 h-5" />
              <span>اتصال</span>
            </a>
            
            {/* زر الواتساب */}
            <a
              href={`https://wa.me/${(listing.owner_phone || "+966500000000").replace(/[^0-9+]/g, '').replace(/^0/, '966')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>واتساب</span>
            </a>
            
            {/* زر المراسلة */}
            {listing.user_id && (
              <button
                onClick={openMessageModal}
                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-[#002845] py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              >
                <MessageCircle className="w-5 h-5" />
                <span>مراسلة</span>
              </button>
            )}
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" dir="rtl">
            <div className="bg-gradient-to-l from-[#002845] to-[#003356] text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">مراسلة المعلن</h3>
                  <p className="text-xs text-slate-300">{listing?.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setMessageError(null);
                  setMessageSent(false);
                }}
                className="text-white/70 hover:text-white p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-5">
              {messageError === "not_logged_in" ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                    <Mail className="w-8 h-8 text-[#002845]" />
                  </div>
                  <h4 className="font-bold text-[#002845] text-lg mb-2">سجّل دخولك للتواصل مع المعلن</h4>
                  <p className="text-slate-500 text-sm mb-6">
                    يجب تسجيل الدخول أولاً للتمكن من مراسلة المعلنين
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 bg-gradient-to-r from-[#002845] to-[#003356] text-white px-6 py-3 rounded-xl font-bold hover:from-[#003356] hover:to-[#004466] transition-all"
                    >
                      تسجيل الدخول
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 border-2 border-[#002845] text-[#002845] px-6 py-3 rounded-xl font-bold hover:bg-[#002845] hover:text-white transition-all"
                    >
                      إنشاء حساب
                    </Link>
                  </div>
                </div>
              ) : messageError === "no_subscription" ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                    <Crown className="w-8 h-8 text-[#D4AF37]" />
                  </div>
                  <h4 className="font-bold text-[#002845] text-lg mb-2">اشترك للتواصل مع المعلنين</h4>
                  <p className="text-slate-500 text-sm mb-6">
                    يجب الاشتراك في إحدى الباقات للتمكن من مراسلة المعلنين والتواصل معهم
                  </p>
                  <Link
                    href="/plans"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-[#002845] px-8 py-3 rounded-xl font-bold hover:from-[#e5c868] hover:to-[#D4AF37] transition-all"
                  >
                    <Crown className="w-5 h-5" />
                    عرض الباقات
                  </Link>
                </div>
              ) : messageSent ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                    <Send className="w-8 h-8 text-green-600" />
                  </div>
                  <h4 className="font-bold text-green-600 text-lg">تم إرسال رسالتك بنجاح!</h4>
                  <p className="text-slate-500 text-sm mt-2">سيتم إشعار المعلن برسالتك</p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-[#002845] mb-2">
                      اكتب رسالتك للمعلن
                    </label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="مثال: مرحباً، أنا مهتم بهذا العقار وأرغب في معرفة المزيد من التفاصيل..."
                      className="w-full h-32 p-4 border border-slate-200 rounded-xl resize-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none text-sm"
                      maxLength={500}
                    />
                    <p className="text-xs text-slate-400 mt-1 text-left">{messageText.length}/500</p>
                  </div>

                  {messageError && messageError !== "not_logged_in" && messageError !== "no_subscription" && (
                    <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
                      {messageError}
                    </div>
                  )}

                  <button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendingMessage}
                    className="w-full bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-[#002845] py-3 rounded-xl font-bold hover:from-[#e5c868] hover:to-[#D4AF37] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {sendingMessage ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        إرسال الرسالة
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {listing?.user_id && !isOwner && (
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <h3 className="text-lg font-bold text-[#002845] mb-4">معلومات المعلن</h3>
          <AdvertiserReputation advertiserId={listing.user_id} />
        </div>
      )}

      {listing?.user_id && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          advertiserId={listing.user_id}
          listingId={listing.id}
          advertiserName={listing.owner_name}
        />
      )}
    </div>
  );
}
