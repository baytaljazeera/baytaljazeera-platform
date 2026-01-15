"use client";

import { formatPrice, formatCompactPrice } from "@/lib/utils";

interface FormattedPriceProps {
  price: number | string | null | undefined;
  currency?: string;
  compact?: boolean;
  className?: string;
}

export function FormattedPrice({ 
  price, 
  currency = "SAR", 
  compact = false,
  className = "" 
}: FormattedPriceProps) {
  const formatted = compact 
    ? formatCompactPrice(typeof price === "string" ? parseFloat(price) : price ?? undefined)
    : formatPrice(price, currency);
  
  return <span className={className}>{formatted}</span>;
}

export default FormattedPrice;
