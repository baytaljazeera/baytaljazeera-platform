"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Lock, Crown, Eye, EyeOff, ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user, hydrate, isHydrated } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const ADMIN_ROLES = ['super_admin', 'finance_admin', 'support_admin', 'content_admin', 'admin'];

  const isAdminRole = (role: string | undefined) => role && ADMIN_ROLES.includes(role);

  useEffect(() => {
    if (isHydrated && isAuthenticated && isAdminRole(user?.role)) {
      router.push("/admin/dashboard");
    }
  }, [isHydrated, isAuthenticated, user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const result = await login(email, password);
      
      if (result.success) {
        // Get the updated user from store after login
        const currentUser = useAuthStore.getState().user;
        if (currentUser && isAdminRole(currentUser.role)) {
          router.push("/admin/dashboard");
          return;
        } else {
          setError("هذا الحساب ليس لديه صلاحيات إدارية");
          // Logout the user since they don't have admin access
          useAuthStore.getState().logout();
        }
      } else {
        setError(result.error || "فشل تسجيل الدخول");
      }
    } catch (err) {
      setError("حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c] p-4" dir="rtl">
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl" />
      
      <div className="relative w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] shadow-xl mb-4">
              <Crown className="w-10 h-10 text-[#002845]" />
            </div>
            <h1 className="text-2xl font-black text-white mb-2">دخول الإدارة</h1>
            <p className="text-sm text-white/60">بيت الجزيرة - لوحة التحكم</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="admin@aqar.sa"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/80 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl pr-12 pl-12 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#D4AF37] transition"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:shadow-lg hover:scale-[1.02] transition-all disabled:opacity-70"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-[#002845] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  تسجيل الدخول
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <Link 
              href="/request-access"
              className="block text-sm text-[#D4AF37] hover:underline"
            >
              ليس لديك حساب؟ اطلب الانضمام
            </Link>
            <Link 
              href="/"
              className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white/70 transition"
            >
              <ArrowRight className="w-3 h-3" />
              العودة للموقع
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
