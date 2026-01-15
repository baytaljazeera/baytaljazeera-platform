import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 🎯 Centralized date formatting utility
 * Formats dates in Arabic with consistent format across the app
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Format date with time included
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Format relative time (e.g., "منذ 5 دقائق")
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "—";
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    
    return formatDate(dateStr);
  } catch {
    return "—";
  }
}

/**
 * 🎯 Centralized price formatting utility
 * Formats prices with proper Arabic formatting and currency
 */
export function formatPrice(
  price: number | string | null | undefined, 
  currency: string = "SAR"
): string {
  if (price === null || price === undefined || price === "") return "—";
  
  const numPrice = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(numPrice)) return "—";
  
  // Currency symbols mapping
  const currencySymbols: Record<string, string> = {
    SAR: "ر.س",
    AED: "د.إ",
    KWD: "د.ك",
    QAR: "ر.ق",
    BHD: "د.ب",
    OMR: "ر.ع",
    EGP: "ج.م",
    LBP: "ل.ل",
    TRY: "₺",
    USD: "$",
  };
  
  const symbol = currencySymbols[currency] || currency;
  
  // Format with thousands separator
  const formatted = numPrice.toLocaleString("ar-SA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  
  return `${formatted} ${symbol}`;
}

/**
 * Format compact price (e.g., 1.5M, 500K)
 */
export function formatCompactPrice(price: number | null | undefined): string {
  if (!price) return "—";
  
  if (price >= 1000000) {
    const m = price / 1000000;
    return m % 1 === 0 ? `${m.toFixed(0)}M` : `${m.toFixed(1)}M`;
  }
  if (price >= 1000) {
    const k = price / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}K` : `${k.toFixed(1)}K`;
  }
  return price.toString();
}

/**
 * 🎯 Centralized area formatting utility
 */
export function formatArea(area: number | string | null | undefined): string {
  if (area === null || area === undefined || area === "") return "—";
  
  const numArea = typeof area === "string" ? parseFloat(area) : area;
  if (isNaN(numArea)) return "—";
  
  return `${numArea.toLocaleString("ar-SA")} م²`;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string | null | undefined, maxLength: number = 50): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Generate initials from name
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "؟";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Sanitize phone number for display
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  // Remove all non-digits except +
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length < 9) return phone;
  return cleaned;
}
