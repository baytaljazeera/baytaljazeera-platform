"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type PriceRangeSliderProps = {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
};

export function PriceRangeSlider({
  min,
  max,
  minValue,
  maxValue,
  onChange,
}: PriceRangeSliderProps) {
  const [mounted, setMounted] = useState(false);
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getPercentage = (value: number) => {
    return ((value - min) / (max - min)) * 100;
  };

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    if (value < localMax) {
      setLocalMin(value);
      onChange(value, localMax);
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || max;
    if (value > localMin) {
      setLocalMax(value);
      onChange(localMin, value);
    }
  };

  const formatPrice = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  };

  if (!mounted) return null;

  const minPercentage = getPercentage(localMin);
  const maxPercentage = getPercentage(localMax);

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Bar Chart Visualization */}
      <div className="flex items-end justify-center h-20 gap-1 bg-gray-100 rounded-lg p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm transition-all ${
              i / 20 >= minPercentage / 100 && i / 20 <= maxPercentage / 100
                ? "bg-blue-500"
                : "bg-blue-200"
            }`}
            style={{
              height: `${Math.random() * 80 + 20}%`,
            }}
          />
        ))}
      </div>

      {/* Slider Container */}
      <div className="relative flex items-center gap-4">
        {/* Left Circle (Min) */}
        <div
          className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full shadow-lg border-2 border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
          style={{
            backgroundColor: "#2563eb",
          }}
        />

        {/* Slider Track */}
        <div className="flex-grow relative h-1 bg-blue-200 rounded-full">
          {/* Filled portion */}
          <div
            className="absolute h-full bg-blue-500 rounded-full"
            style={{
              left: `${minPercentage}%`,
              right: `${100 - maxPercentage}%`,
            }}
          />

          {/* Hidden range inputs for dragging */}
          <input
            type="range"
            min={min}
            max={max}
            value={localMin}
            onChange={handleMinChange}
            className="absolute w-full h-full opacity-0 cursor-pointer top-1/2 -translate-y-1/2 pointer-events-auto"
            style={{ zIndex: localMin > max - 100000 ? 5 : 3 }}
            ref={minInputRef}
          />
          <input
            type="range"
            min={min}
            max={max}
            value={localMax}
            onChange={handleMaxChange}
            className="absolute w-full h-full opacity-0 cursor-pointer top-1/2 -translate-y-1/2 pointer-events-auto"
            style={{ zIndex: localMax < min + 100000 ? 5 : 4 }}
            ref={maxInputRef}
          />
        </div>

        {/* Right Circle (Max) */}
        <div
          className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-full shadow-lg border-2 border-white flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
          style={{
            backgroundColor: "#2563eb",
          }}
        />
      </div>

      {/* Price Labels */}
      <div className="flex justify-between text-sm font-bold text-gray-700">
        <span>{formatPrice(localMin)}</span>
        <span>{formatPrice(localMax)}</span>
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            الحد الأدنى
          </label>
          <Input
            type="number"
            value={localMin}
            onChange={handleMinChange}
            placeholder="0"
            className="text-right"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">
            الحد الأقصى
          </label>
          <Input
            type="number"
            value={localMax}
            onChange={handleMaxChange}
            placeholder={max.toString()}
            className="text-right"
          />
        </div>
      </div>

      {/* Price Range Summary */}
      <div className="text-center text-sm font-semibold text-blue-600">
        {localMin.toLocaleString()} - {localMax.toLocaleString()} ريال
      </div>
    </div>
  );
}
