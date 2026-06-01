"use client";

import { Layers, Mountain, Map as MapIcon } from "lucide-react";
import { MAP_STYLES, MAP_STYLE_ORDER, type MapStyleKey } from "@/lib/mapStyles";

// ─────────────────────────────────────────────────────────────────
// Floating premium pill that lets the customer switch the map's
// base layer between streets / satellite / hybrid. Sits in the
// top-left of each Leaflet map. Gold-on-paper design language.
// Stateless — parent owns the current style + the setter.
// ─────────────────────────────────────────────────────────────────

const ICONS: Record<MapStyleKey, typeof MapIcon> = {
  streets: MapIcon,
  voyager: MapIcon,
  satellite: Mountain,
  hybrid: Layers,
};

interface MapStyleToggleProps {
  current: MapStyleKey;
  onChange: (next: MapStyleKey) => void;
  /** Optional Tailwind classes for absolute positioning (default top-left) */
  className?: string;
  /** Compact = icons only, no labels (for tight map controls) */
  compact?: boolean;
}

export default function MapStyleToggle({
  current,
  onChange,
  className = "",
  compact = false,
}: MapStyleToggleProps) {
  return (
    <div
      dir="rtl"
      className={`absolute top-3 left-3 z-[400] flex items-center gap-1 p-1 rounded-2xl bg-white/95 backdrop-blur shadow-[0_8px_24px_-8px_rgba(0,40,69,0.35)] border border-white/60 ${className}`}
      role="group"
      aria-label="نمط الخريطة"
    >
      {MAP_STYLE_ORDER.map((key) => {
        const cfg = MAP_STYLES[key];
        const Icon = ICONS[key];
        const active = current === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={cfg.hint}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 ${
              active
                ? "bg-gradient-to-l from-[#D4AF37] to-[#B8860B] text-[#002845] shadow-[0_4px_12px_-2px_rgba(212,175,55,0.5)]"
                : "text-[#002845]/70 hover:bg-[#FFFCEE] hover:text-[#9A7D28]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {!compact && <span>{cfg.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
