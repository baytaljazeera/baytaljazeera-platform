"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { toast, Toaster } from "sonner";
import { 
  User, Mail, Phone, Lock, Crown, Heart, FileText, Bell, 
  LogOut, Edit2, Check, X, ArrowUp, Calendar, Shield, 
  Star, Sparkles, Building2, ChevronLeft, Receipt, AlertCircle,
  CheckCircle2, Clock, XCircle, Banknote, ExternalLink, Gift
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/authStore";
import { QuotaBuckets } from "@/components/QuotaBuckets";

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + percent));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

type User = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  planName: string;
  planNameEn?: string;
  planId?: number | null;
  planColor?: string;
  planLogoUrl?: string | null;
  planPrice?: number;
  listingsCount?: number;
  listingLimit?: number;
  maxPhotosPerListing?: number;
  featuredAllowed?: boolean;
  subscriptionStatus?: string;
  subscriptionEndDate?: string;
  subscriptionStartDate?: string;
  role?: string;
};

export default function AccountPage() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [alertsCount, setAlertsCount] = useState(0);
  
  useEffect(() => {
    fetchProfile();
    fetchAlertsCount();
  }, []);

  async function fetchAlertsCount() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/account/alerts/unread-count", { 
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setAlertsCount(data.count || 0);
      }
    } catch (err) {
      // silent
    }
  }

  async function fetchProfile() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/account/profile", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      setUser(data.user);
      setName(data.user.name || "");
      setPhone(data.user.phone || "");
      setWhatsapp(data.user.whatsapp || "");
    } catch (err) {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, phone, whatsappNumber: whatsapp }),
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        toast.success("تم حفظ التعديلات بنجاح");
        setEditMode(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "فشل حفظ التعديلات");
      }
    } catch (err) {
      toast.error("حدث خطأ في الاتصال");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const current = String(form.get("currentPassword") || "");
    const next = String(form.get("newPassword") || "");
    const confirm = String(form.get("confirmPassword") || "");

    if (next !== confirm) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }

    // Validate password strength
    const passwordErrors = [];
    if (next.length < 12) passwordErrors.push("12 حرفاً");
    if (!/[A-Z]/.test(next)) passwordErrors.push("حرف كبير");
    if (!/[a-z]/.test(next)) passwordErrors.push("حرف صغير");
    if (!/[0-9]/.test(next)) passwordErrors.push("رقم");
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(next)) passwordErrors.push("رمز خاص");
    
    if (passwordErrors.length > 0) {
      toast.error(`كلمة المرور تحتاج: ${passwordErrors.join("، ")}`);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ current, next }),
      });

      if (res.ok) {
        toast.success("تم تغيير كلمة المرور بنجاح");
        e.currentTarget.reset();
        setShowPasswordForm(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "فشل تغيير كلمة المرور");
      }
    } catch (err) {
      toast.error("حدث خطأ في الاتصال");
    }
  }

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  const calculateDaysRemaining = () => {
    if (!user?.subscriptionEndDate) return null;
    try {
      const endDate = new Date(user.subscriptionEndDate);
      const today = new Date();
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysLeft > 0 ? daysLeft : 0;
    } catch {
      return null;
    }
  };

  const daysRemaining = calculateDaysRemaining();

  const getPlanIcon = () => {
    if (!user?.planId) return Star;
    if (user.planPrice && user.planPrice >= 1000) return Crown;
    if (user.planPrice && user.planPrice >= 500) return Shield;
    if (user.planPrice && user.planPrice >= 200) return Sparkles;
    if (user.planPrice && user.planPrice > 0) return Building2;
    return Star;
  };
  const TierIcon = getPlanIcon();

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db]">
      <Toaster position="top-center" richColors />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-extrabold text-white mb-2">حسابي الشخصي</h1>
          <p className="text-white/70">إدارة معلومات حسابك واشتراكك</p>
        </motion.div>

        <div className="grid gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl text-white shadow-2xl relative overflow-hidden"
            style={{ 
              background: `linear-gradient(145deg, #0b1d34 0%, #1a3a5c 40%, ${user.planColor || '#D4AF37'} 100%)` 
            }}
          >
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#D4AF37] blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-[#f4c365] blur-2xl translate-y-1/2 -translate-x-1/2" />
            </div>

            <div className="relative z-10 p-6">
              <div className="flex flex-col md:flex-row items-center gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-[#0f2139]/90 ring-4 ring-[#f4c365] shadow-[0_0_30px_rgba(244,195,101,0.4)] flex items-center justify-center p-3 flex-shrink-0">
                  {user.planLogoUrl ? (
                    <img 
                      src={user.planLogoUrl} 
                      alt={user.planName} 
                      className="w-full h-full object-contain rounded-full"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const sibling = e.currentTarget.nextElementSibling as HTMLElement;
                        if (sibling) sibling.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <TierIcon className={`w-12 h-12 text-[#f7d978] ${user.planLogoUrl ? 'hidden' : ''}`} />
                </div>

                <div className="flex-1 text-center md:text-right">
                  <h2 className="text-3xl font-bold text-[#f7d978] mb-1">{user.planName}</h2>
                  <p className="text-white/70 text-sm">
                    {user.subscriptionStatus === 'active' ? '✨ اشتراك نشط' : 'بدون اشتراك'}
                  </p>
                </div>

                <Link
                  href="/upgrade"
                  className="flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#f4c365] hover:from-[#f4c365] hover:to-[#D4AF37] text-[#0b1d34] font-bold px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-xl"
                >
                  <ArrowUp className="w-5 h-5" />
                  <span>ترقية</span>
                </Link>
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-[#f4c365]/40 to-transparent mb-6" />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-[#0f2139]/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/10">
                  <p className="text-[#f7d978] text-[10px] sm:text-xs mb-1 font-medium">الإعلانات المستخدمة</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">
                    {user.listingsCount || 0}/{user.listingLimit || 0}
                  </p>
                </div>
                <div className="bg-[#0f2139]/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/10">
                  <p className="text-[#f7d978] text-[10px] sm:text-xs mb-1 font-medium">الصور المتاحة</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{user.maxPhotosPerListing || 5}</p>
                </div>
                {daysRemaining !== null && (
                  <div className="bg-[#0f2139]/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/10">
                    <p className="text-[#f7d978] text-[10px] sm:text-xs mb-1 font-medium">الأيام المتبقية</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{daysRemaining}</p>
                  </div>
                )}
                <div className="bg-[#0f2139]/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/10">
                  <p className="text-[#f7d978] text-[10px] sm:text-xs mb-1 font-medium">إعلانات مميزة</p>
                  <p className="text-xl sm:text-2xl font-bold text-white">{user.featuredAllowed ? '✓' : '✗'}</p>
                </div>
              </div>

              {user.subscriptionEndDate && (
                <div className="mt-6 flex justify-center">
                  <div className="inline-flex items-center gap-2 bg-[#0f2139]/80 px-5 py-2 rounded-full text-[#f7d978] text-sm border border-[#f4c365]/30">
                    <Calendar className="w-4 h-4" />
                    <span>ينتهي الاشتراك: {new Date(user.subscriptionEndDate).toLocaleDateString('ar-SA')}</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-3xl shadow-xl p-6"
          >
            <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-[#D4AF37]" />
              رصيد الإعلانات
            </h2>
            <QuotaBuckets />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-3xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2">
                <User className="w-5 h-5 text-[#D4AF37]" />
                المعلومات الشخصية
              </h2>
              {!editMode ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2 text-sm text-[#003366] hover:text-[#D4AF37] transition"
                >
                  <Edit2 className="w-4 h-4" />
                  تعديل
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditMode(false)}
                    className="p-2 text-slate-500 hover:text-red-500 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl transition disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-[#003366] mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#D4AF37]" />
                  الاسم
                </label>
                {editMode ? (
                  <input
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أدخل اسمك"
                  />
                ) : (
                  <p className="text-slate-700 bg-slate-50 rounded-xl px-4 py-3">{user.name || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#003366] mb-2 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#D4AF37]" />
                  البريد الإلكتروني
                  {user.emailVerified && <span className="text-xs text-green-500">✓ مؤكد</span>}
                </label>
                <p className="text-slate-700 bg-slate-50 rounded-xl px-4 py-3">{user.email}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#003366] mb-2 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#D4AF37]" />
                  رقم الجوال
                </label>
                {editMode ? (
                  <input
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                  />
                ) : (
                  <p className="text-slate-700 bg-slate-50 rounded-xl px-4 py-3">{user.phone || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#003366] mb-2 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#D4AF37]" />
                  رقم واتساب
                </label>
                {editMode ? (
                  <input
                    className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="05xxxxxxxx"
                  />
                ) : (
                  <p className="text-slate-700 bg-slate-50 rounded-xl px-4 py-3">{user.whatsapp || '—'}</p>
                )}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-3xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#003366] flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#D4AF37]" />
                الأمان
              </h2>
              <button
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="text-sm text-[#003366] hover:text-[#D4AF37] transition"
              >
                {showPasswordForm ? 'إلغاء' : 'تغيير كلمة المرور'}
              </button>
            </div>

            <AnimatePresence>
              {showPasswordForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={changePassword}
                  className="grid md:grid-cols-3 gap-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">كلمة المرور الحالية</label>
                    <input
                      type="password"
                      name="currentPassword"
                      required
                      className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">كلمة المرور الجديدة</label>
                    <input
                      type="password"
                      name="newPassword"
                      required
                      className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">تأكيد كلمة المرور</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      required
                      className="w-full border-2 border-slate-200 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm transition outline-none"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="bg-[#003366] hover:bg-[#01375e] text-white font-bold px-6 py-3 rounded-xl transition"
                    >
                      حفظ كلمة المرور الجديدة
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-3xl shadow-xl p-6"
          >
            <h2 className="text-xl font-bold text-[#003366] mb-4">روابط سريعة</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { href: "/favorites", label: "المفضلة", icon: Heart, color: "bg-red-50 text-red-600 hover:bg-red-100", badge: 0 },
                { href: "/my-listings", label: "إعلاناتي", icon: FileText, color: "bg-blue-50 text-blue-600 hover:bg-blue-100", badge: 0 },
                { href: "/invoices", label: "فواتيري", icon: Receipt, color: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100", badge: 0 },
                { href: "/inbox", label: "الإشعارات", icon: Bell, color: "bg-amber-50 text-amber-600 hover:bg-amber-100", badge: 0 },
                { href: "/account-alerts", label: "تنبيهات الحساب", icon: AlertCircle, color: alertsCount > 0 ? "bg-red-100 text-red-700 hover:bg-red-200 ring-2 ring-red-400" : "bg-orange-50 text-orange-600 hover:bg-orange-100", badge: alertsCount },
                { href: "/ambassador", label: "🌟 سفراء البيت", icon: Gift, color: "bg-gradient-to-r from-yellow-50 to-amber-50 text-amber-600 hover:from-yellow-100 hover:to-amber-100 ring-2 ring-amber-300 shadow-lg", badge: 0 },
                { href: "/plans", label: "الباقات", icon: Crown, color: "bg-purple-50 text-purple-600 hover:bg-purple-100", badge: 0 },
              ].map(({ href, label, icon: Icon, color, badge }) => (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center justify-center gap-2 p-4 rounded-xl font-semibold transition ${color}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{label}</span>
                  {badge > 0 && (
                    <span className="absolute -top-1 -left-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                      {badge}
                    </span>
                  )}
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              ))}
            </div>
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onClick={handleLogout}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 shadow-lg"
          >
            <LogOut className="w-5 h-5" />
            تسجيل الخروج
          </motion.button>
        </div>
      </div>
    </div>
  );
}
