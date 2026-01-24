"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import MaintenancePage from "./MaintenancePage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const pathname = usePathname();
  
  const isAdminRoute = pathname?.startsWith("/admin");

  const checkMaintenance = useCallback(async () => {
    if (isAdminRoute) return;
    
    try {
      const res = await fetch(`${API_URL}/api/settings/maintenance-status`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const data = await res.json();
        setIsMaintenanceMode(data.maintenanceMode === true);
      }
    } catch (err) {
      console.log("Could not check maintenance status");
    } finally {
      setIsChecking(false);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) {
      setIsChecking(false);
      return;
    }

    checkMaintenance();
    
    const interval = setInterval(checkMaintenance, 5000);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkMaintenance();
      }
    };
    
    const handleFocus = () => checkMaintenance();
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAdminRoute, checkMaintenance]);

  if (isChecking) {
    return <>{children}</>;
  }

  if (isMaintenanceMode && !isAdminRoute) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
