"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ListingsRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/admin/finance/listings");
  }, [router]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white text-lg">جاري التحويل...</p>
      </div>
    </div>
  );
}
