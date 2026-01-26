"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TouchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
}

export default function TouchButton({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  className,
  disabled,
  ...props
}: TouchButtonProps) {
  const baseStyles = "touch-manipulation transition-all duration-200 font-semibold rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-[#001A33] hover:from-[#B8860B] hover:to-[#D4AF37] focus:ring-[#D4AF37] active:scale-95",
    secondary: "bg-gradient-to-r from-[#003366] to-[#001A33] text-white hover:from-[#001A33] hover:to-[#003366] focus:ring-[#003366] active:scale-95",
    outline: "border-2 border-[#003366] text-[#003366] hover:bg-[#003366] hover:text-white focus:ring-[#003366] active:scale-95",
    ghost: "text-[#003366] hover:bg-slate-100 focus:ring-slate-300 active:scale-95",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:scale-95",
  };

  const sizes = {
    sm: "min-h-[44px] px-4 py-2 text-mobile-sm",
    md: "min-h-[48px] px-6 py-3 text-mobile-base",
    lg: "min-h-[56px] px-8 py-4 text-mobile-lg",
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          جاري التحميل...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
