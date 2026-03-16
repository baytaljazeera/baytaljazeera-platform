"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FeedbackAdminPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/add-listing/admin/feedback/overview");
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]" />
    </div>
  );
}
