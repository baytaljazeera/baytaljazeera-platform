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
  const [workCenterOpen, setWorkCenterOpen] = useState(false);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-x-hidden" dir="rtl">
        <div className="flex min-h-screen overflow-hidden">
          <div className="flex min-h-screen flex-1 flex-col">
            <AdminTopbar onMenuClick={() => setWorkCenterOpen(true)} />
            <main className="flex min-h-0 flex-1 flex-col px-3 pb-6 pt-3 md:px-6 md:pb-8 md:pt-4 overflow-x-hidden">
              {children}
            </main>
          </div>
        </div>

        {workCenterOpen && (
          <div className="fixed inset-0 z-[60]">
            <button
              type="button"
              onClick={() => setWorkCenterOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              aria-label="إغلاق مركز العمل"
            />
            <div className="absolute right-0 top-0 h-full w-[88vw] max-w-sm bg-gradient-to-b from-[#001a2e] via-[#002845] to-[#003d5c] text-white shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white">مركز العمل</h3>
                <button
                  type="button"
                  onClick={() => setWorkCenterOpen(false)}
                  className="rounded-lg p-2 hover:bg-white/10 transition"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="h-[calc(100%-52px)] overflow-y-auto">
                <AdminSidebar isMobile onNavigate={() => setWorkCenterOpen(false)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
