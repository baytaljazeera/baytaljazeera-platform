"use client";

import Image from "next/image";
import { CITIES, COLORS } from "@/lib/constants";

interface CityCardProps {
  title: string;
  img: string;
  onClick?: () => void;
}

function CityCard({ title, img, onClick }: CityCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group"
    >
      {/* City image with overlay */}
      <div className="relative h-48 w-full overflow-hidden">
        <Image
          src={img}
          alt={title}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />
      </div>

      {/* Corner decoration */}
      <div className="absolute top-0 left-0 opacity-35">
        <Image
          src="/patterns/corner-light.png"
          alt="زخرفة"
          width={160}
          height={160}
        />
      </div>

      {/* Title */}
      <div
        className="p-5 text-center font-bold text-xl bg-white"
        style={{ color: COLORS.primary }}
      >
        {title}
      </div>
    </div>
  );
}

interface PopularCitiesSectionProps {
  onCityClick?: (city: string) => void;
}

export function PopularCitiesSection({ onCityClick }: PopularCitiesSectionProps) {
  return (
    <section className="relative py-20 px-6" style={{ backgroundColor: COLORS.cream }}>
      {/* Background pattern */}
      <div className="absolute inset-0 -z-10 opacity-10">
        <Image
          src="/patterns/footer-pattern.png"
          alt="نمط إسلامي"
          fill
          className="object-cover"
        />
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Section title */}
        <h2
          className="text-3xl md:text-4xl font-extrabold text-center mb-12"
          style={{ color: COLORS.primary }}
        >
          المدن الأكثر طلباً
        </h2>

        {/* Cities grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {CITIES.map((city) => (
            <CityCard
              key={city.title}
              title={city.title}
              img={city.img}
              onClick={() => onCityClick?.(city.title)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
