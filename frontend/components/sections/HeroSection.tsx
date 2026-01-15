"use client";

import Image from "next/image";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { COLORS } from "@/lib/constants";

interface HeroSectionProps {
  onSearch?: (query: string) => void;
}

export function HeroSection({ onSearch }: HeroSectionProps) {
  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("search") as string;
    onSearch?.(query);
  };

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b text-white"
      style={{
        backgroundImage: `linear-gradient(to bottom, ${COLORS.primary}, ${COLORS.secondary}, ${COLORS.dark})`,
      }}
    >
      {/* Hero pattern background */}
      <Image
        src="/patterns/hero-2.png"
        alt="خلفية إسلامية"
        fill
        className="object-cover opacity-40 mix-blend-soft-light"
        priority
      />

      {/* Corner gold decoration */}
      <div className="absolute top-0 right-0 opacity-80">
        <Image
          src="/patterns/corner-gold.png"
          alt="زخرفة إسلامية"
          width={220}
          height={220}
          priority
        />
      </div>

      {/* Hero content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold leading-snug drop-shadow-lg">
          اعثر على عقارك المثالي
          <br />
          في <span style={{ color: COLORS.gold }}>الجزيرة</span>
        </h1>

        <p
          className="mt-4 text-lg md:text-xl font-light"
          style={{ color: COLORS.textLight }}
        >
          منصة عقارية بمعايير جودة عالية، مع روح الهوية الإسلامية الملكية.
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mt-10">
          <div className="bg-white rounded-3xl p-4 shadow-lg flex items-center gap-3 max-w-3xl mx-auto">
            <Input
              type="text"
              name="search"
              placeholder="ابحث عن مدينة، حي، أو نوع العقار..."
              className="flex-1 h-12 text-lg text-black rounded-2xl border-0 focus:ring-0"
            />
            <Button
              type="submit"
              className="h-12 px-6 rounded-2xl text-black font-medium hover:opacity-90 transition"
              style={{ backgroundColor: COLORS.gold }}
            >
              <Search className="w-5 h-5 ml-2" />
              بحث
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
