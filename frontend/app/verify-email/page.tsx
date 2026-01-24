"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  
  const [status, setStatus] = useState<"loading" | "success" | "error" | "expired" | "already-verified">("loading");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else if (email) {
      // Show resend option if email is provided but no token
      setStatus("error");
      setMessage("يرجى التحقق من بريدك الإلكتروني والضغط على رابط التأكيد.");
    } else {
      setStatus("error");
      setMessage("رمز التأكيد غير موجود.");
    }
  }, [token, email]);

  async function verifyEmail(verificationToken: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/verify-email?token=${verificationToken}`);
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage("تم تأكيد بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول.");
        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } else {
        if (data.error?.includes("مؤكد بالفعل")) {
          setStatus("already-verified");
          setMessage("البريد الإلكتروني مؤكد بالفعل. يمكنك تسجيل الدخول الآن.");
        } else if (data.error?.includes("انتهت")) {
          setStatus("expired");
          setMessage("انتهت صلاحية رابط التأكيد. يرجى طلب رابط جديد.");
        } else {
          setStatus("error");
          setMessage(data.error || "حدث خطأ أثناء تأكيد البريد الإلكتروني.");
        }
      }
    } catch (err) {
      console.error("Verification error:", err);
      setStatus("error");
      setMessage("حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setMessage("تم إرسال رابط التأكيد إلى بريدك الإلكتروني.");
        setStatus("error"); // Change to show success message
      } else {
        setMessage(data.error || "فشل إرسال رابط التأكيد.");
      }
    } catch (err) {
      console.error("Resend error:", err);
      setMessage("حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] flex items-center justify-center py-12 px-4"
    >
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-[#f6d879]/50 p-8">
        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center shadow-lg ${
            status === "success" || status === "already-verified"
              ? "bg-green-100"
              : status === "error" || status === "expired"
              ? "bg-red-100"
              : "bg-blue-100"
          }`}>
            {status === "loading" && (
              <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {status === "success" && (
              <svg className="w-10 h-10 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
            {(status === "error" || status === "expired") && (
              <svg className="w-10 h-10 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
            {status === "already-verified" && (
              <svg className="w-10 h-10 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-[#002845]">
            {status === "loading" && "جاري التحقق..."}
            {status === "success" && "تم التأكيد بنجاح!"}
            {status === "already-verified" && "البريد مؤكد بالفعل"}
            {(status === "error" || status === "expired") && "خطأ في التأكيد"}
          </h1>
        </div>

        <div className="text-center">
          <p className="text-slate-700 mb-6">{message}</p>

          {status === "expired" && (
            <button
              onClick={resendVerification}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#002845] to-[#01375e] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? "جاري الإرسال..." : "إعادة إرسال رابط التأكيد"}
            </button>
          )}

          {(status === "error" && email) && (
            <button
              onClick={resendVerification}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#002845] to-[#01375e] text-white font-bold py-3 rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed mb-4"
            >
              {loading ? "جاري الإرسال..." : "إعادة إرسال رابط التأكيد"}
            </button>
          )}

          {(status === "success" || status === "already-verified") && (
            <p className="text-sm text-slate-500 mb-4">
              جاري التحويل إلى صفحة تسجيل الدخول...
            </p>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100">
            <Link 
              href="/login" 
              className="text-[#002845] font-bold hover:underline hover:text-[#f6d879] transition-colors text-sm"
            >
              تسجيل الدخول
            </Link>
            {" | "}
            <Link 
              href="/" 
              className="text-slate-500 hover:text-[#002845] transition-colors text-sm"
            >
              العودة للرئيسية
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div
        dir="rtl"
        className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] flex items-center justify-center py-12 px-4"
      >
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-[#f6d879]/50 p-8">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center shadow-lg">
              <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-[#002845]">جاري التحميل...</p>
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
