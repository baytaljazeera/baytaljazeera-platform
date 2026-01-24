const db = require('../db');

const SUPPORTED_COUNTRIES = {
  SA: { code: 'SA', name_ar: 'السعودية', currency_code: 'SAR', symbol: 'ر.س', lat: 24.7136, lng: 46.6753, zoom: 6 },
  AE: { code: 'AE', name_ar: 'الإمارات', currency_code: 'AED', symbol: 'د.إ', lat: 25.2048, lng: 55.2708, zoom: 8 },
  QA: { code: 'QA', name_ar: 'قطر', currency_code: 'QAR', symbol: 'ر.ق', lat: 25.2867, lng: 51.5333, zoom: 9 },
  KW: { code: 'KW', name_ar: 'الكويت', currency_code: 'KWD', symbol: 'د.ك', lat: 29.3759, lng: 47.9774, zoom: 9 },
  OM: { code: 'OM', name_ar: 'عمان', currency_code: 'OMR', symbol: 'ر.ع', lat: 23.5859, lng: 58.4059, zoom: 7 },
  BH: { code: 'BH', name_ar: 'البحرين', currency_code: 'BHD', symbol: 'د.ب', lat: 26.0667, lng: 50.5577, zoom: 10 },
  EG: { code: 'EG', name_ar: 'مصر', currency_code: 'EGP', symbol: 'ج.م', lat: 30.0444, lng: 31.2357, zoom: 6 },
  TR: { code: 'TR', name_ar: 'تركيا', currency_code: 'TRY', symbol: '₺', lat: 39.9334, lng: 32.8597, zoom: 6 },
  LB: { code: 'LB', name_ar: 'لبنان', currency_code: 'LBP', symbol: 'ل.ل', lat: 33.8938, lng: 35.5018, zoom: 8 }
};

// المنظر الحيادي: يُظهر السعودية ومصر وتركيا معاً للزوار من خارج الدول التسع
const INTERNATIONAL = { code: 'INT', name_ar: 'دولي', currency_code: 'USD', symbol: '$', lat: 28.5, lng: 42.0, zoom: 4 };

const DEFAULT_EXCHANGE_RATES = {
  SAR: 1,
  USD: 3.75,
  AED: 1.02,
  QAR: 1.027,
  KWD: 12.2,
  OMR: 9.74,
  BHD: 9.97,
  EGP: 0.076,
  TRY: 0.11,
  LBP: 0.000042
};

let exchangeRatesCache = null;
let exchangeRatesCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getExchangeRates() {
  const now = Date.now();
  if (exchangeRatesCache && (now - exchangeRatesCacheTime) < CACHE_TTL) {
    return exchangeRatesCache;
  }

  const rates = { ...DEFAULT_EXCHANGE_RATES };
  
  try {
    // الجدول يستخدم rate_to_usd (كم دولار = 1 عملة محلية)
    // نحتاج تحويلها إلى rate_to_sar (كم ريال = 1 عملة محلية)
    // rate_to_sar = rate_to_usd * 3.75 (سعر الدولار بالريال)
    const result = await db.query('SELECT currency_code, rate_to_usd FROM exchange_rates');
    const usdToSar = 3.75; // سعر الدولار الثابت بالريال
    
    for (const row of result.rows) {
      const rateToUsd = parseFloat(row.rate_to_usd);
      if (rateToUsd > 0) {
        // rate_to_usd = كم دولار للعملة الواحدة
        // rate_to_sar = rate_to_usd * 3.75
        rates[row.currency_code] = rateToUsd * usdToSar;
      }
    }
  } catch (err) {
    console.error('Error fetching exchange rates:', err);
  }
  
  exchangeRatesCache = rates;
  exchangeRatesCacheTime = now;
  return rates;
}

function isCountrySupported(countryCode) {
  return countryCode && SUPPORTED_COUNTRIES[countryCode.toUpperCase()];
}

function getCountryInfo(countryCode) {
  const code = countryCode?.toUpperCase();
  return SUPPORTED_COUNTRIES[code] || INTERNATIONAL;
}

