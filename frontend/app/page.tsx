"use client";

export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from 'next/navigation';
import { Search as SearchIcon, Crown, Sparkles, Star, X, MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PlansHighlightSection from "@/components/home/PlansHighlightSection";
import { getImageUrl } from "@/lib/imageUrl";
import { useAuthStore } from '@/lib/stores/authStore';

const fallbackCities = [
  { title: "مكة المكرمة", img: "/makkah.jpg" },
  { title: "المدينة المنورة", img: "/madinah.jpg" },
  { title: "جدة", img: "/jeddah.jpg" },
  { title: "الطائف", img: "/taif.jpg" },
  { title: "الرياض", img: "/riyadh.jpg" },
];

interface EliteProperty {
  id: string;
  property_id: string;
  title: string;
  city: string;
  district: string;
  price: number;
  land_area: number;
  building_area?: number;
  type: string;
  purpose?: string;
  bedrooms: number;
  bathrooms: number;
  latitude?: number;
  longitude?: number;
  image_url?: string;
  cover_image?: string;
  distance?: number;
  tier?: string;
  slot_id?: number;
  display_order?: number;
  row_num?: number;
  col_num?: number;
  owner_name?: string;
}

const placeholderSlots = [
  { id: 1, img: "/jeddah.jpg", tagline: "كن أول من يعرض عقاره هنا", highlight: "خانة VIP" },
  { id: 2, img: "/madinah.jpg", tagline: "فرصتك لتكون في الواجهة", highlight: "مميز" },
  { id: 3, img: "/taif.jpg", tagline: "اجعل عقارك يتصدر البحث", highlight: "الأكثر مشاهدة" },
  { id: 4, img: "/riyadh.jpg", tagline: "احجز مكانك الآن", highlight: "فرصة ذهبية" },
  { id: 5, img: "/makkah.jpg", tagline: "تميّز عن المنافسين", highlight: "حصري" },
  { id: 6, img: "/jeddah.jpg", tagline: "عقارك في دائرة الضوء", highlight: "نخبة" },
  { id: 7, img: "/madinah.jpg", tagline: "انضم لنخبة رجال الأعمال", highlight: "رجال أعمال" },
  { id: 8, img: "/taif.jpg", tagline: "ضاعف مشاهداتك", highlight: "x10 مشاهدة" },
  { id: 9, img: "/riyadh.jpg", tagline: "الخيار الأمثل للمستثمرين", highlight: "استثماري" },
];

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#001A33] via-[#003366] to-[#001A33] text-white min-h-[60vh] sm:min-h-[70vh] lg:min-h-[80vh] flex items-center">
      {/* خلفية صورة + نقش إسلامي */}
      <Image
        src="/hero.jpg"
        alt="خلفية بيت الجزيرة"
        fill
        sizes="100vw"
        priority
        loading="eager"
        className="object-cover opacity-40"
      />
      {/* النقش الإسلامي - مخفي على الجوال للسرعة */}
      <Image
        src="/patterns/hero-3.png"
        alt="نقش إسلامي"
        fill
        sizes="(max-width: 640px) 0px, 100vw"
        className="hidden sm:block object-cover opacity-25 mix-blend-soft-light"
      />
      
      {/* Animated particles overlay - مخفية على الجوال */}
      <div className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-2 h-2 bg-gold/30 rounded-full animate-float" style={{ animationDelay: '0s' }} />
        <div className="absolute top-1/3 left-1/3 w-3 h-3 bg-gold/20 rounded-full animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/4 right-1/3 w-2 h-2 bg-gold/25 rounded-full animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 bg-white/20 rounded-full animate-float" style={{ animationDelay: '1.5s' }} />
      </div>

      <div
        className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-16 lg:pt-24 pb-8 sm:pb-16 lg:pb-24 text-center w-full"
        dir="rtl"
      >
        {/* عنوان مُحسَّن للجوال */}
        <h1 className="text-mobile-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.3] sm:leading-relaxed" style={{ fontFamily: "'Cairo', sans-serif", fontWeight: 900, letterSpacing: '0.02em' }}>
          <span className="gold-shimmer-text">بيتك</span> أقرب بخطوة
        </h1>

        {/* وصف مختصر على الجوال */}
        <p className="mt-4 sm:mt-6 text-mobile-base sm:text-lg md:text-xl text-[#F3E7C9] max-w-3xl mx-auto leading-relaxed">
          منصة عالمية للبحث عن البيوت بسهولة وأمان
        </p>

        {/* صندوق البحث السريع - مُحسَّن للجوال */}
        <div className="mt-6 sm:mt-10 max-w-3xl mx-auto bg-white/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col md:flex-row items-center gap-3 sm:gap-4 border border-gold/20">
          <Input
            placeholder="ابحث عن مدينة أو حي..."
            className="flex-1 min-h-[48px] sm:min-h-[56px] text-mobile-base sm:text-lg text-black rounded-xl sm:rounded-2xl border-2 border-[#E0D4B0] focus:border-gold focus:ring-2 focus:ring-gold/30 transition-all touch-manipulation"
          />
          <Link href="/search" className="w-full md:w-auto">
            <Button className="min-h-[48px] sm:min-h-[56px] w-full md:w-auto px-6 sm:px-8 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#E8C882] text-[#002244] hover:shadow-lg hover:shadow-gold/30 active:scale-95 transition-all duration-300 font-bold text-mobile-base sm:text-lg touch-manipulation">
              <SearchIcon className="w-5 h-5 sm:w-6 sm:h-6 ml-2" />
              بحث
            </Button>
          </Link>
        </div>
        
        {/* إحصائيات سريعة - محسّنة للجوال */}
        <div className="mt-8 sm:mt-12 flex justify-center gap-6 sm:gap-8">
          <div className="text-center">
            <div className="text-mobile-2xl sm:text-3xl font-bold text-gold">+10K</div>
            <div className="text-mobile-sm sm:text-sm text-white/70 mt-1">عقار</div>
          </div>
          <div className="text-center">
            <div className="text-mobile-2xl sm:text-3xl font-bold text-gold">+5K</div>
            <div className="text-mobile-sm sm:text-sm text-white/70 mt-1">عميل</div>
          </div>
          <div className="text-center">
            <div className="text-mobile-2xl sm:text-3xl font-bold text-gold">+50</div>
            <div className="text-mobile-sm sm:text-sm text-white/70 mt-1">مدينة</div>
          </div>
        </div>
      </div>
      
      {/* Scroll indicator - مخفي على الجوال */}
      <div className="hidden sm:block absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2">
          <div className="w-1.5 h-3 bg-gold rounded-full animate-pulse" />
        </div>
      </div>
    </section>
  );
}

