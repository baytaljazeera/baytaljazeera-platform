"use client";

import { API_URL, getAuthHeaders } from "@/lib/api";
import { RESIDENTIAL_TYPES, COMMERCIAL_TYPES, isResidential, isCommercial, normalizeType, getSpecialties } from "@/lib/propertyTypes";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Save, Loader2, Home, MapPin, DollarSign, Ruler, BedDouble, Bath, Camera, Video, Building2, Crown, Sparkles, Rocket, CheckCircle2, AlertTriangle, X, Upload, Trash2, Plus, ImagePlus, Star, Check, Film, Zap } from "lucide-react";
import Link from "next/link";
import { getImageUrl } from "@/lib/imageUrl";

interface MediaItem {
  id: string;
  url: string;
  is_cover?: boolean;
}

interface Listing {
  id: string;
  title: string;
  description: string;
  city: string;
  district: string;
  type: string;
  purpose: string;
  price: number;
  area: number;
  bedrooms: number;
  bathrooms: number;
  latitude: number;
  longitude: number;
  images: MediaItem[];
  video_url: string;
  video_status?: string;
  property_age: string;
  floor_number: number;
  direction: string;
  parking_spaces: number;
  status: string;
  support_level?: number;
}

// Types for countries and cities
type Country = {
  id: number;
  code: string;
  name_ar: string;
  name_en: string;
  flag_emoji: string;
};

type City = {
  id: number;
  name_ar: string;
  name_en: string;
  country_id: number;
};




const PURPOSES = [
  { value: "sale", label: "للبيع" },
  { value: "rent", label: "للإيجار" },
];

const DIRECTIONS = [
  { value: "north", label: "شمال" },
  { value: "south", label: "جنوب" },
  { value: "east", label: "شرق" },
  { value: "west", label: "غرب" },
  { value: "northeast", label: "شمال شرق" },
  { value: "northwest", label: "شمال غرب" },
  { value: "southeast", label: "جنوب شرق" },
  { value: "southwest", label: "جنوب غرب" },
];

