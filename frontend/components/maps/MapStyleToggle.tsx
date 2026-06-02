"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, Mountain, Map as MapIcon, TreePine, Sparkles, ChevronDown } from "lucide-react";
import { MAP_STYLES, MAP_STYLE_ORDER, MAP_STYLE_ORDER_COMPACT, type MapStyleKey } from "@/lib/mapStyles";

// ─────────────────────────────────────────────────────────────────
// Floating premium pill that lets the user switch the map's base
// layer. Sits in the top-left of each Leaflet map. Gold-on-paper
// design language. Stateless choice — parent owns the current style.
//
// Collapsed behaviour (June 2026 — owner-driven):
//   The toggle now defaults to a SINGLE compact pill showing the
//   active style + a chevron. The rest of the options only appear
//   when the user taps the pill. Reason: with 5 options open by
//   default the toggle stretched across the top of the map and
//   covered the "انقر مرتين لتأكيد الموقع" tooltip on the picker.
//   Tap-to-expand keeps the top of the map clear for the tooltip
//   and only surfaces the choices when the user actually needs them.
//
// Use cases:
//   - Browse maps (search, listing detail): compact = 3 options
//     (streets / satellite / hybrid)
//   - Location picker (adding a listing): full = 5 options
//     including voyager (clean streets) + terrain (elevation
//     contours, good for rural plots)
// ─────────────────────────────────────────────────────────────────

const ICONS: Record<MapStyleKey, typeof MapIcon> = {
  streets:   MapIcon,
  voyager:   Sparkles,
  satellite: Mountain,
  hybrid:    Layers,
  terrain:   TreePine,
};

interface MapStyleToggleProps {
  current: MapStyleKey;
  onChange: (next: MapStyleKey) => void;
  /** Optional Tailwind classes for absolute positioning (default top-left) */
  className?: string;
  /** Compact = icons only, no labels (for tight map controls) */
  compact?: boolean;
  /** Show the FULL set of styles (default = compact set of 3) */
  fullSet?: boolean;
}

export default function MapStyleToggle({
  current,
  onChange,
  className = "",
  compact = false,
  fullSet = false,
}: MapStyleToggleProps) {
  const order = fullSet ? MAP_STYLE_ORDER : MAP_STYLE_ORDER_COMPACT;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-tap so the toggle doesn't sit open while the
  // user is trying to drop a pin elsewhere on the map.
  useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ActiveIcon = ICONS[current] || MapIcon;
  const activeCfg = MAP_STYLES[current];

  return (
    <div
      ref={containerRef}
      dir="rtl"
      className={`absolute top-3 left-3 z-[1000] ${className}`}
      role="group"
      aria-label="نمط الخريطة"
    >
      {/* Collapsed pill — always visible. Tap to expand the full row. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="تغيير نمط الخريطة"
        aria-expanded={open}
        aria-haspopup="true"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/95 backdrop-blur shadow-[0_8px_24px_-8px_rgba(0,40,69,0.35)] border border-white/60 text-[12px] font-bold text-[#002845] active:scale-95 transition-transform"
      >
        <ActiveIcon className="w-3.5 h-3.5 text-[#B8860B]" />
        {!compact && <span className="whitespace-nowrap">{activeCfg?.label || "الخريطة"}</span>}
        <ChevronDown className={`w-3 h-3 text-[#002845]/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded options drawer — drops down BELOW the pill so it
          never overlaps the centered "click to confirm" tooltip. */}
      {open && (
        <div className="mt-1.5 flex items-center gap-1 p-1 rounded-2xl bg-white/95 backdrop-blur shadow-[0_8px_24px_-8px_rgba(0,40,69,0.35)] border border-white/60 flex-wrap max-w-[calc(100vw-1.5rem)] animate-[fadeIn_120ms_ease-out]">
          {order.map((key) => {
            const cfg = MAP_STYLES[key];
            const Icon = ICONS[key];
            const active = current === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
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
      )}
    </div>
  );
}
