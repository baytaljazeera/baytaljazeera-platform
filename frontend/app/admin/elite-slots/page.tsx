'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';

interface Period {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
}

interface Stats {
  booked_slots: number;
  held_slots: number;
  pending_slots: number;
  total_revenue: number;
  waitlist_count: number;
}

interface Reservation {
  id: number;
  tier: string;
  row_num: number;
  col_num: number;
  slot_id: number;
  property_id: string;
  property_title: string;
  property_image: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: string;
  total_amount: number;
  price_amount: number;
  vat_amount: number;
  confirmed_at: string | null;
  created_at: string;
  period_ends_at?: string;
  reservation_ends_at?: string;
}

interface WaitlistEntry {
  id: number;
  tier: string | null;
  tier_preference: string;
  property_title: string;
  property_city: string;
  user_name: string;
  user_email: string;
  created_at: string;
}

interface SlotInfo {
  id: number;
  row_num: number;
  col_num: number;
  tier: string;
  base_price: number;
  reservation?: Reservation;
}

export default function AdminEliteSlotsPage() {
  const router = useRouter();
  const { isAuthenticated, user, isHydrated } = useAuthStore();
  const [period, setPeriod] = useState<Period | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [pendingReservations, setPendingReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [waitlistBySlot, setWaitlistBySlot] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'reservations' | 'waitlist' | 'seatmap' | 'pricing'>('pending');
  const [notifying, setNotifying] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [extending, setExtending] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(1);
  const [pricingSlots, setPricingSlots] = useState<{id: number; tier: string; base_price: number; row_num: number; col_num: number; display_order?: number}[]>([]);
  const [savingPrices, setSavingPrices] = useState(false);
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'approve' | 'rotate' | 'danger' | 'cancel';
    onConfirm: () => void;
    showReasonInput?: boolean;
    reservationId?: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (isHydrated && (!isAuthenticated || !user?.role || user.role === 'user')) {
      router.push('/admin/login');
    }
  }, [isHydrated, isAuthenticated, user, router]);

  const fetchData = async () => {
    try {
      const [statsRes, waitlistRes, slotsRes] = await Promise.all([
        fetch('/api/elite-slots/admin/stats', { credentials: 'include' }),
        fetch('/api/elite-slots/admin/waitlist', { credentials: 'include' }),
        fetch('/api/elite-slots/availability', { credentials: 'include' })
      ]);
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setPeriod(data.period);
        setStats(data.stats);
        const allRes = data.reservations || [];
        setReservations(allRes.filter((r: Reservation) => r.status === 'confirmed' || r.status === 'held'));
        setPendingReservations(allRes.filter((r: Reservation) => r.status === 'pending_approval'));
        setWaitlistBySlot(data.waitlistBySlot || {});
      }
      
      if (waitlistRes.ok) {
        const data = await waitlistRes.json();
        setWaitlist(data.waitlist || []);
      }

      if (slotsRes.ok) {
        const data = await slotsRes.json();
        setSlots(data.slots || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const fetchPricing = async () => {
    try {
      const res = await fetch('/api/elite-slots/admin/pricing', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPricingSlots(data.slots || []);
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
    }
  };

  const handleSavePrices = async () => {
    setSavingPrices(true);
    try {
      const prices = pricingSlots.map(s => ({ id: s.id, price: s.base_price }));
      const res = await fetch('/api/elite-slots/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prices })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم حفظ الأسعار بنجاح ✅');
        fetchData();
        fetchPricing();
      } else {
        toast.error(data.error || 'خطأ في حفظ الأسعار');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setSavingPrices(false);
  };

  const handleUpdateTierPrice = async (tier: string, price: number) => {
    try {
      const res = await fetch('/api/elite-slots/admin/pricing/tier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier, price })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'تم تحديث السعر');
        fetchPricing();
      } else {
        toast.error(data.error || 'خطأ في التحديث');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
  };

  const updateSlotPrice = (slotId: number, newPrice: number) => {
    setPricingSlots(prev => 
      prev.map(s => s.id === slotId ? { ...s, base_price: newPrice } : s)
    );
  };

  const showApproveConfirm = (reservationId: number) => {
    setConfirmModal({
      show: true,
      title: 'تأكيد الموافقة',
      message: 'هل تريد الموافقة على هذا الحجز وتفعيله؟',
      type: 'approve',
      onConfirm: () => handleApprove(reservationId)
    });
  };

  const handleApprove = async (reservationId: number) => {
    setConfirmModal(null);
    setApproving(reservationId);
    try {
      const res = await fetch('/api/elite-slots/admin/approve-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservationId })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تمت الموافقة وتفعيل الحجز بنجاح ✅', {
          description: 'تم تفعيل موقع النخبة للعقار',
          duration: 4000,
        });
        fetchData();
      } else {
        toast.error(data.error || 'خطأ في الموافقة');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setApproving(null);
  };

  const handleReject = async (reservationId: number) => {
    const reason = prompt('سبب الرفض (اختياري):');
    if (reason === null) return;
    
    setRejecting(reservationId);
    try {
      const res = await fetch('/api/elite-slots/admin/reject-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservationId, reason })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم رفض الحجز', {
          description: 'سيتم إشعار صاحب العقار بالقرار',
          duration: 4000,
        });
        fetchData();
      } else {
        toast.error(data.error || 'خطأ في الرفض');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setRejecting(null);
  };

  const handleNotifyWaitlist = async (waitlistId: number) => {
    setNotifying(waitlistId);
    try {
      const res = await fetch('/api/elite-slots/admin/notify-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ waitlistId })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم إرسال الإشعار بنجاح 📧', {
          description: 'سيصل الإشعار للمستخدم في قائمة الانتظار',
          duration: 4000,
        });
        fetchData();
      } else {
        toast.error(data.error || 'خطأ في إرسال الإشعار');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setNotifying(null);
  };

  // عرض مودال إلغاء الحجز
  const showCancelModal = (reservationId: string) => {
    setCancelReason('');
    setConfirmModal({
      show: true,
      title: 'إلغاء حجز النخبة',
      message: 'هل أنت متأكد من إلغاء هذا الحجز؟ سيتم إشعار صاحب العقار.',
      type: 'cancel',
      showReasonInput: true,
      reservationId: reservationId,
      onConfirm: () => handleCancelReservation(reservationId)
    });
  };

  // إلغاء حجز مؤكد
  const handleCancelReservation = async (reservationId: string) => {
    setConfirmModal(null);
    setCancelling(reservationId);
    try {
      const res = await fetch('/api/elite-slots/admin/cancel-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservationId, reason: cancelReason })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('تم إلغاء الحجز بنجاح', {
          description: 'سيتم إشعار صاحب العقار بالإلغاء',
          duration: 4000,
        });
        setCancelReason('');
        fetchData();
      } else {
        toast.error(data.error || 'خطأ في الإلغاء');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setCancelling(null);
  };

  // تمديد حجز مؤكد
  const handleExtendReservation = async (reservationId: string, days: number) => {
    setExtending(reservationId);
    try {
      const res = await fetch('/api/elite-slots/admin/extend-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservationId, days })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`تم تمديد الحجز بـ ${days} يوم`, {
          description: 'سيتم إشعار صاحب العقار بالتمديد',
          duration: 4000,
        });
        fetchData();
      } else {
        toast.error(data.error || 'خطأ في التمديد');
      }
    } catch (error) {
      toast.error('خطأ في الاتصال بالخادم');
    }
    setExtending(null);
  };

  // حساب الأيام المتبقية
  const getRemainingDays = (endDate: string | undefined): number => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  useEffect(() => {
    if (isHydrated && isAuthenticated && user?.role && user.role !== 'user') {
      fetchData();
    }
  }, [isHydrated, isAuthenticated, user]);

  const showRotateConfirm = () => {
    setConfirmModal({
      show: true,
      title: 'تأكيد تدوير الفترة',
      message: 'هل أنت متأكد من تدوير الفترة؟ سيتم إنهاء الفترة الحالية وبدء فترة جديدة.',
      type: 'rotate',
      onConfirm: handleRotatePeriod
    });
  };

  const handleRotatePeriod = async () => {
    setConfirmModal(null);
    setRotating(true);
    try {
      const res = await fetch('/api/elite-slots/rotate-period', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.rotated) {
        toast.success('تم تدوير الفترة بنجاح! 🔄', {
          description: `تم إشعار ${data.notifiedUsers} مستخدم ببدء الدورة الجديدة`,
          duration: 5000,
        });
        fetchData();
      } else {
        toast.info(data.message || 'لا توجد فترة منتهية للتدوير', {
          description: 'الدورة الحالية لا تزال نشطة',
          duration: 4000,
        });
      }
    } catch (error) {
      toast.error('خطأ في تدوير الفترة', {
        description: 'يرجى المحاولة مرة أخرى لاحقاً',
        duration: 4000,
      });
    }
    setRotating(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tierNames: Record<string, string> = {
    top: 'الصف الأول',
    middle: 'الصف الثاني',
    bottom: 'الصف الثالث',
  };

  const tierPrices: Record<string, number> = {
    top: 150,
    middle: 100,
    bottom: 50,
  };

  const tierColors: Record<string, string> = {
    top: 'bg-gradient-to-r from-yellow-400 to-amber-500',
    middle: 'bg-gradient-to-r from-blue-400 to-blue-600',
    bottom: 'bg-gradient-to-r from-green-400 to-emerald-500',
  };

  const getSlotByPosition = (row: number, col: number) => {
    return slots.find(s => s.row_num === row && s.col_num === col);
  };

  const getReservationForSlot = (slotId: number) => {
    return [...reservations, ...pendingReservations].find(r => r.id === slotId);
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#D4AF37] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100" dir="rtl">
      <div className="bg-gradient-to-r from-[#0A1628] to-[#1a2d4a] text-white py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#D4AF37]">🏆 نخبة الإعلانات</h1>
            <p className="text-gray-300 text-sm mt-1">إدارة حجوزات المواقع المميزة على الصفحة الرئيسية</p>
          </div>
          <Link
            href="/admin/dashboard"
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition"
          >
            ← العودة للوحة التحكم
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {period && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-r-4 border-[#D4AF37]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  📅 دورة العرض الحالية
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  كل دورة تستمر 7 أيام - بعدها تبدأ دورة جديدة ويمكن للعملاء حجز مواقع جديدة
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={showRotateConfirm}
                  disabled={rotating}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-5 py-2.5 rounded-xl transition disabled:opacity-50 font-semibold shadow-md flex items-center gap-2"
                >
                  🔄 {rotating ? 'جاري التدوير...' : 'بدء دورة جديدة'}
                </button>
                <span className="text-xs text-gray-400">للاستخدام الطارئ فقط</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 text-center border border-blue-200">
                <p className="text-blue-600 text-sm font-medium">🚀 تاريخ البدء</p>
                <p className="font-bold text-gray-800 text-lg mt-1">{formatDate(period.starts_at)}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 text-center border border-purple-200">
                <p className="text-purple-600 text-sm font-medium">🏁 تاريخ الانتهاء</p>
                <p className="font-bold text-gray-800 text-lg mt-1">{formatDate(period.ends_at)}</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 text-center border border-green-200">
                <p className="text-green-600 text-sm font-medium">الحالة</p>
                <span className="inline-flex items-center gap-1 bg-green-500 text-white px-4 py-1.5 rounded-full text-sm font-bold mt-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  نشطة
                </span>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 text-center border border-amber-200">
                <p className="text-amber-600 text-sm font-medium">⏳ المتبقي</p>
                <p className="font-bold text-[#D4AF37] text-2xl mt-1">
                  {Math.max(0, Math.ceil((new Date(period.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} <span className="text-base">يوم</span>
                </p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-blue-800 text-sm">
                <strong>💡 ماذا يحدث عند انتهاء الدورة؟</strong> تبدأ دورة جديدة تلقائياً، ويتم إشعار أصحاب الحجوزات المنتهية. يمكنهم تجديد حجوزاتهم أو تركها لعملاء آخرين.
              </p>
            </div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-4xl font-bold text-amber-500">{pendingReservations.length}</div>
              <p className="text-gray-600 mt-2">طلبات معلقة</p>
              <p className="text-gray-400 text-sm">بانتظار الموافقة</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-4xl font-bold text-[#D4AF37]">{stats.booked_slots}</div>
              <p className="text-gray-600 mt-2">مواقع محجوزة</p>
              <p className="text-gray-400 text-sm">من أصل 9 مواقع</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-4xl font-bold text-blue-500">{stats.held_slots}</div>
              <p className="text-gray-600 mt-2">حجوزات مؤقتة</p>
              <p className="text-gray-400 text-sm">في انتظار الدفع</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-4xl font-bold text-green-500">
                {parseFloat(String(stats.total_revenue)).toLocaleString('en-US')}
              </div>
              <p className="text-gray-600 mt-2">إجمالي الإيرادات</p>
              <p className="text-gray-400 text-sm">ريال سعودي</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="text-4xl font-bold text-purple-500">{stats.waitlist_count}</div>
              <p className="text-gray-600 mt-2">قائمة الانتظار</p>
              <p className="text-gray-400 text-sm">في انتظار التوفر</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#0A1628] to-[#1a2d4a] text-white">
            <div className="flex flex-wrap">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex-1 px-4 py-4 font-bold transition-all relative ${
                  activeTab === 'pending' 
                    ? 'bg-white/10 text-[#D4AF37]' 
                    : 'hover:bg-white/5'
                }`}
              >
                🔔 طلبات الموافقة ({pendingReservations.length})
                {pendingReservations.length > 0 && (
                  <span className="absolute top-2 left-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {pendingReservations.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('seatmap')}
                className={`flex-1 px-4 py-4 font-bold transition-all ${
                  activeTab === 'seatmap' 
                    ? 'bg-white/10 text-[#D4AF37]' 
                    : 'hover:bg-white/5'
                }`}
              >
                ✈️ خريطة المقاعد
              </button>
              <button
                onClick={() => setActiveTab('reservations')}
                className={`flex-1 px-4 py-4 font-bold transition-all ${
                  activeTab === 'reservations' 
                    ? 'bg-white/10 text-[#D4AF37]' 
                    : 'hover:bg-white/5'
                }`}
              >
                الحجوزات المؤكدة ({reservations.length})
              </button>
              <button
                onClick={() => setActiveTab('waitlist')}
                className={`flex-1 px-4 py-4 font-bold transition-all ${
                  activeTab === 'waitlist' 
                    ? 'bg-white/10 text-[#D4AF37]' 
                    : 'hover:bg-white/5'
                }`}
              >
                قائمة الانتظار ({waitlist.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('pricing');
                  fetchPricing();
                }}
                className={`flex-1 px-4 py-4 font-bold transition-all ${
                  activeTab === 'pricing' 
                    ? 'bg-white/10 text-[#D4AF37]' 
                    : 'hover:bg-white/5'
                }`}
              >
                💰 إدارة الأسعار
              </button>
            </div>
          </div>
          
          {activeTab === 'pending' && (
            <>
              {pendingReservations.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="text-6xl mb-4">✅</div>
                  <p className="text-xl font-bold mb-2">لا توجد طلبات معلقة</p>
                  <p>جميع طلبات حجز النخبة تمت معالجتها</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {pendingReservations.map((res) => (
                    <div key={res.id} className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-6">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="md:w-48 h-32 bg-gray-200 rounded-xl overflow-hidden flex-shrink-0">
                          {res.property_image ? (
                            <img 
                              src={res.property_image} 
                              alt={res.property_title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <span className="text-4xl">🏠</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="text-xl font-bold text-gray-800">{res.property_title}</h3>
                              <p className="text-gray-600">{res.user_name} • {res.user_email}</p>
                            </div>
                            <span className={`px-4 py-2 rounded-full text-white font-bold ${tierColors[res.tier]}`}>
                              {tierNames[res.tier]} • موقع {res.row_num}-{res.col_num}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500">الإجمالي</p>
                              <p className="font-bold text-[#D4AF37]">{res.total_amount} ريال</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500">تاريخ الطلب</p>
                              <p className="font-bold text-gray-800 text-sm">{formatDate(res.created_at)}</p>
                            </div>
                            <div className="bg-white/70 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500">الفئة</p>
                              <p className="font-bold text-gray-800">{tierNames[res.tier]}</p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={() => showApproveConfirm(res.id)}
                              disabled={approving === res.id}
                              className="flex-1 bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {approving === res.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : (
                                <>✅ موافقة وتفعيل</>
                              )}
                            </button>
                            <button
                              onClick={() => handleReject(res.id)}
                              disabled={rejecting === res.id}
                              className="flex-1 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {rejecting === res.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : (
                                <>❌ رفض</>
                              )}
                            </button>
                            <Link
                              href={`/property/${res.property_id}`}
                              target="_blank"
                              className="bg-[#002845] hover:bg-[#003d5c] text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                            >
                              👁️ عرض الإعلان
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'seatmap' && (
            <div className="p-8">
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">✈️ خريطة مقاعد النخبة</h3>
                  <p className="text-gray-600">عرض مباشر لحالة جميع المواقع التسعة</p>
                </div>
                
                <div className="bg-gradient-to-b from-[#002845] to-[#003d5c] rounded-3xl p-8 shadow-2xl">
                  <div className="bg-gradient-to-b from-gray-700 to-gray-800 rounded-t-[100px] p-6 mb-4">
                    <p className="text-center text-white/70 text-sm">🏠 الصفحة الرئيسية</p>
                  </div>
                  
                  {['top', 'middle', 'bottom'].map((tier, tierIndex) => (
                    <div key={tier} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-4 h-4 rounded-full ${
                          tier === 'top' ? 'bg-amber-400' : 
                          tier === 'middle' ? 'bg-blue-400' : 'bg-green-400'
                        }`}></span>
                        <span className="text-white/80 text-sm">
                          {tierNames[tier]} ({tierPrices[tier]} ريال)
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map((col) => {
                          const slot = getSlotByPosition(tierIndex + 1, col);
                          const reservation = slot ? [...reservations, ...pendingReservations].find(
                            r => r.row_num === tierIndex + 1 && r.col_num === col
                          ) : null;
                          
                          const isEmpty = !reservation;
                          const isConfirmed = reservation?.status === 'confirmed';
                          const isPending = reservation?.status === 'pending_approval';
                          const isHeld = reservation?.status === 'held';
                          const slotWaitlistCount = slot ? (waitlistBySlot[slot.id] || 0) : 0;
                          const remainingDays = reservation?.reservation_ends_at ? getRemainingDays(reservation.reservation_ends_at) : (reservation?.period_ends_at ? getRemainingDays(reservation.period_ends_at) : (period ? getRemainingDays(period.ends_at) : 0));
                          
                          return (
                            <div
                              key={col}
                              className={`relative p-4 rounded-xl transition-all ${
                                isEmpty 
                                  ? 'bg-white/20 border-2 border-dashed border-white/30' 
                                  : isConfirmed
                                  ? 'bg-green-500 border-2 border-green-300'
                                  : isPending
                                  ? 'bg-amber-500 border-2 border-amber-300 animate-pulse'
                                  : 'bg-blue-500 border-2 border-blue-300'
                              }`}
                            >
                              {/* شارة عدد المنتظرين */}
                              {slotWaitlistCount > 0 && (
                                <div className="absolute -top-2 -right-2 min-w-[24px] h-[24px] flex items-center justify-center text-xs font-bold bg-red-500 text-white rounded-full px-1.5 shadow-lg">
                                  {slotWaitlistCount} 🕐
                                </div>
                              )}
                              
                              {/* رقم الموقع */}
                              <div className="text-center mb-2">
                                <div className="text-xl mb-1">
                                  {isEmpty ? '💺' : isConfirmed ? '✅' : isPending ? '⏳' : '🔒'}
                                </div>
                                <div className="text-white text-sm font-bold">
                                  {tierIndex + 1}-{col}
                                </div>
                              </div>
                              
                              {/* معلومات الحجز */}
                              {reservation && (
                                <div className="bg-white/20 rounded-lg p-2 mb-2">
                                  <div className="text-white text-xs font-medium truncate">
                                    {reservation.property_title?.substring(0, 15)}...
                                  </div>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-white/80 text-[10px]">ينتهي:</span>
                                    <span className="text-white font-bold text-[10px]">
                                      {period ? new Date(period.ends_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '-'}
                                    </span>
                                  </div>
                                  <div className={`mt-1 text-center py-1 rounded text-[10px] font-bold ${
                                    remainingDays <= 1 ? 'bg-red-600 text-white' : 
                                    remainingDays <= 3 ? 'bg-orange-500 text-white' : 
                                    'bg-white/30 text-white'
                                  }`}>
                                    {remainingDays} أيام متبقية
                                  </div>
                                </div>
                              )}
                              
                              {isEmpty && (
                                <div className="text-center py-2">
                                  <div className="text-white/60 text-sm">متاح للحجز</div>
                                  <div className="text-white/40 text-xs mt-1">{tierPrices[tier]} ريال</div>
                                </div>
                              )}
                              
                              {/* أزرار التحكم */}
                              {isConfirmed && reservation && (
                                <div className="flex gap-2 justify-center">
                                  <button
                                    onClick={() => handleExtendReservation(String(reservation.id), 1)}
                                    disabled={extending === String(reservation.id)}
                                    className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-bold transition disabled:opacity-50"
                                  >
                                    {extending === String(reservation.id) ? '...' : '+1 يوم'}
                                  </button>
                                  <button
                                    onClick={() => showCancelModal(String(reservation.id))}
                                    disabled={cancelling === String(reservation.id)}
                                    className="flex-1 px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-bold transition disabled:opacity-50"
                                  >
                                    {cancelling === String(reservation.id) ? '...' : 'إلغاء'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex justify-center gap-6 mt-6 pt-4 border-t border-white/20">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-white/20 rounded border border-dashed border-white/30"></div>
                      <span className="text-white/60 text-xs">متاح</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-amber-500 rounded"></div>
                      <span className="text-white/60 text-xs">معلق</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span className="text-white/60 text-xs">مؤكد</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-500 rounded"></div>
                      <span className="text-white/60 text-xs">محجوز مؤقت</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reservations' && (
            <>
              {reservations.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="text-6xl mb-4">📭</div>
                  <p>لا توجد حجوزات مؤكدة في الفترة الحالية</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">الموقع</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">العقار</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">المستخدم</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">المبلغ</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">المتبقي</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">الحالة</th>
                        <th className="px-4 py-4 text-right text-sm font-semibold text-gray-700">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reservations.map((res) => {
                        const remainingDays = res.reservation_ends_at ? getRemainingDays(res.reservation_ends_at) : (res.period_ends_at ? getRemainingDays(res.period_ends_at) : (period ? getRemainingDays(period.ends_at) : 0));
                        return (
                          <tr key={res.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4">
                              <span className={`inline-block px-3 py-1 rounded-full text-white text-sm ${tierColors[res.tier]}`}>
                                {tierNames[res.tier]} ({res.row_num}-{res.col_num})
                              </span>
                            </td>
                            <td className="px-4 py-4 text-gray-800 font-medium">{res.property_title}</td>
                            <td className="px-4 py-4">
                              <div className="text-gray-800">{res.user_name}</div>
                              <div className="text-gray-500 text-sm">{res.user_email}</div>
                            </td>
                            <td className="px-4 py-4 text-[#D4AF37] font-bold">
                              {Number(res.total_amount || 0).toFixed(0)} ريال
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold ${
                                remainingDays <= 1 ? 'bg-red-100 text-red-700' : 
                                remainingDays <= 3 ? 'bg-orange-100 text-orange-700' : 
                                'bg-green-100 text-green-700'
                              }`}>
                                {remainingDays} يوم
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                                res.status === 'confirmed' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {res.status === 'confirmed' ? 'مؤكد' : 'محجوز مؤقتاً'}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleExtendReservation(String(res.id), 1)}
                                  disabled={extending === String(res.id)}
                                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg font-bold transition disabled:opacity-50"
                                  title="تمديد يوم"
                                >
                                  {extending === String(res.id) ? '...' : '+1 يوم'}
                                </button>
                                <button
                                  onClick={() => showCancelModal(String(res.id))}
                                  disabled={cancelling === String(res.id)}
                                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg font-bold transition disabled:opacity-50"
                                  title="إلغاء الحجز"
                                >
                                  {cancelling === String(res.id) ? '...' : 'إلغاء'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'waitlist' && (
            <>
              {waitlist.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="text-6xl mb-4">⏳</div>
                  <p>لا يوجد أحد في قائمة الانتظار</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">التفضيل</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">العقار</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">المستخدم</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">تاريخ التسجيل</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {waitlist.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-white text-sm ${
                              entry.tier_preference === 'top' ? 'bg-amber-500' :
                              entry.tier_preference === 'middle' ? 'bg-blue-500' :
                              entry.tier_preference === 'bottom' ? 'bg-green-500' :
                              'bg-purple-500'
                            }`}>
                              {tierNames[entry.tier_preference] || 'أي موقع'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-800 font-medium">{entry.property_title}</div>
                            <div className="text-gray-500 text-sm">{entry.property_city}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-gray-800">{entry.user_name}</div>
                            <div className="text-gray-500 text-sm">{entry.user_email}</div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 text-sm">
                            {formatDate(entry.created_at)}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleNotifyWaitlist(entry.id)}
                              disabled={notifying === entry.id}
                              className="bg-[#D4AF37] text-[#0A1628] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#FFD700] transition-all disabled:opacity-50"
                            >
                              {notifying === entry.id ? 'جاري الإرسال...' : 'إرسال إشعار'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'pricing' && (
            <div className="p-6">
              <div className="mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
                <h3 className="text-lg font-bold text-amber-800 mb-2">💡 نظام التسعير</h3>
                <p className="text-amber-700 text-sm">
                  الأسعار محددة لكل فتحة بناءً على موقعها. الصف العلوي أعلى قيمة لأنه الأكثر ظهوراً.
                  يمكنك تعديل سعر كل فتحة بشكل فردي أو تحديث أسعار الفئة كاملة.
                </p>
              </div>

              {/* تحديث سريع حسب الفئة */}
              <div className="mb-8 bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">⚡ تحديث سريع حسب الفئة</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { tier: 'top', label: 'الصف العلوي', color: 'from-amber-400 to-orange-500', icon: '👑' },
                    { tier: 'middle', label: 'الصف الأوسط', color: 'from-blue-400 to-indigo-500', icon: '⭐' },
                    { tier: 'bottom', label: 'الصف السفلي', color: 'from-green-400 to-emerald-500', icon: '✨' }
                  ].map(t => {
                    const tierSlots = pricingSlots.filter(s => s.tier === t.tier);
                    const currentPrice = tierSlots[0]?.base_price || 0;
                    return (
                      <div key={t.tier} className={`bg-gradient-to-br ${t.color} rounded-xl p-4 text-white`}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{t.icon}</span>
                          <span className="font-bold">{t.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            defaultValue={currentPrice}
                            className="w-full px-3 py-2 rounded-lg text-gray-800 font-bold text-center"
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val !== currentPrice) {
                                handleUpdateTierPrice(t.tier, val);
                              }
                            }}
                          />
                          <span className="font-medium">ر.س</span>
                        </div>
                        <p className="text-white/80 text-xs mt-2 text-center">3 فتحات</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* تفاصيل كل فتحة */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-[#0A1628] to-[#1a2d4a] text-white px-6 py-4 flex justify-between items-center">
                  <h3 className="text-lg font-bold">🎯 تفاصيل أسعار الفتحات</h3>
                  <button
                    onClick={handleSavePrices}
                    disabled={savingPrices}
                    className="bg-[#D4AF37] text-[#0A1628] px-6 py-2 rounded-lg font-bold hover:bg-[#FFD700] transition-all disabled:opacity-50"
                  >
                    {savingPrices ? 'جاري الحفظ...' : '💾 حفظ جميع التغييرات'}
                  </button>
                </div>
                
                <div className="p-6">
                  {/* عرض الفتحات كشبكة 3×3 */}
                  <div className="max-w-lg mx-auto">
                    {[1, 2, 3].map(row => (
                      <div key={row} className="flex gap-4 mb-4">
                        {[1, 2, 3].map(col => {
                          const slot = pricingSlots.find(s => s.row_num === row && s.col_num === col);
                          if (!slot) return <div key={col} className="flex-1 h-24 bg-gray-100 rounded-xl" />;
                          
                          const tierColor = slot.tier === 'top' ? 'border-amber-400 bg-amber-50' :
                            slot.tier === 'middle' ? 'border-blue-400 bg-blue-50' :
                            'border-green-400 bg-green-50';
                          
                          return (
                            <div key={col} className={`flex-1 border-2 ${tierColor} rounded-xl p-3 text-center`}>
                              <div className="text-sm text-gray-500 mb-1">
                                {slot.tier === 'top' ? '👑' : slot.tier === 'middle' ? '⭐' : '✨'}
                                موقع {slot.display_order || (row - 1) * 3 + col}
                              </div>
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={slot.base_price}
                                  onChange={(e) => updateSlotPrice(slot.id, parseFloat(e.target.value) || 0)}
                                  className="w-20 px-2 py-1 border rounded text-center font-bold text-gray-800"
                                />
                                <span className="text-xs text-gray-500">ر.س</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* جدول الأسعار التفصيلي */}
                  <div className="mt-8 overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الموقع</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الفئة</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">الصف</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">العمود</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">السعر (ر.س)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pricingSlots.map((slot, idx) => (
                          <tr key={slot.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-bold text-gray-800">#{idx + 1}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-3 py-1 rounded-full text-white text-sm ${
                                slot.tier === 'top' ? 'bg-amber-500' :
                                slot.tier === 'middle' ? 'bg-blue-500' : 'bg-green-500'
                              }`}>
                                {slot.tier === 'top' ? 'علوي 👑' : slot.tier === 'middle' ? 'أوسط ⭐' : 'سفلي ✨'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{slot.row_num}</td>
                            <td className="px-4 py-3 text-gray-600">{slot.col_num}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                value={slot.base_price}
                                onChange={(e) => updateSlotPrice(slot.id, parseFloat(e.target.value) || 0)}
                                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center font-bold focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* قسم أسعار البلدان */}
              <div className="mt-8 bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    🌍 إدارة أسعار البلدان
                  </h3>
                  <p className="text-white/80 text-sm mt-1">
                    اعتمد الأسعار المحولة تلقائياً لكل بلد. الأسعار غير المعتمدة تظهر للعملاء لكنها قد تختلف عند الشراء.
                  </p>
                </div>
                
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { code: 'AE', name: 'الإمارات', flag: '🇦🇪', currency: 'درهم' },
                      { code: 'KW', name: 'الكويت', flag: '🇰🇼', currency: 'د.ك' },
                      { code: 'QA', name: 'قطر', flag: '🇶🇦', currency: 'ر.ق' },
                      { code: 'BH', name: 'البحرين', flag: '🇧🇭', currency: 'د.ب' },
                      { code: 'OM', name: 'عمان', flag: '🇴🇲', currency: 'ر.ع' },
                      { code: 'EG', name: 'مصر', flag: '🇪🇬', currency: 'جنيه' },
                      { code: 'LB', name: 'لبنان', flag: '🇱🇧', currency: 'ل.ل' },
                      { code: 'TR', name: 'تركيا', flag: '🇹🇷', currency: 'ليرة' }
                    ].map(country => (
                      <button
                        key={country.code}
                        onClick={async () => {
                          const token = localStorage.getItem('token');
                          try {
                            const res = await fetch('/api/elite-slots/admin/country-pricing/approve', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {})
                              },
                              credentials: 'include',
                              body: JSON.stringify({ country_code: country.code })
                            });
                            const data = await res.json();
                            if (res.ok) {
                              toast.success(`تم اعتماد أسعار ${country.name} بنجاح`);
                            } else {
                              toast.error(data.error || 'حدث خطأ');
                            }
                          } catch (err) {
                            toast.error('فشل الاتصال');
                          }
                        }}
                        className="flex flex-col items-center gap-2 p-4 bg-gray-50 hover:bg-emerald-50 border-2 border-gray-200 hover:border-emerald-400 rounded-xl transition-all group"
                      >
                        <span className="text-3xl">{country.flag}</span>
                        <span className="font-bold text-gray-800 group-hover:text-emerald-700">{country.name}</span>
                        <span className="text-xs text-gray-500">({country.currency})</span>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                          ✓ اعتماد
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Beautiful Confirmation Modal */}
      {confirmModal?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmModal(null)}
          />
          
          {/* Modal */}
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transform animate-[scaleIn_0.2s_ease-out]">
            {/* Header */}
            <div className={`p-6 text-center ${
              confirmModal.type === 'approve' 
                ? 'bg-gradient-to-br from-emerald-500 to-green-600' 
                : confirmModal.type === 'rotate'
                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                : 'bg-gradient-to-br from-red-500 to-rose-600'
            }`}>
              <div className="w-16 h-16 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-4">
                {confirmModal.type === 'approve' ? (
                  <span className="text-4xl">✅</span>
                ) : confirmModal.type === 'rotate' ? (
                  <span className="text-4xl">🔄</span>
                ) : confirmModal.type === 'cancel' ? (
                  <span className="text-4xl">🚫</span>
                ) : (
                  <span className="text-4xl">⚠️</span>
                )}
              </div>
              <h3 className="text-xl font-bold text-white">{confirmModal.title}</h3>
            </div>
            
            {/* Body */}
            <div className="p-6">
              <p className="text-gray-600 text-center text-lg leading-relaxed mb-4">
                {confirmModal.message}
              </p>
              
              {/* حقل السبب للإلغاء */}
              {confirmModal.showReasonInput && (
                <div className="mt-4">
                  <label className="block text-gray-700 text-sm font-medium mb-2 text-right">
                    سبب الإلغاء (اختياري)
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="أدخل سبب الإلغاء هنا..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    rows={3}
                    dir="rtl"
                  />
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={confirmModal.onConfirm}
                className={`flex-1 text-white py-3 px-6 rounded-xl font-bold transition-all ${
                  confirmModal.type === 'approve'
                    ? 'bg-gradient-to-l from-emerald-500 to-green-600 hover:opacity-90'
                    : confirmModal.type === 'rotate'
                    ? 'bg-gradient-to-l from-amber-500 to-orange-600 hover:opacity-90'
                    : 'bg-gradient-to-l from-red-500 to-rose-600 hover:opacity-90'
                }`}
              >
                {confirmModal.type === 'cancel' ? 'تأكيد الإلغاء' : 'تأكيد'}
              </button>
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-bold transition-all"
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
