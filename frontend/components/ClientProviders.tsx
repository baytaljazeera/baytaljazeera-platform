"use client";

import dynamic from "next/dynamic";

const Providers = dynamic(() => import("./Providers"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-beige">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-royalblue font-tajawal">جاري التحميل...</p>
      </div>
    </div>
  ),
});

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