function CityCardsSection() {
  const [cities, setCities] = useState<Array<{ title: string; img: string }>>([]);

  useEffect(() => {
    async function fetchCities() {
      try {
        const res = await fetch('/api/featured-cities/active');
        if (res.ok) {
          const data = await res.json();
          if (data.cities && data.cities.length > 0) {
            const citiesWithImages = data.cities.filter((c: any) => c.image_url);
            if (citiesWithImages.length > 0) {
              setCities(citiesWithImages.map((c: any) => ({
                title: c.name_ar,
                img: c.image_url,
              })));
              return;
            }
          }
        }
      } catch (e) {}
      setCities(fallbackCities);
    }
    fetchCities();
  }, []);

  if (cities.length === 0) {
    return (
      <section className="relative py-12 sm:py-20 px-4 sm:px-6 bg-[#F7F1E5]" dir="rtl">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-mobile-2xl sm:text-3xl md:text-4xl font-extrabold text-center mb-8 sm:mb-12 text-[#003366]">
            المدن الأكثر طلباً
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg animate-pulse">
                <div className="aspect-[16/9] bg-gray-200 min-h-[200px]" />
                <div className="p-4 sm:p-5 flex justify-center"><div className="h-5 w-24 bg-gray-200 rounded" /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative py-12 sm:py-20 px-4 sm:px-6 bg-[#F7F1E5]" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-mobile-2xl sm:text-3xl md:text-4xl font-extrabold text-center mb-8 sm:mb-12 text-[#003366]">
          المدن الأكثر طلباً
        </h2>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 ${cities.length <= 3 ? 'lg:grid-cols-3' : cities.length === 4 ? 'lg:grid-cols-4' : cities.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-3 xl:grid-cols-6'}`}>
          {cities.map((city) => (
            <Link
              key={city.title}
              href={`/search?city=${encodeURIComponent(city.title)}`}
              className="relative bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg hover:shadow-xl hover:-translate-y-2 active:scale-95 transition-all duration-300 group touch-manipulation"
            >
              <div className="relative aspect-[16/9] overflow-hidden min-h-[200px]">
                <Image
                  src={city.img}
                  alt={city.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                  className="object-cover group-hover:scale-105 transition duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              </div>
              <div className="p-4 sm:p-5 text-center font-bold text-mobile-lg sm:text-lg text-[#003366] bg-white min-h-[64px] flex items-center justify-center">
                {city.title}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedPropertiesSection() {
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<typeof placeholderSlots[0] | null>(null);
  const [eliteProperties, setEliteProperties] = useState<EliteProperty[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'denied' | 'unavailable'>('loading');
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // جلب موقع المستخدم
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationStatus('success');
        },
        () => {
          setLocationStatus('denied');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationStatus('unavailable');
    }
  }, []);

  // جلب عقارات النخبة
  useEffect(() => {
    const fetchEliteProperties = async () => {
      try {
        const res = await fetch('/api/elite-slots/featured-properties');
        if (res.ok) {
          const data = await res.json();
          // تصفية الخانات التي تحتوي على عقارات حقيقية فقط
          const confirmedProperties = (data.properties || [])
            .filter((p: EliteProperty) => p.property_id && p.title)
            .map((p: EliteProperty) => ({
              ...p,
              id: p.property_id,
              cover_image: p.cover_image || '/patterns/hero-3.png'
            }));
          setEliteProperties(confirmedProperties);
        }
      } catch (error) {
        console.error('Error fetching elite properties:', error);
      }
    };

    fetchEliteProperties();
  }, []);

  const handleSlotClick = (slot: typeof placeholderSlots[0]) => {
    setSelectedSlot(slot);
    setShowModal(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, slot: typeof placeholderSlots[0]) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSlotClick(slot);
    }
  };

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedSlot(null);
  }, []);

  useEffect(() => {
    if (showModal && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [showModal]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showModal) {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showModal, closeModal]);

  // دمج العقارات الحقيقية مع الخانات الدعائية لتكوين 9 خانات دائماً (شبكة 3×3)
  const displaySlots = [];
  
  // إنشاء خريطة للعقارات حسب display_order (ترتيب العرض من 1 إلى 9)
  const propertyByDisplayOrder = new Map<number, EliteProperty>();
  eliteProperties.forEach((p) => {
    // استخدام display_order لتحديد موقع العقار في الشبكة
    const order = p.display_order || 1;
    propertyByDisplayOrder.set(Number(order), p);
  });
  
  // بناء 9 خانات - إما عقار حقيقي أو خانة دعائية
  for (let i = 0; i < 9; i++) {
    const displayOrder = i + 1; // الخانات من 1 إلى 9
    const property = propertyByDisplayOrder.get(displayOrder);
    
    if (property) {
      displaySlots.push({ type: 'property' as const, data: property, index: i });
    } else {
      displaySlots.push({ type: 'placeholder' as const, data: placeholderSlots[i], index: i });
    }
  }

  const formatPrice = (price: number) => {
    if (price >= 1000000) return `${(price / 1000000).toFixed(1)} مليون`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)} ألف`;
    return price.toString();
  };

  const formatDistance = (distance: number) => {
    if (distance < 1) return `${Math.round(distance * 1000)} م`;
    return `${distance.toFixed(1)} كم`;
  };

  return (
    <>
      <section className="py-16 bg-white" dir="rtl">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
            <div>
              <p className="text-mobile-sm font-semibold text-[#D4AF37] mb-2 flex items-center gap-1.5">
                <Crown className="w-5 h-5" /> الاختيار الأفضل
              </p>
              <h2 className="text-mobile-2xl sm:text-3xl md:text-4xl font-extrabold text-[#003366] mb-3">
                نخبة العقارات المختارة
              </h2>
              <p className="text-mobile-sm sm:text-base text-slate-600 flex items-center gap-2 flex-wrap">
                <span>خانات حصرية لرجال الأعمال والمستثمرين</span>
                {locationStatus === 'success' && (
                  <span className="inline-flex items-center gap-1.5 text-mobile-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full">
                    <Navigation className="w-4 h-4" />
                    مرتبة حسب قربك
                  </span>
                )}
              </p>
            </div>
            <Link
              href="/upgrade"
              className="min-h-[48px] px-6 py-3 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-mobile-base font-bold hover:shadow-lg active:scale-95 transition flex items-center gap-2 touch-manipulation"
            >
              <Sparkles className="w-5 h-5" />
              احجز خانتك الآن
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {displaySlots.map((slot) => (
              slot.type === 'property' ? (
                // عقار حقيقي
                <Link
                  key={slot.data.id}
                  href={`/listing/${slot.data.id}`}
                  className="relative bg-[#FBF7F0] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-2 focus:shadow-xl focus:-translate-y-2 focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50 transition-all duration-300 cursor-pointer group"
                >
                  <div className="relative h-[240px] sm:h-52">
                    <Image
                      src={getImageUrl(slot.data.cover_image || slot.data.image_url) || '/images/property1.jpg'}
                      alt={slot.data.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001A33]/90 via-[#001A33]/30 to-transparent" />
                    
                    <span 
                      className="absolute top-3 right-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-mobile-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 select-none"
                      onContextMenu={(e) => e.preventDefault()}
                      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    >
                      <Star className="w-4 h-4" />
                      نخبة
                    </span>

                    {slot.data.distance !== undefined && (
                      <span className="absolute top-3 left-3 bg-white/90 text-[#003366] text-mobile-xs px-2.5 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {formatDistance(slot.data.distance)}
                      </span>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
                      <h3 className="text-white font-bold text-mobile-lg sm:text-lg mb-2 drop-shadow-lg line-clamp-1">
                        {slot.data.title}
                      </h3>
                      <p className="text-white/80 text-mobile-sm flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {slot.data.city} - {slot.data.district}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 bg-gradient-to-l from-[#001A33] to-[#002845] flex justify-between items-center">
                    <p className="text-[#D4AF37] font-bold text-mobile-lg sm:text-lg">
                      {formatPrice(slot.data.price)} ر.س
                    </p>
                    <div className="flex items-center gap-3 text-white/70 text-mobile-sm">
                      <span>{slot.data.land_area} م²</span>
                      <span>{slot.data.bedrooms} غرف</span>
                    </div>
                  </div>
                </Link>
              ) : (
                // خانة فارغة
                <div
                  key={`placeholder-${slot.data.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${slot.data.tagline} - خانة ${slot.data.highlight} رقم ${slot.data.id}`}
                  onClick={() => handleSlotClick(slot.data)}
                  onKeyDown={(e) => handleKeyDown(e, slot.data)}
                  className="relative bg-[#FBF7F0] rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-2 focus:shadow-xl focus:-translate-y-2 focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50 transition-all duration-300 cursor-pointer group"
                >
                  <div className="relative h-[240px] sm:h-52">
                    <Image
                      src={slot.data.img}
                      alt={slot.data.tagline}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover opacity-60 group-hover:opacity-40 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#001A33]/90 via-[#001A33]/50 to-transparent" />
                    
                    <span className="absolute top-3 right-3 bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] text-mobile-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5">
                      <Star className="w-4 h-4" />
                      {slot.data.highlight}
                    </span>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 sm:p-6">
                      <div className="w-16 h-16 sm:w-14 sm:h-14 rounded-full bg-[#D4AF37]/20 border-2 border-dashed border-[#D4AF37] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Crown className="w-8 h-8 sm:w-7 sm:h-7 text-[#D4AF37]" />
                      </div>
                      <h3 className="text-white font-bold text-mobile-lg sm:text-lg mb-2 drop-shadow-lg">
                        {slot.data.tagline}
                      </h3>
                      <p className="text-[#D4AF37] text-mobile-sm font-medium">
                        اضغط للتفاصيل
                      </p>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5 bg-gradient-to-l from-[#001A33] to-[#002845] text-center">
                    <p className="text-white/80 text-mobile-sm">
                      خانة رقم <span className="text-[#D4AF37] font-bold">#{slot.data.id}</span> • متاحة الآن
                    </p>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </section>

      {showModal && selectedSlot && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onClick={closeModal}
          role="presentation"
        >
          <div 
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="bg-gradient-to-b from-[#001A33] to-[#002845] rounded-3xl max-w-lg w-full p-8 text-center relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-[#D4AF37] to-[#B8860B]" />
            
            <button 
              ref={closeButtonRef}
              onClick={closeModal}
              aria-label="إغلاق"
              className="absolute top-4 left-4 text-white/60 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-full p-1"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center mb-6 shadow-lg">
              <Crown className="w-10 h-10 text-[#001A33]" />
            </div>

            <h3 id="modal-title" className="text-2xl font-bold text-white mb-2">
              🌟 فرصة ذهبية لعقارك!
            </h3>
            
            <p className="text-[#D4AF37] font-bold text-lg mb-4">
              خانة #{selectedSlot.id} • {selectedSlot.highlight}
            </p>

            <div className="bg-white/10 rounded-2xl p-4 mb-6">
              <p className="text-white/90 text-sm leading-relaxed">
                احجز هذه الخانة الحصرية واجعل عقارك يظهر في <span className="text-[#D4AF37] font-bold">الصفحة الرئيسية</span> أمام 
                <span className="text-[#D4AF37] font-bold"> آلاف الزوار يومياً</span>. 
                هذه الميزة متاحة حصرياً لمشتركي <span className="text-[#D4AF37] font-bold">باقة رجال الأعمال</span>.
              </p>
            </div>

            <div className="space-y-3 mb-6 text-right">
              <div className="flex items-center gap-3 text-white/80 text-sm">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>ظهور مميز في الصفحة الرئيسية</span>
              </div>
              <div className="flex items-center gap-3 text-white/80 text-sm">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>زيادة المشاهدات بنسبة 10 أضعاف</span>
              </div>
              <div className="flex items-center gap-3 text-white/80 text-sm">
                <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                <span>أولوية في نتائج البحث</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/upgrade"
                className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#001A33] font-bold hover:shadow-lg transition flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-white"
                onClick={closeModal}
              >
                <Crown className="w-5 h-5" />
                ترقية لباقة رجال الأعمال
              </Link>
              <button
                onClick={closeModal}
                className="flex-1 py-3 px-6 rounded-xl border border-white/30 text-white font-medium hover:bg-white/10 transition focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              >
                لاحقاً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FreeAdCallToActionSection() {
  return (
    <section className="py-8 sm:py-10 bg-white" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center gap-6 sm:gap-10">
        <div className="flex-1 w-full">
          <Image
            src="/patterns/palace5.jpeg"
            alt="أعلن عن عقارك الآن"
            width={800}
            height={500}
            className="rounded-2xl sm:rounded-3xl shadow-lg object-cover w-full"
          />
        </div>
        <div className="flex-1 w-full">
          <p className="text-xs text-[#D4AF37] font-semibold mb-2">
            ابدأ رحلتك الآن 🚀
          </p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#003366] mb-3 sm:mb-4">
            أعلن عن عقارك بكل سهولة
          </h2>
          <p className="text-sm md:text-base text-slate-700 mb-5 sm:mb-6 leading-relaxed">
            انضم لآلاف أصحاب العقارات على منصتنا. ابدأ بإعلان مجاني
            لتجربة المنصة، ثم اختر الباقة المناسبة عندما ترى النتائج.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/listings/new"
              className="min-h-[48px] px-6 py-3 rounded-xl bg-[#D4AF37] text-[#001A33] font-bold text-sm hover:bg-[#E8C882] transition flex items-center"
            >
              أضف عقارك مجاناً
            </Link>
            <Link
              href="/plans"
              className="min-h-[48px] px-6 py-3 rounded-xl border border-[#003366] text-[#003366] font-bold text-sm hover:bg-[#003366] hover:text-white transition flex items-center"
            >
              استكشف الباقات
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const { checkAuth, isAuthenticated } = useAuthStore();

  // Handle OAuth redirect - sync auth state
  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauth === 'success' && provider) {
      // OAuth login successful - ensure auth state is synced
      if (!isAuthenticated) {
        checkAuth().then(() => {
          // Clean up URL by removing oauth params
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('oauth');
            url.searchParams.delete('provider');
            window.history.replaceState({}, '', url.pathname);
          }
        });
      }
    }
  }, [searchParams, checkAuth, isAuthenticated]);

  return (
    <div className="bg-[#F7F1E5] text-[#003366] min-h-screen" dir="rtl">
      <HeroSection />
      <CityCardsSection />
      <FeaturedPropertiesSection />
      <PlansHighlightSection />
      <FreeAdCallToActionSection />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="bg-[#F7F1E5] min-h-screen" />}>
      <HomePageContent />
    </Suspense>
  );
}
