"use client";

import { FEATURES, COLORS } from "@/lib/constants";

interface FeatureCardProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <div
      className="rounded-3xl p-8 shadow-sm border transition-all duration-300 hover:shadow-md hover:-translate-y-1"
      style={{
        backgroundColor: COLORS.lightCream,
        borderColor: COLORS.border,
      }}
    >
      {icon && <div className="mb-4 text-2xl">{icon}</div>}
      <h3 className="text-2xl font-bold mb-3" style={{ color: COLORS.primary }}>
        {title}
      </h3>
      <p className="text-lg leading-relaxed" style={{ color: COLORS.textDark }}>
        {description}
      </p>
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section title */}
        <h2
          className="text-3xl md:text-4xl font-extrabold text-center mb-12"
          style={{ color: COLORS.primary }}
        >
          لماذا بيت الجزيرة؟
        </h2>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {FEATURES.map((feature, index) => (
            <FeatureCard
              key={`${feature.title}-${index}`}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
