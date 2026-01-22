"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, FormEvent, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import nextDynamic from "next/dynamic";
import {
  MapPin, Image as ImageIcon, Video, ChevronRight, ChevronLeft,
  CheckCircle2, AlertTriangle, X, Upload, Star, Home, Building2,
  Loader2, User, Crown, FileText, Eye, Send, Trash2, Package, Calendar,
  Camera, Film, Map, Sparkles, Rocket, TrendingUp, Zap, ArrowUpRight, ArrowUp, Lock,
  BrainCircuit, ArrowLeft, Check, DollarSign, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import SliderInput from "@/components/SliderInput";

const LeafletLocationPicker = nextDynamic(
  () => import("@/components/LeafletLocationPicker"),
  { ssr: false, loading: () => (
    <div className="h-[400px] bg-slate-100 rounded-2xl flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
    </div>
  )}
);

type User = {
  id: string;
  email: string;
  name?: string;
};

type PlanInfo = {
  planId: number | null;
  planName: string;
  maxListings: number;
  currentListings: number;
  remainingListings: number;
  canAdd: boolean;
  maxPhotosPerListing: number;
  maxVideosPerListing: number;
  maxVideoDuration: number;
  showOnMap: boolean;
  needsUpgrade: boolean;
};

type QuotaOption = {
  bucketId: number;
  planId: number;
  planName: string;
  planSlug: string;
  planColor: string;
  planHeaderColor: string | null;
  planBodyColor: string | null;
  planLogo: string | null;
  planIcon: string | null;
  planCustomIcon: string | null;
  remainingSlots: number;
  expiresAt: string | null;
  supportLevel?: number;
  benefits: {
    maxPhotos: number;
    maxVideos: number;
    maxVideoDuration: number;
    showOnMap: boolean;
    aiSupportLevel: number;
    highlightsAllowed: number;
    supportLevel: number;
    features: string[];
  };
};

const PLAN_ICON_DEFAULTS: Record<string, string> = {
  "الأساس": "/icons/plan-starter.jpeg",
  "التميّز": "/icons/plan-premium.jpeg",
  "النخبة": "/icons/plan-intermediate.jpeg",
  "الملكي": "/icons/plan-competition.jpeg",
  "الإمبراطوري": "/icons/plan-business.jpeg",
  "الصفوة": "/icons/plan-business.jpeg",
  "كبار رجال الأعمال": "/icons/plan-competition.jpeg",
};

type Country = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  flag_emoji: string;
};

type City = {
  id: number;
  country_id: number;
  name_ar: string;
  name_en: string;
};

type ListingFormState = {
  purpose: "بيع" | "إيجار" | "";
  usageType: "سكني" | "تجاري" | "";
  propertyType: string;
  title: string;
  description: string;
  country: string;
  city: string;
  district: string;
  price: string;
  landArea: string;
  buildingArea: string;
  isLargeLandArea: boolean;
  isLargeBuildingArea: boolean;
  isLargeRooms: boolean;
  isLargeBathrooms: boolean;
  isLargePrice: boolean;
  bedrooms: string;
  bathrooms: string;
  propertyAge: string;
  floorNumber: string;
  direction: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  // Building-specific fields
  totalFloors: string;
  apartmentCount: string;
  rentalScope: "كامل" | "جزئي" | "";
  // General field
  parkingSpaces: string;
  // Amenities
  hasPool: boolean;
  hasElevator: boolean;
  hasGarden: boolean;
};

type ValidationErrors = Partial<Record<keyof ListingFormState | "media", string>>;

const SAUDI_CITIES = [
  "مكة المكرمة", "المدينة المنورة",
  "الرياض", "جدة", "الدمام", "الخبر", "الظهران", "الطائف", 
  "تبوك", "بريدة", "حائل", "أبها", "جازان", "نجران", 
  "ينبع", "القطيف", "الأحساء", "الجبيل", "خميس مشيط", "الخرج"
];

const RESIDENTIAL_TYPES = ["شقة", "فيلا", "دور", "دوبلكس", "قصر", "استوديو", "شاليه", "عمارة سكنية", "أرض سكنية"];
const COMMERCIAL_TYPES = ["أرض تجارية", "محل", "مكتب", "معرض", "مستودع", "فندق", "مجمع تجاري", "مبنى تجاري"];
const DIRECTIONS = ["شمالية", "جنوبية", "شرقية", "غربية", "شمالية شرقية", "شمالية غربية", "جنوبية شرقية", "جنوبية غربية"];

const STEPS = [
  { id: 0, title: "اختيار الباقة", icon: Package },
  { id: 1, title: "نوع العقار", icon: Home },
  { id: 2, title: "التفاصيل", icon: FileText },
  { id: 3, title: "الموقع", icon: MapPin },
  { id: 4, title: "الصور", icon: ImageIcon },
  { id: 5, title: "المراجعة", icon: Eye },
];