export default function EditListingPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);
  const [canGenerateVideo, setCanGenerateVideo] = useState(false);
  const [videoQuota, setVideoQuota] = useState<{ allowed: boolean; maxVideos: number; usedVideos: number; remainingVideos: number; maxDuration: number; planName: string } | null>(null);

  // Elite slot booking state
  const [eliteSlots, setEliteSlots] = useState<any[]>([]);
  const [elitePeriod, setElitePeriod] = useState<any>(null);
  const [selectedEliteSlot, setSelectedEliteSlot] = useState<any>(null);
  const [eliteReservation, setEliteReservation] = useState<any>(null);
  const [eliteHolding, setEliteHolding] = useState(false);
  const [elitePaymentLoading, setElitePaymentLoading] = useState(false);
  const [showElitePaymentModal, setShowElitePaymentModal] = useState(false);
  const [eliteCardNumber, setEliteCardNumber] = useState('');
  const [eliteCardExpiry, setEliteCardExpiry] = useState('');
  const [eliteCardCvv, setEliteCardCvv] = useState('');

  // Video regeneration state
  const [regeneratingVideo, setRegeneratingVideo] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState("");
  const [pollingVideo, setPollingVideo] = useState(false);
  const [showVideoImageSelection, setShowVideoImageSelection] = useState(false);
  const [selectedImagesForVideo, setSelectedImagesForVideo] = useState<Set<number>>(new Set());
  const [videoVoice, setVideoVoice] = useState("");
  const [videoQuality, setVideoQuality] = useState<"full" | "fast">("full");
  const [elevenlabsVoices, setElevenlabsVoices] = useState<any[]>([]);
  const [elevenlabsVoicesLoading, setElevenlabsVoicesLoading] = useState(false);

  // Image management state
  const [imageQuota, setImageQuota] = useState<{maxPhotos: number; currentCount: number; remainingSlots: number; canAddMore: boolean} | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [settingCoverIndex, setSettingCoverIndex] = useState<number | null>(null);

  // Property usage type state
  const [usageType, setUsageType] = useState<"سكني" | "تجاري" | "">("");

  // Deal status state
  const [dealStatus, setDealStatus] = useState<string>('active');
  const [updatingDealStatus, setUpdatingDealStatus] = useState(false);

  useEffect(() => {
    if (!isBusinessPlan && !canGenerateVideo) return;
    setElevenlabsVoicesLoading(true);
    fetch(`${API_URL}/api/ai/user/elevenlabs-voices`, {
      credentials: "include",
      headers: getAuthHeaders(),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })))
      .then(({ ok, status, data }) => {
        if (ok && Array.isArray(data.voices)) {
          setElevenlabsVoices(data.voices);
        } else {
          console.warn("[edit-listing] elevenlabs voices fetch failed:", status, data?.error || data?.message);
        }
      })
      .catch((err) => {
        console.warn("[edit-listing] elevenlabs voices network error:", err?.message);
      })
      .finally(() => setElevenlabsVoicesLoading(false));
  }, [isBusinessPlan, canGenerateVideo]);

  // Polling for video status updates
  useEffect(() => {
    if (!listing?.id || listing?.video_status !== 'processing') {
      setPollingVideo(false);
      return;
    }
    
    setPollingVideo(true);
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/listings/${listing.id}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const updatedListing = data.listing || data;
          if (updatedListing.video_status === 'ready') {
            setListing(updatedListing);
            setRegenerateMessage("✅ تم إنشاء الفيديو بنجاح! يمكنك مشاهدته في صفحة الإعلان");
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
        console.error('Error polling video status:', err);
      }
    }, 4000);
    
    return () => clearInterval(pollInterval);
  }, [listing?.id, listing?.video_status]);

  // Countries and Cities from API
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    country: "",
    city: "",
    district: "",
    type: "شقة",
    purpose: "sale",
    price: "",
    land_area: "",
    building_area: "",
    bedrooms: "0",
    bathrooms: "0",
    property_age: "",
    floor_number: "0",
    direction: "",
    parking_spaces: "0",
    specialties: [] as string[],
  });

  // Fetch countries on mount
  useEffect(() => {
    fetch(`${API_URL}/api/locations/countries`)
      .then(res => res.json())
      .then(data => setCountries(data?.countries || []))
      .catch(() => setCountries([]));
  }, []);

  // Fetch cities when country changes
  useEffect(() => {
    if (!formData.country) {
      setCities([]);
      return;
    }
    
    const selectedCountry = countries.find(c => c.name_ar === formData.country);
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
  }, [formData.country, countries]);

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${listingId}`, {
          credentials: "include",
        });
        
        if (!res.ok) {
          throw new Error("لم يتم العثور على الإعلان");
        }
        
        const data = await res.json();
        const l = data.listing || data;
        
        // Debug: Log images to see what we're getting
        console.log('Listing images:', l.images);
        console.log('Listing data:', l);
        
        setListing(l);
        
        // Set form data with country and city
        const initialCountry = l.country || "";
        const initialCity = l.city || "";
        
        const rawType = l.type || "شقة";
        const resolvedType = normalizeType(rawType);
        
        if (isResidential(resolvedType)) {
          setUsageType("سكني");
        } else if (isCommercial(resolvedType)) {
          setUsageType("تجاري");
        }

        let desc = l.description || "";
        let extractedSpecialties: string[] = [];
        const specMatch = desc.match(/التخصصات:\s*(.+)$/m);
        if (specMatch) {
          extractedSpecialties = specMatch[1].split("،").map((s: string) => s.trim()).filter(Boolean);
          desc = desc.replace(/\n?\n?التخصصات:\s*.+$/m, "").trim();
        }

        setFormData({
          title: l.title || "",
          description: desc,
          country: initialCountry,
          city: initialCity,
          district: l.district || "",
          type: resolvedType,
          purpose: l.purpose || "sale",
          price: l.price?.toString() || "",
          land_area: l.land_area?.toString() || "",
          building_area: l.building_area?.toString() || "",
          bedrooms: l.bedrooms?.toString() || "0",
          bathrooms: l.bathrooms?.toString() || "0",
          property_age: l.property_age || "",
          floor_number: l.floor_number?.toString() || "0",
          direction: l.direction || "",
          parking_spaces: l.parking_spaces?.toString() || "0",
          specialties: extractedSpecialties,
        });
        
        // Fetch cities for the initial country if available
        if (initialCountry && countries.length > 0) {
          const selectedCountry = countries.find(c => c.name_ar === initialCountry);
          if (selectedCountry) {
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
          }
        }
      } catch (err: any) {
        setError(err.message || "حدث خطأ في تحميل الإعلان");
      } finally {
        setLoading(false);
      }
    }

    if (listingId) {
      fetchListing();
      checkPlanEligibility();
      fetchImageQuota();
      fetchVideoQuota();
      fetchDealStatus();
    }
  }, [listingId, countries]);

  async function fetchImageQuota() {
    try {
      const res = await fetch(`/api/listings/${listingId}/image-quota`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setImageQuota(data);
      }
    } catch (err) {
      console.error('Error fetching image quota:', err);
    }
  }

  async function handleUploadImages() {
    if (newImages.length === 0 || uploadingImages) return;
    
    setUploadingImages(true);
    setError("");
    
    try {
      const formData = new FormData();
      newImages.forEach(file => {
        formData.append('images', file);
      });
      
      const res = await fetch(`/api/listings/${listingId}/add-images`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'فشل رفع الصور');
      }
      
      setSuccess(data.message);
      setNewImages([]);
      
      // Refresh listing and quota
      const listingRes = await fetch(`/api/listings/${listingId}`, { credentials: 'include' });
      if (listingRes.ok) {
        const listingData = await listingRes.json();
        setListing(listingData.listing || listingData);
      }
      fetchImageQuota();
      
      if (data.needsReview) {
        setTimeout(() => {
          setSuccess("");
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleDeleteImage(index: number) {
    if (deletingImageIndex !== null) return;
    
    const confirmDelete = window.confirm('هل أنت متأكد من حذف هذه الصورة؟');
    if (!confirmDelete) return;
    
    setDeletingImageIndex(index);
    setError("");
    
    try {
      const res = await fetch(`/api/listings/${listingId}/images/${index}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'فشل حذف الصورة');
      }
      
      setSuccess(data.message);
      
      // Refresh listing and quota
      const listingRes = await fetch(`/api/listings/${listingId}`, { credentials: 'include' });
      if (listingRes.ok) {
        const listingData = await listingRes.json();
        setListing(listingData.listing || listingData);
      }
      fetchImageQuota();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingImageIndex(null);
    }
  }

  async function handleSetCover(index: number) {
    if (settingCoverIndex !== null || index === 0) return;
    
    setSettingCoverIndex(index);
    setError("");
    
    try {
      const res = await fetch(`/api/listings/${listingId}/images/cover`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIndex: index })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'فشل تعيين الغلاف');
      }
      
      setSuccess(data.message);
      
      // Refresh listing
      const listingRes = await fetch(`/api/listings/${listingId}`, { credentials: 'include' });
      if (listingRes.ok) {
        const listingData = await listingRes.json();
        setListing(listingData.listing || listingData);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettingCoverIndex(null);
    }
  }

  async function fetchDealStatus() {
    try {
      const res = await fetch(`/api/listings/${listingId}/deal-status`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setDealStatus(data.dealStatus || 'active');
      }
    } catch (err) {
      console.error('Error fetching deal status:', err);
    }
  }

  async function handleDealStatusChange(newStatus: string) {
    if (updatingDealStatus) return;
    
    const confirmMessage = {
      'sold': 'هل أنت متأكد من تحديد أن العقار تم بيعه؟ سيتم إخفاء الإعلان تلقائياً.',
      'rented': 'هل أنت متأكد من تحديد أن العقار تم تأجيره؟ سيتم إخفاء الإعلان تلقائياً.',
      'archived': 'هل أنت متأكد من أرشفة هذا الإعلان؟'
    };

    if (confirmMessage[newStatus as keyof typeof confirmMessage]) {
      if (!window.confirm(confirmMessage[newStatus as keyof typeof confirmMessage])) {
        return;
      }
    }

    setUpdatingDealStatus(true);
    setError('');

    try {
      const res = await fetch(`/api/listings/${listingId}/deal-status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealStatus: newStatus })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل تحديث حالة الصفقة');
      }

      setDealStatus(newStatus);
      setSuccess(data.message);

      if (data.autoHidden) {
        const listingRes = await fetch(`/api/listings/${listingId}`, { credentials: 'include' });
        if (listingRes.ok) {
          const listingData = await listingRes.json();
          setListing(listingData.listing || listingData);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingDealStatus(false);
    }
  }

  async function checkPlanEligibility() {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/elite-slots/check-eligibility', {
        credentials: 'include',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        setIsBusinessPlan(data.allowed === true);
        if (data.allowed) {
          fetchEliteSlots();
          checkExistingReservation();
        }
      }
    } catch (err) {
      console.error('Error checking plan eligibility:', err);
    }
  }

  async function fetchVideoQuota() {
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/listings/${listingId}/video-quota`, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        setVideoQuota(data);
        setCanGenerateVideo(data.allowed === true);
      }
    } catch (err) {
      console.error('Error fetching video quota:', err);
    }
  }

  function getAuthToken() {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/token=([^;]+)/);
      return match ? match[1] : '';
    }
    return localStorage.getItem("token") || '';
  }

  async function fetchEliteSlots() {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/elite-slots/availability', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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

  async function checkExistingReservation() {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/elite-slots/my-reservations?propertyId=${listingId}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reservations && data.reservations.length > 0) {
          setEliteReservation(data.reservations[0]);
        }
      }
    } catch (err) {
      console.error('Error checking reservation:', err);
    }
  }

  async function handleEliteHold() {
    if (!selectedEliteSlot || eliteHolding) return;
    
    try {
      setEliteHolding(true);
      const token = getAuthToken();
      const isPendingListing = listing?.status === 'pending';
      
      const res = await fetch('/api/elite-slots/hold', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          slotId: selectedEliteSlot.id,
          propertyId: listingId
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطأ في حجز الموقع');
      }
      
      setEliteReservation(data.reservation);
      
      // للإعلانات المعلقة: حجز أولي بدون دفع - ينتظر الموافقة المزدوجة
      if (isPendingListing || data.propertyStatus === 'pending') {
        // إنشاء حجز أولي بحالة pending_approval مباشرة
        const reserveRes = await fetch('/api/elite-slots/reserve-with-listing', {
          method: 'POST',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            slotId: selectedEliteSlot.id,
            propertyId: listingId,
            paymentMethod: 'pending_approval',
            isPreliminary: true
          })
        });
        
        const reserveData = await reserveRes.json();
        if (reserveRes.ok) {
          setEliteReservation({ ...data.reservation, status: 'pending_approval' });
          setSelectedEliteSlot(null);
          fetchEliteSlots();
          alert('✅ تم الحجز الأولي بنجاح!\n\nسيتم تفعيل الموقع بعد:\n• موافقة إدارة المالية\n• موافقة إدارة الإعلانات');
        } else {
          throw new Error(reserveData.error || 'خطأ في الحجز الأولي');
        }
      } else {
        // للإعلانات المعتمدة: عرض نافذة الدفع
        setShowElitePaymentModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'خطأ في حجز الموقع');
    } finally {
      setEliteHolding(false);
    }
  }

  async function handleElitePayment() {
    if (!eliteReservation || elitePaymentLoading) return;
    
    try {
      setElitePaymentLoading(true);
      const token = getAuthToken();
      
      // For pending listings, use reserve-with-listing endpoint (pending_approval status)
      // For approved listings, use confirm-payment endpoint (immediate activation)
      const isPending = listing?.status === 'pending';
      const endpoint = isPending 
        ? '/api/elite-slots/reserve-with-listing' 
        : '/api/elite-slots/confirm-payment';
      
      const body = isPending 
        ? {
            slotId: selectedEliteSlot.id,
            propertyId: listingId,
            paymentMethod: 'credit_card',
            cardNumber: eliteCardNumber,
            cardExpiry: eliteCardExpiry,
            cardCvv: eliteCardCvv
          }
        : {
            reservationId: eliteReservation.id,
            paymentMethod: 'credit_card',
            cardNumber: eliteCardNumber,
            cardExpiry: eliteCardExpiry,
            cardCvv: eliteCardCvv
          };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطأ في عملية الدفع');
      }
      
      const newStatus = isPending ? 'pending_approval' : 'confirmed';
      setEliteReservation({ ...eliteReservation, status: newStatus });
      setShowElitePaymentModal(false);
      setSelectedEliteSlot(null);
      setEliteCardNumber('');
      setEliteCardExpiry('');
      setEliteCardCvv('');
      fetchEliteSlots();
    } catch (err: any) {
      alert(err.message || 'خطأ في عملية الدفع');
    } finally {
      setElitePaymentLoading(false);
    }
  }

  async function handleCancelHold() {
    if (!eliteReservation) return;
    try {
      const token = getAuthToken();
      await fetch('/api/elite-slots/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reservationId: eliteReservation.id })
      });
      setEliteReservation(null);
      setShowElitePaymentModal(false);
      fetchEliteSlots();
    } catch (err) {
      console.error('Error cancelling hold:', err);
    }
  }

  // Toggle image selection for video generation
  const toggleImageSelection = (index: number) => {
    setSelectedImagesForVideo((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Select all images for video
  const selectAllImages = () => {
    if (listing?.images) {
      setSelectedImagesForVideo(new Set(listing.images.map((_, i) => i)));
    }
  };

  // Deselect all images
  const deselectAllImages = () => {
    setSelectedImagesForVideo(new Set());
  };

  const handleRegenerateVideo = async () => {
    if (regeneratingVideo) return;
    
    // If selection UI is shown and no images selected, require selection
    if (showVideoImageSelection && selectedImagesForVideo.size === 0) {
      setRegenerateMessage("⚠️ يرجى اختيار صورة واحدة على الأقل");
      return;
    }
    
    setRegeneratingVideo(true);
    setRegenerateMessage("");
    
    try {
      console.log('[Video] Starting video generation for listing:', listingId);
      console.log('[Video] Selected images:', Array.from(selectedImagesForVideo));
      
      const body: any = { videoQuality };
      if (videoVoice) body.voice = videoVoice;
      if (selectedImagesForVideo.size > 0) {
        body.selectedImageIndices = Array.from(selectedImagesForVideo).sort((a, b) => a - b);
      }
      
      const res = await fetch(`/api/listings/${listingId}/regenerate-video`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      console.log('[Video] Response:', data);
      
      if (!res.ok) {
        console.error('[Video] Error:', data.error);
        setRegenerateMessage(`❌ ${data.error || 'حدث خطأ'}`);
      } else {
        setRegenerateMessage("✅ جاري إنشاء الفيديو... سيظهر تلقائياً عند الانتهاء");
        if (listing) {
          setListing({ ...listing, video_status: 'processing' });
        }
        setShowVideoImageSelection(false);
        setSelectedImagesForVideo(new Set());
      }
    } catch (err: any) {
      console.error('[Video] Request failed:', err);
      setRegenerateMessage(`❌ حدث خطأ في الاتصال: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setRegeneratingVideo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let finalDesc = formData.description || "";
      if (formData.specialties.length > 0) {
        finalDesc = finalDesc.trim();
        if (finalDesc) finalDesc += "\n\n";
        finalDesc += `التخصصات: ${formData.specialties.join("، ")}`;
      }

      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formData,
          description: finalDesc,
          price: parseFloat(formData.price) || 0,
          land_area: parseFloat(formData.land_area) || null,
          building_area: parseFloat(formData.building_area) || null,
          bedrooms: parseInt(formData.bedrooms) || 0,
          bathrooms: parseInt(formData.bathrooms) || 0,
          floor_number: parseInt(formData.floor_number) || 0,
          parking_spaces: parseInt(formData.parking_spaces) || 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل في حفظ التعديلات");
      }

      setSuccess("تم حفظ التعديلات بنجاح!");
      setTimeout(() => {
        router.push("/my-listings");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#fef8e6] to-[#f7e8b7]">
        <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (error && !listing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#fef8e6] to-[#f7e8b7] p-4">
        <div className="bg-white rounded-2xl p-8 shadow-xl text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Home className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#002845] mb-2">خطأ</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <Link
            href="/my-listings"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#002845] text-white rounded-xl hover:bg-[#003366] transition"
          >
            <ArrowRight className="w-5 h-5" />
            العودة لإعلاناتي
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fef8e6] to-[#f7e8b7] py-8 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/my-listings"
            className="flex items-center gap-2 text-[#002845] hover:text-[#D4AF37] transition"
          >
            <ArrowRight className="w-5 h-5" />
            العودة
          </Link>
          <h1 className="text-2xl font-bold text-[#002845]">تعديل الإعلان</h1>
          {listing?.status === "pending" && (
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm">
              قيد المراجعة
            </span>
          )}
          {listing?.status === "approved" && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              معتمد
            </span>
          )}
        </div>

        {listing?.status === "approved" && isBusinessPlan && (
          <Link
            href={`/elite-booking?propertyId=${listingId}`}
            className="mb-6 block bg-gradient-to-r from-[#D4AF37] to-[#B8860B] rounded-2xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-1">
                  اعرض عقارك في نخبة العقارات المختارة 👑
                </h3>
                <p className="text-white/80 text-sm">
                  احصل على ظهور مميز في الصفحة الرئيسية وزد من مشاهدات إعلانك
                </p>
              </div>
              <div className="text-white/80 group-hover:text-white transition">
                <ArrowRight className="w-6 h-6 rotate-180" />
              </div>
            </div>
          </Link>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                عنوان الإعلان *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="مثال: شقة فاخرة للبيع في حي النرجس"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                وصف العقار *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={4}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none resize-none"
                placeholder="اكتب وصفاً تفصيلياً للعقار..."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <MapPin className="w-4 h-4 inline ml-1" />
                الدولة *
              </label>
              <select
                name="country"
                value={formData.country}
                onChange={(e) => {
                  handleChange(e);
                  // Reset city when country changes
                  setFormData(prev => ({ ...prev, city: "" }));
                }}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              >
                <option value="">اختر الدولة</option>
                {countries.map(country => (
                  <option key={country.id} value={country.name_ar}>
                    {country.flag_emoji} {country.name_ar}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <MapPin className="w-4 h-4 inline ml-1" />
                المدينة *
              </label>
              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                disabled={!formData.country || citiesLoading}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
              >
                <option value="">
                  {citiesLoading ? "جاري التحميل..." : !formData.country ? "اختر الدولة أولاً" : "اختر المدينة"}
                </option>
                {cities.map(city => (
                  <option key={city.id} value={city.name_ar}>{city.name_ar}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                الحي *
              </label>
              <input
                type="text"
                name="district"
                value={formData.district}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="مثال: حي النرجس"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Home className="w-4 h-4 inline ml-1" />
                نوع الاستخدام *
              </label>
              <div className="flex gap-2 mb-4">
                {[
                  { value: "سكني" as const, icon: Home },
                  { value: "تجاري" as const, icon: Building2 },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setUsageType(option.value);
                      setFormData(prev => ({ ...prev, type: "" }));
                    }}
                    className={`py-3 px-5 rounded-xl border-2 font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
                      usageType === option.value
                        ? "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C49B2F] text-white shadow-lg shadow-[#D4AF37]/30 scale-[1.02]"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 hover:text-slate-700"
                    }`}
                  >
                    <option.icon className="w-4 h-4" />
                    {option.value}
                  </button>
                ))}
              </div>

              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Building2 className="w-4 h-4 inline ml-1" />
                نوع العقار *
              </label>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {(usageType === "تجاري"
                  ? COMMERCIAL_TYPES
                  : usageType === "سكني"
                  ? RESIDENTIAL_TYPES
                  : [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES]
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type, specialties: [] }))}
                    className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all duration-300 ${
                      formData.type === type
                        ? "border-[#D4AF37] bg-gradient-to-r from-[#D4AF37] to-[#C49B2F] text-white shadow-lg shadow-[#D4AF37]/30 scale-[1.02]"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 hover:text-slate-700"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {getSpecialties(formData.type).length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-semibold text-[#002845] mb-2">
                  التخصصات / التصنيف الفرعي
                  <span className="text-xs text-slate-400 font-normal mr-2">(اختياري)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {getSpecialties(formData.type).map((spec) => {
                    const selected = formData.specialties.includes(spec);
                    return (
                      <button
                        key={spec}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            specialties: selected
                              ? prev.specialties.filter((s: string) => s !== spec)
                              : [...prev.specialties, spec],
                          }));
                        }}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          selected
                            ? "bg-[#0B6B4C] text-white shadow-md shadow-[#0B6B4C]/20"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                        }`}
                      >
                        {selected && <span className="ml-1">✓</span>}
                        {spec}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                الغرض *
              </label>
              <select
                name="purpose"
                value={formData.purpose}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              >
                {PURPOSES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <DollarSign className="w-4 h-4 inline ml-1" />
                السعر (ريال) *
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Ruler className="w-4 h-4 inline ml-1" />
                مساحة الأرض (م²) *
              </label>
              <input
                type="number"
                name="land_area"
                value={formData.land_area}
                onChange={handleChange}
                required
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Ruler className="w-4 h-4 inline ml-1" />
                مساحة البناء (م²)
              </label>
              <input
                type="number"
                name="building_area"
                value={formData.building_area}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <BedDouble className="w-4 h-4 inline ml-1" />
                غرف النوم
              </label>
              <input
                type="number"
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Bath className="w-4 h-4 inline ml-1" />
                دورات المياه
              </label>
              <input
                type="number"
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                سنة البناء
              </label>
              <input
                type="number"
                name="property_age"
                value={formData.property_age}
                onChange={handleChange}
                min="1900"
                max={2100}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
                placeholder="مثال: 2020"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                الطابق
              </label>
              <input
                type="number"
                name="floor_number"
                value={formData.floor_number}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                الاتجاه
              </label>
              <select
                name="direction"
                value={formData.direction}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              >
                <option value="">اختر الاتجاه</option>
                {DIRECTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                مواقف السيارات
              </label>
              <input
                type="number"
                name="parking_spaces"
                value={formData.parking_spaces}
                onChange={handleChange}
                min="0"
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* حالة الصفقة */}
          {listing?.status === 'approved' && (
            <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200">
              <h3 className="text-lg font-bold text-[#002845] mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                حالة الصفقة
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                حدّث حالة العقار ليعرف الزوار ما إذا كان متاحاً أو قيد التفاوض أو تمت الصفقة
              </p>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { value: 'active', label: 'نشط', icon: '🟢', color: 'bg-green-100 border-green-300 text-green-800' },
                  { value: 'negotiating', label: 'قيد التفاوض', icon: '🟡', color: 'bg-amber-100 border-amber-300 text-amber-800' },
                  { value: formData.purpose === 'rent' ? 'rented' : 'sold', label: formData.purpose === 'rent' ? 'تم التأجير' : 'تم البيع', icon: '✅', color: 'bg-blue-100 border-blue-300 text-blue-800' },
                  { value: 'archived', label: 'مؤرشف', icon: '📁', color: 'bg-slate-100 border-slate-300 text-slate-800' },
                ].map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => handleDealStatusChange(status.value)}
                    disabled={updatingDealStatus || dealStatus === status.value}
                    className={`
                      flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                      ${dealStatus === status.value 
                        ? status.color + ' ring-2 ring-offset-2 ring-[#D4AF37]' 
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800'
                      }
                      ${updatingDealStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <span className="text-2xl">{status.icon}</span>
                    <span className="text-sm font-medium">{status.label}</span>
                    {dealStatus === status.value && (
                      <span className="text-xs opacity-75">الحالة الحالية</span>
                    )}
                  </button>
                ))}
              </div>

              {updatingDealStatus && (
                <div className="flex items-center justify-center gap-2 mt-4 text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">جاري تحديث الحالة...</span>
                </div>
              )}
            </div>
          )}

          {listing?.images && listing.images.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-[#002845]">
                  <Camera className="w-4 h-4 inline ml-1" />
                  الصور الحالية
                </label>
                {imageQuota && (
                  <div className="text-xs bg-slate-100 px-3 py-1 rounded-full">
                    <span className="text-slate-600">{imageQuota.currentCount} / {imageQuota.maxPhotos} صور</span>
                    {imageQuota.canAddMore && (
                      <span className="text-green-600 mr-2">({imageQuota.remainingSlots} متبقي)</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 flex-wrap">
                {listing.images.map((img, i) => {
                  const rawUrl = typeof img === 'string' ? img : img.url;
                  const imageUrl = getImageUrl(rawUrl);
                  console.log(`[Image ${i}] Raw: ${rawUrl}, Processed: ${imageUrl}`);
                  return (
                  <div key={img.id || i} className="relative group">
                    <div className={`w-24 h-24 rounded-xl overflow-hidden border-2 shadow-sm ${i === 0 ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30' : 'border-slate-200'}`}>
                      <img 
                        src={imageUrl} 
                        alt={`صورة ${i + 1}`} 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          console.error(`[Image ${i}] Failed to load:`, imageUrl, 'Raw URL:', rawUrl);
                          (e.target as HTMLImageElement).src = '/images/property1.jpg';
                        }}
                        onLoad={() => {
                          console.log(`[Image ${i}] Loaded successfully:`, imageUrl);
                        }}
                      />
                    </div>
                    
                    <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {i !== 0 && (
                        <button
                          type="button"
                          onClick={() => handleSetCover(i)}
                          disabled={settingCoverIndex !== null}
                          className="w-6 h-6 bg-[#D4AF37] text-white rounded-full flex items-center justify-center shadow-lg hover:bg-[#b8962f] disabled:opacity-50"
                          title="تعيين كغلاف"
                        >
                          {settingCoverIndex === i ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Star className="w-3 h-3" />
                          )}
                        </button>
                      )}
                      {listing.images.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteImage(i)}
                          disabled={deletingImageIndex !== null}
                          className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 disabled:opacity-50"
                          title="حذف الصورة"
                        >
                          {deletingImageIndex === i ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>

                    {i === 0 && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-[#D4AF37] text-white px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        غلاف
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>

              {imageQuota?.canAddMore && (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-dashed border-emerald-300 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                      <ImagePlus className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-emerald-800">إضافة صور جديدة</h4>
                      <p className="text-sm text-emerald-600">يمكنك إضافة {imageQuota.remainingSlots} صور إضافية</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {newImages.map((file, i) => (
                      <div key={i} className="relative">
                        <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-emerald-300">
                          <img 
                            src={URL.createObjectURL(file)} 
                            alt={`صورة جديدة ${i + 1}`} 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setNewImages(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const remaining = imageQuota.remainingSlots - newImages.length;
                          if (files.length > remaining) {
                            alert(`يمكنك إضافة ${remaining} صور فقط`);
                            return;
                          }
                          setNewImages(prev => [...prev, ...files].slice(0, imageQuota.remainingSlots));
                          e.target.value = '';
                        }}
                      />
                      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-emerald-300 rounded-xl text-emerald-700 hover:bg-emerald-50 transition">
                        <Plus className="w-5 h-5" />
                        <span className="font-medium">اختيار صور</span>
                      </div>
                    </label>

                    {newImages.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUploadImages}
                        disabled={uploadingImages}
                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50 font-medium"
                      >
                        {uploadingImages ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>جاري الرفع...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-5 h-5" />
                            <span>رفع {newImages.length} صور</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {listing.status === 'approved' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>تعديل الصور سيضع الإعلان في فترة مراجعة</span>
                </div>
              )}
            </div>
          )}

          {/* قسم الفيديو - يظهر دائماً */}
          {canGenerateVideo && listing?.images && listing.images.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-emerald-800">📷 فيديو ترويجي بالذكاء الاصطناعي</h4>
                  <p className="text-sm text-emerald-600">سيتم إنشاء فيديو احترافي من صورك الفعلية</p>
                </div>
                {videoQuota && (
                  <div className="text-left text-xs space-y-0.5">
                    <div className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                      {videoQuota.remainingVideos} / {videoQuota.maxVideos} متاح
                    </div>
                    <div className="text-emerald-500 text-center">حتى {videoQuota.maxDuration} ثانية</div>
                  </div>
                )}
              </div>

              {/* حالة معالجة الفيديو */}
              {listing.video_status === 'processing' && (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-6 text-center mb-4">
                  <div className="w-16 h-16 mx-auto mb-4 relative">
                    <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                    <Video className="absolute inset-2 w-12 h-12 text-amber-600" />
                  </div>
                  <h4 className="text-lg font-bold text-amber-800 mb-2">جاري إنشاء الفيديو...</h4>
                  <p className="text-amber-600 text-sm">سيظهر الفيديو تلقائياً عند الانتهاء (يتم التحقق كل 4 ثواني)</p>
                </div>
              )}

              {/* حالة الفيديو الجاهز */}
              {listing.video_status === 'ready' && (
                <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-emerald-800">🎬 الفيديو جاهز!</h4>
                        <p className="text-sm text-emerald-600">تم إنشاء فيديو ترويجي من صورك</p>
                      </div>
                    </div>
                    <Link 
                      href={`/listing/${listingId}`}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                    >
                      مشاهدة الفيديو
                    </Link>
                  </div>
                </div>
              )}

              {/* حالة عدم وجود فيديو (placeholder) */}
              {(!listing.video_status || listing.video_status === null) && (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-center mb-4 relative overflow-hidden">
                  {listing.images && listing.images.length > 0 && (
                    <div className="absolute inset-0 opacity-10">
                      <img 
                        src={getImageUrl(listing.images[0]?.url || (typeof listing.images[0] === 'string' ? listing.images[0] : ''))} 
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

              {/* خيار اختيار الصور لإعادة التوليد */}
              {showVideoImageSelection && listing.images && listing.images.length > 0 && (
                <div className="mb-4 p-4 bg-white rounded-xl border-2 border-emerald-300">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Film className="w-5 h-5 text-emerald-600" />
                      <h5 className="font-semibold text-emerald-800">اختر الصور لتوليد الفيديو</h5>
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
                      تم اختيار {selectedImagesForVideo.size} من {listing.images.length} صورة
                    </span>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 mb-3">
                    <p className="text-xs text-emerald-800 flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">💡 ملاحظة:</span>
                      <span>
                        عدد صور أقل يعني سرعة في الإنجاز. ننصح باختيار 3-8 صور للحصول على أفضل نتيجة.
                      </span>
                    </p>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {listing.images.map((img, idx) => {
                      const isSelected = selectedImagesForVideo.has(idx);
                      const rawUrl = typeof img === 'string' ? img : img.url;
                      const imageUrl = getImageUrl(rawUrl);
                      return (
                        <div
                          key={img.id || idx}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-emerald-500 ring-2 ring-emerald-300'
                              : 'border-slate-200 hover:border-emerald-300'
                          }`}
                          onClick={() => toggleImageSelection(idx)}
                        >
                          <img
                            src={imageUrl}
                            alt={`صورة ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                              <Check className="w-6 h-6 text-white bg-emerald-500 rounded-full p-1" />
                            </div>
                          )}
                          {!isSelected && (
                            <div className="absolute top-1 left-1 w-6 h-6 bg-white/80 rounded-full flex items-center justify-center opacity-0 hover:opacity-100 transition">
                              <Film className="w-4 h-4 text-slate-600" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* زر إعادة إنشاء الفيديو */}
              {listing.video_status !== 'processing' && (
                <>
                  {!showVideoImageSelection ? (
                    <button
                      onClick={() => setShowVideoImageSelection(true)}
                      disabled={regeneratingVideo}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 font-medium"
                    >
                      <Video className="w-5 h-5" />
                      <span>إنشاء / إعادة إنشاء الفيديو</span>
                    </button>
                  ) : (
                    <div className="space-y-4">
                      {/* اختيار الجودة */}
                      <div className="p-3 bg-white rounded-xl border border-emerald-200">
                        <p className="text-sm font-semibold text-emerald-800 mb-2">جودة الفيديو:</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setVideoQuality("full")}
                            className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                              videoQuality === "full"
                                ? "border-[#D4AF37] bg-amber-50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-amber-300"
                            }`}
                          >
                            <Sparkles className={`w-4 h-4 mx-auto mb-1 ${videoQuality === "full" ? "text-[#D4AF37]" : "text-slate-400"}`} />
                            <span className="text-xs font-semibold block">جودة عالية</span>
                            <span className="text-[10px] text-slate-500">صوت + تأثيرات</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setVideoQuality("fast")}
                            className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                              videoQuality === "fast"
                                ? "border-[#D4AF37] bg-amber-50 shadow-sm"
                                : "border-slate-200 bg-white hover:border-amber-300"
                            }`}
                          >
                            <Zap className={`w-4 h-4 mx-auto mb-1 ${videoQuality === "fast" ? "text-[#D4AF37]" : "text-slate-400"}`} />
                            <span className="text-xs font-semibold block">سريع</span>
                            <span className="text-[10px] text-slate-500">صور فقط</span>
                          </button>
                        </div>
                      </div>

                      {/* اختيار الصوت */}
                      {videoQuality === "full" && (
                        <div className="p-3 bg-white rounded-xl border border-emerald-200">
                          <p className="text-sm font-semibold text-emerald-800 mb-2">صوت التعليق:</p>
                          {elevenlabsVoicesLoading ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>جاري تحميل الأصوات...</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {elevenlabsVoices.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                                  {elevenlabsVoices.map((v: any) => {
                                    const voiceId = v.id || v.voice_id;
                                    const isSelected = videoVoice === voiceId;
                                    const displayName = v.name?.includes(" - ") ? v.name.split(" - ")[0].trim() : v.name;
                                    return (
                                      <div
                                        key={voiceId}
                                        onClick={(e) => { e.stopPropagation(); setVideoVoice(voiceId); }}
                                        className={`relative cursor-pointer rounded-xl p-3 border-2 transition-all duration-200 ${
                                          isSelected
                                            ? "border-[#D4AF37] bg-gradient-to-br from-amber-50 to-[#D4AF37]/10 shadow-md shadow-[#D4AF37]/20"
                                            : "border-slate-200 bg-white hover:border-[#D4AF37]/50 hover:shadow-sm"
                                        }`}
                                      >
                                        {isSelected && (
                                          <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-[#D4AF37] rounded-full flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                          </div>
                                        )}
                                        <div className="flex flex-col items-center text-center gap-1.5">
                                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isSelected ? "bg-[#D4AF37]/20" : "bg-slate-100"}`}>
                                            🎙️
                                          </div>
                                          <span className={`text-sm font-semibold truncate w-full ${isSelected ? "text-[#002845]" : "text-[#002845]/80"}`}>
                                            {displayName}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <details className="group">
                                <summary className="text-xs text-[#002845]/50 cursor-pointer hover:text-[#002845]/70 transition">أصوات OpenAI الافتراضية</summary>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                  {[
                                    { id: "onyx", name: "فيصل", desc: "عميق" },
                                    { id: "ash", name: "عاصم", desc: "قوي" },
                                    { id: "echo", name: "سعد", desc: "واضح" },
                                  ].map((v) => {
                                    const isSelected = videoVoice === v.id;
                                    return (
                                      <div
                                        key={v.id}
                                        onClick={(e) => { e.stopPropagation(); setVideoVoice(v.id); }}
                                        className={`cursor-pointer rounded-xl p-2.5 border-2 transition-all duration-200 text-center ${
                                          isSelected
                                            ? "border-[#D4AF37] bg-gradient-to-br from-amber-50 to-[#D4AF37]/10 shadow-sm"
                                            : "border-slate-200 bg-white hover:border-[#D4AF37]/50"
                                        }`}
                                      >
                                        <span className={`text-sm font-semibold ${isSelected ? "text-[#002845]" : "text-[#002845]/70"}`}>{v.name}</span>
                                        <p className="text-[10px] text-[#002845]/50 mt-0.5">{v.desc}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              </details>
                              {!videoVoice && (
                                <p className="text-xs text-amber-600 mt-1">اختر صوتاً لإضافة تعليق صوتي احترافي</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowVideoImageSelection(false);
                            setSelectedImagesForVideo(new Set());
                          }}
                          className="flex-1 px-4 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition font-medium"
                        >
                          إلغاء
                        </button>
                        <button
                          onClick={handleRegenerateVideo}
                          disabled={regeneratingVideo || selectedImagesForVideo.size === 0}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 font-medium"
                        >
                          {regeneratingVideo ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>جاري الإنشاء...</span>
                            </>
                          ) : (
                            <>
                              <Video className="w-5 h-5" />
                              <span>توليد ({selectedImagesForVideo.size} صور)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  {regenerateMessage && (
                    <p className={`text-sm mt-3 text-center ${
                      regenerateMessage.includes('❌') ? 'text-red-600' : 
                      regenerateMessage.includes('✅') ? 'text-emerald-600 font-medium' : 
                      regenerateMessage.includes('⚠️') ? 'text-amber-600' : 'text-amber-600'
                    }`}>
                      {regenerateMessage}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {listing?.video_status === 'processing' && (
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                <div>
                  <h4 className="font-bold text-amber-800">⏳ جاري إنشاء الفيديو...</h4>
                  <p className="text-sm text-amber-600">سيظهر الفيديو تلقائياً عند الانتهاء (يتم التحقق كل 4 ثواني)</p>
                </div>
              </div>
            </div>
          )}

          {listing?.video_status === 'ready' && (
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-800">🎬 الفيديو جاهز!</h4>
                    <p className="text-sm text-emerald-600">تم إنشاء فيديو ترويجي من صورك</p>
                  </div>
                </div>
                <Link 
                  href={`/listing/${listingId}`}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                >
                  مشاهدة الفيديو
                </Link>
              </div>
            </div>
          )}

          {isBusinessPlan && (listing?.status === 'approved' || listing?.status === 'pending') && (
            <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-2xl p-6 border-2 border-[#D4AF37] shadow-lg">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center shadow-lg">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#002845]">🏆 نخبة العقارات المختارة</h3>
                  <p className="text-sm text-slate-600">اعرض عقارك على الصفحة الرئيسية</p>
                </div>
              </div>

              {eliteReservation?.status === 'confirmed' ? (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-green-800">إعلانك معروض في نخبة العقارات! 🎉</h4>
                      <p className="text-sm text-green-600">يظهر إعلانك الآن في قسم نخبة العقارات على الصفحة الرئيسية</p>
                    </div>
                  </div>
                </div>
              ) : eliteReservation?.status === 'pending_approval' ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                    <div>
                      <h4 className="font-bold text-amber-800">حجز معلق للموافقة</h4>
                      <p className="text-sm text-amber-600">سيتم تفعيل الموقع عند الموافقة على إعلانك</p>
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
                    
                    {eliteSlots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {eliteSlots.map((slot, index) => {
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
                              key={`slot-${slot.id}-${slot.row_num}-${slot.col_num}-${index}`}
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
                    <div className="bg-[#002845]/10 rounded-xl p-4 mb-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-slate-600">الموقع المختار:</p>
                          <p className="font-bold text-[#002845]">
                            الصف {selectedEliteSlot.tier === 'top' ? 'الأول' : selectedEliteSlot.tier === 'middle' ? 'الثاني' : 'الثالث'} - موقع {selectedEliteSlot.row_num}-{selectedEliteSlot.col_num}
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-sm text-slate-600">الإجمالي:</p>
                          <p className="text-xl font-bold text-[#D4AF37]">
                            {parseFloat(selectedEliteSlot.base_price).toFixed(2)} ريال
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!selectedEliteSlot || eliteHolding}
                    onClick={handleEliteHold}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold transition shadow-lg ${
                      selectedEliteSlot
                        ? 'bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white hover:opacity-90'
                        : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {eliteHolding ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        جاري الحجز...
                      </>
                    ) : (
                      <>
                        <Rocket className="w-5 h-5" />
                        {selectedEliteSlot ? 'احجز الموقع الآن' : 'اختر موقعاً أولاً'}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <Link
              href="/my-listings"
              className="px-6 py-3 text-slate-600 hover:text-[#002845] transition"
            >
              إلغاء
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  حفظ التعديلات
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {showElitePaymentModal && eliteReservation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-l from-[#D4AF37] to-[#B8860B] p-6 text-white relative">
              <button
                type="button"
                onClick={handleCancelHold}
                className="absolute top-4 left-4 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition"
              >
                <X className="w-5 h-5" />
              </button>
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
                    {selectedEliteSlot && `الصف ${selectedEliteSlot.tier === 'top' ? 'الأول' : selectedEliteSlot.tier === 'middle' ? 'الثاني' : 'الثالث'}`}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-600">المدة:</span>
                  <span className="font-semibold">7 أيام</span>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-bold text-[#002845]">الإجمالي:</span>
                  <span className="text-xl font-bold text-[#D4AF37]">{eliteReservation.total_amount} ريال</span>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">رقم البطاقة</label>
                  <input
                    type="text"
                    value={eliteCardNumber}
                    onChange={(e) => setEliteCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder="0000 0000 0000 0000"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">تاريخ الانتهاء</label>
                    <input
                      type="text"
                      value={eliteCardExpiry}
                      onChange={(e) => setEliteCardExpiry(e.target.value.replace(/[^\d/]/g, '').slice(0, 5))}
                      placeholder="MM/YY"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">CVV</label>
                    <input
                      type="text"
                      value={eliteCardCvv}
                      onChange={(e) => setEliteCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="123"
                      className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 transition"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-3 mb-4 border border-amber-200">
                <p className="text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>هذه بيئة تجريبية. لن يتم خصم أي مبلغ فعلي.</span>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelHold}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold border-2 border-slate-200 text-slate-700 hover:bg-slate-100 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleElitePayment}
                  disabled={elitePaymentLoading || !eliteCardNumber || !eliteCardExpiry || !eliteCardCvv}
                  className="flex-1 py-3 px-6 rounded-xl font-semibold bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-white hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {elitePaymentLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جاري الدفع...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      تأكيد الدفع
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
