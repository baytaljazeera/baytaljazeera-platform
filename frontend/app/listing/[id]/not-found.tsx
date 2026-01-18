"use client";

import Link from "next/link";
import { Home, ArrowRight, Search } from "lucide-react";

export default function ListingNotFound() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#002845] to-[#fdf6db] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-md w-full shadow-xl">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded-full flex items-center justify-center mx-auto mb-6">
          <Search className="w-10 h-10 text-amber-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-[#002845] mb-3">
          الإعلان غير موجود
        </h1>
        
        <p className="text-slate-600 mb-6 leading-relaxed">
          قد يكون الإعلان محذوفاً أو تحت المراجعة أو غير متاح حالياً.
          <br />
          إذا كنت صاحب الإعلان، تأكد من تسجيل الدخول.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/search"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#D4AF37] text-[#002845] rounded-full font-semibold hover:bg-[#e5c868] transition-all"
          >
            <Search className="w-5 h-5" />
            تصفح العقارات
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#002845] text-white rounded-full font-semibold hover:bg-[#01375e] transition-all"
          >
            <Home className="w-5 h-5" />
            الرئيسية
          </Link>
        </div>
        
        <div className="mt-6 pt-6 border-t border-slate-200">
          <Link
            href="/my-listings"
            className="text-[#D4AF37] hover:text-[#b8942e] font-medium flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            إعلاناتي
          </Link>
        </div>
      </div>
    </div>
  );
}
