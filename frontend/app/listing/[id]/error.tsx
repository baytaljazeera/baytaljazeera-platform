"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, AlertCircle } from "lucide-react";

export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Listing page error:", error);
  }, [error]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-md w-full shadow-xl">
        <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-[#002845] mb-3">
          حدث خطأ أثناء تحميل الإعلان
        </h1>
        
        <p className="text-slate-600 mb-6 leading-relaxed">
          نعتذر، حدثت مشكلة أثناء محاولة عرض هذا الإعلان.
          <br />
          يرجى المحاولة مرة أخرى.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#D4AF37] text-[#002845] rounded-full font-semibold hover:bg-[#e5c868] transition-all"
          >
            <RefreshCw className="w-5 h-5" />
            إعادة المحاولة
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#002845] text-white rounded-full font-semibold hover:bg-[#01375e] transition-all"
          >
            <Home className="w-5 h-5" />
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
