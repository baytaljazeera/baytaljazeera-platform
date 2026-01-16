'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A1628] to-[#1a2942] flex items-center justify-center">
      <div className="animate-spin w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
    </div>
  );
}

interface Reservation {
  id: string;
  property_id: string;
  property_title: string;
  property_image: string;
  city: string;
  tier: string;
  row_num: number;
  col_num: number;
  status: string;
  effective_ends_at: string;
  days_remaining: number;
  pending_extension_count: number;
}

interface ExtensionRequest {
  id: string;
  requested_days: number;
  price_per_day: number;
  price_amount: string;
  vat_amount: string;
  total_amount: string;
  status: string;
}

const tierNames: Record<string, string> = {
  top: 'الموقع الذهبي 👑',
  middle: 'الموقع الفضي ⭐',
  bottom: 'الموقع البرونزي ✨'
};

const tierColors: Record<string, string> = {
  top: 'from-amber-400 to-yellow-600',
  middle: 'from-slate-300 to-slate-500',
  bottom: 'from-orange-400 to-orange-600'
};

function EliteExtendContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isHydrated } = useAuthStore();
  
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [days, setDays] = useState(7);
  const [customerNote, setCustomerNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'select' | 'details' | 'payment' | 'success'>('select');
  const [extension, setExtension] = useState<ExtensionRequest | null>(null);
  const [pricePerDay, setPricePerDay] = useState(30);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.push('/login?redirect=/elite-booking/extend');
    }
  }, [isHydrated, isAuthenticated, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        const [reservationsRes, priceRes] = await Promise.all([
          fetch('/api/elite-slots/my-reservations', {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }),
          fetch('/api/elite-slots/extension-price')
        ]);

        if (reservationsRes.ok) {
          const data = await reservationsRes.json();
          setReservations(data.reservations || []);
          
          const reservationParam = searchParams.get('reservation');
          if (reservationParam) {
            const found = data.reservations.find((r: Reservation) => r.id === reservationParam);
            if (found) {
              setSelectedReservation(found);
              setStep('details');
            }
          }
        }

        if (priceRes.ok) {
          const priceData = await priceRes.json();
          setPricePerDay(priceData.pricePerDay);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, searchParams]);

  const calculatePrice = () => {
    const price = pricePerDay * days;
    return { price, total: price };
  };

  const handleCreateExtension = async () => {
    if (!selectedReservation) return;
    
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/elite-slots/reservations/${selectedReservation.id}/extension`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ days, customerNote })
      });

      const data = await res.json();
      
      if (res.ok) {
        setExtension(data.extension);
        setStep('payment');
        toast.success('تم إنشاء طلب التمديد');
      } else {
        toast.error(data.error || 'حدث خطأ');
      }
    } catch (err) {
      toast.error('خطأ في الاتصال');
    } finally {
      setProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!extension) return;
    
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/elite-slots/extensions/${extension.id}/pay`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      
      if (res.ok) {
        setStep('success');
        toast.success('تم الدفع بنجاح!');
      } else {
        toast.error(data.error || 'حدث خطأ في الدفع');
      }
    } catch (err) {
      toast.error('خطأ في الاتصال');
    } finally {
      setProcessing(false);
    }
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0A1628] to-[#1a2942] flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const { price, total } = calculatePrice();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A1628] to-[#1a2942] py-8 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">تمديد حجز النخبة ⏰</h1>
          <p className="text-gray-400">أضف المزيد من الأيام لظهور إعلانك في صفوف النخبة</p>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          {['select', 'details', 'payment', 'success'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                step === s ? 'bg-[#D4AF37] text-[#0A1628]' : 
                ['select', 'details', 'payment', 'success'].indexOf(step) > i 
                  ? 'bg-green-500 text-white' 
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {['select', 'details', 'payment', 'success'].indexOf(step) > i ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-12 h-1 bg-gray-700"></div>}
            </div>
          ))}
        </div>

        {step === 'select' && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-800 mb-4">اختر الحجز الذي تريد تمديده</h2>
            
            {reservations.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📭</div>
                <h3 className="text-xl font-bold text-gray-600 mb-2">لا توجد حجوزات نخبة</h3>
                <p className="text-gray-500 mb-4">لم تقم بحجز أي مواقع نخبة بعد</p>
                <Link href="/elite-booking" className="inline-block bg-[#D4AF37] text-[#0A1628] px-6 py-3 rounded-xl font-bold hover:bg-[#FFD700] transition">
                  احجز موقع نخبة الآن
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map((res) => {
                  const daysLeft = Math.max(0, Math.ceil(res.days_remaining));
                  const isExpiringSoon = daysLeft <= 3;
                  
                  return (
                    <div 
                      key={res.id}
                      onClick={() => {
                        if (res.pending_extension_count > 0) {
                          toast.error('لديك طلب تمديد معلق لهذا الحجز');
                          return;
                        }
                        setSelectedReservation(res);
                        setStep('details');
                      }}
                      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                        res.pending_extension_count > 0 
                          ? 'border-gray-300 bg-gray-50 opacity-60 cursor-not-allowed'
                          : 'border-gray-200 hover:border-[#D4AF37] hover:shadow-lg'
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                          <Image
                            src={res.property_image || '/placeholder.jpg'}
                            alt={res.property_title}
                            fill
                            className="object-cover"
                          />
                          <div className={`absolute top-1 right-1 px-2 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r ${tierColors[res.tier]}`}>
                            {tierNames[res.tier]}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800 mb-1">{res.property_title}</h3>
                          <p className="text-gray-500 text-sm mb-2">{res.city}</p>
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                              isExpiringSoon ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                            }`}>
                              {daysLeft > 0 ? `${daysLeft} أيام متبقية` : 'منتهي'}
                            </span>
                            {res.pending_extension_count > 0 && (
                              <span className="px-3 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-600">
                                طلب تمديد معلق
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center">
                          <span className="text-2xl">→</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === 'details' && selectedReservation && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <button onClick={() => setStep('select')} className="text-gray-500 hover:text-gray-700 mb-4">
              ← العودة للقائمة
            </button>
            
            <div className="flex gap-6 mb-6">
              <div className="relative w-32 h-32 rounded-xl overflow-hidden flex-shrink-0">
                <Image
                  src={selectedReservation.property_image || '/placeholder.jpg'}
                  alt={selectedReservation.property_title}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white bg-gradient-to-r ${tierColors[selectedReservation.tier]} mb-2`}>
                  {tierNames[selectedReservation.tier]}
                </div>
                <h3 className="text-xl font-bold text-gray-800">{selectedReservation.property_title}</h3>
                <p className="text-gray-500">{selectedReservation.city}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <h4 className="font-bold text-gray-800 mb-4">اختر عدد أيام التمديد</h4>
              
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[3, 7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`py-3 rounded-xl font-bold transition ${
                      days === d 
                        ? 'bg-[#D4AF37] text-[#0A1628]' 
                        : 'bg-white border-2 border-gray-200 text-gray-600 hover:border-[#D4AF37]'
                    }`}
                  >
                    {d} أيام
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-4">
                <span className="text-gray-600">أو اختر يدوياً:</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={days}
                  onChange={(e) => setDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-20 px-3 py-2 border-2 border-gray-200 rounded-lg text-center font-bold"
                />
                <span className="text-gray-500">يوم</span>
              </div>
            </div>

            <div className="bg-[#0A1628] rounded-xl p-6 mb-6 text-white">
              <h4 className="font-bold mb-4">ملخص التكلفة</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">سعر اليوم الواحد</span>
                  <span>{pricePerDay} ريال</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">عدد الأيام</span>
                  <span>{days} يوم</span>
                </div>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="flex justify-between text-xl font-bold">
                    <span className="text-[#D4AF37]">الإجمالي</span>
                    <span className="text-[#D4AF37]">{total.toFixed(2)} ريال</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">ملاحظات (اختياري)</label>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="أي ملاحظات تود إضافتها..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl resize-none"
                rows={3}
              />
            </div>

            <button
              onClick={handleCreateExtension}
              disabled={processing}
              className="w-full bg-[#D4AF37] text-[#0A1628] py-4 rounded-xl font-bold text-lg hover:bg-[#FFD700] transition disabled:opacity-50"
            >
              {processing ? 'جاري المعالجة...' : `متابعة للدفع - ${total.toFixed(2)} ريال`}
            </button>
          </div>
        )}

        {step === 'payment' && extension && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">💳</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">إتمام الدفع</h2>
              <p className="text-gray-500">تأكيد طلب تمديد النخبة</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">عدد أيام التمديد</span>
                <span className="font-bold text-lg">{extension.requested_days} يوم</span>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-600">سعر اليوم</span>
                <span className="font-bold">{extension.price_per_day} ريال</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold text-gray-800">الإجمالي</span>
                  <span className="text-2xl font-bold text-[#D4AF37]">{parseFloat(extension.total_amount).toFixed(2)} ريال</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-blue-700 text-sm">
                💡 بعد الدفع، سيتم مراجعة طلبك من قبل الإدارة وستصلك إشعار بالموافقة.
              </p>
            </div>

            <button
              onClick={handlePayment}
              disabled={processing}
              className="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-600 transition disabled:opacity-50"
            >
              {processing ? 'جاري الدفع...' : 'تأكيد الدفع'}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-5xl">✅</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">تم الدفع بنجاح!</h2>
            <p className="text-gray-500 mb-6">
              طلب التمديد قيد المراجعة من قبل الإدارة.
              ستصلك إشعار عند الموافقة على طلبك.
            </p>
            <div className="flex gap-4 justify-center">
              <Link 
                href="/my-listings"
                className="bg-[#0A1628] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#1a2942] transition"
              >
                إعلاناتي
              </Link>
              <Link 
                href="/"
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-bold hover:bg-gray-200 transition"
              >
                الصفحة الرئيسية
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EliteExtendPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EliteExtendContent />
    </Suspense>
  );
}
