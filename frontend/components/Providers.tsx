"use client";

import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import NewsTicker from "@/components/NewsTicker";
import ChatbotWrapper from "@/components/ChatbotWrapper";
import GlobalPromotions from "@/components/GlobalPromotions";
import SiteStatusWrapper from "@/components/SiteStatusWrapper";
import { Footer } from "@/components/sections/Footer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SiteStatusWrapper>
      <Toaster position="top-center" richColors />
      <Navbar />
      <NewsTicker />
      <GlobalPromotions />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatbotWrapper />
    </SiteStatusWrapper>
  );
}
