"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import OAuthButtons from "@/components/auth/OAuthButtons";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register: authRegister, isAuthenticated, user } = useAuthStore();

  // توجيه المستخدم المسجل بعيداً عن صفحة التسجيل
  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace("/");
    }
  }, [isAuthenticated, user, router]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    phoneCountry: "+966", // Default to Saudi Arabia
    password: "",
    confirmPassword: "",
    ambassadorCode: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ambassadorValid, setAmbassadorValid] = useState<boolean | null>(null);
  const [ambassadorName, setAmbassadorName] = useState<string>("");
  const [validatingCode, setValidatingCode] = useState(false);
  const [errorField, setErrorField] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (errorField) {
        const fieldRefs: Record<string, React.RefObject<HTMLInputElement | null>> = {
          name: nameRef,
          email: emailRef,
          password: passwordRef,
          confirmPassword: confirmPasswordRef
        };
        const targetRef = fieldRefs[errorField];
        if (targetRef?.current) {
          setTimeout(() => targetRef.current?.focus(), 500);
        }
      }
    }
  }, [error, errorField]);

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setFormData(prev => ({ ...prev, ambassadorCode: refCode }));
      validateAmbassadorCode(refCode);
    }
  }, [searchParams]);

  async function validateAmbassadorCode(code: string) {
    if (!code.trim()) {
      setAmbassadorValid(null);
      setAmbassadorName("");
      return;
    }
    
    setValidatingCode(true);
    try {
      const res = await fetch(`/api/ambassador/validate/${code.trim()}`);
      const data = await res.json();
      setAmbassadorValid(data.valid);
      setAmbassadorName(data.valid ? data.referrer_name : "");
    } catch {
      setAmbassadorValid(false);
    } finally {
      setValidatingCode(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    
    if (name === "ambassadorCode") {
      const timeoutId = setTimeout(() => validateAmbassadorCode(value), 500);
      return () => clearTimeout(timeoutId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setErrorField(null);
    setSuccess(null);

    if (!formData.name.trim()) {
      setError("يرجى إدخال الاسم");
      setErrorField("name");
      setLoading(false);
      return;
    }

    if (!formData.email.trim()) {
      setError("يرجى إدخال البريد الإلكتروني");
      setErrorField("email");
      setLoading(false);
      return;
    }

    if (!formData.password) {
      setError("يرجى إدخال كلمة المرور");
      setErrorField("password");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("كلمة المرور غير متطابقة");
      setErrorField("confirmPassword");
      setLoading(false);
      return;
    }

    // Validate password strength
    const passwordErrors = [];
    if (formData.password.length < 12) {
      passwordErrors.push("12 حرفاً على الأقل");
    }
    if (!/[A-Z]/.test(formData.password)) {
      passwordErrors.push("حرف كبير واحد");
    }
    if (!/[a-z]/.test(formData.password)) {
      passwordErrors.push("حرف صغير واحد");
    }
    if (!/[0-9]/.test(formData.password)) {
      passwordErrors.push("رقم واحد");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(formData.password)) {
      passwordErrors.push("رمز خاص واحد (!@#$%^&*)");
    }
    
    if (passwordErrors.length > 0) {
      setError(`كلمة المرور يجب أن تحتوي على: ${passwordErrors.join("، ")}`);
      setErrorField("password");
      setLoading(false);
      return;
    }

    try {
      // Combine country code with phone number
      // Remove any existing country code from phone number to avoid duplication
      let fullPhone: string | undefined = undefined;
      if (formData.phone.trim()) {
        let cleanPhone = formData.phone.trim();
        // Remove leading + and country code if present
        cleanPhone = cleanPhone.replace(/^\+?\d{1,4}/, '');
        // Remove any non-digit characters
        cleanPhone = cleanPhone.replace(/\D/g, '');
        // Only combine if we have digits after cleaning
        if (cleanPhone.length > 0) {
          fullPhone = `${formData.phoneCountry}${cleanPhone}`;
        }
      }

      const result = await authRegister({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: fullPhone,
        password: formData.password,
        referralCode: formData.ambassadorCode.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error || "فشل إنشاء الحساب");
        setLoading(false);
        return;
      }

      setSuccess("تم إنشاء حسابك بنجاح! يرجى التحقق من بريدك الإلكتروني لتأكيد حسابك.");
      setLoading(false);
      
      // Redirect to verification page or show message
      setTimeout(() => {
        window.location.href = "/verify-email?email=" + encodeURIComponent(formData.email.trim());
      }, 2000);
    } catch (err) {
      console.error("Registration error:", err);
      setError("حدث خطأ في الاتصال، حاول مرة أخرى");
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
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#002845] to-[#123a64] rounded-full flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-[#f6d879]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-[#002845]">
            إنشاء حساب جديد
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            انضم إلى بيت الجزيرة اليوم
          </p>
        </div>

        {error && (
          <div ref={errorRef} className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2 animate-pulse">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#002845] mb-2">
              الاسم الكامل
            </label>
            <div className="relative">
              <input
                ref={nameRef}
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all ${errorField === 'name' ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="محمد أحمد"
                autoComplete="name"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#002845] mb-2">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <input
                ref={emailRef}
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all ${errorField === 'email' ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="example@email.com"
                autoComplete="email"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#002845] mb-2">
              رقم الجوال <span className="text-slate-400 font-normal">(اختياري)</span>
            </label>
            <div className="flex gap-2">
              {/* Country Code Selector */}
              <div className="relative flex-shrink-0">
                <select
                  name="phoneCountry"
                  value={formData.phoneCountry}
                  onChange={handleChange}
                  disabled={loading}
                  className="min-h-[48px] rounded-xl border border-slate-200 px-3 py-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all appearance-none bg-white cursor-pointer"
                >
                  <option value="+966">🇸🇦 +966</option>
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+965">🇰🇼 +965</option>
                  <option value="+974">🇶🇦 +974</option>
                  <option value="+973">🇧🇭 +973</option>
                  <option value="+968">🇴🇲 +968</option>
                  <option value="+20">🇪🇬 +20</option>
                  <option value="+961">🇱🇧 +961</option>
                  <option value="+90">🇹🇷 +90</option>
                </select>
                <div className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {/* Phone Number Input */}
              <div className="relative flex-1">
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                  dir="ltr"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 pl-11 text-sm text-left focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all"
                  placeholder={formData.phoneCountry === "+966" ? "05xxxxxxxx" : "رقم الجوال"}
                  autoComplete="tel"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#002845] mb-2">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                ref={passwordRef}
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all ${errorField === 'password' ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="12 حرف + كبير + صغير + رقم + رمز"
                autoComplete="new-password"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#002845] mb-2">
              تأكيد كلمة المرور
            </label>
            <div className="relative">
              <input
                ref={confirmPasswordRef}
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all ${errorField === 'confirmPassword' ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                placeholder="أعد كتابة كلمة المرور"
                autoComplete="new-password"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border border-amber-200">
            <label className="block text-sm font-semibold text-[#002845] mb-2 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              هل لديك كود برنامج سفير البيت؟
            </label>
            <div className="relative">
              <input
                type="text"
                name="ambassadorCode"
                value={formData.ambassadorCode}
                onChange={handleChange}
                disabled={loading}
                className={`w-full rounded-xl border px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#f6d879] focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed transition-all ${
                  ambassadorValid === true ? 'border-green-400 bg-green-50' :
                  ambassadorValid === false ? 'border-red-400 bg-red-50' :
                  'border-amber-200 bg-white'
                }`}
                placeholder="BAYT-XXXX"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                {validatingCode ? (
                  <svg className="animate-spin h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : ambassadorValid === true ? (
                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : ambassadorValid === false ? (
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
            </div>
            {ambassadorValid === true && ambassadorName && (
              <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                تمت دعوتك من: {ambassadorName}
              </p>
            )}
            {ambassadorValid === false && formData.ambassadorCode && (
              <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                كود السفير غير صالح
              </p>
            )}
            <p className="text-slate-500 text-xs mt-2">
              إذا تمت دعوتك من أحد سفراء البيت، أدخل الكود هنا (اختياري)
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group w-full bg-gradient-to-r from-[#002845] to-[#01375e] text-white font-bold py-4 rounded-xl transition-all duration-150 ease-out disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_6px_0_0_#001a2e,0_8px_20px_rgba(0,0,0,0.3)] flex items-center justify-center gap-2 mt-6 hover:shadow-[0_4px_0_0_#001a2e,0_6px_15px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 hover:from-[#01375e] hover:to-[#002845] active:shadow-[0_2px_0_0_#001a2e,0_3px_8px_rgba(0,0,0,0.2)] active:translate-y-1 focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/40"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>جاري إنشاء الحساب...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 transition-transform duration-200 group-hover:scale-110 group-active:scale-95" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span>إنشاء حساب</span>
              </>
            )}
          </button>
        </form>

        <OAuthButtons className="mt-6" />

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-center text-sm text-slate-600">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="text-[#002845] font-bold hover:underline hover:text-[#f6d879] transition-colors">
              تسجيل الدخول
            </Link>
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-slate-500 hover:text-[#002845] transition-colors flex items-center justify-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>العودة للرئيسية</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div
        dir="rtl"
        className="min-h-screen bg-gradient-to-b from-[#002845] via-[#123a64] to-[#fdf6db] flex items-center justify-center py-12 px-4"
      >
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-[#f6d879]/50 p-8">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#002845] to-[#123a64] rounded-full flex items-center justify-center shadow-lg">
              <svg className="animate-spin h-10 w-10 text-[#f6d879]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <p className="text-[#002845]">جاري التحميل...</p>
          </div>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
