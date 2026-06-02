"use client";

import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// Single button vocabulary for the admin redesign.
//
// Only FOUR variants. Anything in the admin surface that needs a
// "third primary button" is a UX bug — they all should look the
// same. Anything in the admin surface that needs more nuance can
// drop to ghost.
//
//   primary    — gold gradient on royal text. ONE per page section.
//   secondary  — royal outline on paper. Default "do a thing" button.
//   ghost      — transparent, royal text. Inline / table actions.
//   danger     — bad red. Confirm + destroy actions only.
// ─────────────────────────────────────────────────────────────────

export type BJButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type BJButtonSize = "sm" | "md" | "lg";

interface BJButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BJButtonVariant;
  size?: BJButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

const SIZE_CLS: Record<BJButtonSize, string> = {
  sm: "h-8  px-3   text-[12px] gap-1.5 rounded-bj-md",
  md: "h-10 px-4   text-[14px] gap-2   rounded-bj-md",
  lg: "h-12 px-5   text-[15px] gap-2.5 rounded-bj-md",
};

const VARIANT_CLS: Record<BJButtonVariant, string> = {
  primary:
    "bg-gradient-to-l from-brand-gold to-brand-gold-dark text-brand-royal font-bold shadow-card " +
    "hover:shadow-pop hover:brightness-[1.03] active:scale-[0.98] focus-visible:shadow-focus-gold",
  secondary:
    "bg-white text-brand-royal font-bold border border-brand-royal/15 shadow-card " +
    "hover:border-brand-royal/30 hover:bg-brand-paper active:scale-[0.99] focus-visible:shadow-focus-gold",
  ghost:
    "bg-transparent text-brand-royal font-semibold " +
    "hover:bg-brand-paper-2 active:scale-[0.99] focus-visible:shadow-focus-gold",
  danger:
    "bg-bad text-white font-bold shadow-card " +
    "hover:brightness-110 active:scale-[0.99] focus-visible:shadow-focus-gold",
};

export const BJButton = forwardRef<HTMLButtonElement, BJButtonProps>(function BJButton(
  {
    variant = "secondary",
    size = "md",
    loading,
    leadingIcon,
    trailingIcon,
    fullWidth,
    children,
    className = "",
    disabled,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center select-none whitespace-nowrap",
        "transition-[box-shadow,transform,background,border-color] duration-[180ms]",
        "outline-none focus-visible:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        SIZE_CLS[size],
        VARIANT_CLS[variant],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : leadingIcon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  );
});
