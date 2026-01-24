"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const sliderStyles = `
  .price-slider::-webkit-slider-thumb {
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    border: 3px solid #1e40af;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.4, 0.0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .price-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: scale(1.1);
  }
  
  .price-slider::-webkit-slider-thumb:active {
    transform: scale(0.95);
  }
  
  .price-slider::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: white;
    border: 3px solid #1e40af;
    cursor: pointer;
    transition: all 0.15s cubic-bezier(0.4, 0.0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  .price-slider::-moz-range-thumb:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transform: scale(1.1);
  }
  
  .price-slider::-moz-range-thumb:active {
    transform: scale(0.95);
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('price-slider-styles')) {
  const style = document.createElement('style');
  style.id = 'price-slider-styles';
  style.textContent = sliderStyles;
  document.head.appendChild(style);
}

type PriceSliderWithGradientProps = {
  label: string;
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
  step?: number;
};

export function PriceSliderWithGradient({
  label,
  min,
  max,
  minValue,
  maxValue,
  onChange,
  step = 50000,
}: PriceSliderWithGradientProps) {
  const [mounted, setMounted] = useState(false);
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMinChange = (value: number) => {
    if (value <= localMax) {
      setLocalMin(value);
      onChange(value, localMax);
    }
  };

  const handleMaxChange = (value: number) => {
    if (value >= localMin) {
      setLocalMax(value);
      onChange(localMin, value);
    }
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    handleMinChange(value);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || max;
    handleMaxChange(value);
  };

  const minPercentage = ((localMin - min) / (max - min)) * 100;
  const maxPercentage = ((localMax - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      {/* Top Label */}
      <label className="text-xs font-bold text-gray-700">{label}</label>

      {/* Gradient Bar with Min Price Display */}
      <div className="relative h-10 rounded-lg overflow-visible" dir="ltr">
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            background: `linear-gradient(to right, #ef4444, #eab308, #22c55e)`,
            width: "100%",
          }}
        />
        {/* Min Price Display on Bar */}
        <div
          className="absolute top-1/2 transform -translate-y-1/2 font-bold text-white text-xs drop-shadow-lg transition-all duration-200 whitespace-nowrap px-1 pointer-events-none"
          style={{
            left: `max(0px, calc(${minPercentage}% - 32px))`,
          }}
        >
          {localMin.toLocaleString()} ر.س
        </div>
      </div>

      {/* Display Box with Min/Max */}
      <div className="bg-blue-900 rounded-lg p-4 text-white flex justify-between items-center gap-4 h-20">
        <div className="flex-1 text-center border-r border-white/20">
          <div className="text-xs opacity-75 mb-1">أعلى سعر</div>
          <div className="font-bold text-2xl leading-tight">
            {localMax.toLocaleString()} ر.س
          </div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-xs opacity-75 mb-1">أقل سعر</div>
          <div className="font-bold text-2xl leading-tight">
            {localMin.toLocaleString()} ر.س
          </div>
        </div>
      </div>

      {/* Dual Range Sliders */}
      <div className="flex flex-col gap-2">
        {/* Min Slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMin}
          onChange={(e) => handleMinChange(parseInt(e.target.value))}
          className="price-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500"
          style={{
            background: `linear-gradient(to right, #ef4444 0%, #eab308 50%, #22c55e 100%)`,
          }}
        />

        {/* Max Slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={localMax}
          onChange={(e) => handleMaxChange(parseInt(e.target.value))}
          className="price-slider w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-500"
          style={{
            background: `linear-gradient(to right, #ef4444 0%, #eab308 50%, #22c55e 100%)`,
          }}
        />
      </div>

      {/* Input Fields */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الحد الأدنى</label>
          <Input
            type="number"
            value={localMin}
            onChange={handleMinInputChange}
            placeholder="0"
            className="text-right text-xs h-8 bg-blue-50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">الحد الأقصى</label>
          <Input
            type="number"
            value={localMax}
            onChange={handleMaxInputChange}
            placeholder={max.toString()}
            className="text-right text-xs h-8 bg-blue-50"
          />
        </div>
      </div>
    </div>
  );
}
