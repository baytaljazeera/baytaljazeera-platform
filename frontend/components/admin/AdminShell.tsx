"use client";

import { ReactNode, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import AdminGuard from "./AdminGuard";
import MobileBottomSheet from "../MobileBottomSheet";

type AdminShellProps = {
  children: ReactNode;
};

export default function AdminShell({ children }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-x-hidden" dir="rtl">
        <div className="flex min-h-screen overflow-hidden">
          <AdminSidebar />
          
          <MobileBottomSheet
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            title="القائمة الإدارية"
            maxHeight="85vh"
            showCloseButton={true}
          >
            <AdminSidebar isMobile onNavigate={() => setMobileMenuOpen(false)} />
          </MobileBottomSheet>
          
          <div className="flex min-h-screen flex-1 flex-col">
            <AdminTopbar onMenuClick={() => setMobileMenuOpen(true)} />
            <main className="flex-1 px-3 pb-6 pt-3 md:px-6 md:pb-8 md:pt-4 overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
