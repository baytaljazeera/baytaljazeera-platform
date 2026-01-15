'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { Globe } from 'lucide-react';

interface Slot {
  id: number;
  row_num: number;
  col_num: number;
  tier: 'top' | 'middle' | 'bottom';
  base_price: string;
  local_price?: number;
  display_order: number;
  status: 'available' | 'booked';
  hold_expires_at: string | null;
  needs_review?: boolean;
  property: {
    id: string;
    title: string;
    cover_image: string;
    city: string;
    price: number;
  } | null;
}

interface Country {
  code: string;
  name_ar: string;
  currency_code: string;
  currency_symbol: string;
}

const COUNTRY_FLAGS: Record<string, string> = {
  SA: "🇸🇦",
  AE: "🇦🇪",
  QA: "🇶🇦",
  KW: "🇰🇼",
  OM: "🇴🇲",
  BH: "🇧🇭",
  EG: "🇪🇬",
  TR: "🇹🇷",
  LB: "🇱🇧",
};

interface Property {
  id: string;
  title: string;
  cover_image: string;
  city: string;
  district: string;
  price: number;
  property_type: string;
  status: string;
}

interface Reservation {
  id: string;
  slot_id: number;
  status: string;
  price_amount: string;
  vat_amount: string;
  total_amount: string;
  hold_expires_at: string;
}

const tierColors = {
  top: { 
    bg: 'from-[#D4AF37] via-[#F4D03F] to-[#D4AF37]', 
    border: 'border-[#D4AF37]', 
    text: 'text-[#D4AF37]', 
    name: '🥇 الموقع الذهبي',
    price: '150',
    icon: '👑',
    description: 'أعلى نسبة مشاهدة'
  },
  middle: { 
    bg: 'from-[#C0C0C0] via-[#E8E8E8] to-[#C0C0C0]', 
    border: 'border-slate-400', 
    text: 'text-slate-600', 
    name: '🥈 الموقع الفضي',
    price: '100',
    icon: '⭐',
    description: 'موقع متميز'
  },
  bottom: { 
    bg: 'from-[#CD7F32] via-[#E8A54B] to-[#CD7F32]', 
    border: 'border-orange-400', 
    text: 'text-orange-700', 
    name: '🥉 الموقع البرونزي',
    price: '50',
    icon: '✨',
    description: 'بداية مميزة'
  }
};

