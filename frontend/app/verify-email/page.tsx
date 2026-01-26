"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [waitingForEmail, setWaitingForEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      if (email) {
        setWaitingForEmail(true);
      } else {
        setError("رابط غير صالح. يرجى طلب رابط تأكيد جديد.");
      }
      setLoading(false);
      return;
    }

    verifyEmail();
  }, [token]);

  async function verifyEmail() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
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

  async function resendVerification() {
    if (!email) return;
    setResending(true);
    setResendSuccess(false);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok) {
        setResendSuccess(true);
      } else {
        setError(data.error || "فشل إرسال رابط التأكيد.");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.");
    } finally {
      setResending(false);
    }
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
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0B6B4C] via-[#10B981] to-[#0B6B4C]"></div>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#0B6B4C] to-[#085239] rounded-2xl flex items-center justify-center shadow-xl animate-pulse">
                <svg className="w-10 h-10 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-[#002845]">
                جاري التحقق...
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                يرجى الانتظار بينما نتحقق من بريدك الإلكتروني
              </p>
            </div>
          ) : waitingForEmail ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#002845] mb-2">تحقق من بريدك الإلكتروني</h3>
              <p className="text-slate-600 mb-2">
                تم إرسال رابط التأكيد إلى:
              </p>
              <p className="text-[#0B6B4C] font-bold mb-6 text-lg">
                {email}
              </p>
              <p className="text-slate-500 text-sm mb-6">
                افتح بريدك الإلكتروني واضغط على رابط التأكيد لتفعيل حسابك.
                <br />
                قد تجد الرسالة في مجلد البريد غير المرغوب (Spam).
              </p>
              
              {resendSuccess && (
                <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-emerald-700 text-sm font-medium">
                    تم إرسال رابط التأكيد بنجاح! تحقق من بريدك الإلكتروني.
                  </p>
                </div>
              )}
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}
              
              <div className="space-y-3">
                <button 
                  onClick={resendVerification}
                  disabled={resending}
                  className="block w-full bg-gradient-to-r from-[#0B6B4C] to-[#085239] text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg disabled:opacity-50"
                >
                  {resending ? 'جاري الإرسال...' : 'إعادة إرسال رابط التأكيد'}
                </button>
                <Link 
                  href="/login"
                  className="block w-full border-2 border-slate-300 text-slate-600 font-bold py-3 rounded-xl transition-all hover:bg-slate-50 text-center"
                >
                  تسجيل الدخول
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#002845] mb-2">تم التأكيد بنجاح!</h3>
              <p className="text-slate-600 mb-6">
                تم تأكيد بريدك الإلكتروني بنجاح. جاري تحويلك لتسجيل الدخول...
              </p>
              <Link 
                href="/login"
                className="inline-flex items-center gap-2 text-[#0B6B4C] font-bold hover:text-[#085239] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                تسجيل الدخول الآن
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#002845] mb-2">حدث خطأ</h3>
              <p className="text-slate-600 mb-6">
                {error}
              </p>
              <div className="space-y-3">
                <Link 
                  href="/login"
                  className="block w-full bg-gradient-to-r from-[#0B6B4C] to-[#085239] text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg"
                >
                  تسجيل الدخول
                </Link>
                {email && (
                  <button 
                    onClick={resendVerification}
                    disabled={resending}
                    className="block w-full border-2 border-[#0B6B4C] text-[#0B6B4C] font-bold py-3 rounded-xl transition-all hover:bg-[#0B6B4C]/5 disabled:opacity-50"
                  >
                    {resending ? 'جاري الإرسال...' : 'إعادة إرسال رابط التأكيد'}
                  </button>
                )}
                <button 
                  onClick={() => window.location.reload()}
                  className="block w-full border-2 border-slate-300 text-slate-600 font-bold py-3 rounded-xl transition-all hover:bg-slate-50"
                >
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-600">
              تحتاج مساعدة؟{" "}
              <Link href="/complaint" className="text-[#0B6B4C] font-bold hover:text-[#085239] hover:underline transition-colors">
                تواصل معنا
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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#01375e] flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-[#0B6B4C] border-t-transparent rounded-full"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
