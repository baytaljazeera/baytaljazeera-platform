"use client";

import { ReactNode, useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import AdminGuard from "./AdminGuard";
import { X } from "lucide-react";

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
          
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div 
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
              <div className="absolute right-0 top-0 h-full w-72 bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] shadow-2xl animate-in slide-in-from-right duration-300">
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="absolute left-3 top-3 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition"
                >
                  <X className="w-5 h-5" />
                </button>
                <AdminSidebar isMobile onNavigate={() => setMobileMenuOpen(false)} />
              </div>
            </div>
          )}
          
          <div className="flex min-h-screen flex-1 flex-col">
            <AdminTopbar onMenuClick={() => setMobileMenuOpen(true)} />
            <main className="flex-1 px-4 pb-8 pt-4 md:px-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AdminGuard>
  );
}
