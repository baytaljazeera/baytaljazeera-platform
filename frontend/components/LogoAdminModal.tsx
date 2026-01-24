"use client";

import { useRouter } from "next/navigation";
import { X, ShieldCheck, LogIn, UserPlus, Sparkles, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import Image from "next/image";

type LogoAdminModalProps = {
  open: boolean;
  onClose: () => void;
};

const ADMIN_ROLES = ['super_admin', 'finance_admin', 'support_admin', 'content_admin', 'admin'];

export default function LogoAdminModal({ open, onClose }: LogoAdminModalProps) {
  const router = useRouter();
  const { user, isAuthenticated, isHydrated } = useAuthStore();
  const [showLightbox, setShowLightbox] = useState(false);
  
  const isAdmin = isHydrated && isAuthenticated && user?.role && ADMIN_ROLES.includes(user.role);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showLightbox) {
          setShowLightbox(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, showLightbox]);

  if (!open) return null;

  const goToAdminDashboard = () => {
    onClose();
    router.push("/admin/dashboard");
  };

  const goToAdminLogin = () => {
    onClose();
    router.push("/admin/login");
  };

  const goToAdminRequest = () => {
    onClose();
    router.push("/admin/request-access");
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md"
        dir="rtl"
        onClick={onClose}
      >
        <div 
          className="relative w-11/12 max-w-xl rounded-3xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* خلفية متدرجة فاخرة */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c]" />
          <div className="absolute inset-0 bg-[url('/patterns/card-pattern.png')] opacity-5" />
          
          {/* زخارف ذهبية */}
          <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#D4AF37]/30 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-40 h-40 bg-gradient-to-tl from-[#D4AF37]/20 to-transparent rounded-full blur-3xl" />
          
          {/* المحتوى */}
          <div className="relative p-6 md:p-8 text-center text-white">
            {/* زر إغلاق */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 rounded-full p-2 bg-white/10 hover:bg-white/20 transition"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>

            {/* الشعار */}
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative group">
                {/* توهج خلف الشعار */}
                <div className="absolute inset-0 bg-[#D4AF37]/20 rounded-2xl blur-xl animate-pulse" />
                
                {/* إطار الشعار */}
                <div 
                  className="relative cursor-pointer transition-all duration-300 hover:scale-105"
                  onClick={() => setShowLightbox(true)}
                  title="اضغط للتكبير"
                >
                  {/* حدود ذهبية */}
                  <div className="absolute -inset-1 bg-gradient-to-br from-[#D4AF37] via-[#F5E6B8] to-[#D4AF37] rounded-2xl opacity-70" />
                  
                  {/* صورة الشعار */}
                  <div className="relative w-32 h-24 md:w-40 md:h-28 rounded-xl overflow-hidden bg-[#E8DCC0] shadow-xl">
                    <Image
                      src="/logo.svg"
                      alt="بيت الجزيرة اونلاين"
                      fill
                      className="object-contain p-2"
                      priority
                    />
                  </div>
                  
                  {/* أيقونة تكبير */}
                  <div className="absolute -bottom-2 -left-2 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full p-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-[#002845]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
                
                <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-[#D4AF37] animate-pulse" />
              </div>
              
              <div>
                <p className="text-[#D4AF37] font-bold text-sm mb-1 flex items-center justify-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  بوابة المدراء الخاصة
                </p>
              </div>
            </div>

            {/* تنبيه */}
            <div className="bg-white/5 border border-[#D4AF37]/30 rounded-2xl p-4 mb-6">
              {isAdmin ? (
                <p className="text-sm text-white/90 leading-relaxed">
                  مرحباً <span className="font-bold text-[#D4AF37]">{user?.name}</span>! 
                  أنت مسجل دخول بصلاحيات إدارية. اضغط على الزر أدناه للدخول إلى لوحة التحكم.
                </p>
              ) : (
                <p className="text-sm text-white/90 leading-relaxed">
                  هذه النافذة مخصّصة للإدارة فقط. الوصول إلى لوحة التحكم يتم عن طريق{" "}
                  <span className="font-bold text-[#D4AF37]">شعار بيت الجزيرة</span>{" "}
                  في أعلى الموقع حفاظًا على السرية والأمان.
                </p>
              )}
            </div>

            {/* أزرار */}
            {isAdmin ? (
              <button
                onClick={goToAdminDashboard}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-5 py-4 text-base font-bold text-[#002845] shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                <LayoutDashboard className="w-6 h-6" />
                الدخول إلى لوحة التحكم
              </button>
            ) : (
              <div className="flex flex-col gap-3 md:flex-row">
                <button
                  onClick={goToAdminLogin}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] px-5 py-3 text-sm font-bold text-[#002845] shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
                >
                  <LogIn className="w-5 h-5" />
                  دخول الإدارة
                </button>

                <button
                  onClick={goToAdminRequest}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[#D4AF37]/50 bg-white/5 px-5 py-3 text-sm font-bold text-white hover:bg-white/10 hover:border-[#D4AF37] transition-all"
                >
                  <UserPlus className="w-5 h-5" />
                  طلب الانضمام
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox للتكبير */}
      {showLightbox && (
        <div 
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-lg cursor-zoom-out"
          onClick={() => setShowLightbox(false)}
        >
          {/* زر إغلاق */}
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-6 left-6 rounded-full p-3 bg-white/10 hover:bg-white/20 transition z-10"
            aria-label="إغلاق"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* تعليمات */}
          <p className="absolute top-6 right-6 text-white/60 text-sm">
            اضغط للإغلاق أو ESC
          </p>

          {/* الشعار المكبر */}
          <div 
            className="relative w-[90vw] h-[70vh] max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* إطار ذهبي */}
            <div className="absolute -inset-2 bg-gradient-to-br from-[#D4AF37] via-[#F5E6B8] to-[#D4AF37] rounded-3xl opacity-50" />
            
            <div className="relative w-full h-full rounded-2xl overflow-hidden bg-[#E8DCC0] shadow-2xl">
              <Image
                src="/logo.svg"
                alt="بيت الجزيرة اونلاين - شعار مكبر"
                fill
                className="object-contain p-6"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