export default function NewListingPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quotaOptions, setQuotaOptions] = useState<QuotaOption[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<QuotaOption | null>(null);

  const [currentYear] = useState(() => 2026); // Fixed to avoid hydration mismatch
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [form, setForm] = useState<ListingFormState>({
    purpose: "",
    usageType: "",
    propertyType: "",
    title: "",
    description: "",
    country: "",
    city: "",
    district: "",
    price: "",
    landArea: "",
    buildingArea: "",
    isLargeLandArea: false,
    isLargeBuildingArea: false,
    isLargeRooms: false,
    isLargeBathrooms: false,
    isLargePrice: false,
    bedrooms: "",
    totalFloors: "",
    apartmentCount: "",
    rentalScope: "",
    parkingSpaces: "",
    bathrooms: "",
    propertyAge: "",
    floorNumber: "",
    direction: "",
    hasPool: false,
    hasElevator: false,
    hasGarden: false,
  });
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [selectedImagesForVideo, setSelectedImagesForVideo] = useState<Set<number>>(new Set()); // Selected images for video generation
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string>("");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stepTransition, setStepTransition] = useState(false);

  // Countries and Cities from API
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  // Elite slot booking state
  const [eliteSlots, setEliteSlots] = useState<any[]>([]);
  const [elitePeriod, setElitePeriod] = useState<any>(null);
  const [selectedEliteSlot, setSelectedEliteSlot] = useState<any>(null);
  const [elitePaymentData, setElitePaymentData] = useState<any>(null);
  const [elitePaymentLoading, setElitePaymentLoading] = useState(false);
  const [showElitePaymentModal, setShowElitePaymentModal] = useState(false);

  // Location confirmation state
  const [locationConfirmed, setLocationConfirmed] = useState(false);

  // AI Description Generator states
  const [aiLevel, setAiLevel] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingResult, setPricingResult] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsResult, setTipsResult] = useState<string | null>(null);
  const [tipsError, setTipsError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [slideshowLoading, setSlideshowLoading] = useState(false);
  const [slideshowResult, setSlideshowResult] = useState<string | null>(null);
  const [customPromoText, setCustomPromoText] = useState("");
  const [videoMode, setVideoMode] = useState<"slideshow" | "cinematic">("slideshow");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoPromoText, setVideoPromoText] = useState<{headline: string; subheadline: string; callToAction: string; tagline?: string; priceTag: string | null} | null>(null);
  const [selectedVideoImageIndex, setSelectedVideoImageIndex] = useState<number | null>(null);

  // Scroll to top button state
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Currency state based on selected country
  const [localCurrency, setLocalCurrency] = useState<{
    code: string;
    symbol: string;
    name_ar: string;
    rate: number;
  } | null>(null);

  // Map Arabic country names to country codes for currency lookup
  // Include variations of country names to ensure matching
  const countryCodeMap: Record<string, string> = {
    "المملكة العربية السعودية": "SA",
    "السعودية": "SA",
    "الإمارات العربية المتحدة": "AE",
    "الإمارات": "AE",
    "الكويت": "KW",
    "قطر": "QA",
    "البحرين": "BH",
    "سلطنة عمان": "OM",
    "عمان": "OM",
    "مصر": "EG",
    "لبنان": "LB",
    "تركيا": "TR"
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 🔒 Cleanup: تحرير الذاكرة عند مغادرة الصفحة
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);

        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const meData = await meRes.json();
        if (!meData.user) {
          setUser(null);
          setIsLoading(false);
          return;
        }
        setUser(meData.user);

        // IMPORTANT: Sync quota buckets first to ensure old users have their buckets created
        await fetch("/api/quota/sync", { method: "POST", credentials: "include" });

        // Now fetch limits (which uses quota_buckets)
        const planRes = await fetch("/api/account/limits", { credentials: "include" });
        if (planRes.ok) {
          const planJson = await planRes.json();
          setPlan(planJson);
        }

        // Fetch quota options for bucket selection in listing creation
        const quotaRes = await fetch("/api/quota/options-for-listing", { credentials: "include" });
        const quotaJson = quotaRes.ok ? await quotaRes.json() : { options: [] };
        
        setQuotaOptions(quotaJson.options || []);
        const availableOptions = (quotaJson.options || []).filter((opt: QuotaOption) => opt.remainingSlots > 0);
        if (availableOptions.length > 0) {
          setSelectedBucket(availableOptions[0]);
        } else {
          setSelectedBucket(null);
        }
      } catch (e) {
        console.error("Error loading user/plan", e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Fetch countries on mount
  useEffect(() => {
    fetch("/api/locations/countries")
      .then(res => res.json())
      .then(data => setCountries(data?.countries || []))
      .catch(() => setCountries([]));
  }, []);

  // Fetch cities when country changes
  useEffect(() => {
    if (!form.country) {
      setCities([]);
      return;
    }
    
    const selectedCountry = countries.find(c => c.name_ar === form.country);
    if (!selectedCountry) return;
    
    setCitiesLoading(true);
    fetch(`/api/locations/cities?country_id=${selectedCountry.id}`)
      .then(res => res.json())
      .then(data => {
        setCities(data?.cities || []);
        setCitiesLoading(false);
      })
      .catch(() => {
        setCities([]);
        setCitiesLoading(false);
      });
  }, [form.country, countries]);

  // Fetch local currency when country changes
  useEffect(() => {
    if (!form.country) {
      setLocalCurrency(null);
      return;
    }
    
    const countryCode = countryCodeMap[form.country];
    if (!countryCode || countryCode === "SA") {
      setLocalCurrency(null);
      return;
    }
    
    fetch(`/api/geo/currencies`)
      .then(res => res.json())
      .then(data => {
        const currency = data.currencies?.find((c: any) => c.country_code === countryCode);
        if (currency && currency.exchange_rate) {
          // exchange_rate من API = rate_to_sar = كم ريال لكل عملة محلية واحدة
          // مثال: 0.326 يعني 1 ليرة تركية = 0.326 ريال
          // نحتاج: rate = "عملة محلية لكل ريال" = 1 / rate_to_sar
          // مثال: 1 / 0.326 = 3.06 يعني 1 ريال = 3.06 ليرة تركية
          const rateToSar = parseFloat(currency.exchange_rate);
          const localPerSar = rateToSar > 0 ? 1 / rateToSar : 1;
          setLocalCurrency({
            code: currency.currency_code,
            symbol: currency.currency_symbol,
            name_ar: currency.country_name_ar,
            rate: localPerSar
          });
        } else {
          setLocalCurrency(null);
        }
      })
      .catch(() => setLocalCurrency(null));
  }, [form.country]);

  // Fetch AI support level based on selected bucket
  useEffect(() => {
    if (selectedBucket?.benefits?.aiSupportLevel !== undefined) {
      setAiLevel(selectedBucket.benefits.aiSupportLevel);
    } else {
      // Fallback: fetch from API
      fetch("/api/user/ai-level", { credentials: "include" })
        .then(res => res.json())
        .then(data => setAiLevel(data.level || 0))
        .catch(() => setAiLevel(0));
    }
  }, [selectedBucket]);

  // AI Description Generator function
  async function generateAIDescription() {
    if (aiLevel < 1) {
      setAiError("يجب الترقية لباقة تدعم الذكاء الاصطناعي");
      return;
    }
    if (!form.propertyType) {
      setAiError("يرجى اختيار نوع العقار أولاً");
      return;
    }
    if (!form.city) {
      setAiError("يرجى اختيار المدينة أولاً");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await fetch("/api/ai/user/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType: form.propertyType,
          purpose: form.purpose,
          city: form.city,
          district: form.district,
          price: form.price,
          landArea: form.landArea,
          buildingArea: form.buildingArea,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          title: form.title,
          hasPool: form.hasPool,
          hasElevator: form.hasElevator,
          hasGarden: form.hasGarden,
          direction: form.direction,
          parkingSpaces: form.parkingSpaces
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في توليد الوصف");
      }

      const data = await res.json();
      if (data.description) {
        updateField("description", data.description);
      }
    } catch (err: any) {
      setAiError(err.message || "حدث خطأ أثناء توليد الوصف");
    } finally {
      setAiLoading(false);
    }
  }

  // AI Title Generator function (Business tier only)
  async function generateAITitle() {
    const aiSupportLevel = selectedBucket?.benefits?.aiSupportLevel ?? 0;
    if (aiSupportLevel < 3) {
      setTitleError("ميزة توليد العناوين متاحة فقط لباقة رجال الأعمال");
      return;
    }
    if (!form.propertyType) {
      setTitleError("يرجى اختيار نوع العقار أولاً");
      return;
    }

    setTitleLoading(true);
    setTitleError(null);

    try {
      const res = await fetch("/api/ai/user/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType: form.propertyType,
          purpose: form.purpose,
          city: form.city,
          district: form.district,
          landArea: form.landArea,
          buildingArea: form.buildingArea,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          hasPool: form.hasPool,
          hasElevator: form.hasElevator,
          hasGarden: form.hasGarden
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في توليد العنوان");
      }

      const data = await res.json();
      if (data.title) {
        updateField("title", data.title);
      }
    } catch (err: any) {
      setTitleError(err.message || "حدث خطأ أثناء توليد العنوان");
    } finally {
      setTitleLoading(false);
    }
  }

  // 🏆 Smart Pricing Generator (Business tier only)
  async function generateSmartPricing() {
    const aiSupportLevel = selectedBucket?.benefits?.aiSupportLevel ?? 0;
    if (aiSupportLevel < 3) {
      setPricingError("ميزة اقتراحات التسعير الذكية متاحة فقط لباقة رجال الأعمال");
      return;
    }
    if (!form.propertyType || !form.city) {
      setPricingError("يرجى اختيار نوع العقار والمدينة أولاً");
      return;
    }

    setPricingLoading(true);
    setPricingError(null);
    setPricingResult(null);

    try {
      const res = await fetch("/api/ai/user/smart-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType: form.propertyType,
          purpose: form.purpose,
          country: form.country,
          city: form.city,
          district: form.district,
          landArea: form.landArea,
          buildingArea: form.buildingArea,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          hasPool: form.hasPool,
          hasElevator: form.hasElevator,
          hasGarden: form.hasGarden,
          currency: localCurrency?.code || "SAR",
          currencyName: localCurrency?.name_ar || "ريال سعودي"
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في تحليل التسعير");
      }

      const data = await res.json();
      if (data.pricing) {
        setPricingResult(data.pricing);
      }
    } catch (err: any) {
      setPricingError(err.message || "حدث خطأ أثناء تحليل التسعير");
    } finally {
      setPricingLoading(false);
    }
  }

  // 🎯 Marketing Tips Generator (Business tier only)
  async function generateMarketingTips() {
    const aiSupportLevel = selectedBucket?.benefits?.aiSupportLevel ?? 0;
    if (aiSupportLevel < 3) {
      setTipsError("ميزة النصائح التسويقية متاحة فقط لباقة رجال الأعمال");
      return;
    }
    if (!form.propertyType) {
      setTipsError("يرجى اختيار نوع العقار أولاً");
      return;
    }

    setTipsLoading(true);
    setTipsError(null);
    setTipsResult(null);

    try {
      const res = await fetch("/api/ai/user/marketing-tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType: form.propertyType,
          purpose: form.purpose,
          city: form.city,
          district: form.district,
          price: form.price,
          landArea: form.landArea,
          buildingArea: form.buildingArea,
          bedrooms: form.bedrooms,
          title: form.title,
          description: form.description
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في إنشاء النصائح");
      }

      const data = await res.json();
      if (data.tips) {
        setTipsResult(data.tips);
      }
    } catch (err: any) {
      setTipsError(err.message || "حدث خطأ أثناء إنشاء النصائح");
    } finally {
      setTipsLoading(false);
    }
  }

  // 🎬 توليد فيديو شرائح من صور المستخدم (FFmpeg) - سريع ودقيق
  async function handleGenerateSlideshowVideo() {
    if (images.length === 0) {
      setVideoError("يرجى رفع صور العقار أولاً لإنشاء فيديو من صورك");
      return;
    }

    setSlideshowLoading(true);
    setVideoError(null);
    setSlideshowResult(null);
    setVideoPromoText(null);

    try {
      // First, we need to get the actual image paths from uploaded images
      // For now, show a message that this feature needs uploaded images
      setVideoError("ميزة الفيديو من صورك متاحة بعد نشر الإعلان. جرّب الفيديو السينمائي AI!");
      setSlideshowLoading(false);
      return;

      // This would work with already-uploaded listings:
      // const res = await fetch("/api/ai/user/generate-slideshow-video", {...})
    } catch (err: any) {
      setVideoError(err.message || "حدث خطأ أثناء إنشاء الفيديو");
    } finally {
      setSlideshowLoading(false);
    }
  }

  // 🎬 توليد فيديو سينمائي بالذكاء الاصطناعي (Veo) 
  async function handleGenerateVideo() {
    if (!form.propertyType) {
      setVideoError("يرجى اختيار نوع العقار أولاً");
      return;
    }

    setVideoLoading(true);
    setVideoError(null);
    setVideoResult(null);
    setVideoPromoText(null);

    try {
      // Step 1: Start video generation (returns immediately with operationId)
      const res = await fetch("/api/ai/user/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          propertyType: form.propertyType,
          purpose: form.purpose,
          city: form.city,
          district: form.district,
          price: form.price,
          landArea: form.landArea,
          buildingArea: form.buildingArea,
          bedrooms: form.bedrooms,
          bathrooms: form.bathrooms,
          title: form.title,
          description: form.description,
          hasPool: form.hasPool,
          hasElevator: form.hasElevator,
          hasGarden: form.hasGarden,
          customPromoText: customPromoText.trim() || undefined
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في بدء توليد الفيديو");
      }

      const startData = await res.json();
      
      if (!startData.operationId) {
        throw new Error("لم يتم الحصول على معرف العملية");
      }

      // Store promotional text
      if (startData.promoText) {
        setVideoPromoText(startData.promoText);
      }

      // Step 2: Poll for completion
      const operationId = startData.operationId;
      const maxPolls = 36; // 36 * 5 seconds = 3 minutes max
      let pollCount = 0;

      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        pollCount++;

        const statusRes = await fetch(`/api/ai/user/video-status/${operationId}`, {
          credentials: "include"
        });

        if (!statusRes.ok) {
          throw new Error("فشل في التحقق من حالة الفيديو");
        }

        const statusData = await statusRes.json();

        if (statusData.status === "completed" && statusData.videoUrl) {
          setVideoResult(statusData.videoUrl);
          if (statusData.promoText) {
            setVideoPromoText(statusData.promoText);
          }
          setVideoLoading(false);
          return;
        }

        if (statusData.status === "error" || statusData.status === "timeout") {
          throw new Error(statusData.error || "فشل في توليد الفيديو");
        }

        // Still processing, continue polling
      }

      // Timeout after max polls
      throw new Error("استغرق توليد الفيديو وقتاً طويلاً. يرجى المحاولة لاحقاً.");

    } catch (err: any) {
      setVideoError(err.message || "حدث خطأ أثناء توليد الفيديو");
    } finally {
      setVideoLoading(false);
    }
  }

  const propertyTypesForUI = form.usageType === "تجاري"
    ? COMMERCIAL_TYPES
    : form.usageType === "سكني"
    ? RESIDENTIAL_TYPES
    : [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES];

  const availableQuotaOptions = useMemo(() => {
    return quotaOptions.filter(opt => opt.remainingSlots > 0);
  }, [quotaOptions]);

  // Check if user has Business plan (support_level >= 3)
  const isEligibleForElite = useMemo(() => {
    return (selectedBucket?.benefits?.supportLevel ?? 0) >= 3;
  }, [selectedBucket]);

  // Fetch elite slots when user is eligible
  useEffect(() => {
    async function fetchEliteSlots() {
      if (!isEligibleForElite || !user) return;
      try {
        const res = await fetch('/api/elite-slots/availability', {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setEliteSlots(data.slots || []);
          setElitePeriod(data.period);
        }
      } catch (err) {
        console.error('Error fetching elite slots:', err);
      }
    }
    fetchEliteSlots();
  }, [isEligibleForElite, user]);

  // Handle elite slot payment (simulated - no real card data)
  async function handleElitePayment() {
    if (!selectedEliteSlot || elitePaymentLoading) return;
    
    try {
      setElitePaymentLoading(true);
      const res = await fetch('/api/elite-slots/reserve-with-listing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedEliteSlot.id,
          paymentMethod: 'simulated'
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطأ في عملية الحجز');
      }
      
      setElitePaymentData(data);
      setShowElitePaymentModal(false);
    } catch (err: any) {
      alert(err.message || 'خطأ في عملية الحجز');
    } finally {
      setElitePaymentLoading(false);
    }
  }

  function updateField<K extends keyof ListingFormState>(key: K, value: ListingFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

  const handleImagesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const maxImages = selectedBucket?.benefits.maxPhotos || plan?.maxPhotosPerListing || 5;
    
    // التحقق من نوع الملفات
    const invalidFiles = files.filter(file => !ALLOWED_IMAGE_TYPES.includes(file.type));
    if (invalidFiles.length > 0) {
      const invalidNames = invalidFiles.map(f => f.name).join(', ');
      setErrors(prev => ({ 
        ...prev, 
        media: `نوع الملف غير مدعوم (${invalidNames}). الأنواع المسموحة: JPEG, PNG, WebP, GIF` 
      }));
      toast.error(`نوع الملف غير مدعوم: ${invalidNames}`, { duration: 4000 });
      e.target.value = '';
      return;
    }

    const total = images.length + files.length;
    if (total > maxImages) {
      const excess = total - maxImages;
      setErrors(prev => ({ 
        ...prev, 
        media: `تجاوزت الحد الأقصى! باقتك تسمح بـ ${maxImages} صور فقط. لديك ${images.length} صورة حالياً.` 
      }));
      toast.error(`لا يمكن رفع أكثر من ${maxImages} صورة. تجاوزت الحد بـ ${excess} صورة.`, { 
        duration: 5000,
        style: {
          background: '#FEE2E2',
          color: '#991B1B',
          fontWeight: '600',
        }
      });
      e.target.value = '';
      return;
    }

    const newImages = [...images, ...files];
    setImages(newImages);

    const newPreviews = files.map(file => URL.createObjectURL(file));
    setImagePreviews([...imagePreviews, ...newPreviews]);
    setErrors((prev) => ({ ...prev, media: undefined }));
    
    toast.success(`تم رفع ${files.length} صورة بنجاح`, { duration: 2000 });
  }, [images, imagePreviews, selectedBucket?.benefits.maxPhotos, plan?.maxPhotosPerListing]);

  const removeImage = useCallback((index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    // Remove from selected images if it was selected
    setSelectedImagesForVideo((prev) => {
      const newSet = new Set(prev);
      newSet.delete(index);
      // Adjust indices for remaining images
      const adjusted = new Set<number>();
      newSet.forEach((idx) => {
        if (idx > index) adjusted.add(idx - 1);
        else if (idx < index) adjusted.add(idx);
      });
      return adjusted;
    });
  }, [imagePreviews]);

  // Toggle image selection for video generation
  const toggleImageSelection = useCallback((index: number) => {
    setSelectedImagesForVideo((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  }, []);

  // Select all images for video
  const selectAllImages = useCallback(() => {
    setSelectedImagesForVideo(new Set(images.map((_, i) => i)));
  }, [images]);

  // Deselect all images
  const deselectAllImages = useCallback(() => {
    setSelectedImagesForVideo(new Set());
  }, []);

  const handleVideoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    // التحقق من نوع الملف
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      setVideoError(`نوع الملف غير مدعوم. الأنواع المسموحة: MP4, WebM`);
      e.target.value = "";
      return;
    }

    // التحقق من أن الباقة المختارة تدعم الفيديو
    const maxVideos = selectedBucket?.benefits.maxVideos || 0;
    if (maxVideos === 0) {
      alert("الباقة المختارة لا تدعم رفع الفيديو. يرجى اختيار باقة أخرى تدعم الفيديو.");
      e.target.value = "";
      return;
    }

    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setVideoError(null);
  }, [videoPreview, selectedBucket?.benefits.maxVideos]);

  const removeVideo = useCallback(() => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
    setVideoFile(null);
    setVideoPreview("");
  }, [videoPreview]);

  const handleLocationSelect = useCallback((location: { lat: number; lng: number; address?: string; city?: string; district?: string }) => {
    setForm(prev => {
      const updates: Partial<ListingFormState> = {
        latitude: location.lat,
        longitude: location.lng,
      };
      if (location.address) updates.formattedAddress = location.address;
      if (location.city && !prev.city) updates.city = location.city;
      if (location.district && !prev.district) updates.district = location.district;
      
      const coordsChanged = Math.abs((prev.latitude || 0) - location.lat) > 0.0001 || Math.abs((prev.longitude || 0) - location.lng) > 0.0001;
      if (coordsChanged) {
        setTimeout(() => setLocationConfirmed(false), 0);
      }
      
      return { ...prev, ...updates };
    });
  }, []);

  function scrollToFirstError(errorKeys: string[]) {
    if (errorKeys.length === 0) return;
    
    const fieldIdMap: Record<string, string> = {
      purpose: "field-purpose",
      usageType: "field-usageType",
      propertyType: "field-propertyType",
      title: "field-title",
      city: "field-city",
      district: "field-district",
      price: "field-price",
      landArea: "field-landArea",
      buildingArea: "field-buildingArea",
      bedrooms: "field-bedrooms",
      bathrooms: "field-bathrooms",
      latitude: "field-location",
      media: "field-media",
    };

    const firstErrorKey = errorKeys[0];
    const elementId = fieldIdMap[firstErrorKey];
    
    if (elementId) {
      setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("ring-2", "ring-red-400", "ring-offset-2");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-red-400", "ring-offset-2");
          }, 2000);
        }
      }, 100);
    }
  }

  function validateStep(stepToValidate: number): boolean {
    const newErrors: ValidationErrors = {};
    const errorOrder: string[] = [];

    if (stepToValidate === 0) {
      if (!selectedBucket || selectedBucket.remainingSlots <= 0) {
        return false;
      }
      const isValidBucket = availableQuotaOptions.some(opt => opt.bucketId === selectedBucket.bucketId);
      if (!isValidBucket) {
        return false;
      }
    }

    if (stepToValidate === 1 || stepToValidate === 5) {
      if (!form.purpose) { newErrors.purpose = "يرجى تحديد نوع العرض"; errorOrder.push("purpose"); }
      if (!form.usageType) { newErrors.usageType = "يرجى تحديد نوع الاستخدام"; errorOrder.push("usageType"); }
      if (!form.propertyType) { newErrors.propertyType = "يرجى اختيار نوع العقار"; errorOrder.push("propertyType"); }
    }

    if (stepToValidate === 2 || stepToValidate === 5) {
      if (!form.country) { newErrors.country = "يرجى اختيار الدولة"; errorOrder.push("country"); }
      if (!form.city) { newErrors.city = "يرجى اختيار المدينة"; errorOrder.push("city"); }
      if (!form.district.trim()) { newErrors.district = "يرجى إدخال اسم الحي"; errorOrder.push("district"); }
      if (!form.price || Number(form.price) <= 0) { newErrors.price = "يرجى إدخال سعر صحيح"; errorOrder.push("price"); }
      if (!form.landArea || Number(form.landArea) <= 0) { newErrors.landArea = "يرجى إدخال مساحة الأرض"; errorOrder.push("landArea"); }
      if (!form.bedrooms || Number(form.bedrooms) < 0) { newErrors.bedrooms = "يرجى تحديد عدد الغرف"; errorOrder.push("bedrooms"); }
      if (!form.bathrooms || Number(form.bathrooms) < 0) { newErrors.bathrooms = "يرجى تحديد عدد دورات المياه"; errorOrder.push("bathrooms"); }
      if (!form.title.trim()) { newErrors.title = "يرجى إدخال عنوان الإعلان"; errorOrder.push("title"); }
    }

    if (stepToValidate === 3 || stepToValidate === 5) {
      if (!form.latitude || !form.longitude) {
        newErrors.latitude = "يرجى تحديد موقع العقار على الخريطة";
        errorOrder.push("latitude");
      } else if (!locationConfirmed && stepToValidate === 3) {
        newErrors.latitude = "يرجى تأكيد الموقع المحدد على الخريطة بالضغط على زر 'أكد الموقع'";
        errorOrder.push("latitude");
      }
    }

    if (stepToValidate === 4 || stepToValidate === 5) {
      if (images.length === 0) {
        newErrors.media = "يرجى رفع صورة واحدة على الأقل";
        errorOrder.push("media");
      }
    }

    setErrors(newErrors);
    
    if (errorOrder.length > 0) {
      scrollToFirstError(errorOrder);
    }
    
    return Object.keys(newErrors).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    if (step < 5) {
      setStepTransition(true);
      setTimeout(() => {
        const nextStep = step + 1;
        setStep(nextStep as any);
        setStepTransition(false);
        // في الخطوة الأخيرة (المراجعة) لا تنتقل للأعلى - ابقَ عند زر النشر والملخص
        if (nextStep < 5) {
          const formElement = document.getElementById("listing-form");
          if (formElement) {
            formElement.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }, 200);
    }
  }

  function goBack() {
    if (step > 0) {
      setStepTransition(true);
      setTimeout(() => {
        setStep((s) => (s - 1) as any);
        setStepTransition(false);
        const formElement = document.getElementById("listing-form");
        if (formElement) {
          formElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 200);
    }
  }

  async function handleConfirmSubmit() {
    if (!validateStep(5)) {
      setShowConfirmModal(false);
      const firstErrorStep = !form.purpose || !form.usageType || !form.propertyType ? 1
        : !form.city || !form.district || !form.price || !form.landArea || !form.title ? 2
        : !form.latitude || !form.longitude ? 3
        : images.length === 0 ? 4 : 1;
      setStep(firstErrorStep as any);
      return;
    }
    
    let paymentDataToUse = elitePaymentData;
    
    // إذا كان هناك موقع نخبة مختار ولم يتم الدفع بعد، نقوم بالدفع أولاً
    if (selectedEliteSlot && !elitePaymentData) {
      try {
        setElitePaymentLoading(true);
        const res = await fetch('/api/elite-slots/reserve-with-listing', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotId: selectedEliteSlot.id,
            paymentMethod: 'simulated'
          })
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'خطأ في عملية الحجز');
        }
        
        setElitePaymentData(data);
        paymentDataToUse = data; // استخدام البيانات مباشرة بدلاً من انتظار تحديث الـ state
      } catch (err: any) {
        setElitePaymentLoading(false);
        alert(err.message || 'خطأ في عملية دفع النخبة. يرجى المحاولة مرة أخرى.');
        return;
      } finally {
        setElitePaymentLoading(false);
      }
    }
    
    setShowConfirmModal(false);
    submitListing(paymentDataToUse);
  }

  async function submitListing(elitePaymentDataParam?: any) {
    if (!user) {
      alert("يجب تسجيل الدخول قبل نشر إعلان.");
      router.push("/login");
      return;
    }

    if (plan && !plan.canAdd) {
      alert("لا يمكنك إضافة إعلانات جديدة، يرجى ترقية الباقة.");
      router.push("/plans");
      return;
    }
    
    // استخدام البيانات الممررة أو الـ state
    const effectiveElitePaymentData = elitePaymentDataParam || elitePaymentData;

    try {
      setSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(false);

      // تحويل السعر للريال السعودي إذا كان بعملة أخرى
      // rate = "1 ريال = X عملة محلية"
      // للتحويل من عملة محلية لريال: عملة محلية / rate
      const priceInSAR = localCurrency 
        ? Math.round(Number(form.price) / localCurrency.rate)
        : Number(form.price);

      const formData = new FormData();
      formData.append(
        "listing",
        JSON.stringify({
          ...form,
          price: priceInSAR,
          originalPrice: Number(form.price),
          originalCurrency: localCurrency?.code || "SAR",
          landArea: Number(form.landArea) || null,
          buildingArea: Number(form.buildingArea) || null,
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          propertyAge: form.propertyAge ? Number(form.propertyAge) : null,
          floorNumber: form.floorNumber ? Number(form.floorNumber) : null,
          bucketId: selectedBucket?.bucketId || null,
        })
      );

      images.forEach((file) => {
        formData.append("images", file);
      });

      // إرسال مؤشرات الصور المختارة لتوليد الفيديو (فقط إذا كانت هناك صور مختارة)
      if (selectedImagesForVideo.size > 0 && (selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3) {
        formData.append("selectedImageIndices", JSON.stringify(Array.from(selectedImagesForVideo).sort((a, b) => a - b)));
      }

      if (videoFile) {
        formData.append("video", videoFile);
      }
      
      // إرسال الفيديو المُنشأ بالذكاء الاصطناعي إذا وُجد
      if (videoResult) {
        formData.append("aiVideoUrl", videoResult);
      }

      const res = await fetch("/api/listings/create", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "حدث خطأ أثناء إنشاء الإعلان");
      }

      // If elite slot payment was made, complete the reservation
      if (effectiveElitePaymentData && data.listing?.id) {
        try {
          await fetch('/api/elite-slots/complete-reservation', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propertyId: data.listing.id,
              slotId: effectiveElitePaymentData.slotId,
              periodId: effectiveElitePaymentData.periodId,
              paymentId: effectiveElitePaymentData.paymentId,
              invoiceId: effectiveElitePaymentData.invoiceId
            })
          });
        } catch (eliteErr) {
          console.error('Error completing elite reservation:', eliteErr);
          // Don't fail the whole submission, the listing was created
        }
      }

      toast.success("تم إرسال الإعلان بنجاح! سيتم مراجعته من قبل الإدارة", {
        duration: 4000,
        position: "top-center",
        style: {
          background: 'linear-gradient(to left, #D4AF37, #B8860B)',
          color: 'white',
          fontWeight: '600',
          fontSize: '16px',
          padding: '16px 24px',
          borderRadius: '12px',
        },
      });

      setTimeout(() => {
        router.push("/my-listings");
      }, 1500);
    } catch (err: any) {
      console.error("Submit error:", err);
      setSubmitError(err.message || "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    
    if (!validateStep(5)) {
      const firstErrorStep = !form.purpose || !form.usageType || !form.propertyType ? 1
        : !form.city || !form.district || !form.price || !form.landArea || !form.title ? 2
        : !form.latitude || !form.longitude ? 3
        : images.length === 0 ? 4 : 1;
      setStep(firstErrorStep as any);
      return;
    }
    
    setShowConfirmModal(true);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#D4AF37] mx-auto mb-4" />
          <p className="text-slate-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border border-[#D4AF37]/20">
          <div className="w-20 h-20 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center mx-auto mb-6">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#002845] mb-3">تسجيل الدخول مطلوب</h1>
          <p className="text-slate-600 mb-6">يجب عليك تسجيل الدخول أو إنشاء حساب جديد لإضافة إعلان عقاري</p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/login")}
              className="flex-1 bg-[#002845] text-white py-3 px-6 rounded-xl font-semibold hover:bg-[#003356] transition"
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => router.push("/register")}
              className="flex-1 border-2 border-[#D4AF37] text-[#D4AF37] py-3 px-6 rounded-xl font-semibold hover:bg-[#D4AF37]/10 transition"
            >
              حساب جديد
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (plan && !plan.canAdd) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border border-[#D4AF37]/20">
          <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#002845] mb-3">لا يمكنك إضافة إعلان</h1>
          <p className="text-slate-600 mb-4">
            {plan.needsUpgrade
              ? "ليس لديك باقة مفعلة حالياً"
              : `وصلت للحد الأقصى (${plan.currentListings}/${plan.maxListings} إعلان)`}
          </p>
          <p className="text-sm text-slate-500 mb-6">
            باقتك الحالية: <span className="font-semibold text-[#D4AF37]">{plan.planName}</span>
          </p>
          <button
            onClick={() => router.push("/plans")}
            className="w-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white py-3 px-6 rounded-xl font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <Crown className="w-5 h-5" />
            ترقية الباقة
          </button>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center border border-green-200">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#002845] mb-3">تم إرسال الإعلان بنجاح!</h1>
          <p className="text-slate-600 mb-6">سيتم مراجعة إعلانك من قبل الإدارة وإشعارك عند الموافقة عليه</p>
          <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37] mx-auto" />
          <p className="text-sm text-slate-500 mt-2">جاري التحويل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100" dir="rtl">
      <div className="relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ 
            backgroundImage: `url('/uploads/listings/1764807083106-931124547.jpeg')`,
            filter: 'blur(1px)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#002845]/55 via-[#003356]/50 to-[#002845]/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        
        <div className="relative z-10 py-8">
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden shadow-xl shadow-amber-500/50 ring-2 ring-[#D4AF37]/60 ring-offset-2 ring-offset-[#002845]/50">
                  <img 
                    src="/images/add-listing-icon.png" 
                    alt="إضافة إعلان"
                    className="w-full h-full object-cover"
                  />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                  إضافة إعلان جديد
                </h1>
              </div>
              
              <span className="hidden md:block text-[#D4AF37] text-2xl font-light">|</span>
              
              <p className="text-white/90 text-lg font-medium drop-shadow-md">
                أضف عقارك واحصل على أفضل العروض
              </p>
              
              {plan && (
                <>
                  <span className="hidden md:block text-[#D4AF37] text-2xl font-light">|</span>
                  
                  <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37]/20 to-amber-500/10 backdrop-blur-sm border border-[#D4AF37]/40 rounded-full px-5 py-2 shadow-lg">
                    <Crown className="w-5 h-5 text-[#D4AF37] drop-shadow" />
                    <span className="text-sm font-semibold text-[#D4AF37] drop-shadow">{plan.planName}</span>
                    <span className="text-white/70 mx-1">|</span>
                    <span className="text-white text-sm drop-shadow">
                      باقي <span className="font-bold text-[#D4AF37]">{plan.remainingListings}</span> إعلان من <span className="font-bold">{plan.maxListings}</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <button
                onClick={() => {
                  if (s.id < step || validateStep(step)) {
                    setStep(s.id as any);
                  }
                }}
                className={`flex flex-col items-center gap-2 px-4 py-2 rounded-xl transition min-w-[80px] ${
                  step === s.id
                    ? "bg-[#D4AF37] text-white shadow-lg"
                    : step > s.id
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step === s.id ? "bg-white/20" : step > s.id ? "bg-green-200" : "bg-slate-200"
                }`}>
                  {step > s.id ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span className="text-xs font-medium whitespace-nowrap">{s.title}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`w-8 h-1 mx-1 rounded ${step > s.id ? "bg-green-300" : "bg-slate-200"}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} id="listing-form">
          <div className={`bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden transition-all duration-300 ${stepTransition ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
            {step === 0 && (
              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-[#002845] flex items-center gap-2">
                    <Package className="w-6 h-6 text-[#D4AF37]" />
                    اختر نوع الإعلان وفقاً للباقة المتاحة لك
                  </h2>
                  <button
                    type="button"
                    onClick={() => router.push("/plans")}
                    className="group flex items-center gap-2 text-sm font-bold text-white bg-gradient-to-l from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#996B0A] px-5 py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>ترقية للمزيد</span>
                    <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                </div>
                <p className="text-slate-500 mb-6">
                  اختر الباقة التي تريد استخدام رصيدها لهذا الإعلان. كل باقة لها مميزاتها الخاصة ومدة صلاحيتها.
                </p>

                {availableQuotaOptions.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border-2 border-dashed border-slate-300">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <AlertTriangle className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-[#002845] mb-3">لا توجد باقات متاحة</h3>
                    <p className="text-slate-600 mb-6 max-w-md mx-auto">
                      استنفدت جميع أرصدة الإعلانات المتاحة لديك، أو انتهت صلاحية باقاتك. يرجى ترقية باقتك للاستمرار في نشر الإعلانات.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/plans")}
                      className="bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white py-3 px-8 rounded-xl font-semibold hover:opacity-90 transition inline-flex items-center gap-2"
                    >
                      <Crown className="w-5 h-5" />
                      اشترك في باقة جديدة
                    </button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {availableQuotaOptions.map((option, optionIndex) => {
                      const isSelected = selectedBucket?.bucketId === option.bucketId;
                      const expiryDate = option.expiresAt 
                        ? new Date(option.expiresAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' })
                        : 'غير محدد';
                      const planColor = option.planColor || '#D4AF37';
                      const bucketNumber = optionIndex + 1;
                      
                      return (
                        <button
                          key={option.bucketId}
                          type="button"
                          onClick={() => setSelectedBucket(option)}
                          className={`relative overflow-hidden rounded-2xl border-4 transition-all text-right ${
                            isSelected
                              ? "scale-[1.03] shadow-2xl border-green-600"
                              : "hover:scale-[1.01] hover:shadow-lg"
                          }`}
                          style={{
                            borderColor: isSelected ? '#16a34a' : `${planColor}60`,
                            boxShadow: isSelected 
                              ? `0 20px 40px -10px #16a34a60, 0 0 0 4px #16a34a30` 
                              : `0 4px 15px -3px ${planColor}25`,
                          }}
                        >
                          {/* رقم الرصيد لتمييز الأرصدة المتشابهة */}
                          <div className="absolute top-2 left-2 z-20 bg-white/90 backdrop-blur-sm rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold text-[#002845] shadow-sm border border-white/50">
                            #{bucketNumber}
                          </div>
                          <div 
                            className="absolute inset-0"
                            style={{ 
                              background: `linear-gradient(145deg, ${planColor} 0%, ${planColor} 60%, ${planColor}ee 100%)`
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/5" />
                          
                          <div className="relative z-10 p-5">
                            <div className="flex items-start gap-3 mb-4">
                              {(() => {
                                const iconSrc = option.planCustomIcon || PLAN_ICON_DEFAULTS[option.planName];
                                if (iconSrc) {
                                  return (
                                    <div className="w-16 h-16 rounded-xl bg-white/95 p-1.5 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                      <img 
                                        src={iconSrc} 
                                        alt={option.planName}
                                        className="w-full h-full object-contain rounded-lg"
                                      />
                                    </div>
                                  );
                                }
                                if (option.planLogo) {
                                  return (
                                    <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg border border-white/30">
                                      {option.planLogo}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg border border-white/30">
                                    <Crown className="w-8 h-8" />
                                  </div>
                                );
                              })()}
                              <div className="flex-1">
                                <h3 className="font-bold text-[#002845] text-xl">{option.planName}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-3xl font-black text-[#002845]">{option.remainingSlots}</span>
                                  <span className="text-[#002845]/70 text-sm font-medium">إعلان متبقي</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 text-sm text-[#002845]/80 mb-4 bg-white/50 backdrop-blur-sm rounded-lg px-3 py-2">
                              <Calendar className="w-4 h-4 text-[#002845]/60" />
                              <span>ينتهي في: {expiryDate}</span>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-[#002845]/70 mb-2">مميزات هذه الباقة:</div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-1 text-xs text-[#002845] bg-white/50 backdrop-blur-sm rounded-lg px-2 py-1.5">
                                  <Camera className="w-3.5 h-3.5 text-[#002845]/70" />
                                  <span>{option.benefits.maxPhotos} صورة</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-[#002845] bg-white/50 backdrop-blur-sm rounded-lg px-2 py-1.5">
                                  <Film className="w-3.5 h-3.5 text-[#002845]/70" />
                                  <span>{option.benefits.maxVideos} فيديو</span>
                                </div>
                                {option.benefits.showOnMap && (
                                  <div className="flex items-center gap-1 text-xs text-[#002845] bg-white/50 backdrop-blur-sm rounded-lg px-2 py-1.5">
                                    <Map className="w-3.5 h-3.5 text-[#002845]/70" />
                                    <span>ظهور بالخريطة</span>
                                  </div>
                                )}
                                {option.benefits.highlightsAllowed > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-[#002845] bg-white/50 backdrop-blur-sm rounded-lg px-2 py-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-[#002845]/70" />
                                    <span>تمييز الإعلان</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedBucket && selectedBucket.remainingSlots > 0 && availableQuotaOptions.some(opt => opt.bucketId === selectedBucket.bucketId) && (
                  <div 
                    className="mt-6 p-4 rounded-xl border-2 relative overflow-hidden"
                    style={{ 
                      borderColor: selectedBucket.planColor || '#D4AF37',
                      background: `linear-gradient(to left, ${selectedBucket.planColor || '#D4AF37'}15, ${selectedBucket.planColor || '#D4AF37'}08)`
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: selectedBucket.planColor || '#D4AF37' }}
                      >
                        <CheckCircle2 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#002845]">
                          اخترت باقة: <span style={{ color: selectedBucket.planColor || '#D4AF37' }}>{selectedBucket.planName}</span>
                        </p>
                        <p className="text-sm text-slate-600">
                          سيحصل إعلانك على جميع مميزات هذه الباقة حتى انتهاء صلاحيتها.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {step === 1 && (
              <div className="p-6 md:p-8">
                <h2 className="text-xl font-bold text-[#002845] mb-6 flex items-center gap-2">
                  <Home className="w-6 h-6 text-[#D4AF37]" />
                  نوع العقار والعرض
                </h2>

                <div className="space-y-5">
                  <div id="field-usageType">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      نوع الاستخدام <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: "سكني", icon: Home },
                        { value: "تجاري", icon: Building2 },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            updateField("usageType", option.value as any);
                            updateField("propertyType", "");
                          }}
                          className={`py-3 px-5 rounded-xl border-2 font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                            form.usageType === option.value
                              ? "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C49B2F] text-white shadow-lg shadow-[#D4AF37]/30 scale-[1.02]"
                              : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 hover:text-slate-700"
                          }`}
                        >
                          <option.icon className="w-4 h-4" />
                          {option.value}
                        </button>
                      ))}
                    </div>
                    {errors.usageType && <p className="text-red-500 text-xs mt-2">{errors.usageType}</p>}
                  </div>

                  <div id="field-purpose">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      نوع العرض <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      {["بيع", "إيجار"].map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateField("purpose", option as any)}
                          className={`py-3 px-5 rounded-xl border-2 font-medium transition-all duration-300 ${
                            form.purpose === option
                              ? "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C49B2F] text-white shadow-lg shadow-[#D4AF37]/30 scale-[1.02]"
                              : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 hover:text-slate-700"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {errors.purpose && <p className="text-red-500 text-xs mt-2">{errors.purpose}</p>}
                  </div>
                </div>

                <div id="field-propertyType" className="mt-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    نوع العقار <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {propertyTypesForUI.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => updateField("propertyType", type)}
                        className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-300 ${
                          form.propertyType === type
                            ? "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C49B2F] text-white shadow-lg shadow-[#D4AF37]/30 scale-[1.02]"
                            : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 hover:text-slate-700"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {errors.propertyType && <p className="text-red-500 text-xs mt-2">{errors.propertyType}</p>}
                </div>

                </div>
            )}

            {step === 2 && (
              <div className="p-6 md:p-8">
                <h2 className="text-xl font-bold text-[#002845] mb-6 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-[#D4AF37]" />
                  تفاصيل العقار
                </h2>

                <div className="grid md:grid-cols-2 gap-6 overflow-visible">
                  <div id="field-country" className="relative">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      الدولة <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.country}
                      onChange={(e) => {
                        updateField("country", e.target.value);
                        updateField("city", "");
                      }}
                      className="w-full max-w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] outline-none transition bg-white text-base appearance-none"
                      style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    >
                      <option value="">اختر الدولة</option>
                      {countries.map((country) => (
                        <option key={country.id} value={country.name_ar}>
                          {country.flag_emoji} {country.name_ar}
                        </option>
                      ))}
                    </select>
                    {errors.country && <p className="text-red-500 text-xs mt-2">{errors.country}</p>}
                  </div>

                  <div id="field-city" className="relative">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      المدينة <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      disabled={!form.country || citiesLoading}
                      className="w-full max-w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] outline-none transition bg-white disabled:bg-slate-100 disabled:cursor-not-allowed text-base appearance-none"
                      style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
                    >
                      <option value="">
                        {citiesLoading ? "جاري التحميل..." : !form.country ? "اختر الدولة أولاً" : "اختر المدينة"}
                      </option>
                      {cities.map((city) => (
                        <option key={city.id} value={city.name_ar}>{city.name_ar}</option>
                      ))}
                    </select>
                    {errors.city && <p className="text-red-500 text-xs mt-2">{errors.city}</p>}
                  </div>

                  <div id="field-district">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      الحي <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.district}
                      onChange={(e) => updateField("district", e.target.value)}
                      placeholder="مثال: النرجس"
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] outline-none transition"
                    />
                    {errors.district && <p className="text-red-500 text-xs mt-2">{errors.district}</p>}
                  </div>

                  <div id="field-landArea">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        مساحة الأرض (م²) <span className="text-red-500">*</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-500">مساحة ضخمة (أراضي/مزارع)</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={form.isLargeLandArea}
                            onChange={(e) => {
                              updateField("isLargeLandArea", e.target.checked);
                              if (!e.target.checked && Number(form.landArea) > (form.usageType === "تجاري" ? 100000 : 10000)) {
                                updateField("landArea", "");
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-[#D4AF37] transition-colors"></div>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                    </div>
                    
                    {form.isLargeLandArea ? (
                      <div className="bg-amber-50 rounded-2xl p-4 border-2 border-amber-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">🏜️ مساحة ضخمة</span>
                          <span className="text-xs text-amber-600">للأراضي والمزارع الكبيرة</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="number"
                            value={form.landArea}
                            onChange={(e) => updateField("landArea", e.target.value)}
                            placeholder="أدخل المساحة بالمتر المربع"
                            min={0}
                            className="flex-1 px-4 py-3 border-2 border-amber-300 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white"
                          />
                          <span className="text-sm font-medium text-amber-700 min-w-[60px]">م²</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-amber-200">
                          <span className="text-xs text-amber-600 w-full mb-1">قيم سريعة للمساحات الكبيرة:</span>
                          {[100000, 500000, 1000000, 2000000, 5000000, 10000000].map((qv) => {
                            let displayText = qv.toLocaleString("en-US");
                            if (qv >= 1000000) {
                              displayText = `${(qv / 1000000)} مليون`;
                            } else if (qv >= 1000) {
                              displayText = `${(qv / 1000)} ألف`;
                            }
                            return (
                              <button
                                key={qv}
                                type="button"
                                onClick={() => updateField("landArea", String(qv))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                  Number(form.landArea) === qv
                                    ? "bg-amber-500 text-white"
                                    : "bg-white border border-amber-300 text-amber-700 hover:border-amber-500 hover:bg-amber-100"
                                }`}
                              >
                                {displayText}
                              </button>
                            );
                          })}
                        </div>
                        {form.landArea && Number(form.landArea) > 0 && (
                          <p className="text-center text-sm text-amber-700 font-bold mt-3 bg-amber-100 rounded-lg py-2">
                            {Number(form.landArea) >= 1000000
                              ? `${(Number(form.landArea) / 1000000).toFixed(2)} مليون م²`
                              : Number(form.landArea) >= 1000
                                ? `${(Number(form.landArea) / 1000).toFixed(1)} ألف م²`
                                : `${Number(form.landArea).toLocaleString("en-US")} م²`}
                          </p>
                        )}
                      </div>
                    ) : (
                      <SliderInput
                        value={form.landArea}
                        onChange={(val) => updateField("landArea", val)}
                        min={0}
                        max={form.usageType === "تجاري" ? 100000 : 10000}
                        step={form.usageType === "تجاري" ? 100 : 10}
                        unit="م²"
                        error={errors.landArea}
                        quickValues={form.usageType === "تجاري"
                          ? [500, 1000, 2000, 5000, 10000, 20000, 50000]
                          : [100, 200, 300, 500, 1000, 2000, 5000]
                        }
                      />
                    )}
                    {errors.landArea && <p className="text-red-500 text-xs mt-2">{errors.landArea}</p>}
                  </div>

                  <div id="field-buildingArea">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        مساحة البناء (م²)
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-500">مبنى ضخم</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={form.isLargeBuildingArea}
                            onChange={(e) => {
                              updateField("isLargeBuildingArea", e.target.checked);
                              if (!e.target.checked && Number(form.buildingArea) > (form.usageType === "تجاري" ? 50000 : 5000)) {
                                updateField("buildingArea", "");
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-[#D4AF37] transition-colors"></div>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                    </div>
                    
                    {form.isLargeBuildingArea ? (
                      <div className="bg-blue-50 rounded-2xl p-4 border-2 border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">🏢 مبنى ضخم</span>
                          <span className="text-xs text-blue-600">للفنادق والمجمعات الكبيرة</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="number"
                            value={form.buildingArea}
                            onChange={(e) => updateField("buildingArea", e.target.value)}
                            placeholder="أدخل مساحة البناء"
                            min={0}
                            className="flex-1 px-4 py-3 border-2 border-blue-300 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white"
                          />
                          <span className="text-sm font-medium text-blue-700 min-w-[60px]">م²</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-blue-200">
                          <span className="text-xs text-blue-600 w-full mb-1">قيم سريعة:</span>
                          {[50000, 100000, 200000, 500000, 1000000].map((qv) => {
                            let displayText = qv >= 1000000 ? `${(qv / 1000000)} مليون` : `${(qv / 1000)} ألف`;
                            return (
                              <button
                                key={qv}
                                type="button"
                                onClick={() => updateField("buildingArea", String(qv))}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                  Number(form.buildingArea) === qv
                                    ? "bg-blue-500 text-white"
                                    : "bg-white border border-blue-300 text-blue-700 hover:border-blue-500 hover:bg-blue-100"
                                }`}
                              >
                                {displayText}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <SliderInput
                        value={form.buildingArea}
                        onChange={(val) => updateField("buildingArea", val)}
                        min={0}
                        max={form.usageType === "تجاري" ? 50000 : 5000}
                        step={form.usageType === "تجاري" ? 50 : 10}
                        unit="م²"
                        error={errors.buildingArea}
                        quickValues={form.usageType === "تجاري"
                          ? [200, 500, 1000, 2000, 5000, 10000]
                          : [100, 150, 200, 300, 500, 1000]
                        }
                      />
                    )}
                  </div>

                  <div id="field-bedrooms">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        عدد الغرف <span className="text-red-500">*</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-500">عدد كبير (فنادق)</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={form.isLargeRooms}
                            onChange={(e) => {
                              updateField("isLargeRooms", e.target.checked);
                              if (!e.target.checked && Number(form.bedrooms) > 20) {
                                updateField("bedrooms", "");
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-[#D4AF37] transition-colors"></div>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                    </div>
                    
                    {form.isLargeRooms ? (
                      <div className="bg-purple-50 rounded-2xl p-4 border-2 border-purple-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg">🏨 غرف كثيرة</span>
                          <span className="text-xs text-purple-600">للفنادق والمباني السكنية</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="number"
                            value={form.bedrooms}
                            onChange={(e) => updateField("bedrooms", e.target.value)}
                            placeholder="أدخل عدد الغرف"
                            min={0}
                            className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white"
                          />
                          <span className="text-sm font-medium text-purple-700 min-w-[60px]">غرفة</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-purple-200">
                          <span className="text-xs text-purple-600 w-full mb-1">قيم سريعة:</span>
                          {[20, 50, 100, 200, 500, 1000].map((qv) => (
                            <button
                              key={qv}
                              type="button"
                              onClick={() => updateField("bedrooms", String(qv))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                Number(form.bedrooms) === qv
                                  ? "bg-purple-500 text-white"
                                  : "bg-white border border-purple-300 text-purple-700 hover:border-purple-500 hover:bg-purple-100"
                              }`}
                            >
                              {qv}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <SliderInput
                        value={form.bedrooms}
                        onChange={(val) => updateField("bedrooms", val)}
                        min={0}
                        max={20}
                        step={1}
                        unit="غرفة"
                        error={errors.bedrooms}
                        quickValues={[1, 2, 3, 4, 5, 6]}
                      />
                    )}
                    {errors.bedrooms && <p className="text-red-500 text-xs mt-2">{errors.bedrooms}</p>}
                  </div>

                  <div id="field-bathrooms">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        عدد دورات المياه <span className="text-red-500">*</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-500">عدد كبير</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={form.isLargeBathrooms}
                            onChange={(e) => {
                              updateField("isLargeBathrooms", e.target.checked);
                              if (!e.target.checked && Number(form.bathrooms) > 15) {
                                updateField("bathrooms", "");
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 rounded-full peer peer-checked:bg-[#D4AF37] transition-colors"></div>
                          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                    </div>
                    
                    {form.isLargeBathrooms ? (
                      <div className="bg-teal-50 rounded-2xl p-4 border-2 border-teal-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs font-bold rounded-lg">🚿 حمامات كثيرة</span>
                          <span className="text-xs text-teal-600">للمباني والمجمعات الكبيرة</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="number"
                            value={form.bathrooms}
                            onChange={(e) => updateField("bathrooms", e.target.value)}
                            placeholder="أدخل عدد الحمامات"
                            min={0}
                            className="flex-1 px-4 py-3 border-2 border-teal-300 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white"
                          />
                          <span className="text-sm font-medium text-teal-700 min-w-[60px]">حمام</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-teal-200">
                          <span className="text-xs text-teal-600 w-full mb-1">قيم سريعة:</span>
                          {[20, 50, 100, 200, 500].map((qv) => (
                            <button
                              key={qv}
                              type="button"
                              onClick={() => updateField("bathrooms", String(qv))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                Number(form.bathrooms) === qv
                                  ? "bg-teal-500 text-white"
                                  : "bg-white border border-teal-300 text-teal-700 hover:border-teal-500 hover:bg-teal-100"
                              }`}
                            >
                              {qv}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <SliderInput
                        value={form.bathrooms}
                        onChange={(val) => updateField("bathrooms", val)}
                        min={0}
                        max={15}
                        step={1}
                        unit="حمام"
                        error={errors.bathrooms}
                        quickValues={[1, 2, 3, 4, 5]}
                      />
                    )}
                    {errors.bathrooms && <p className="text-red-500 text-xs mt-2">{errors.bathrooms}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      سنة البناء
                    </label>
                    {/* Quick decade buttons */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {[
                        { label: "جديد", value: currentYear },
                        { label: `${currentYear - 1}`, value: currentYear - 1 },
                        { label: `${currentYear - 2}`, value: currentYear - 2 },
                        { label: `${currentYear - 5}`, value: currentYear - 5 },
                        { label: `${currentYear - 10}`, value: currentYear - 10 },
                        { label: `${currentYear - 15}`, value: currentYear - 15 },
                        { label: `${currentYear - 20}`, value: currentYear - 20 },
                        { label: `${currentYear - 30}`, value: currentYear - 30 },
                      ].map((decade) => (
                        <button
                          key={decade.value}
                          type="button"
                          onClick={() => updateField("propertyAge", String(decade.value))}
                          className={`py-2 px-4 rounded-lg border-2 text-sm transition ${
                            form.propertyAge === String(decade.value)
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] font-semibold"
                              : "border-slate-200 hover:border-slate-300 text-slate-600"
                          }`}
                        >
                          {decade.label}
                        </button>
                      ))}
                    </div>
                    {/* Manual input with slider */}
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={currentYear - 100}
                        max={2100}
                        value={form.propertyAge || currentYear}
                        onChange={(e) => updateField("propertyAge", e.target.value)}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
                      />
                      <input
                        type="number"
                        min={1875}
                        max={2100}
                        value={form.propertyAge || ""}
                        onChange={(e) => updateField("propertyAge", e.target.value)}
                        placeholder="السنة"
                        className="w-24 px-3 py-2 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] outline-none transition text-center font-semibold"
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      {form.propertyAge ? `سنة البناء: ${form.propertyAge}` : "اختر سنة البناء أو اكتبها يدوياً"}
                    </p>
                  </div>

                  {/* Dynamic: For buildings show "عدد الأدوار", otherwise show "رقم الدور" */}
                  {(form.propertyType === "عمارة سكنية" || form.propertyType === "مبنى تجاري") ? (
                    <div>
                      <SliderInput
                        label="عدد الأدوار"
                        value={form.totalFloors}
                        onChange={(val) => updateField("totalFloors", val)}
                        min={1}
                        max={50}
                        step={1}
                        unit="دور"
                        quickValues={[2, 3, 4, 5, 6, 8, 10, 15]}
                      />
                    </div>
                  ) : (
                    <div>
                      <SliderInput
                        label="رقم الدور"
                        value={form.floorNumber}
                        onChange={(val) => updateField("floorNumber", val)}
                        min={0}
                        max={50}
                        step={1}
                        unit="دور"
                        quickValues={[0, 1, 2, 3, 5, 10]}
                      />
                    </div>
                  )}

                  {/* Building-specific: Number of apartments */}
                  {(form.propertyType === "عمارة سكنية" || form.propertyType === "مبنى تجاري") && (
                    <div>
                      <SliderInput
                        label="عدد الشقق/الوحدات"
                        value={form.apartmentCount}
                        onChange={(val) => updateField("apartmentCount", val)}
                        min={1}
                        max={100}
                        step={1}
                        unit="وحدة"
                        quickValues={[4, 6, 8, 10, 12, 16, 20, 30]}
                      />
                    </div>
                  )}

                  {/* Building rental: Full or partial */}
                  {(form.propertyType === "عمارة سكنية" || form.propertyType === "مبنى تجاري") && form.purpose === "إيجار" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        نوع التأجير
                      </label>
                      <div className="flex gap-3">
                        {[
                          { value: "كامل", label: "تأجير كامل" },
                          { value: "جزئي", label: "تأجير جزئي" }
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => updateField("rentalScope", option.value as "كامل" | "جزئي")}
                            className={`flex-1 py-3 px-4 rounded-xl border-2 font-medium transition ${
                              form.rentalScope === option.value
                                ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parking spaces for all properties */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      مواقف السيارات
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["0", "1", "2", "3", "4", "4+"].map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateField("parkingSpaces", option)}
                          className={`py-2 px-4 rounded-lg border-2 text-sm transition min-w-[50px] ${
                            form.parkingSpaces === option
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {option === "0" ? "لا يوجد" : option === "4+" ? "+4" : option}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Property Amenities - Pool, Elevator, Garden */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      مميزات إضافية
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, hasPool: !prev.hasPool }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                          form.hasPool
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
                      >
                        <span className="text-2xl">🏊</span>
                        <span className="text-sm font-medium">مسبح</span>
                        {form.hasPool && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, hasElevator: !prev.hasElevator }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                          form.hasElevator
                            ? "border-purple-500 bg-purple-50 text-purple-700"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
                      >
                        <span className="text-2xl">🛗</span>
                        <span className="text-sm font-medium">مصعد</span>
                        {form.hasElevator && <CheckCircle2 className="w-4 h-4 text-purple-500" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, hasGarden: !prev.hasGarden }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                          form.hasGarden
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-slate-200 hover:border-slate-300 text-slate-600"
                        }`}
                      >
                        <span className="text-2xl">🌳</span>
                        <span className="text-sm font-medium">حديقة</span>
                        {form.hasGarden && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      واجهة العقار
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {DIRECTIONS.map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => updateField("direction", form.direction === dir ? "" : dir)}
                          className={`py-2 px-4 rounded-lg border-2 text-sm transition ${
                            form.direction === dir
                              ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          {dir}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 🏆 Business Tier Exclusive AI Features - After all property details for context */}
                  {(selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 ? (
                    <div className="md:col-span-2 mt-6 pt-6 border-t-2 border-slate-100">
                      <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-2xl p-5 border-2 border-amber-300 shadow-lg">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Crown className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-amber-800 text-lg">مركز الذكاء الاصطناعي الحصري 👑</h4>
                            <p className="text-xs text-amber-600">ميزات حصرية لمشتركي باقة رجال الأعمال - الآن لديك كل البيانات!</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Smart Pricing Button */}
                          <button
                            type="button"
                            onClick={generateSmartPricing}
                            disabled={pricingLoading || !form.propertyType || !form.city || !form.landArea}
                            className="flex items-center gap-3 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white py-3 px-4 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                          >
                            {pricingLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <TrendingUp className="w-5 h-5" />
                            )}
                            <div className="text-right">
                              <span className="block text-sm font-bold">💰 تحليل التسعير الذكي</span>
                              <span className="block text-xs opacity-80">اقتراح السعر المثالي بناءً على بياناتك</span>
                            </div>
                          </button>

                          {/* Marketing Tips Button */}
                          <button
                            type="button"
                            onClick={generateMarketingTips}
                            disabled={tipsLoading || !form.propertyType}
                            className="flex items-center gap-3 bg-gradient-to-l from-purple-500 to-purple-600 text-white py-3 px-4 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                          >
                            {tipsLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Rocket className="w-5 h-5" />
                            )}
                            <div className="text-right">
                              <span className="block text-sm font-bold">🎯 خطة تسويقية مخصصة</span>
                              <span className="block text-xs opacity-80">نصائح احترافية لإعلانك</span>
                            </div>
                          </button>
                        </div>

                        {/* Error Messages */}
                        {pricingError && (
                          <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {pricingError}
                          </p>
                        )}
                        {tipsError && (
                          <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {tipsError}
                          </p>
                        )}

                        {/* Pricing Result - Enhanced Design like Title Generation */}
                        {pricingResult && (
                          <div className="mt-4 p-4 rounded-xl border relative overflow-hidden bg-gradient-to-l from-emerald-50 via-teal-50/50 to-transparent border-emerald-100/60">
                            <div className="absolute top-0 left-0 w-1 h-full rounded-r-full bg-gradient-to-b from-emerald-400 to-teal-600"></div>
                            <div className="absolute top-4 right-4 w-16 h-16 bg-emerald-300/20 rounded-full blur-xl"></div>
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-lg flex items-center justify-center shadow-sm">
                                <TrendingUp className="w-4 h-4 text-white" />
                              </div>
                              <h5 className="font-bold text-emerald-700 text-lg">تحليل التسعير الذكي</h5>
                              <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full font-bold">AI</span>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm leading-relaxed mr-11" dir="rtl">
                              {pricingResult}
                            </div>
                          </div>
                        )}

                        {/* Marketing Tips Result - Enhanced Design like Title Generation */}
                        {tipsResult && (
                          <div className="mt-4 p-4 rounded-xl border relative overflow-hidden bg-gradient-to-l from-purple-50 via-violet-50/50 to-transparent border-purple-100/60">
                            <div className="absolute top-0 left-0 w-1 h-full rounded-r-full bg-gradient-to-b from-purple-400 to-violet-600"></div>
                            <div className="absolute top-4 right-4 w-16 h-16 bg-purple-300/20 rounded-full blur-xl"></div>
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-violet-600 rounded-lg flex items-center justify-center shadow-sm">
                                <Rocket className="w-4 h-4 text-white" />
                              </div>
                              <h5 className="font-bold text-purple-700 text-lg">خطة التسويق المخصصة</h5>
                              <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full font-bold">AI</span>
                            </div>
                            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-sm leading-relaxed mr-11" dir="rtl">
                              {tipsResult}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="md:col-span-2 mt-6 pt-6 border-t-2 border-slate-100">
                      <div className="relative overflow-hidden bg-gradient-to-br from-[#001A33] via-[#002845] to-[#003366] rounded-2xl p-6 border-2 border-[#D4AF37]/30 shadow-xl">
                        <div className="absolute top-0 left-0 w-full h-full opacity-10">
                          <div className="absolute top-4 right-4 w-32 h-32 bg-[#D4AF37] rounded-full blur-3xl"></div>
                          <div className="absolute bottom-4 left-4 w-24 h-24 bg-[#D4AF37] rounded-full blur-2xl"></div>
                        </div>
                        
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                              <BrainCircuit className="w-7 h-7 text-white" />
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-lg flex items-center gap-2">
                                مركز الذكاء الاصطناعي الحصري
                                <span className="px-2 py-0.5 bg-[#D4AF37] text-[#001A33] text-xs rounded-full font-bold">VIP</span>
                              </h4>
                              <p className="text-[#D4AF37] text-sm">احصل على تحليل ذكي للسعر قبل تحديده!</p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center border border-white/20">
                              <p className="text-2xl font-bold text-[#D4AF37]">+38%</p>
                              <p className="text-xs text-white/80">زيادة الاستفسارات</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center border border-white/20">
                              <p className="text-2xl font-bold text-[#D4AF37]">2x</p>
                              <p className="text-xs text-white/80">سرعة البيع</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center border border-white/20">
                              <p className="text-2xl font-bold text-[#D4AF37]">24/7</p>
                              <p className="text-xs text-white/80">دعم ذكي</p>
                            </div>
                          </div>
                          
                          <div className="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
                            <p className="text-white/90 text-sm mb-3 flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                              ماذا ستحصل عند الترقية؟
                            </p>
                            <ul className="space-y-2">
                              <li className="flex items-center gap-2 text-white/80 text-sm">
                                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                                تسعير ذكي بناءً على السوق
                              </li>
                              <li className="flex items-center gap-2 text-white/80 text-sm">
                                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                                نصائح تسويقية مخصصة
                              </li>
                              <li className="flex items-center gap-2 text-white/80 text-sm">
                                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-emerald-400" />
                                </div>
                                توليد عناوين وأوصاف احترافية
                              </li>
                            </ul>
                          </div>
                          
                          <a
                            href="/upgrade"
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] font-bold rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all duration-300 transform hover:scale-[1.02]"
                          >
                            <Crown className="w-5 h-5" />
                            ترقية إلى باقة رجال الأعمال
                            <ArrowLeft className="w-4 h-4" />
                          </a>
                          
                          <p className="text-center text-white/50 text-xs mt-3">
                            انضم لأكثر من 500+ رجل أعمال يستخدمون AI
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 💰 السعر - بعد تحليل الذكاء الاصطناعي */}
                  <div id="field-price" className="md:col-span-2 mt-6 pt-6 border-t-2 border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-[#D4AF37]" />
                        <label className="block text-lg font-bold text-[#002845]">
                          {form.purpose === "إيجار" ? "الإيجار السنوي" : "سعر العقار"} <span className="text-red-500">*</span>
                        </label>
                        {localCurrency && (
                          <span className="text-sm bg-gradient-to-l from-emerald-100 to-teal-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            💱 {localCurrency.name_ar}
                          </span>
                        )}
                      </div>
                      {/* زر تبديل العقار الضخم */}
                      <button
                        type="button"
                        onClick={() => updateField("isLargePrice", !form.isLargePrice)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                          form.isLargePrice 
                            ? "bg-gradient-to-l from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30" 
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                        عقار ضخم 🏢
                      </button>
                    </div>
                    {form.isLargePrice && (
                      <div className="mb-4 p-3 bg-gradient-to-l from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                        <p className="text-sm text-amber-700 flex items-center gap-2">
                          <span className="text-lg">🏗️</span>
                          <span><strong>وضع العقارات الضخمة:</strong> نطاق أسعار موسع يصل حتى <strong>10 مليار</strong> {localCurrency?.symbol || "ريال"} للأبراج والمجمعات الكبرى</span>
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-slate-500 mb-4">
                      {(selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 
                        ? "حدد السعر بناءً على اقتراح الذكاء الاصطناعي أعلاه" 
                        : `حدد سعر العقار المناسب للسوق ${localCurrency ? `(ب${localCurrency.name_ar})` : "(بالريال السعودي)"}`}
                    </p>
                    <SliderInput
                      label={form.purpose === "إيجار" 
                        ? `الإيجار السنوي (${localCurrency?.symbol || "ريال"})` 
                        : `السعر (${localCurrency?.symbol || "ريال"})`}
                      required
                      value={form.price}
                      onChange={(val) => updateField("price", val)}
                      min={0}
                      max={(() => {
                        let baseMax;
                        if (form.purpose === "إيجار") {
                          baseMax = form.isLargePrice ? 50000000 : 5000000; // 50 مليون للإيجار الضخم
                        } else {
                          baseMax = form.isLargePrice ? 10000000000 : 1000000000; // 10 مليار للعقارات الضخمة
                        }
                        if (!localCurrency) return baseMax;
                        return Math.round(baseMax * localCurrency.rate);
                      })()}
                      step={(() => {
                        let baseStep;
                        if (form.purpose === "إيجار") {
                          baseStep = form.isLargePrice ? 100000 : 5000;
                        } else {
                          baseStep = form.isLargePrice ? 1000000 : 100000; // مليون للعقارات الضخمة
                        }
                        if (!localCurrency) return baseStep;
                        // rate = "1 ريال = X عملة محلية"
                        // للتحويل من ريال لعملة محلية: ريال × rate
                        const converted = baseStep * localCurrency.rate;
                        // تقريب للأرقام المناسبة
                        if (localCurrency.code === "TRY" || localCurrency.code === "EGP") {
                          return Math.round(converted / 10000) * 10000 || 10000;
                        }
                        if (localCurrency.code === "LBP") {
                          return Math.round(converted / 1000000) * 1000000 || 1000000;
                        }
                        return Math.round(converted / 100) * 100 || 100;
                      })()}
                      unit={localCurrency?.symbol || "ريال"}
                      error={errors.price}
                      formatLabel={(v) => {
                        const symbol = localCurrency?.symbol || "ريال";
                        if (v >= 1000000000) return `${(v/1000000000).toFixed(2)} مليار ${symbol}`;
                        if (v >= 1000000) return `${(v/1000000).toFixed(2)} مليون ${symbol}`;
                        return `${v.toLocaleString("en-US")} ${symbol}`;
                      }}
                      quickValues={(() => {
                        let sarValues;
                        if (form.purpose === "إيجار") {
                          sarValues = form.isLargePrice
                            ? [500000, 1000000, 2000000, 5000000, 10000000, 20000000, 30000000, 50000000]
                            : [5000, 10000, 25000, 50000, 100000, 200000, 500000, 1000000];
                        } else {
                          sarValues = form.isLargePrice
                            ? [100000000, 500000000, 1000000000, 2000000000, 3000000000, 5000000000, 7000000000, 10000000000]
                            : [5000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000];
                        }
                        if (!localCurrency) return sarValues;
                        // rate = "1 ريال = X عملة محلية"
                        // للتحويل من ريال لعملة محلية: ريال × rate
                        return sarValues.map(v => {
                          const converted = v * localCurrency.rate;
                          // تقريب لأرقام جميلة
                          if (converted >= 1000000000) return Math.round(converted / 100000000) * 100000000;
                          if (converted >= 100000000) return Math.round(converted / 10000000) * 10000000;
                          if (converted >= 10000000) return Math.round(converted / 1000000) * 1000000;
                          if (converted >= 1000000) return Math.round(converted / 100000) * 100000;
                          if (converted >= 100000) return Math.round(converted / 10000) * 10000;
                          if (converted >= 10000) return Math.round(converted / 1000) * 1000;
                          return Math.round(converted / 100) * 100;
                        });
                      })()}
                    />
                    {/* عرض السعر بالدولار الأمريكي كمرجع عالمي */}
                    {Number(form.price) > 0 && (
                      <div className="mt-3 p-3 bg-gradient-to-l from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <span className="text-lg">💵</span>
                          <span className="font-medium">ما يعادل بالدولار الأمريكي:</span>
                          <span className="font-bold text-lg">
                            {(() => {
                              // rate = "1 ريال = X عملة محلية"
                              // للتحويل من عملة محلية لريال: عملة محلية / rate
                              // ثم من ريال لدولار: ريال / 3.75
                              const sarPrice = localCurrency 
                                ? Number(form.price) / localCurrency.rate 
                                : Number(form.price);
                              const usdPrice = sarPrice / 3.75;
                              if (usdPrice >= 1000000000) return `${(usdPrice/1000000000).toFixed(2)} مليار`;
                              if (usdPrice >= 1000000) return `${(usdPrice/1000000).toFixed(2)} مليون`;
                              if (usdPrice >= 1000) return `${(usdPrice/1000).toFixed(1)} ألف`;
                              return usdPrice.toLocaleString("en-US", { maximumFractionDigits: 0 });
                            })()} $
                          </span>
                        </div>
                        <p className="text-xs text-emerald-600 mt-1">
                          {localCurrency 
                            ? `سعر الصرف: 1 دولار ≈ ${(3.75 * localCurrency.rate).toFixed(2)} ${localCurrency.name_ar}`
                            : `سعر الصرف: 1 دولار ≈ 3.75 ريال سعودي`
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ✏️ عنوان الإعلان - بعد إدخال كل المعلومات */}
                  <div id="field-title" className="md:col-span-2 mt-6 pt-6 border-t-2 border-slate-100">
                    <div className={`p-4 rounded-xl border relative overflow-hidden transition-all duration-700 ${
                      titleLoading 
                        ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600 border-green-300 shadow-lg shadow-green-200/50' 
                        : 'bg-gradient-to-l from-amber-50 via-yellow-50/50 to-transparent border-amber-100/60'
                    }`}>
                      {/* 🌿 تأثير المروج أثناء التوليد */}
                      {titleLoading && (
                        <>
                          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+CiAgPHBhdGggZD0iTTMwIDUgQzM1IDE1IDQ1IDE1IDUwIDI1IEw1MCA1NSBMMTAgNTUgTDEwIDI1IEMxNSAxNSAyNSAxNSAzMCA1IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz4KPC9zdmc+')] opacity-30 animate-pulse"></div>
                          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-green-600/40 to-transparent"></div>
                          <div className="absolute top-4 right-4 w-16 h-16 bg-yellow-300/30 rounded-full blur-xl animate-pulse"></div>
                          <div className="absolute top-2 left-1/4 w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="absolute top-6 left-1/2 w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '0.3s'}}></div>
                          <div className="absolute top-3 left-3/4 w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{animationDelay: '0.5s'}}></div>
                        </>
                      )}
                      <div className={`absolute top-0 left-0 w-1 h-full rounded-r-full transition-colors duration-500 ${
                        titleLoading ? 'bg-gradient-to-b from-yellow-300 to-green-300' : 'bg-gradient-to-b from-amber-400 to-amber-600'
                      }`}></div>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-sm">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <label className="block text-lg font-bold text-[#002845]">
                          عنوان الإعلان <span className="text-red-500">*</span>
                        </label>
                        {/* زر توليد العنوان بالذكاء الاصطناعي - مصغر بجانب العنوان */}
                        {(selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 ? (
                          <button
                            type="button"
                            onClick={generateAITitle}
                            disabled={titleLoading || !form.propertyType || !form.city}
                            className="bg-gradient-to-l from-[#002845] to-[#0A3D6F] text-white py-2 px-4 rounded-xl text-xs font-bold hover:from-[#0A3D6F] hover:to-[#0F5899] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl border border-[#D4AF37]/30 hover:border-[#D4AF37]"
                          >
                            {titleLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <BrainCircuit className="w-4 h-4 text-[#D4AF37]" />
                                <span>توليد بالذكاء</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            AI للباقات المتقدمة
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3 mr-11">
                        اكتب عنواناً جذاباً ومختصراً يظهر في نتائج البحث ويجذب المشترين
                      </p>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => updateField("title", e.target.value)}
                        placeholder="مثال: فيلا فاخرة 5 غرف في حي النرجس - تشطيب سوبر ديلوكس"
                        className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-base bg-white"
                      />
                      {titleError && (
                        <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {titleError}
                        </p>
                      )}
                      {errors.title && <p className="text-red-500 text-xs mt-2">{errors.title}</p>}
                    </div>
                  </div>

                  {/* AI Description Section - Moved here after all details are filled */}
                  <div className="md:col-span-2 mt-4">
                    <div className={`p-4 rounded-xl border relative overflow-hidden transition-all duration-700 ${
                      aiLoading 
                        ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600 border-green-300 shadow-lg shadow-green-200/50' 
                        : 'bg-gradient-to-l from-purple-50 via-violet-50/50 to-transparent border-purple-100/60'
                    }`}>
                      {/* 🌿 تأثير المروج أثناء التوليد */}
                      {aiLoading && (
                        <>
                          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+CiAgPHBhdGggZD0iTTMwIDUgQzM1IDE1IDQ1IDE1IDUwIDI1IEw1MCA1NSBMMTAgNTUgTDEwIDI1IEMxNSAxNSAyNSAxNSAzMCA1IiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz4KPC9zdmc+')] opacity-30 animate-pulse"></div>
                          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-green-600/40 to-transparent"></div>
                          <div className="absolute top-4 left-8 w-20 h-20 bg-yellow-300/30 rounded-full blur-xl animate-pulse"></div>
                          <div className="absolute top-8 right-1/4 w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{animationDelay: '0s'}}></div>
                          <div className="absolute top-4 right-1/2 w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          <div className="absolute top-6 right-3/4 w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                          <div className="absolute bottom-12 left-1/3 w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '0.6s'}}></div>
                        </>
                      )}
                      <div className={`absolute top-0 left-0 w-1 h-full rounded-r-full transition-colors duration-500 ${
                        aiLoading ? 'bg-gradient-to-b from-yellow-300 to-green-300' : 'bg-gradient-to-b from-purple-400 to-violet-600'
                      }`}></div>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-violet-600 rounded-lg flex items-center justify-center shadow-sm">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <label className="block text-lg font-bold text-[#002845]">
                          وصف الإعلان
                        </label>
                        {/* زر توليد الوصف - مصغر بجانب العنوان */}
                        {aiLevel >= 1 ? (
                          <button
                            type="button"
                            onClick={generateAIDescription}
                            disabled={aiLoading || !form.propertyType || !form.city}
                            className={`py-2 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all shadow-lg hover:shadow-xl bg-gradient-to-l from-[#002845] to-[#0A3D6F] hover:from-[#0A3D6F] hover:to-[#0F5899] border border-[#D4AF37]/30 hover:border-[#D4AF37] ${(aiLoading || !form.propertyType || !form.city) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {aiLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <BrainCircuit className="w-4 h-4 text-[#D4AF37]" />
                                <span>توليد بالذكاء</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            AI للباقات المتقدمة
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3 mr-11">
                        أضف وصفاً تفصيلياً للعقار يجذب المشترين
                      </p>
                      {aiError && (
                        <p className="mb-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg">{aiError}</p>
                      )}
                      <textarea
                        value={form.description}
                        onChange={(e) => updateField("description", e.target.value)}
                        placeholder="اكتب وصفاً تفصيلياً للعقار... أو اضغط على زر التوليد لإنشاء وصف تلقائي"
                        rows={5}
                        className="w-full px-4 py-3 border-2 border-purple-200 rounded-xl focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none transition resize-none text-base bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="p-6 md:p-8">
                <h2 className="text-xl font-bold text-[#002845] mb-6 flex items-center gap-2">
                  <MapPin className="w-6 h-6 text-[#D4AF37]" />
                  موقع العقار على الخريطة
                </h2>

                <div id="field-location">
                  <LeafletLocationPicker
                    onLocationSelect={handleLocationSelect}
                    initialLocation={form.latitude && form.longitude ? { lat: form.latitude, lng: form.longitude } : undefined}
                    selectedCity={form.city}
                    selectedCountry={form.country}
                  />
                </div>

                {form.latitude && form.longitude && (
                  <div className="mt-4 p-4 bg-slate-50 rounded-xl border-2 border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-[#D4AF37]" />
                        <span className="font-semibold text-[#002845]">الموقع المحدد</span>
                      </div>
                      {locationConfirmed ? (
                        <span className="flex items-center gap-1 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                          <CheckCircle2 className="w-4 h-4" />
                          تم التأكيد
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                          بانتظار التأكيد
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-3">
                      الإحداثيات: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                    </p>
                    {form.formattedAddress && (
                      <p className="text-sm text-slate-600 mb-3">
                        العنوان: {form.formattedAddress}
                      </p>
                    )}
                    
                    {!locationConfirmed && (
                      <div className="flex gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => setLocationConfirmed(true)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-l from-[#0B6B4C] to-[#0d8a5e] text-white font-semibold rounded-xl hover:opacity-90 transition"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          أكد الموقع
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm(prev => ({ ...prev, latitude: 0, longitude: 0, formattedAddress: "" }));
                            setLocationConfirmed(false);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition"
                        >
                          <RefreshCw className="w-5 h-5" />
                          إعادة المحاولة
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {errors.latitude && (
                  <p className="text-red-500 text-sm mt-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {errors.latitude}
                  </p>
                )}

                {/* تحذير ترويجي: الموقع لا يظهر في الباقة الحالية */}
                {plan && !plan.showOnMap && (
                  <div className="mt-6 p-4 bg-gradient-to-l from-amber-50 to-orange-50 border-2 border-[#D4AF37]/40 rounded-2xl">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-xl flex items-center justify-center shrink-0">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-[#002845] mb-1 flex items-center gap-2">
                          <Crown className="w-4 h-4 text-[#D4AF37]" />
                          اجعل عقارك يظهر على الخريطة!
                        </h4>
                        <p className="text-sm text-slate-600 mb-3">
                          باقتك الحالية <span className="font-semibold text-[#002845]">({plan.planName})</span> لا تدعم عرض العقار على خريطة البحث. 
                          قم بالترقية لتظهر إعلاناتك للباحثين على الخريطة وتزيد فرص البيع!
                        </p>
                        <a
                          href="/upgrade"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition"
                        >
                          <Crown className="w-4 h-4" />
                          ترقية الباقة
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="p-6 md:p-8">
                <h2 className="text-xl font-bold text-[#002845] mb-6 flex items-center gap-2">
                  <ImageIcon className="w-6 h-6 text-[#D4AF37]" />
                  صور وفيديو العقار
                </h2>

                <div id="field-media" className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-slate-700">
                      صور العقار <span className="text-red-500">*</span>
                    </label>
                    <span className="text-xs text-slate-500">
                      {images.length} / {selectedBucket?.benefits.maxPhotos || plan?.maxPhotosPerListing || 5} صور
                    </span>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-[#D4AF37] transition">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImagesChange}
                      className="hidden"
                      id="images-upload"
                    />
                    <label htmlFor="images-upload" className="cursor-pointer">
                      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600 font-medium">اضغط لرفع الصور أو اسحبها هنا</p>
                      <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP حتى 10 ميجابايت</p>
                    </label>
                  </div>

                  {imagePreviews.length > 0 && (
                    <div className="mt-4">
                      {/* Video Generation Image Selection - Only for Business tier */}
                      {(selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 && imagePreviews.length > 3 && (
                        <div className="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Film className="w-5 h-5 text-emerald-600" />
                              <h4 className="font-semibold text-emerald-800">اختر الصور لتوليد الفيديو</h4>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={selectAllImages}
                                className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                              >
                                تحديد الكل
                              </button>
                              <button
                                type="button"
                                onClick={deselectAllImages}
                                className="text-xs px-3 py-1 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                              >
                                إلغاء الكل
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-emerald-700 mb-3">
                            <Zap className="w-4 h-4" />
                            <span className="font-medium">
                              تم اختيار {selectedImagesForVideo.size} من {imagePreviews.length} صورة
                            </span>
                          </div>
                          <div className="p-3 bg-white/80 rounded-lg border border-emerald-200">
                            <p className="text-xs text-emerald-800 flex items-start gap-2">
                              <span className="text-emerald-600 font-bold">💡 نصيحة:</span>
                              <span>
                                كلما قل عدد الصور المختارة، كلما كانت عملية التوليد أسرع. ننصح باختيار 3-8 صور للحصول على أفضل نتيجة.
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                        {imagePreviews.map((preview, idx) => {
                          const isSelected = selectedImagesForVideo.has(idx);
                          const showVideoSelection = (selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 && imagePreviews.length > 3;
                          
                          return (
                            <div 
                              key={idx} 
                              className={`relative group aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                showVideoSelection && isSelected 
                                  ? 'border-emerald-500 ring-2 ring-emerald-300 ring-offset-2' 
                                  : 'border-slate-200'
                              }`}
                              onContextMenu={(e) => e.preventDefault()}
                            >
                              <img 
                                src={preview} 
                                alt={`صورة ${idx + 1}`} 
                                className="w-full h-full object-cover pointer-events-none select-none" 
                                draggable={false}
                              />
                              {idx === 0 && (
                                <div className="absolute top-2 right-2 bg-[#D4AF37] text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 z-10">
                                  <Star className="w-3 h-3" />
                                  الغلاف
                                </div>
                              )}
                              {/* Video selection checkbox - Only for Business tier with >3 images */}
                              {showVideoSelection && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleImageSelection(idx);
                                  }}
                                  className={`absolute top-2 left-2 w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${
                                    isSelected
                                      ? 'bg-emerald-500 text-white shadow-lg'
                                      : 'bg-white/90 text-slate-600 hover:bg-emerald-100'
                                  }`}
                                  title={isSelected ? 'إلغاء الاختيار' : 'اختيار للفيديو'}
                                >
                                  {isSelected ? (
                                    <Check className="w-5 h-5" />
                                  ) : (
                                    <Film className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                className="absolute bottom-2 left-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition z-10"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              {/* Selected indicator overlay */}
                              {isSelected && (
                                <div className="absolute inset-0 bg-emerald-500/20 border-2 border-emerald-500 rounded-xl pointer-events-none" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {errors.media && (
                    <p className="text-red-500 text-xs mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {errors.media}
                    </p>
                  )}
                </div>

                {(selectedBucket?.benefits.maxVideos || 0) > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Video className="w-5 h-5 text-[#D4AF37]" />
                        فيديو العقار (اختياري)
                      </label>
                      <span className="text-xs text-slate-500">
                        حد أقصى {selectedBucket?.benefits.maxVideoDuration || plan?.maxVideoDuration || 60} ثانية
                      </span>
                    </div>

                    {!videoPreview ? (
                      <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-[#D4AF37] transition">
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                          id="video-upload"
                        />
                        <label htmlFor="video-upload" className="cursor-pointer">
                          <Video className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                          <p className="text-slate-600 font-medium">اضغط لرفع فيديو</p>
                          <p className="text-xs text-slate-400 mt-1">MP4, WEBM حتى 50 ميجابايت</p>
                        </label>
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border-2 border-slate-200">
                        <video src={videoPreview} controls className="w-full max-h-[300px]" />
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="absolute top-3 left-3 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Video Generation - Prominent placement for Business tier */}
                {(selectedBucket?.benefits?.aiSupportLevel ?? 0) >= 3 && (
                  <div className="mt-6 pt-6 border-t-2 border-dashed border-[#D4AF37]/30">
                    <div className="bg-gradient-to-r from-rose-50 via-pink-50 to-fuchsia-50 rounded-2xl p-5 border-2 border-rose-200 shadow-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                          <span className="text-2xl">📷</span>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-emerald-800 text-lg">فيديو تلقائي من صورك الفعلية! ✨</h4>
                          <p className="text-sm text-emerald-600">سيُنشأ فيديو احترافي من الصور التي رفعتها</p>
                        </div>
                      </div>
                      
                      {/* رسالة الفيديو التلقائي */}
                      <div className="mb-4 p-4 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl text-white">
                        <h5 className="font-bold text-yellow-300 mb-2 flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          🎬 فيديو تلقائي من صور عقارك!
                        </h5>
                        <ul className="text-sm space-y-1 opacity-90">
                          <li>✅ يُنشأ تلقائياً بعد نشر الإعلان</li>
                          <li>✅ يستخدم <strong>صورك الفعلية</strong> التي رفعتها</li>
                          <li>✅ تأثير حركة سينمائية احترافية (Ken Burns)</li>
                          <li>✅ نصوص تحفيزية فريدة من الذكاء الاصطناعي</li>
                        </ul>
                        <p className="mt-3 text-yellow-200 text-xs">
                          💡 لا حاجة لإنشاء الفيديو يدوياً - سيظهر تلقائياً في صفحة إعلانك!
                        </p>
                      </div>
                      
                      {/* نصيحة مهمة */}
                      <div className="p-3 bg-white/80 border border-emerald-300 rounded-lg">
                        <p className="text-sm text-emerald-800 text-center">
                          ✨ انشر إعلانك الآن وسيظهر الفيديو من صورك خلال دقيقة أو دقيقتين!
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="p-6 md:p-8">
                <h2 className="text-xl font-bold text-[#002845] mb-6 flex items-center gap-2">
                  <Eye className="w-6 h-6 text-[#D4AF37]" />
                  مراجعة الإعلان
                </h2>

                <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-500 mb-2">نوع العرض</h3>
                      <p className="text-lg font-bold text-[#002845]">{form.purpose} - {form.usageType}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-500 mb-2">نوع العقار</h3>
                      <p className="text-lg font-bold text-[#002845]">{form.propertyType}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-500 mb-2">عنوان الإعلان</h3>
                    <p className="text-lg font-bold text-[#002845]">{form.title}</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
                      <p className="text-xs text-slate-500">السعر</p>
                      <p className="text-lg font-bold text-[#D4AF37]">
                        {Number(form.price).toLocaleString()} {localCurrency?.symbol || "ر.س"}
                      </p>
                      {localCurrency && (
                        <p className="text-xs text-slate-500 mt-1">
                          ≈ {Math.round(Number(form.price) / localCurrency.rate).toLocaleString()} ر.س
                        </p>
                      )}
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
                      <p className="text-xs text-slate-500">مساحة الأرض</p>
                      <p className="text-lg font-bold text-[#002845]">{form.landArea || "--"} م²</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
                      <p className="text-xs text-slate-500">مساحة البناء</p>
                      <p className="text-lg font-bold text-[#002845]">{form.buildingArea || "--"} م²</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
                      <p className="text-xs text-slate-500">الغرف</p>
                      <p className="text-lg font-bold text-[#002845]">{form.bedrooms}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 text-center">
                      <p className="text-xs text-slate-500">دورات المياه</p>
                      <p className="text-lg font-bold text-[#002845]">{form.bathrooms}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-4 border border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-500 mb-2">الموقع</h3>
                    <p className="text-[#002845]">{form.country} - {form.city}، {form.district}</p>
                    {form.formattedAddress && (
                      <p className="text-sm text-slate-500 mt-1">{form.formattedAddress}</p>
                    )}
                  </div>

                  {imagePreviews.length > 0 && (
                    <div className="bg-white rounded-xl p-4 border border-slate-200">
                      <h3 className="text-sm font-semibold text-slate-500 mb-3">الصور ({images.length})</h3>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {imagePreviews.slice(0, 5).map((preview, idx) => (
                          <img key={idx} src={preview} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                        ))}
                        {imagePreviews.length > 5 && (
                          <div className="w-20 h-20 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                            <span className="text-slate-600 font-bold">+{imagePreviews.length - 5}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {selectedBucket && (
                  <div className="mt-6 bg-gradient-to-br from-[#D4AF37]/10 to-amber-50 rounded-2xl p-5 border-2 border-[#D4AF37]/30">
                    <h3 className="text-lg font-bold text-[#002845] mb-4 flex items-center gap-2">
                      <Package className="w-5 h-5 text-[#D4AF37]" />
                      الباقة المستخدمة لهذا الإعلان
                    </h3>
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-lg shrink-0"
                        style={{ backgroundColor: selectedBucket.planColor || '#D4AF37' }}
                      >
                        {selectedBucket.planIcon || selectedBucket.planName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-[#002845] text-lg">{selectedBucket.planName}</h4>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Camera className="w-4 h-4 text-blue-500" />
                            <span>حتى {selectedBucket.benefits.maxPhotos} صورة</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Film className="w-4 h-4 text-purple-500" />
                            <span>حتى {selectedBucket.benefits.maxVideos} فيديو</span>
                          </div>
                          {selectedBucket.benefits.showOnMap && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                              <Map className="w-4 h-4" />
                              <span>ظهور على الخريطة</span>
                            </div>
                          )}
                          {selectedBucket.expiresAt && (
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span>ينتهي: {new Date(selectedBucket.expiresAt).toLocaleDateString('ar-SA')}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-3 bg-white/50 px-3 py-2 rounded-lg">
                          سيتم خصم إعلان واحد من رصيد هذه الباقة. متبقي حالياً: <span className="font-bold text-[#D4AF37]">{selectedBucket.remainingSlots} إعلان</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="mt-4 text-sm text-[#D4AF37] hover:underline flex items-center gap-1"
                    >
                      <ChevronRight className="w-4 h-4" />
                      تغيير الباقة
                    </button>
                  </div>
                )}

                {isEligibleForElite && (
                  <div className="mt-6 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-2xl p-6 border-2 border-[#D4AF37] shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center shadow-lg">
                        <Crown className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-[#002845]">🏆 عرض حصري لمشتركي رجال الأعمال!</h3>
                        <p className="text-sm text-slate-600">اعرض عقارك في "نخبة العقارات المختارة" على الصفحة الرئيسية</p>
                      </div>
                    </div>

                    {elitePaymentData ? (
                      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="font-bold text-green-800">تم الدفع بنجاح! 🎉</h4>
                            <p className="text-sm text-green-600">
                              رقم الفاتورة: {elitePaymentData.invoiceNumber}
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                              سيتم تفعيل الموقع تلقائياً بعد الموافقة على إعلانك
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white/70 backdrop-blur rounded-xl p-4 mb-4">
                          <h4 className="font-bold text-[#002845] mb-3 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                            اختر موقعك المميز (7 أيام)
                          </h4>
                          
                          {/* عرض عدد الخانات المتاحة */}
                          {eliteSlots.length > 0 && (
                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <p className="text-sm text-blue-800 flex items-center gap-2">
                                <span className="text-lg">📊</span>
                                <span>الخانات المتاحة: <strong>{eliteSlots.filter(s => s.status !== 'booked').length}</strong> من أصل <strong>{eliteSlots.length}</strong></span>
                              </p>
                            </div>
                          )}
                          
                          {eliteSlots.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              {eliteSlots.map((slot) => {
                                const isBooked = slot.status === 'booked';
                                const isSelected = selectedEliteSlot?.id === slot.id;
                                const tierEmoji = slot.tier === 'top' ? '🥇' : slot.tier === 'middle' ? '🥈' : '🥉';
                                const tierBg = slot.tier === 'top' 
                                  ? 'from-amber-100 to-amber-50 border-amber-300' 
                                  : slot.tier === 'middle' 
                                  ? 'from-slate-100 to-slate-50 border-slate-300' 
                                  : 'from-orange-100 to-orange-50 border-orange-300';
                                
                                return (
                                  <button
                                    key={slot.id}
                                    type="button"
                                    disabled={isBooked}
                                    onClick={() => setSelectedEliteSlot(isSelected ? null : slot)}
                                    className={`text-center p-3 rounded-xl border-2 transition-all ${
                                      isBooked 
                                        ? 'bg-slate-200 border-slate-300 cursor-not-allowed opacity-50' 
                                        : isSelected
                                        ? 'bg-gradient-to-b from-[#002845] to-[#003d5c] border-[#D4AF37] text-white ring-2 ring-[#D4AF37]'
                                        : `bg-gradient-to-b ${tierBg} hover:scale-105`
                                    }`}
                                  >
                                    <div className="text-xl mb-1">{isBooked ? '❌' : tierEmoji}</div>
                                    <p className={`text-xs mb-1 ${isSelected ? 'text-white/80' : 'text-slate-600'}`}>
                                      موقع {slot.row_num}-{slot.col_num}
                                    </p>
                                    <p className={`font-bold ${
                                      isSelected ? 'text-[#D4AF37]' : 
                                      slot.tier === 'top' ? 'text-[#D4AF37]' : 
                                      slot.tier === 'middle' ? 'text-slate-700' : 'text-orange-700'
                                    }`}>
                                      {isBooked ? 'محجوز' : `${slot.base_price} ريال`}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-slate-500">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                              جاري تحميل المواقع المتاحة...
                            </div>
                          )}
                          
                          <p className="text-xs text-slate-500 text-center">* الأسعار شاملة</p>
                        </div>

                        {selectedEliteSlot && (
                          <div className="bg-gradient-to-l from-[#002845]/10 to-[#D4AF37]/10 rounded-xl p-5 mb-4 border-2 border-[#D4AF37]/50">
                            <h5 className="font-bold text-[#002845] mb-4 flex items-center gap-2">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ملخص اختيارك للنخبة
                            </h5>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div className="bg-white rounded-lg p-3 text-center">
                                <p className="text-xs text-slate-500 mb-1">الموقع المختار</p>
                                <p className="font-bold text-[#002845]">
                                  الصف {selectedEliteSlot.tier === 'top' ? 'الأول 🥇' : selectedEliteSlot.tier === 'middle' ? 'الثاني 🥈' : 'الثالث 🥉'}
                                </p>
                                <p className="text-sm text-slate-600">موقع {selectedEliteSlot.row_num}-{selectedEliteSlot.col_num}</p>
                              </div>
                              <div className="bg-white rounded-lg p-3 text-center">
                                <p className="text-xs text-slate-500 mb-1">التكلفة</p>
                                <p className="text-2xl font-bold text-[#D4AF37]">
                                  {parseFloat(selectedEliteSlot.base_price).toFixed(0)}
                                </p>
                                <p className="text-sm text-slate-600">ريال سعودي</p>
                              </div>
                            </div>
                            
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                              <p className="text-sm text-amber-800 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>سيتم طلب الدفع عند الضغط على "نشر الإعلان". يمكنك التراجع الآن أو تغيير الموقع.</span>
                              </p>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => setSelectedEliteSlot(null)}
                              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white text-red-600 rounded-xl font-semibold hover:bg-red-50 transition border-2 border-red-200"
                            >
                              <X className="w-4 h-4" />
                              إلغاء اختيار النخبة
                            </button>
                          </div>
                        )}

                        {!selectedEliteSlot && (
                          <div className="bg-slate-100 rounded-xl p-4 text-center">
                            <p className="text-slate-600 text-sm">
                              اختر موقعاً من الشبكة أعلاه لعرض إعلانك في نخبة العقارات، أو تابع بدون هذه الميزة.
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-center text-slate-500 mt-3">
                          سيتم تفعيل الموقع تلقائياً بعد الموافقة على إعلانك من الإدارة
                        </p>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <p className="text-amber-800 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>سيتم مراجعة إعلانك من قبل الإدارة قبل نشره. ستتلقى إشعاراً عند الموافقة عليه.</span>
                  </p>
                </div>

                {submitError && (
                  <div className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-red-700 text-sm flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      {submitError}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition ${
                  step === 0
                    ? "text-slate-400 cursor-not-allowed"
                    : "text-slate-700 hover:bg-slate-200"
                }`}
              >
                <ChevronRight className="w-5 h-5" />
                السابق
              </button>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-2 px-8 py-3 bg-[#002845] text-white rounded-xl font-semibold hover:bg-[#003356] transition"
                >
                  التالي
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  {selectedEliteSlot && !elitePaymentData && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Crown className="w-3 h-3" />
                      يتضمن دفع النخبة: {parseFloat(selectedEliteSlot.base_price).toFixed(0)} ريال
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري النشر...
                      </>
                    ) : selectedEliteSlot && !elitePaymentData ? (
                      <>
                        <Crown className="w-5 h-5" />
                        نشر مع النخبة
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        نشر الإعلان
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>

        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
              <div className="bg-gradient-to-l from-[#002845] to-[#003d5c] p-6 text-white">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Send className="w-6 h-6" />
                  </div>
                  تأكيد نشر الإعلان
                </h3>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                <div className="bg-slate-50 rounded-2xl p-3 mb-4">
                  <h4 className="font-bold text-[#002845] mb-2 flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-[#D4AF37]" />
                    ملخص الإعلان
                  </h4>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p><span className="font-semibold">العنوان:</span> {form.title}</p>
                    <p><span className="font-semibold">النوع:</span> {form.propertyType} - {form.purpose}</p>
                    <p><span className="font-semibold">الموقع:</span> {form.country} - {form.city}</p>
                    <p><span className="font-semibold">السعر:</span> {Number(form.price).toLocaleString()} ريال</p>
                    <p><span className="font-semibold">الصور:</span> {images.length} صورة</p>
                  </div>
                </div>

                {/* قسم دفع النخبة في modal التأكيد */}
                {selectedEliteSlot && !elitePaymentData && (
                  <div className="bg-gradient-to-l from-amber-50 to-orange-50 rounded-lg p-3 mb-3 border border-[#D4AF37]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-[#D4AF37]" />
                        <span className="font-semibold text-[#002845] text-sm">موقع النخبة</span>
                      </div>
                      <span className="font-bold text-[#D4AF37]">{parseFloat(selectedEliteSlot.base_price).toFixed(0)} ريال</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      الصف {selectedEliteSlot.tier === 'top' ? 'الأول 🥇' : selectedEliteSlot.tier === 'middle' ? 'الثاني 🥈' : 'الثالث 🥉'} - سيتم الخصم عند التأكيد
                    </p>
                  </div>
                )}

                <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
                  <p className="text-amber-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>تنبيه:</strong> سيتم إرسال إعلانك للمراجعة من قبل الإدارة. 
                      ستتلقى إشعاراً عند الموافقة عليه أو في حال وجود ملاحظات.
                    </span>
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-3 px-6 rounded-xl font-semibold border-2 border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                  >
                    مراجعة مرة أخرى
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSubmit}
                    disabled={submitting || elitePaymentLoading}
                    className="flex-1 py-3 px-6 rounded-xl font-semibold bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting || elitePaymentLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {elitePaymentLoading ? 'جاري الدفع...' : 'جاري الإرسال...'}
                      </>
                    ) : selectedEliteSlot && !elitePaymentData ? (
                      <>
                        <Crown className="w-5 h-5" />
                        ادفع وانشر ({parseFloat(selectedEliteSlot.base_price).toFixed(0)} ر.س)
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        تأكيد ونشر
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showElitePaymentModal && selectedEliteSlot && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-gradient-to-l from-[#D4AF37] to-[#B8860B] p-6 text-white">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Crown className="w-6 h-6" />
                  </div>
                  دفع حجز موقع النخبة
                </h3>
              </div>
              
              <div className="p-6">
                <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-600">الموقع:</span>
                    <span className="font-bold text-[#002845]">
                      الصف {selectedEliteSlot.tier === 'top' ? 'الأول' : selectedEliteSlot.tier === 'middle' ? 'الثاني' : 'الثالث'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-600">المدة:</span>
                    <span className="font-semibold">7 أيام</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between items-center">
                    <span className="font-bold text-[#002845]">الإجمالي:</span>
                    <span className="text-xl font-bold text-[#D4AF37]">{parseFloat(selectedEliteSlot.base_price).toFixed(2)} ريال</span>
                  </div>
                </div>

                <div className="bg-emerald-50 rounded-xl p-4 mb-6 border border-emerald-200">
                  <p className="text-emerald-800 text-sm flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>هذه بيئة تجريبية. سيتم تأكيد الحجز مباشرة بدون خصم فعلي.</span>
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowElitePaymentModal(false)}
                    className="flex-1 py-3 px-6 rounded-xl font-semibold border-2 border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleElitePayment}
                    disabled={elitePaymentLoading}
                    className="flex-1 py-3 px-6 rounded-xl font-semibold bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {elitePaymentLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري التأكيد...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        تأكيد الحجز التجريبي
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-24 left-6 z-50 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white p-3 rounded-full shadow-lg hover:opacity-90 transition-all duration-300 animate-in fade-in zoom-in"
            aria-label="العودة للأعلى"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );
}
