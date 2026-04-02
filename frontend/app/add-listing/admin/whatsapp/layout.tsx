"use client";

import { useEffect } from "react";

/**
 * Layout for the WhatsApp Command Center.
 *
 * AdminShell's <main> has padding + no explicit height, so the chat UI overflows
 * into the global footer. This layout patches <main> for this route only:
 *   - Removes padding (the page applies its own)
 *   - Sets height = 100vh − topbar height so children can use h-full
 *   - Sets overflow-hidden to prevent footer bleed
 * Everything is restored on unmount (navigation away).
 */
export default function WhatsAppAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const mainEl = document.querySelector<HTMLElement>("main");
    const headerEl = document.querySelector<HTMLElement>("header");
    if (!mainEl) return;

    // Save original inline styles (not class-based, those are untouched)
    const orig = {
      padding: mainEl.style.padding,
      height: mainEl.style.height,
      overflow: mainEl.style.overflow,
      flex: mainEl.style.flex,
    };

    function apply() {
      const topH = headerEl ? headerEl.getBoundingClientRect().height : 0;
      mainEl!.style.padding = "0";
      mainEl!.style.height = `calc(100vh - ${topH}px)`;
      mainEl!.style.overflow = "hidden";
      mainEl!.style.flex = "none"; // prevent flex-1 fighting our explicit height
    }

    apply();
    window.addEventListener("resize", apply);

    return () => {
      window.removeEventListener("resize", apply);
      // Restore
      mainEl.style.padding = orig.padding;
      mainEl.style.height = orig.height;
      mainEl.style.overflow = orig.overflow;
      mainEl.style.flex = orig.flex;
    };
  }, []);

  return <>{children}</>;
}
