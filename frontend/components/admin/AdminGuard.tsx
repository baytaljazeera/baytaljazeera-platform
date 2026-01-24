"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { Crown } from "lucide-react";

interface AdminGuardProps {
  children: React.ReactNode;
}

const ADMIN_ROLES = ['super_admin', 'finance_admin', 'support_admin', 'content_admin', 'admin'];

const isAdminRole = (role: string | undefined) => role && ADMIN_ROLES.includes(role);

export default function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const { isAuthenticated, user, hydrate, isHydrated, checkAuth, isLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const hasChecked = useRef(false);

  useEffect(() => {
    const verify = async () => {
      if (hasChecked.current) return;
      hasChecked.current = true;
      
      if (!isHydrated) {
        hydrate();
      }
      await checkAuth();
      setChecking(false);
    };
    
    verify();
  }, [hydrate, isHydrated, checkAuth]);

  useEffect(() => {
    if (!checking && !isLoading) {
      if (!isAuthenticated || !isAdminRole(user?.role)) {
        router.replace("/admin-login");
      }
    }
  }, [checking, isLoading, isAuthenticated, user, router]);

  if (checking || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001a2e] via-[#002845] to-[#003d5c]" dir="rtl">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-[#B8860B] shadow-xl mb-4 animate-pulse">
            <Crown className="w-8 h-8 text-[#002845]" />
          </div>
          <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white/60 mt-4 text-sm">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdminRole(user?.role)) {
    return null;
  }

  return <>{children}</>;
}
