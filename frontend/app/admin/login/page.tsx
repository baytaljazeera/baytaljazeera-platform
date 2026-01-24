"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin-login");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#001a2e]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#D4AF37] mx-auto mb-4"></div>
        <p className="text-white">جاري التحويل...</p>
      </div>
    </div>
  );
}
