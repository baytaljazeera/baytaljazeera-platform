"use client";

import { Toaster } from "sonner";

// ─────────────────────────────────────────────────────────────────
// Premium toaster — Bayt Aljazira palette.
//
// Gold (#D4AF37) on royal blue (#002845) for success.
// Deep amber for warnings. Soft rose for errors. Royal-blue with
// gold accent for info. RTL by default since 90%+ of the platform
// is Arabic, with rounded corners and soft layered shadows that
// match the rest of the admin/customer surfaces.
// ─────────────────────────────────────────────────────────────────

export default function ToasterClient() {
  return (
    <Toaster
      position="top-center"
      dir="rtl"
      visibleToasts={5}
      gap={10}
      offset={20}
      toastOptions={{
        // Base styles applied to every toast. Per-type overrides below.
        className: "bj-toast",
        unstyled: false,
        duration: 4500,
        style: {
          fontFamily: "var(--font-arabic, 'Tajawal'), system-ui, sans-serif",
          borderRadius: "16px",
          padding: "14px 18px",
          fontWeight: "600",
          fontSize: "14px",
          boxShadow:
            "0 24px 50px -16px rgba(0, 40, 69, 0.32), 0 6px 14px -6px rgba(0, 40, 69, 0.18), 0 0 0 1px rgba(212, 175, 55, 0.18)",
          backdropFilter: "blur(10px)",
        },
      }}
      // Sonner v1+ supports per-type style maps via the `classNames` prop.
      // We hand-roll the per-type chrome below — sonner pipes the toast
      // through these slots so we get full visual control without
      // breaking its built-in animations/dismiss behaviour.
      icons={{
        success: <span className="bj-toast-icon bj-toast-icon--success">✓</span>,
        error:   <span className="bj-toast-icon bj-toast-icon--error">✕</span>,
        warning: <span className="bj-toast-icon bj-toast-icon--warning">!</span>,
        info:    <span className="bj-toast-icon bj-toast-icon--info">i</span>,
        loading: <span className="bj-toast-icon bj-toast-icon--loading">◌</span>,
      }}
    />
  );
}
