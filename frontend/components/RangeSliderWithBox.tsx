"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type RangeSliderWithBoxProps = {
  label: string;
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  step?: number;
  suffix?: string;
};

export function RangeSliderWithBox({
  label,
  min,
  max,
  minValue,
  maxValue,
  onChange,
  step = 1000,
  suffix = "",
}: RangeSliderWithBoxProps) {
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
    if (value <= localMax) {
      setLocalMin(value);
      onChange(value, localMax);
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || max;
    if (value >= localMin) {
      setLocalMax(value);
      onChange(localMin, value);
    }
  };

  const handleInputChange = (type: "min" | "max", value: string) => {
    const num = parseInt(value) || 0;
    if (type === "min" && num <= localMax) {
      setLocalMin(num);
      onChange(num, localMax);
    } else if (type === "max" && num >= localMin) {
      setLocalMax(num);
      onChange(localMin, num);
    }
  };

  if (!mounted) return null;

  const minPercentage = getPercentage(localMin);
  const maxPercentage = getPercentage(localMax);

  return (
    <div className="flex flex-col gap-2" dir="rtl">
      {/* Top Label */}
      <label className="text-xs font-bold text-gray-700">{label}</label>

      {/* Display Box - مثل الصورة */}
      <div className="bg-blue-900 rounded-lg p-3 text-white flex justify-between items-center gap-4 h-16">
        <div className="flex-1 text-center border-r border-white/20">
          <div className="text-xs opacity-75 mb-1">أعلى سعر</div>
          <div className="font-bold text-base">
            {localMax.toLocaleString()}
          </div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs opacity-75 mb-1">أقل سعر</div>
          <div className="font-bold text-base">
            {localMin.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Slider Track */}
      <div className="relative h-8 flex items-center">
        {/* Circle Min */}
        <div
          className="absolute w-7 h-7 bg-blue-500 rounded-full shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform"
          style={{
            left: `calc(${minPercentage}% - 14px)`,
            zIndex: localMin > max - 100000 ? 5 : 3,
          }}
        />

        {/* Track Background */}
        <div className="w-full h-1 bg-gray-300 rounded-full">
          {/* Filled portion */}
          <div
            className="absolute h-1 bg-blue-500 rounded-full"
            style={{
              left: `${minPercentage}%`,
              right: `${100 - maxPercentage}%`,
            }}
          />
        </div>

        {/* Circle Max */}
        <div
          className="absolute w-7 h-7 bg-blue-500 rounded-full shadow-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform"
          style={{
            left: `calc(${maxPercentage}% - 14px)`,
            zIndex: localMax < min + 100000 ? 5 : 4,
          }}
        />

        {/* Hidden range inputs */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={handleMinChange}
          className="absolute w-full h-full opacity-0 cursor-pointer pointer-events-auto"
          ref={minInputRef}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={handleMaxChange}
          className="absolute w-full h-full opacity-0 cursor-pointer pointer-events-auto"
          ref={maxInputRef}
        />
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الحد الأدنى</label>
          <Input
            type="number"
            value={localMin}
            onChange={(e) => handleInputChange("min", e.target.value)}
            placeholder="0"
            className="text-right text-xs h-8"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الحد الأقصى</label>
          <Input
            type="number"
            value={localMax}
            onChange={(e) => handleInputChange("max", e.target.value)}
            placeholder={max.toString()}
            className="text-right text-xs h-8"
          />
        </div>
      </div>
    </div>
  );
}
