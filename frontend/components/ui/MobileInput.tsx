"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface MobileInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(
  ({ label, error, helperText, fullWidth = true, className, ...props }, ref) => {
    return (
      <div className={cn("flex flex-col gap-2", fullWidth && "w-full")}>
        {label && (
          <label className="text-mobile-sm font-semibold text-[#003366]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "min-h-[48px] px-4 py-3 text-mobile-base",
            "border-2 rounded-xl",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            "transition-all duration-200",
            "touch-manipulation",
            error
              ? "border-red-500 focus:ring-red-500 focus:border-red-600"
              : "border-slate-300 focus:ring-[#D4AF37] focus:border-[#D4AF37]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
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

MobileInput.displayName = "MobileInput";

export default MobileInput;
