const express = require("express");
const router = express.Router();
const pricingService = require('../services/pricingService');
const { asyncHandler } = require('../middleware/asyncHandler');

router.get("/detect", asyncHandler(async (req, res) => {
  const clientIP = pricingService.getClientIP(req);
  
  if (clientIP === '::1' || clientIP === '127.0.0.1' || clientIP?.startsWith('192.168.') || clientIP?.startsWith('10.')) {
    const country = pricingService.getCountryInfo('SA');
    return res.json({ 
      country,
      detected: false,
      fallback: true,
      message: "تم استخدام الموقع الافتراضي (تطوير محلي)"
    });
  }

  const countryCode = await pricingService.getClientCountryFromIP(clientIP);
  const country = pricingService.getCountryInfo(countryCode);

  res.json({
    country,
    detected: true,
    ip: clientIP,
    international: countryCode === 'INT'
  });
}));

router.get("/countries", (req, res) => {
  res.json({ 
    countries: Object.values(pricingService.SUPPORTED_COUNTRIES)
  });
});

router.get("/exchange-rates", asyncHandler(async (req, res) => {
  const rates = await pricingService.getExchangeRates();
  res.json({ rates, cached: true });
}));

module.exports = router;
