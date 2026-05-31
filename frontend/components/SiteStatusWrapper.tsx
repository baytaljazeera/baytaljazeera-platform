"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import MaintenancePage from "./MaintenancePage";
import ComingSoonPage from "./ComingSoonPage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type SiteStatus = "normal" | "maintenance" | "coming_soon";

export default function SiteStatusWrapper({ children }: { children: React.ReactNode }) {
  const [siteStatus, setSiteStatus] = useState<SiteStatus>("normal");
  const [isChecking, setIsChecking] = useState(true);
  const pathname = usePathname();
  
  // Admin pages in this project live under /add-listing/admin/* (not
  // /admin/*). The old check `startsWith("/admin")` returned false
  // for the REAL admin URLs, so turning maintenance on locked the
  // operator out of their own settings page — they couldn't disable
  // the mode they just enabled. Also exempt /login + /oauth-callback
  // so the operator can actually authenticate before reaching the
  // admin shell.
  const isAdminRoute = !!pathname && (
    pathname.startsWith("/add-listing/admin") ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname.startsWith("/oauth-callback")
  );

  const checkSiteStatus = useCallback(async () => {
    if (isAdminRoute) return;
    
    try {
      const res = await fetch(`${API_URL}/api/settings/site-status`, {
        cache: "no-store",
        headers: { 
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache"
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status && ["normal", "maintenance", "coming_soon"].includes(data.status)) {
          setSiteStatus(data.status as SiteStatus);
        }
      }
    } catch (err) {
      console.log("Could not check site status");
    } finally {
      setIsChecking(false);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) {
      setIsChecking(false);
      return;
    }

    checkSiteStatus();
    
    const interval = setInterval(checkSiteStatus, 3000);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSiteStatus();
      }
    };
    
    const handleFocus = () => checkSiteStatus();
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAdminRoute, checkSiteStatus]);

  if (isChecking) {
    return <>{children}</>;
  }

  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (siteStatus === "maintenance") {
    return <MaintenancePage />;
  }

  if (siteStatus === "coming_soon") {
    return <ComingSoonPage />;
  }

  return <>{children}</>;
}
