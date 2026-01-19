import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CurrencyInfo {
  code: string;
  name_ar: string;
  name_en: string;
  symbol: string;
  exchange_rate: number;
}

interface GeoState {
  country_code: string;
  country_name_ar: string;
  country_name_en: string;
  country_flag: string;
  currency: CurrencyInfo;
  isLoading: boolean;
  isDetected: boolean;
  
  detectLocation: () => Promise<void>;
  formatPrice: (priceInSAR: number, showOriginal?: boolean) => string;
  formatLocalPrice: (amount: number) => string;
}

const DEFAULT_CURRENCY: CurrencyInfo = {
  code: 'SAR',
  name_ar: 'ريال سعودي',
  name_en: 'Saudi Riyal',
  symbol: 'ر.س',
  exchange_rate: 1.0
};

function roundPrice(amount: number, currencyCode: string): number {
  if (amount <= 0) return 0;
  
  switch (currencyCode) {
    case 'SAR':
    case 'QAR':
    case 'OMR':
      if (amount >= 100000) return Math.round(amount / 10000) * 10000;
      if (amount >= 10000) return Math.round(amount / 1000) * 1000;
      if (amount >= 1000) return Math.round(amount / 100) * 100;
      return Math.round(amount / 10) * 10;
      
    case 'KWD':
    case 'BHD':
      if (amount >= 10000) return Math.round(amount / 100) * 100;
      if (amount >= 1000) return Math.round(amount / 10) * 10;
      return Math.round(amount);
      
    case 'EGP':
      if (amount >= 1000000) return Math.round(amount / 100000) * 100000;
      if (amount >= 100000) return Math.round(amount / 10000) * 10000;
      if (amount >= 10000) return Math.round(amount / 1000) * 1000;
      return Math.round(amount / 100) * 100;
      
    case 'LBP':
      if (amount >= 1000000000) return Math.round(amount / 100000000) * 100000000;
      if (amount >= 100000000) return Math.round(amount / 10000000) * 10000000;
      if (amount >= 10000000) return Math.round(amount / 1000000) * 1000000;
      return Math.round(amount / 100000) * 100000;
      
    case 'TRY':
      if (amount >= 1000000) return Math.round(amount / 100000) * 100000;
      if (amount >= 100000) return Math.round(amount / 10000) * 10000;
      if (amount >= 10000) return Math.round(amount / 1000) * 1000;
      return Math.round(amount / 100) * 100;
      
    case 'USD':
      return Math.round(amount * 100) / 100;
      
    default:
      return Math.round(amount);
  }
}

export const useCurrencyStore = create<GeoState>()(
  persist(
    (set, get) => ({
      country_code: 'SA',
      country_name_ar: 'السعودية',
      country_name_en: 'Saudi Arabia',
      country_flag: '🇸🇦',
      currency: DEFAULT_CURRENCY,
      isLoading: false,
      isDetected: false,

      detectLocation: async () => {
        if (get().isDetected) return;
        
        set({ isLoading: true });
        try {
          const res = await fetch('/api/geo/detect', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            set({
              country_code: data.country_code,
              country_name_ar: data.country_name_ar,
              country_name_en: data.country_name_en,
              country_flag: data.country_flag,
              currency: data.currency,
              isDetected: true,
              isLoading: false
            });
          } else {
            set({ isLoading: false, isDetected: true });
          }
        } catch (err) {
          console.error('Failed to detect location:', err);
          set({ isLoading: false, isDetected: true });
        }
      },

      formatPrice: (priceInSAR: number, showOriginal = false) => {
        const { currency } = get();
        
        if (currency.code === 'SAR' || currency.exchange_rate <= 0) {
          const rounded = roundPrice(priceInSAR, 'SAR');
          return `${rounded.toLocaleString('ar-SA')} ${currency.symbol}`;
        }
        
        const converted = priceInSAR / currency.exchange_rate;
        const rounded = roundPrice(converted, currency.code);
        
        let result = `${rounded.toLocaleString('ar-SA')} ${currency.symbol}`;
        
        if (showOriginal) {
          const originalRounded = roundPrice(priceInSAR, 'SAR');
          result += ` (${originalRounded.toLocaleString('ar-SA')} ر.س)`;
        }
        
        return result;
      },

      formatLocalPrice: (amount: number) => {
        const { currency } = get();
        const rounded = roundPrice(amount, currency.code);
        return `${rounded.toLocaleString('ar-SA')} ${currency.symbol}`;
      }
    }),
    {
      name: 'aqar-currency-storage',
      partialize: (state) => ({
        country_code: state.country_code,
        country_name_ar: state.country_name_ar,
        country_name_en: state.country_name_en,
        country_flag: state.country_flag,
        currency: state.currency,
        isDetected: state.isDetected
      })
    }
  )
);

export function formatListingPriceByCountry(price: number | null | undefined, currencySymbol?: string): string {
  if (price == null) return "السعر غير محدد";
  const rounded = roundPrice(price, 'SAR');
  return `${rounded.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ${currencySymbol || 'ر.س'}`;
}

export function getCurrencySymbol(currencyCode?: string): string {
  const symbols: { [key: string]: string } = {
    SAR: 'ر.س',
    QAR: 'ر.ق',
    KWD: 'د.ك',
    OMR: 'ر.ع',
    BHD: 'د.ب',
    AED: 'د.إ',
    EGP: 'ج.م',
    TRY: '₺',
    LBP: 'ل.ل',
    USD: '$'
  };
  return symbols[currencyCode || 'SAR'] || 'ر.س';
}

export function getCurrencyCodeByCountry(countryNameOrCode?: string): string {
  if (!countryNameOrCode) return 'SAR';
  const countryToCurrency: { [key: string]: string } = {
    'السعودية': 'SAR',
    'Saudi Arabia': 'SAR',
    'SA': 'SAR',
    'الإمارات': 'AED',
    'UAE': 'AED',
    'AE': 'AED',
    'الكويت': 'KWD',
    'Kuwait': 'KWD',
    'KW': 'KWD',
    'قطر': 'QAR',
    'Qatar': 'QAR',
    'QA': 'QAR',
    'البحرين': 'BHD',
    'Bahrain': 'BHD',
    'BH': 'BHD',
    'عمان': 'OMR',
    'Oman': 'OMR',
    'OM': 'OMR',
    'مصر': 'EGP',
    'Egypt': 'EGP',
    'EG': 'EGP',
    'لبنان': 'LBP',
    'Lebanon': 'LBP',
    'LB': 'LBP',
    'تركيا': 'TRY',
    'Turkey': 'TRY',
    'TR': 'TRY',
  };
  return countryToCurrency[countryNameOrCode] || 'SAR';
}
