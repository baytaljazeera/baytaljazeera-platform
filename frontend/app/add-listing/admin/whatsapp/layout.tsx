"use client";

import { useEffect } from "react";

export default function WhatsAppAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const mainEl = document.querySelector<HTMLElement>("main");
    const headerEl = document.querySelector<HTMLElement>("header");
    const footerEl = document.querySelector<HTMLElement>(
      "footer, .global-footer, [id*='footer']"
    );
    const origBodyOverflow = document.body.style.overflow;
    const origFooterDisplay = footerEl ? footerEl.style.display : "";

    if (!mainEl) return;

    const orig = {
      padding: mainEl.style.padding,
      height: mainEl.style.height,
      overflow: mainEl.style.overflow,
      flex: mainEl.style.flex,
    };

    function apply() {
      const topH = headerEl ? headerEl.getBoundingClientRect().height : 0;
      mainEl.style.padding = "0";
      mainEl.style.height = `calc(100vh - ${topH}px)`;
      mainEl.style.overflow = "hidden";
      mainEl.style.flex = "none";

      // Lock body and hide footer
      document.body.style.overflow = "hidden";
      if (footerEl) footerEl.style.display = "none";
    }

    apply();
    window.addEventListener("resize", apply);

    return () => {
      window.removeEventListener("resize", apply);
      mainEl.style.padding = orig.padding;
      mainEl.style.height = orig.height;
      mainEl.style.overflow = orig.overflow;
      mainEl.style.flex = orig.flex;

      document.body.style.overflow = origBodyOverflow;
      if (footerEl) footerEl.style.display = origFooterDisplay;
    };
  }, []);

  return <>{children}</>;
}
