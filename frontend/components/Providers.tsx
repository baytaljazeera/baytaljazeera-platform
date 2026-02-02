"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import NewsTicker from "@/components/NewsTicker";
import ChatbotWrapper from "@/components/ChatbotWrapper";
import GlobalPromotions from "@/components/GlobalPromotions";
import SiteStatusWrapper from "@/components/SiteStatusWrapper";
import { Footer } from "@/components/sections/Footer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <SiteStatusWrapper>
        <Toaster position="top-center" richColors closeButton duration={4000} dir="rtl" />
      <Navbar />
      <NewsTicker />
      <GlobalPromotions />
      <main className="flex-1">{children}</main>
      <Footer />
      <ChatbotWrapper />
    </SiteStatusWrapper>
    </ThemeProvider>
  );
}
