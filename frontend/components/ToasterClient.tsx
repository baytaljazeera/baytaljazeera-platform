"use client";

import { Toaster } from "sonner";

export default function ToasterClient() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={4000}
      dir="rtl"
      toastOptions={{
        classNames: {
          toast: "font-arabic",
          title: "font-semibold",
          description: "text-sm",
        },
      }}
    />
  );
}
