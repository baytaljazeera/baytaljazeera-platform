"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#01273C] to-[#0B6B4C] text-white p-4" dir="rtl">
      <h1 className="text-6xl font-bold mb-4 text-[#D4AF37]">404</h1>
      <h2 className="text-2xl mb-8">الصفحة غير موجودة</h2>
      <Link 
        href="/" 
        className="px-6 py-3 bg-[#D4AF37] text-[#01273C] rounded-lg font-semibold hover:bg-[#B8972E] transition-colors"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
