"use client";

import nextDynamic from "next/dynamic";

const AdminShell = nextDynamic(() => import("@/components/admin/AdminShell"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#001a2e]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white">جاري التحميل...</p>
      </div>
    </div>
  ),
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
