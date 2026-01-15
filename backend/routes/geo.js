const express = require('express');
const router = express.Router();
const db = require('../db');
const pricingService = require('../services/pricingService');
const { asyncHandler } = require('../middleware/asyncHandler');

router.get('/detect', asyncHandler(async (req, res) => {
  const clientIP = pricingService.getClientIP(req);
  const manualCountry = req.query.country || req.cookies?.user_country;
  
  let countryCode;
  if (manualCountry && pricingService.isCountrySupported(manualCountry)) {
    countryCode = manualCountry.toUpperCase();
  } else if (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP?.startsWith('192.168.') || clientIP?.startsWith('10.')) {
    countryCode = 'SA';
  } else {
    countryCode = await pricingService.getClientCountryFromIP(clientIP);
  }
  
  const countryInfo = pricingService.getCountryInfo(countryCode);
  const rates = await pricingService.getExchangeRates();
  
  const result = await db.query(
    `SELECT name_ar, name_en, flag_emoji FROM countries WHERE code = $1`,
    [countryCode]
  );
  
  const country = result.rows[0] || { name_ar: countryInfo.name_ar, name_en: 'Saudi Arabia', flag_emoji: '🇸🇦' };
  
  res.json({
    detected_ip: clientIP,
    country_code: countryCode,
    country_name_ar: country.name_ar,
    country_name_en: country.name_en,
    country_flag: country.flag_emoji,
    currency: {
      code: countryInfo.currency_code,
      name_ar: countryInfo.name_ar,
      name_en: country.name_en,
      symbol: countryInfo.symbol,
      exchange_rate: rates[countryInfo.currency_code] || 1
    }
  });
}));

router.post('/set-country', asyncHandler(async (req, res) => {
  const { country_code } = req.body;
  
  if (!country_code || !pricingService.isCountrySupported(country_code)) {
    return res.status(400).json({ error: 'رمز الدولة غير صالح', errorEn: 'Invalid country code' });
  }
  
  res.cookie('user_country', country_code.toUpperCase(), {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });
  
  res.json({ success: true, country_code: country_code.toUpperCase() });
}));

router.get('/currencies', asyncHandler(async (req, res) => {
  const rates = await pricingService.getExchangeRates();
  const currencies = Object.entries(pricingService.SUPPORTED_COUNTRIES).map(([code, info]) => ({
    country_code: code,
    currency_code: info.currency_code,
    currency_symbol: info.symbol,
    country_name_ar: info.name_ar,
    exchange_rate: rates[info.currency_code] || 1
  }));
  
  currencies.push({
    country_code: 'INT',
    currency_code: 'USD',
    currency_symbol: '$',
    country_name_ar: 'دولي',
    exchange_rate: rates['USD'] || 3.75
  });
  
  res.json({ currencies });
}));

router.get('/convert', asyncHandler(async (req, res) => {
  const { amount, to_currency } = req.query;
  
  if (!amount || isNaN(parseFloat(amount))) {
    return res.status(400).json({ error: 'المبلغ غير صالح', errorEn: 'Invalid amount' });
  }
  
  const sarAmount = parseFloat(amount);
  const targetCurrency = to_currency?.toUpperCase() || 'SAR';
  
  const convertedAmount = await pricingService.convertPrice(sarAmount, targetCurrency);
  const roundedAmount = pricingService.roundPrice(convertedAmount, targetCurrency);
  
  const countryInfo = Object.values(pricingService.SUPPORTED_COUNTRIES)
    .find(c => c.currency_code === targetCurrency) || pricingService.INTERNATIONAL;
  
  const rates = await pricingService.getExchangeRates();
  
  res.json({
    original_amount: sarAmount,
    original_currency: 'SAR',
    converted_amount: roundedAmount,
    target_currency: targetCurrency,
    exchange_rate: rates[targetCurrency] || 1,
    formatted: pricingService.formatPrice(roundedAmount, targetCurrency)
  });
}));

router.get('/exchange-rates', asyncHandler(async (req, res) => {
  const rates = await pricingService.getExchangeRates();
  res.json({ rates, updated: true });
}));

module.exports = router;
