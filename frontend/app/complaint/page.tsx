"use client";

// ─────────────────────────────────────────────────────────────────
// Legacy /complaint page — REPLACED by the unified RequestComposer.
// We auto-open the composer on mount so any link or notification
// pointing here still results in the customer seeing the right form.
// When the composer closes we send them to the unified hub instead
// of bouncing them back to a blank page.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RequestComposer from "@/components/requests/RequestComposer";

export default function ComplaintRedirectPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Open the composer once the page has mounted so the backdrop +
  // animation kick in cleanly. We don't pre-select a type — the
  // user can pick: شكوى عامة / مالية / تقنية / حسابي.
  useEffect(() => {
    setOpen(true);
  }, []);

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#002845] via-[#001a2e] to-[#000a14] p-6 text-white"
    >
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-2xl">
          💬
        </div>
        <h1 className="text-2xl font-extrabold">قدّم طلبك أو شكواك</h1>
        <p className="text-white/70 leading-relaxed text-sm">
          نقلنا تقديم الشكاوى إلى نموذج موحّد يغطّي كل أنواع الطلبات —
          ستجده مفتوحاً أمامك الآن. متابعة الردود تتم في{" "}
          <span className="font-bold text-[#D4AF37]">طلباتي وشكاواي</span>.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] font-bold text-sm shadow-lg hover:opacity-90 transition"
          >
            فتح النموذج
          </button>
          <button
            type="button"
            onClick={() => router.push("/account/my-tickets")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/20 text-white/85 font-bold text-sm hover:bg-white/5 transition"
          >
            عرض طلباتي
          </button>
        </div>
      </div>

      <RequestComposer
        open={open}
        onClose={() => {
          setOpen(false);
          // After closing (with or without submit), park the user on
          // the unified hub so they can track replies in one place.
          setTimeout(() => router.push("/account/my-tickets"), 100);
        }}
        onCreated={() => {
          setOpen(false);
          router.push("/account/my-tickets");
        }}
      />
    </div>
  );
}
