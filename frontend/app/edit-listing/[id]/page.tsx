"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Save, Loader2, Home, MapPin, DollarSign, Ruler, BedDouble, Bath, Camera, Video, Building2, Crown, Sparkles, Rocket, CheckCircle2, AlertTriangle, X, Upload, Trash2, Plus, ImagePlus, Star } from "lucide-react";
import Link from "next/link";

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

const CITIES = [
  "مكة المكرمة", "المدينة المنورة",
  "الرياض", "جدة", "الدمام", "الخبر", "الظهران", "الأحساء", 
  "القطيف", "الجبيل", "ينبع", "الطائف", "تبوك", "بريدة", 
  "خميس مشيط", "أبها", "نجران", "جازان", "حائل", "عرعر"
];

const PROPERTY_TYPES = [
  { value: "apartment", label: "شقة" },
  { value: "villa", label: "فيلا" },
  { value: "land", label: "أرض" },
  { value: "building", label: "عمارة" },
  { value: "office", label: "مكتب" },
  { value: "shop", label: "محل تجاري" },
  { value: "warehouse", label: "مستودع" },
  { value: "farm", label: "مزرعة" },
];

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

  // Image management state
  const [imageQuota, setImageQuota] = useState<{maxPhotos: number; currentCount: number; remainingSlots: number; canAddMore: boolean} | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [settingCoverIndex, setSettingCoverIndex] = useState<number | null>(null);

  // Deal status state
  const [dealStatus, setDealStatus] = useState<string>('active');
  const [updatingDealStatus, setUpdatingDealStatus] = useState(false);

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

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    city: "",
    district: "",
    type: "apartment",
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
  });

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
        
        setListing(l);
        setFormData({
          title: l.title || "",
          description: l.description || "",
          city: l.city || "",
          district: l.district || "",
          type: l.type || "apartment",
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
        });
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
      fetchDealStatus();
    }
  }, [listingId]);

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
      const res = await fetch('/api/elite-slots/check-eligibility', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
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

  const handleRegenerateVideo = async () => {
    if (regeneratingVideo) return;
    setRegeneratingVideo(true);
    setRegenerateMessage("");
    
    try {
      const res = await fetch(`/api/listings/${listingId}/regenerate-video`, {
        method: 'POST',
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setRegenerateMessage(`❌ ${data.error || 'حدث خطأ'}`);
      } else {
        setRegenerateMessage("✅ جاري إنشاء الفيديو... سيظهر تلقائياً عند الانتهاء");
        if (listing) {
          setListing({ ...listing, video_status: 'processing' });
        }
      }
    } catch (err) {
      setRegenerateMessage("❌ حدث خطأ في الاتصال");
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
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formData,
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
                المدينة *
              </label>
              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              >
                <option value="">اختر المدينة</option>
                {CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
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

            <div>
              <label className="block text-sm font-semibold text-[#002845] mb-2">
                <Building2 className="w-4 h-4 inline ml-1" />
                نوع العقار *
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none"
              >
                {PROPERTY_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

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
                {listing.images.map((img, i) => (
                  <div key={img.id || i} className="relative group">
                    <div className={`w-24 h-24 rounded-xl overflow-hidden border-2 shadow-sm ${i === 0 ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30' : 'border-slate-200'}`}>
                      <img 
                        src={typeof img === 'string' ? img : img.url} 
                        alt={`صورة ${i + 1}`} 
                        className="w-full h-full object-cover" 
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
                ))}
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

          {/* زر إعادة إنشاء الفيديو - متاح لباقة البزنس فقط */}
          {isBusinessPlan && listing?.images && listing.images.length > 0 && listing?.video_status !== 'processing' && (
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-800">📷 إنشاء فيديو من صورك</h4>
                  <p className="text-sm text-emerald-600">فيديو ترويجي احترافي باستخدام صورك الفعلية</p>
                </div>
              </div>
              <button
                onClick={handleRegenerateVideo}
                disabled={regeneratingVideo}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 font-medium"
              >
                {regeneratingVideo ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري الإنشاء...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-5 h-5" />
                    <span>إنشاء / إعادة إنشاء الفيديو</span>
                  </>
                )}
              </button>
              {regenerateMessage && (
                <p className={`text-sm mt-3 text-center ${
                  regenerateMessage.includes('❌') ? 'text-red-600' : 
                  regenerateMessage.includes('✅') ? 'text-emerald-600 font-medium' : 'text-amber-600'
                }`}>
                  {regenerateMessage}
                </p>
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
