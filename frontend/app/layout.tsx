import "./globals.css";
import Navbar from "@/components/Navbar";
import { Footer } from "@/components/sections/Footer";
import NewsTicker from "@/components/NewsTicker";
import { Toaster } from "sonner";
import { Tajawal, Cairo } from "next/font/google";
import ChatbotWrapper from "@/components/ChatbotWrapper";
import GlobalPromotions from "@/components/GlobalPromotions";
import MaintenanceWrapper from "@/components/MaintenanceWrapper";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["300", "400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic"],
  weight: ["400", "700", "800", "900"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata = {
  title: "بيت الجزيرة",
  description: "منصة عقارية ذكية",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${cairo.variable} notranslate`} translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="font-tajawal bg-beige text-royalblue min-h-screen flex flex-col" suppressHydrationWarning>
        <MaintenanceWrapper>
          <Toaster position="top-center" richColors />
          <Navbar />
          <NewsTicker />
          <GlobalPromotions />
          <main className="flex-1">{children}</main>
          <Footer />
          <ChatbotWrapper />
        </MaintenanceWrapper>
      </body>
    </html>
  );
}
