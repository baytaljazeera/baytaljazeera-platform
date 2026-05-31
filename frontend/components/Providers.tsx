"use client";

import { Suspense } from "react";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import NewsTicker from "@/components/NewsTicker";
import ChatbotWrapper from "@/components/ChatbotWrapper";
import GlobalPromotions from "@/components/GlobalPromotions";
import SiteStatusWrapper from "@/components/SiteStatusWrapper";
import { Footer } from "@/components/sections/Footer";
import FeedbackWidgetContainer from "@/components/feedback/FeedbackWidgetContainer";
import { DialogHost } from "@/components/ui/ConfirmDialog";

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
      <Suspense fallback={null}>
        <FeedbackWidgetContainer />
      </Suspense>
      {/* Premium confirmation/alert dialogs — replaces every
          window.confirm / window.alert across the platform. Listens
          to imperative confirmDialog()/alertDialog() helpers. */}
      <DialogHost />
    </SiteStatusWrapper>
  );
}
