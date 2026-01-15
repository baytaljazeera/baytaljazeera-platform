"use client";

import { useRef, useState } from "react";

interface SliderInputProps {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  required?: boolean;
  error?: string;
  formatLabel?: (value: number) => string;
  unit?: string;
  quickValues?: number[];
}

export default function SliderInput({
  value,
  onChange,
  min: rawMin,
  max: rawMax,
  step = 1,
  label,
  required,
  error,
  formatLabel,
  unit = "",
  quickValues,
}: SliderInputProps) {
  const min = isNaN(rawMin) || rawMin === undefined ? 0 : rawMin;
  const max = isNaN(rawMax) || rawMax === undefined ? 100 : rawMax;
  const safeMax = max <= min ? min + 100 : max;
  
  const numValue = value === "" ? min : Number(value);
  const safeNumValue = isNaN(numValue) ? min : Math.max(min, Math.min(safeMax, numValue));
  const percentage = ((safeNumValue - min) / (safeMax - min)) * 100;
  const sliderRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    onChange(String(val));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "") {
      onChange("");
      return;
    }
    const num = Number(val);
    if (!isNaN(num)) {
      if (num > safeMax) {
        onChange(String(safeMax));
      } else if (num < min) {
        onChange(String(min));
      } else {
        onChange(val);
      }
    }
  };

  const handleQuickValue = (qv: number) => {
    onChange(String(qv));
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    const clickPercentage = (clickX / trackWidth) * 100;
    const newValue = min + ((safeMax - min) * clickPercentage) / 100;
    const steppedValue = Math.round(newValue / step) * step;
    const clampedValue = Math.max(min, Math.min(safeMax, steppedValue));
    onChange(String(clampedValue));
  };

  const displayValue = formatLabel ? formatLabel(safeNumValue) : `${safeNumValue.toLocaleString("en-US")} ${unit}`;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1 relative">
            <input
              type="number"
              value={value}
              onChange={handleInputChange}
              placeholder="0"
              min={min}
              max={safeMax}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 outline-none transition text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-white"
            />
          </div>
          {unit && (
            <span className="text-sm font-medium text-slate-500 min-w-[60px]">{unit}</span>
          )}
        </div>

        <div 
          ref={trackRef}
          className="relative py-4 cursor-pointer"
          onClick={handleTrackClick}
          dir="ltr"
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-[#B8860B] to-[#D4AF37] transition-all duration-150 rounded-full"
              style={{ width: `${percentage}%` }}
            />
          </div>

          <input
            ref={sliderRef}
            type="range"
            min={min}
            max={safeMax}
            step={step}
            value={safeNumValue}
            onChange={handleSliderChange}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            style={{ touchAction: 'none' }}
          />

          <div 
            className="absolute top-1/2 -translate-y-1/2 w-7 h-7 bg-white rounded-full border-4 border-[#D4AF37] shadow-lg pointer-events-none z-10 transition-transform duration-150 hover:scale-110"
            style={{ left: `calc(${percentage}% - 14px)` }}
          />

          {isDragging && (
            <div 
              className="absolute -top-10 transform -translate-x-1/2 bg-[#002845] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-30"
              style={{ left: `${percentage}%` }}
            >
              {displayValue}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#002845]"></div>
            </div>
          )}
        </div>

        <div className="flex justify-between text-xs text-slate-400 mt-1 px-1" dir="ltr">
          <span>{min.toLocaleString("en-US")}</span>
          <span>{safeMax.toLocaleString("en-US")}</span>
        </div>

        {quickValues && quickValues.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
            <span className="text-xs text-slate-500 w-full mb-1">قيم سريعة:</span>
            {quickValues.filter(qv => !isNaN(qv) && qv !== undefined).map((qv, index) => {
              let displayText = qv.toLocaleString("en-US");
              if (qv >= 1000000000) {
                displayText = `${(qv / 1000000000)} مليار`;
              } else if (qv >= 1000000) {
                displayText = `${(qv / 1000000)} مليون`;
              } else if (qv >= 1000) {
                displayText = `${(qv / 1000)} ألف`;
              }
              return (
                <button
                  key={`quick-${index}-${qv}`}
                  type="button"
                  onClick={() => handleQuickValue(qv)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    safeNumValue === qv
                      ? "bg-[#D4AF37] text-white"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-[#D4AF37] hover:text-[#D4AF37]"
                  }`}
                >
                  {displayText}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {formatLabel && value !== "" && safeNumValue > 0 && (
        <p className="text-center text-sm text-[#D4AF37] font-medium mt-2">{displayValue}</p>
      )}

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  );
}
