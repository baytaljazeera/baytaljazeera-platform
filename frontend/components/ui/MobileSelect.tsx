"use client";

import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface MobileSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
}

const MobileSelect = forwardRef<HTMLSelectElement, MobileSelectProps>(
  ({ label, error, helperText, options, fullWidth = true, className, ...props }, ref) => {
    return (
      <div className={cn("flex flex-col gap-2", fullWidth && "w-full")}>
        {label && (
          <label className="text-mobile-sm font-semibold text-[#003366]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            "min-h-[48px] px-4 py-3 text-mobile-base",
            "border-2 rounded-xl",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            "transition-all duration-200",
            "touch-manipulation",
            "appearance-none bg-white",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E')] bg-[length:1.5em_1.5em] bg-[right_0.75rem_center] bg-no-repeat",
            "[dir='rtl']&:bg-[left_0.75rem_center]",
            error
              ? "border-red-500 focus:ring-red-500 focus:border-red-600"
              : "border-slate-300 focus:ring-[#D4AF37] focus:border-[#D4AF37]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="text-mobile-sm text-red-600 flex items-center gap-1">
            <span>⚠️</span>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-mobile-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

MobileSelect.displayName = "MobileSelect";

export default MobileSelect;
