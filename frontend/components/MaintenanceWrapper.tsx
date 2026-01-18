"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import MaintenancePage from "./MaintenancePage";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const pathname = usePathname();
  
  const isAdminRoute = pathname?.startsWith("/admin");

  useEffect(() => {
    if (isAdminRoute) {
      setIsChecking(false);
      return;
    }

    const checkMaintenance = async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/maintenance-status`, {
          cache: "no-store",
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
    };

    checkMaintenance();
    
    const interval = setInterval(checkMaintenance, 60000);
    return () => clearInterval(interval);
  }, [isAdminRoute]);

  if (isChecking) {
    return <>{children}</>;
  }

  if (isMaintenanceMode && !isAdminRoute) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
