"use client";

// ─────────────────────────────────────────────────────────────────
// Legacy /my-complaints page — REDIRECTED to the unified hub.
// The owner consolidated "tickets" + "complaints" into one place:
//   /account/my-tickets   →   "طلباتي وشكاواي"
// We keep this route so old bookmarks + notification emails still
// land somewhere valid, but instantly bounce to the new home.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyComplaintsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account/my-tickets");
  }, [router]);

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#002845] via-[#001a2e] to-[#000a14] p-6 text-white"
    >
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-2xl">
          📨
        </div>
        <h1 className="text-2xl font-extrabold">نقلنا الشكاوى لمكان أفضل</h1>
        <p className="text-white/70 leading-relaxed text-sm">
          صارت كل طلباتك وشكاواك في صفحة واحدة:{" "}
          <span className="font-bold text-[#D4AF37]">طلباتي وشكاواي</span>.
          نُحوّلك تلقائياً الآن…
        </p>
        <a
          href="/account/my-tickets"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-sm shadow-lg hover:opacity-90 transition"
        >
          فتح الصفحة الموحّدة
        </a>
      </div>
    </div>
  );
}
