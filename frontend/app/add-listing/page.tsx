"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AddListingRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/listings/new");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#002845]" dir="rtl">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-white">جاري التحويل...</p>
      </div>
    </div>
  );
}
