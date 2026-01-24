"use client";

import React from "react";
import { Filters, UsageTab } from "../types";
import { RESIDENTIAL_TYPES, COMMERCIAL_TYPES } from "../constants";

interface PropertyTypePanelProps {
  filters: Filters;
  usageTab: UsageTab;
  onChange: (f: Filters) => void;
  onClose: () => void;
}

export function PropertyTypePanel({ filters, usageTab, onChange, onClose }: PropertyTypePanelProps) {
  const selected = filters.propertyTypes ?? [];

  const toggleType = (type: string) => {
    const current = filters.propertyTypes ?? [];
    if (current.includes(type)) {
      onChange({
        ...filters,
        propertyTypes: current.filter((t) => t !== type),
      });
    } else {
      onChange({
        ...filters,
        propertyTypes: [...current, type],
      });
    }
  };

  const clearAll = () =>
    onChange({
      ...filters,
      propertyTypes: [],
    });

  const typesToShow =
    usageTab === "residential"
      ? RESIDENTIAL_TYPES
      : usageTab === "commercial"
      ? COMMERCIAL_TYPES
      : [...RESIDENTIAL_TYPES, ...COMMERCIAL_TYPES];

  return (
    <div 
      className="panel-animated bg-[#002845] rounded-xl shadow-lg border border-[#D4AF37]/40 p-2.5 w-fit mx-auto max-h-[200px] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3 className="text-[10px] font-bold text-[#D4AF37]">نوع العقار</h3>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); clearAll(); }} className="text-[10px] text-red-400 hover:text-red-300">مسح</button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[10px] text-white/60 hover:text-white">✕</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {typesToShow.map((type) => {
          const isChecked = selected.includes(type);
          return (
            <button
              key={type}
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleType(type); }}
              className={`text-[10px] rounded-full px-2.5 py-1 transition font-semibold ${
                isChecked ? "bg-[#D4AF37] text-[#002845]" : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>
    </div>
  );
}
