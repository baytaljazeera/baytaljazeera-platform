const express = require("express");
const router = express.Router();
const db = require("../db");
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const { asyncHandler } = require('../middleware/asyncHandler');

router.get("/", asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT currency_code, currency_name_ar, rate_to_usd, rate_from_usd, updated_at
    FROM exchange_rates
    ORDER BY currency_code
  `);
  res.json({
    success: true,
    rates: result.rows,
    lastUpdated: result.rows[0]?.updated_at || null,
  });
}));

router.get("/convert", asyncHandler(async (req, res) => {
  const { amount, from, to } = req.query;
  
  if (!amount || !from || !to) {
    return res.status(400).json({
      success: false,
      message: "يجب تحديد المبلغ والعملة المصدر والعملة الهدف",
    });
  }
  
  const fromRate = await db.query(
    "SELECT rate_to_usd FROM exchange_rates WHERE currency_code = $1",
    [from.toUpperCase()]
  );
  const toRate = await db.query(
    "SELECT rate_from_usd FROM exchange_rates WHERE currency_code = $1",
    [to.toUpperCase()]
  );
  
  if (fromRate.rows.length === 0 || toRate.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: "عملة غير مدعومة",
    });
  }
  
  const amountInUsd = parseFloat(amount) * parseFloat(fromRate.rows[0].rate_to_usd);
  const convertedAmount = amountInUsd * parseFloat(toRate.rows[0].rate_from_usd);
  
  res.json({
    success: true,
    originalAmount: parseFloat(amount),
    originalCurrency: from.toUpperCase(),
    convertedAmount: Math.round(convertedAmount * 100) / 100,
    targetCurrency: to.toUpperCase(),
    usdAmount: Math.round(amountInUsd * 100) / 100,
  });
}));

router.post("/refresh", authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { updateExchangeRates } = require("../scheduler/tasks");
  const updated = await updateExchangeRates();
  
  res.json({
    success: true,
    message: `تم تحديث ${updated} سعر صرف`,
    updatedCount: updated,
  });
}));

module.exports = router;
