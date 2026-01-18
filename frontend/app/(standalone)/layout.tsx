import nextDynamic from "next/dynamic";
import "../globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ToasterClient = nextDynamic(
  () => import("@/components/ToasterClient"),
  { ssr: false }
);

export default function StandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ToasterClient />
      {children}
    </>
  );
}
