import { Toaster } from "sonner";
import "../globals.css";

export default function StandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Toaster position="top-center" richColors />
      {children}
    </>
  );
}