async function convertPrice(amountInSAR, targetCurrency) {
  if (!amountInSAR || amountInSAR <= 0) return 0;
  if (targetCurrency === 'SAR') return amountInSAR;
  
  const rates = await getExchangeRates();
  const rate = rates[targetCurrency] || 1;
  
  return amountInSAR / rate;
}

async function convertPriceToSAR(amount, fromCurrency) {
  if (!amount || amount <= 0) return 0;
  if (fromCurrency === 'SAR') return amount;
  
  const rates = await getExchangeRates();
  const rate = rates[fromCurrency] || 1;
  
  return amount * rate;
}

function roundPrice(amount, currencyCode) {
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
      return Math.round(amount / 1000000) * 1000000;
      
    case 'TRY':
      if (amount >= 100000) return Math.round(amount / 10000) * 10000;
      if (amount >= 10000) return Math.round(amount / 1000) * 1000;
      return Math.round(amount / 100) * 100;
      
    case 'USD':
      return Math.round(amount * 100) / 100;
      
    default:
      return Math.round(amount);
  }
}

function formatPrice(amount, currencyCode, locale = 'ar-SA') {
  const country = Object.values(SUPPORTED_COUNTRIES).find(c => c.currency_code === currencyCode);
  const symbol = country?.symbol || (currencyCode === 'USD' ? '$' : currencyCode);
  
  const rounded = roundPrice(amount, currencyCode);
  const formatted = rounded.toLocaleString(locale, { maximumFractionDigits: currencyCode === 'USD' ? 2 : 0 });
  
  return `${formatted} ${symbol}`;
}

async function calculatePlanPricing(plan, countryCode) {
  const country = getCountryInfo(countryCode);
  const currencyCode = country.currency_code;
  const rates = await getExchangeRates();
  
  const basePriceSAR = parseFloat(plan.price || plan.monthly_price || 0);
  
  let localPrice;
  if (currencyCode === 'SAR') {
    localPrice = basePriceSAR;
  } else {
    const rate = rates[currencyCode] || 1;
    localPrice = basePriceSAR / rate;
  }
  
  const roundedPrice = roundPrice(localPrice, currencyCode);
  
  return {
    price_sar: basePriceSAR,
    price_local: roundedPrice,
    currency_code: currencyCode,
    currency_symbol: country.symbol,
    formatted_price: formatPrice(roundedPrice, currencyCode),
    country_code: country.code,
    country_name: country.name_ar
  };
}

async function calculateEliteSlotPricing(slot, countryCode) {
  const country = getCountryInfo(countryCode);
  const currencyCode = country.currency_code;
  const rates = await getExchangeRates();
  
  const basePriceSAR = parseFloat(slot.base_price || 0);
  
  let localPrice;
  if (currencyCode === 'SAR') {
    localPrice = basePriceSAR;
  } else {
    const rate = rates[currencyCode] || 1;
    localPrice = basePriceSAR / rate;
  }
  
  const roundedPrice = roundPrice(localPrice, currencyCode);
  
  return {
    price_sar: basePriceSAR,
    price_local: roundedPrice,
    total_amount: roundedPrice,
    currency_code: currencyCode,
    currency_symbol: country.symbol,
    formatted_price: formatPrice(roundedPrice, currencyCode)
  };
}

async function getClientCountryFromIP(ip) {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return 'SA';
  }

  try {
    const apiKey = process.env.IP_API_KEY || '';
    const url = apiKey 
      ? `https://pro.ip-api.com/json/${ip}?fields=status,countryCode&key=${apiKey}`
      : `http://ip-api.com/json/${ip}?fields=status,countryCode`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'success' && data.countryCode) {
      const code = data.countryCode.toUpperCase();
      return isCountrySupported(code) ? code : 'INT';
    }
  } catch (err) {
    console.error('IP detection error:', err);
  }

  return 'INT';
}

function getClientIP(req) {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.socket?.remoteAddress ||
         req.ip;
}

module.exports = {
  SUPPORTED_COUNTRIES,
  INTERNATIONAL,
  getExchangeRates,
  isCountrySupported,
  getCountryInfo,
  convertPrice,
  convertPriceToSAR,
  roundPrice,
  formatPrice,
  calculatePlanPricing,
  calculateEliteSlotPricing,
  getClientCountryFromIP,
  getClientIP
};
