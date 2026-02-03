"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("رابط غير صالح. يرجى طلب رابط إعادة تعيين جديد.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        credentials: 'include'
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(data.error || 'حدث خطأ، حاول مرة أخرى');
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال، حاول مرة أخرى');
    }
    
    setLoading(false);
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#01375e] flex items-center justify-center py-12 px-4 relative overflow-hidden"
    >
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-72 h-72 bg-[#D4AF37] rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-[#D4AF37] rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-black bg-gradient-to-l from-[#D4AF37] via-[#F5E6B8] to-[#D4AF37] bg-clip-text text-transparent drop-shadow-lg">
              بيت الجزيرة
            </h1>
          </Link>
          <p className="text-[#D4AF37]/80 text-sm mt-2 font-medium">منصة العقارات الخليجية الأولى</p>
        </div>

        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-[#D4AF37]/30 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4AF37] via-[#F5E6B8] to-[#D4AF37]"></div>
          
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-2xl flex items-center justify-center shadow-xl">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-[#002845]">
              إعادة تعيين كلمة المرور
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              أدخل كلمة المرور الجديدة
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border-r-4 border-red-500 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#002845] mb-2">تم التغيير بنجاح!</h3>
              <p className="text-slate-600 mb-6">
                تم إعادة تعيين كلمة المرور بنجاح. جاري تحويلك لتسجيل الدخول...
              </p>
              <Link 
                href="/login"
                className="inline-flex items-center gap-2 text-[#D4AF37] font-bold hover:text-[#B8860B] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                تسجيل الدخول الآن
              </Link>
            </div>
          ) : token ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-[#002845] mb-2">
                  كلمة المرور الجديدة
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    minLength={8}
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-3.5 pr-12 pl-12 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all duration-200 bg-slate-50/50 hover:bg-white"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#D4AF37] transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#D4AF37] transition-colors"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">8 أحرف على الأقل، حرف كبير، حرف صغير، ورقم</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-[#002845] mb-2">
                  تأكيد كلمة المرور
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="w-full rounded-xl border-2 border-slate-200 px-4 py-3.5 pr-12 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-4 focus:ring-[#D4AF37]/10 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all duration-200 bg-slate-50/50 hover:bg-white"
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#D4AF37] transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold py-4 rounded-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-[#D4AF37]/30 flex items-center justify-center gap-3 hover:shadow-xl hover:shadow-[#D4AF37]/40 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/30"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <span className="text-lg">حفظ كلمة المرور الجديدة</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#002845] mb-2">رابط غير صالح</h3>
              <p className="text-slate-600 mb-6">
                يبدو أن الرابط منتهي الصلاحية أو غير صالح.
              </p>
              <Link 
                href="/forgot-password"
                className="inline-flex items-center gap-2 text-[#D4AF37] font-bold hover:text-[#B8860B] transition-colors"
              >
                طلب رابط جديد
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-600">
              <Link href="/login" className="text-[#D4AF37] font-bold hover:text-[#B8860B] hover:underline transition-colors">
                العودة لتسجيل الدخول
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-white/70 hover:text-[#D4AF37] transition-colors flex items-center justify-center gap-2 group">
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>العودة للرئيسية</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#01375e] flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-[#D4AF37] border-t-transparent rounded-full"></div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