export default function EliteBookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  
  const [slots, setSlots] = useState<Slot[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [step, setStep] = useState<'select' | 'property' | 'payment' | 'success'>('select');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistSlot, setWaitlistSlot] = useState<Slot | null>(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [preselectedPropertyId, setPreselectedPropertyId] = useState<string | null>(null);
  const [detectedCountry, setDetectedCountry] = useState<Country | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('ر.س');
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({ top: 150, middle: 100, bottom: 50 });
  const [currentCountryCode, setCurrentCountryCode] = useState('SA');

  const fetchSlots = useCallback(async (countryCode?: string) => {
    const codeToUse = countryCode || currentCountryCode || 'SA';
    if (countryCode) {
      setCurrentCountryCode(codeToUse);
    }
    try {
      const res = await fetch(`/api/elite-slots/pricing/by-country/${codeToUse}`);
      const data = await res.json();
      
      if (data.country) {
        setCurrencySymbol(data.country.currency_symbol);
      }
      
      const slotsWithStatus = (data.slots || []).map((s: any) => ({
        ...s,
        base_price: String(s.base_price_sar || s.local_price),
        local_price: s.local_price,
        status: 'available',
        property: null
      }));
      
      const prices: Record<string, number> = {};
      slotsWithStatus.forEach((s: Slot) => {
        if (!prices[s.tier] || s.local_price) {
          prices[s.tier] = s.local_price || parseFloat(s.base_price);
        }
      });
      setTierPrices(prices);
      
      const availRes = await fetch('/api/elite-slots/availability');
      const availData = await availRes.json();
      
      const availabilityMap: Record<number, any> = {};
      (availData.slots || []).forEach((s: any) => {
        availabilityMap[s.id] = s;
      });
      
      const mergedSlots = slotsWithStatus.map((s: Slot) => ({
        ...s,
        status: availabilityMap[s.id]?.status || 'available',
        property: availabilityMap[s.id]?.property || null,
        hold_expires_at: availabilityMap[s.id]?.hold_expires_at || null
      }));
      
      setSlots(mergedSlots);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  }, []);

  const fetchProperties = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/elite-slots/my-properties', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties || []);
      }
    } catch (err) {
      console.error('Error fetching properties:', err);
    }
  }, []);

  useEffect(() => {
    const propertyId = searchParams.get('propertyId');
    if (propertyId) {
      setPreselectedPropertyId(propertyId);
    }
  }, [searchParams]);

  useEffect(() => {
    const detectLocation = async () => {
      try {
        const geoRes = await fetch("/api/geolocation/detect");
        const geoData = await geoRes.json();
        if (geoData.country) {
          const supportedCodes = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'LB', 'TR'];
          const countryCode = supportedCodes.includes(geoData.country.code) ? geoData.country.code : 'SA';
          const country = countryCode === geoData.country.code ? geoData.country : {
            code: 'SA',
            name_ar: 'السعودية',
            currency_code: 'SAR',
            currency_symbol: 'ر.س'
          };
          setDetectedCountry(country);
          return countryCode;
        }
      } catch (err) {
        console.error("Error detecting location:", err);
      }
      return 'SA';
    };
    
    const init = async () => {
      setLoading(true);
      const countryCode = await detectLocation();
      await fetchSlots(countryCode);
      if (isAuthenticated) {
        await fetchProperties();
      }
      setLoading(false);
    };
    init();
  }, [isAuthenticated, fetchSlots, fetchProperties]);

  useEffect(() => {
    if (preselectedPropertyId && properties.length > 0 && !selectedProperty) {
      const property = properties.find(p => p.id === preselectedPropertyId);
      if (property) {
        setSelectedProperty(property);
      }
    }
  }, [preselectedPropertyId, properties, selectedProperty]);

  useEffect(() => {
    if (reservation?.hold_expires_at) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((new Date(reservation.hold_expires_at).getTime() - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining === 0) {
          setReservation(null);
          setStep('select');
          setError('انتهت مهلة الحجز المؤقت');
          fetchSlots();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [reservation, fetchSlots]);

  const handleSlotClick = async (slot: Slot) => {
    console.log(`[ELITE-BOOKING] Slot clicked - ID: ${slot.id}, Display Order: ${slot.display_order}, Tier: ${slot.tier}, Row: ${slot.row_num}, Col: ${slot.col_num}`);
    
    if (!isAuthenticated) {
      router.push('/login?redirect=/elite-booking');
      return;
    }

    if (slot.status === 'booked') {
      setWaitlistSlot(slot);
      setShowWaitlistModal(true);
      if (properties.length === 0) {
        fetchProperties();
      }
      return;
    }

    setSelectedSlot(slot);
    setError('');
    
    if (selectedProperty) {
      handlePropertySelectWithSlot(slot, selectedProperty);
    } else {
      setStep('property');
    }
  };

  const handlePropertySelectWithSlot = async (slot: Slot, property: Property) => {
    setProcessing(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/elite-slots/hold', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          slotId: slot.id,
          propertyId: property.id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'خطأ في حجز الموقع');
        setProcessing(false);
        return;
      }

      setReservation(data.reservation);
      setStep('payment');
    } catch (err) {
      setError('خطأ في الاتصال بالخادم');
    }
    setProcessing(false);
  };

  const handleJoinWaitlist = async (property: Property, tierPreference: string) => {
    if (!waitlistSlot) return;
    
    setJoiningWaitlist(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/elite-slots/waitlist/join', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          propertyId: property.id,
          tierPreference,
          slotId: waitlistSlot.id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'خطأ في الانضمام لقائمة الانتظار');
        setJoiningWaitlist(false);
        return;
      }

      setWaitlistSuccess(true);
      setTimeout(() => {
        setShowWaitlistModal(false);
        setWaitlistSlot(null);
        setWaitlistSuccess(false);
      }, 3000);
    } catch (err) {
      setError('خطأ في الاتصال بالخادم');
    }
    setJoiningWaitlist(false);
  };

  const handlePropertySelect = async (property: Property) => {
    setSelectedProperty(property);
    setProcessing(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/elite-slots/hold', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          slotId: selectedSlot?.id,
          propertyId: property.id
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'خطأ في حجز الموقع');
        setProcessing(false);
        return;
      }

      setReservation(data.reservation);
      setStep('payment');
    } catch (err) {
      setError('خطأ في الاتصال بالخادم');
    }
    setProcessing(false);
  };

  const handlePayment = async () => {
    if (!reservation) return;

    setProcessing(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/elite-slots/confirm-payment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          reservationId: reservation.id,
          paymentMethod,
          cardNumber: paymentMethod === 'credit_card' ? cardNumber : undefined,
          cardExpiry: paymentMethod === 'credit_card' ? cardExpiry : undefined,
          cardCvv: paymentMethod === 'credit_card' ? cardCvv : undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'خطأ في معالجة الدفع');
        setProcessing(false);
        return;
      }

      setStep('success');
      fetchSlots();
    } catch (err) {
      setError('خطأ في الاتصال بالخادم');
    }
    setProcessing(false);
  };

  const handleCancel = async () => {
    if (!reservation) return;

    try {
      const token = localStorage.getItem('token');
      await fetch('/api/elite-slots/cancel', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({ reservationId: reservation.id })
      });
    } catch (err) {
      console.error('Error cancelling:', err);
    }

    setReservation(null);
    setSelectedSlot(null);
    setSelectedProperty(null);
    setStep('select');
    fetchSlots();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A1628] to-[#1a2d4a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#D4AF37] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A1628] to-[#1a2d4a] py-8 px-4" dir="rtl">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-[#D4AF37] mb-2">نخبة العقارات المختارة</h1>
          <p className="text-gray-300 text-lg">اختر موقعك المميز في واجهة الموقع الرئيسية</p>
          
          {detectedCountry && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mt-4 bg-white/10 backdrop-blur-sm rounded-xl border border-[#D4AF37]/30">
              <Globe className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-2xl">{COUNTRY_FLAGS[detectedCountry.code] || "🌍"}</span>
              <span className="font-medium text-white">{detectedCountry.name_ar}</span>
              <span className="text-sm text-gray-400">({currencySymbol})</span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-200 px-6 py-4 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        {step === 'select' && (
          <div className="space-y-6">
            {selectedProperty && (
              <div className="bg-gradient-to-r from-[#D4AF37]/20 to-amber-500/10 backdrop-blur-md rounded-2xl p-4 border border-[#D4AF37]/50">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0">
                    <Image
                      src={selectedProperty.cover_image || '/placeholder.jpg'}
                      alt={selectedProperty.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[#D4AF37] text-sm font-medium">العقار المحدد للحجز:</p>
                    <h3 className="text-white font-bold">{selectedProperty.title}</h3>
                    <p className="text-gray-400 text-sm">{selectedProperty.city} - {selectedProperty.district}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedProperty(null)}
                    className="text-gray-400 hover:text-white p-2"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {(['top', 'middle', 'bottom'] as const).map((tier) => {
                const tierSlots = slots.filter(s => s.tier === tier);
                const colors = tierColors[tier];
                const availableCount = tierSlots.filter(s => s.status === 'available').length;
                
                return (
                  <div key={tier} className="bg-white/5 backdrop-blur-md rounded-3xl overflow-hidden border border-white/10 hover:border-white/20 transition-all">
                    <div className={`bg-gradient-to-r ${colors.bg} p-6 text-center`}>
                      <span className="text-4xl mb-2 block">{colors.icon}</span>
                      <h3 className="text-xl font-bold text-[#002845]">{colors.name}</h3>
                      <p className="text-[#002845]/70 text-sm mt-1">{colors.description}</p>
                    </div>
                    
                    <div className="p-6">
                      <div className="text-center mb-6">
                        <span className="text-4xl font-bold text-white">{(tierPrices[tier] || 0).toLocaleString()}</span>
                        <span className="text-gray-400 text-lg mr-1">{currencySymbol}</span>
                        <p className="text-gray-500 text-sm mt-1">لمدة أسبوع</p>
                      </div>
                      
                      <div className="space-y-3">
                        {tierSlots.map((slot) => {
                          const isBooked = slot.status === 'booked';
                          return (
                            <button
                              key={slot.id}
                              onClick={() => handleSlotClick(slot)}
                              disabled={isBooked}
                              className={`
                                w-full p-4 rounded-xl transition-all duration-300 flex items-center justify-between
                                ${isBooked 
                                  ? 'bg-gray-800/50 cursor-not-allowed' 
                                  : `bg-white/10 hover:bg-gradient-to-r hover:${colors.bg} hover:scale-[1.02] cursor-pointer border border-white/10 hover:border-transparent`
                                }
                              `}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isBooked ? 'bg-gray-700' : `bg-gradient-to-br ${colors.bg}`}`}>
                                  {slot.display_order}
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold ${isBooked ? 'text-gray-500' : 'text-white'}`}>
                                    الموقع #{slot.display_order}
                                  </p>
                                  {isBooked && slot.property && (
                                    <p className="text-gray-500 text-xs line-clamp-1">{slot.property.title}</p>
                                  )}
                                </div>
                              </div>
                              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                                isBooked 
                                  ? 'bg-red-500/20 text-red-400' 
                                  : 'bg-green-500/20 text-green-400'
                              }`}>
                                {isBooked ? 'محجوز' : 'متاح'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      
                      <div className="mt-4 text-center">
                        <span className={`text-sm ${availableCount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {availableCount > 0 ? `${availableCount} مواقع متاحة` : 'جميع المواقع محجوزة'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 text-center">
              <div className="flex flex-wrap justify-center gap-6 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span>متاح للحجز</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span>محجوز (يمكن الانضمام لقائمة الانتظار)</span>
                </div>
              </div>
              <p className="mt-4 text-gray-500">الحجز صالح لمدة أسبوع واحد</p>
            </div>
          </div>
        )}

        {step === 'property' && selectedSlot && (
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => { setStep('select'); setSelectedSlot(null); }}
                className="text-gray-400 hover:text-white flex items-center gap-2"
              >
                <span>←</span>
                <span>رجوع</span>
              </button>
              <h2 className="text-2xl font-bold text-white">اختر عقارك</h2>
              <div></div>
            </div>

            <div className={`bg-gradient-to-r ${tierColors[selectedSlot.tier].bg} rounded-xl p-4 mb-6 text-center`}>
              <span className="text-white font-bold">
                الموقع {selectedSlot.display_order} - {tierColors[selectedSlot.tier].name} - {(selectedSlot.local_price || parseFloat(selectedSlot.base_price)).toLocaleString()} {currencySymbol}
              </span>
            </div>

            {properties.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-4">لا توجد عقارات معتمدة</p>
                <p className="text-gray-500 text-sm mb-6">يجب أن يكون لديك عقار معتمد لحجز موقع في النخبة</p>
                <Link
                  href="/listings/new"
                  className="inline-block bg-[#D4AF37] text-[#0A1628] px-6 py-3 rounded-xl font-bold hover:bg-[#FFD700] transition-colors"
                >
                  أضف عقار جديد
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {properties.map((property) => (
                  <button
                    key={property.id}
                    onClick={() => handlePropertySelect(property)}
                    disabled={processing}
                    className="bg-white/5 border border-white/20 rounded-xl p-4 hover:bg-white/10 hover:border-[#D4AF37] transition-all text-right"
                  >
                    <div className="relative h-32 rounded-lg overflow-hidden mb-3">
                      <Image
                        src={property.cover_image || '/placeholder.jpg'}
                        alt={property.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <h3 className="text-white font-bold text-sm mb-1 line-clamp-1">{property.title}</h3>
                    <p className="text-gray-400 text-xs">{property.city} - {property.district}</p>
                    <p className="text-[#D4AF37] font-bold mt-2">{property.price?.toLocaleString()} ريال</p>
                  </button>
                ))}
              </div>
            )}

            {processing && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-[#0A1628] rounded-2xl p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#D4AF37] border-t-transparent mx-auto mb-4"></div>
                  <p className="text-white">جاري حجز الموقع...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'payment' && reservation && selectedSlot && selectedProperty && (
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handleCancel}
                className="text-red-400 hover:text-red-300 flex items-center gap-2"
              >
                <span>إلغاء الحجز</span>
              </button>
              <h2 className="text-2xl font-bold text-white">إتمام الدفع</h2>
              <div className="text-[#D4AF37] font-bold">
                {formatTime(countdown)}
              </div>
            </div>

            {countdown <= 60 && countdown > 0 && (
              <div className="bg-red-500/20 border border-red-500 text-red-200 px-4 py-2 rounded-lg mb-6 text-center text-sm">
                تنبيه: تبقى أقل من دقيقة لإتمام الدفع!
              </div>
            )}

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <h3 className="text-white font-bold mb-3">تفاصيل الحجز</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">الموقع</p>
                  <p className="text-white">{tierColors[selectedSlot.tier].name} - موقع {selectedSlot.display_order}</p>
                </div>
                <div>
                  <p className="text-gray-400">العقار</p>
                  <p className="text-white line-clamp-1">{selectedProperty.title}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <h3 className="text-white font-bold mb-3">ملخص الفاتورة</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-bold">
                  <span className="text-[#D4AF37]">الإجمالي</span>
                  <span className="text-[#D4AF37]">{parseFloat(reservation.total_amount).toFixed(2)} ريال</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-white font-bold mb-3">طريقة الدفع</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPaymentMethod('credit_card')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === 'credit_card'
                      ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <span className="text-2xl mb-2 block">💳</span>
                  <span className="text-white text-sm">بطاقة ائتمان</span>
                </button>
                <button
                  onClick={() => setPaymentMethod('bank_transfer')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === 'bank_transfer'
                      ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <span className="text-2xl mb-2 block">🏦</span>
                  <span className="text-white text-sm">تحويل بنكي</span>
                </button>
              </div>
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">رقم البطاقة</label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder="0000 0000 0000 0000"
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">تاريخ الانتهاء</label>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">CVV</label>
                    <input
                      type="text"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="***"
                      className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {paymentMethod === 'bank_transfer' && (
              <div className="bg-blue-500/10 border border-blue-500 rounded-xl p-4 mb-6">
                <p className="text-blue-200 text-sm">
                  سيتم تأكيد الحجز مؤقتاً وإرسال تفاصيل الحساب البنكي إلى بريدك الإلكتروني.
                  يجب إتمام التحويل خلال 24 ساعة.
                </p>
              </div>
            )}

            <button
              onClick={handlePayment}
              disabled={processing || (paymentMethod === 'credit_card' && (!cardNumber || !cardExpiry || !cardCvv))}
              className="w-full bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-[#0A1628] py-4 rounded-xl font-bold text-lg hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'جاري المعالجة...' : `دفع ${parseFloat(reservation.total_amount).toFixed(2)} ريال`}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl max-w-lg mx-auto text-center">
            <div className="w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl">✓</span>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">تم الحجز بنجاح!</h2>
            <p className="text-gray-300 mb-6">
              تم تأكيد حجز عقارك في قسم نخبة العقارات المختارة.
              سيظهر عقارك في الصفحة الرئيسية خلال دقائق.
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/"
                className="bg-[#D4AF37] text-[#0A1628] px-6 py-3 rounded-xl font-bold hover:bg-[#FFD700] transition-colors"
              >
                العودة للرئيسية
              </Link>
              <Link
                href="/account"
                className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-colors"
              >
                حجوزاتي
              </Link>
            </div>
          </div>
        )}

        {showWaitlistModal && waitlistSlot && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gradient-to-br from-[#0A1628] to-[#1a2d4a] rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-[#D4AF37]/30">
              {waitlistSuccess ? (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">✓</span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">تمت الإضافة بنجاح!</h3>
                  <p className="text-gray-300">سنرسل لك إشعاراً عند توفر الموقع</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <button
                      onClick={() => { setShowWaitlistModal(false); setWaitlistSlot(null); }}
                      className="text-gray-400 hover:text-white text-xl"
                    >
                      ✕
                    </button>
                    <h3 className="text-xl font-bold text-[#D4AF37]">قائمة الانتظار</h3>
                    <div></div>
                  </div>

                  <div className={`bg-gradient-to-r ${tierColors[waitlistSlot.tier].bg} rounded-xl p-4 mb-6 text-center`}>
                    <span className="text-white font-bold">
                      الموقع {waitlistSlot.display_order} - {tierColors[waitlistSlot.tier].name}
                    </span>
                    <p className="text-white/80 text-sm mt-1">هذا الموقع محجوز حالياً</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4 mb-6">
                    <p className="text-gray-300 text-center">
                      انضم لقائمة الانتظار وسنرسل لك إشعاراً فوراً عند توفر هذا الموقع أو بدء فترة جديدة.
                    </p>
                  </div>

                  <h4 className="text-white font-bold mb-3">اختر عقارك للحجز:</h4>

                  {properties.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-gray-400 mb-4">لا توجد عقارات معتمدة</p>
                      <Link
                        href="/listings/new"
                        className="inline-block bg-[#D4AF37] text-[#0A1628] px-4 py-2 rounded-lg font-bold hover:bg-[#FFD700] transition-colors text-sm"
                      >
                        أضف عقار جديد
                      </Link>
                    </div>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {properties.map((property) => (
                        <button
                          key={property.id}
                          onClick={() => handleJoinWaitlist(property, waitlistSlot.tier)}
                          disabled={joiningWaitlist}
                          className="w-full bg-white/5 border border-white/20 rounded-xl p-3 hover:bg-white/10 hover:border-[#D4AF37] transition-all flex items-center gap-3 text-right disabled:opacity-50"
                        >
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                            <Image
                              src={property.cover_image || '/placeholder.jpg'}
                              alt={property.title}
                              fill
                              className="object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="text-white font-bold text-sm line-clamp-1">{property.title}</h5>
                            <p className="text-gray-400 text-xs">{property.city}</p>
                          </div>
                          <span className="text-[#D4AF37] text-sm font-bold flex-shrink-0">
                            {joiningWaitlist ? '...' : 'انضم →'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
