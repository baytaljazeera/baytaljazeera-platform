const db = require('../db');

const DEFAULT_TAX_RATES = {
  SA: { rate: 15.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  AE: { rate: 5.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  KW: { rate: 0.00, name: 'None', nameAr: 'لا توجد ضريبة' },
  QA: { rate: 0.00, name: 'None', nameAr: 'لا توجد ضريبة' },
  BH: { rate: 10.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  OM: { rate: 5.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  EG: { rate: 14.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  LB: { rate: 11.00, name: 'VAT', nameAr: 'ضريبة القيمة المضافة' },
  TR: { rate: 18.00, name: 'KDV', nameAr: 'ضريبة القيمة المضافة' }
};

async function getTaxRule(countryCode) {
  try {
    const result = await db.query(`
      SELECT * FROM country_tax_rules WHERE country_code = $1 AND is_active = true
    `, [countryCode]);
    
    if (result.rows[0]) {
      return {
        countryCode: result.rows[0].country_code,
        countryNameAr: result.rows[0].country_name_ar,
        taxRate: parseFloat(result.rows[0].tax_rate),
        taxName: result.rows[0].tax_name,
        taxNameAr: result.rows[0].tax_name_ar
      };
    }
  } catch (err) {
    console.error('Error fetching tax rule:', err.message);
  }
  
  const defaultRule = DEFAULT_TAX_RATES[countryCode] || DEFAULT_TAX_RATES.SA;
  return {
    countryCode,
    countryNameAr: getCountryNameAr(countryCode),
    taxRate: defaultRule.rate,
    taxName: defaultRule.name,
    taxNameAr: defaultRule.nameAr
  };
}

async function getAllTaxRules() {
  const result = await db.query(`
    SELECT * FROM country_tax_rules ORDER BY country_code
  `);
  return result.rows;
}

async function updateTaxRule(countryCode, taxRate, notes = null) {
  const result = await db.query(`
    UPDATE country_tax_rules 
    SET tax_rate = $1, notes = $2, updated_at = NOW()
    WHERE country_code = $3
    RETURNING *
  `, [taxRate, notes, countryCode]);
  return result.rows[0];
}

function calculateTax(subtotal, taxRate) {
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;
  
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    taxRate: parseFloat(taxRate.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  };
}

async function calculateFullPricing(subtotal, countryCode, isTaxExempt = false) {
  const taxRule = await getTaxRule(countryCode);
  
  if (isTaxExempt) {
    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxRate: 0,
      taxAmount: 0,
      total: parseFloat(subtotal.toFixed(2)),
      countryCode: taxRule.countryCode,
      countryNameAr: taxRule.countryNameAr,
      taxName: 'N/A',
      taxNameAr: 'لا ينطبق',
      isTaxExempt: true
    };
  }
  
  const taxCalculation = calculateTax(subtotal, taxRule.taxRate);
  
  return {
    ...taxCalculation,
    countryCode: taxRule.countryCode,
    countryNameAr: taxRule.countryNameAr,
    taxName: taxRule.taxName,
    taxNameAr: taxRule.taxNameAr,
    isTaxExempt: false
  };
}

function getCountryNameAr(code) {
  const names = {
    SA: 'السعودية',
    AE: 'الإمارات',
    KW: 'الكويت',
    QA: 'قطر',
    BH: 'البحرين',
    OM: 'عمان',
    EG: 'مصر',
    LB: 'لبنان',
    TR: 'تركيا'
  };
  return names[code] || 'غير محدد';
}

function formatTaxBreakdown(pricing, currencySymbol = 'ر.س') {
  let taxDisplay = '-';
  let taxLabel = pricing.taxNameAr || 'رسوم إضافية';
  
  if (pricing.isTaxExempt) {
    taxDisplay = '-';
    taxLabel = 'لا ينطبق';
  } else if (pricing.taxRate > 0) {
    taxDisplay = `${pricing.taxAmount.toLocaleString('ar-SA')} ${currencySymbol} (${pricing.taxRate}%)`;
  }
  
  return {
    subtotalDisplay: `${pricing.subtotal.toLocaleString('ar-SA')} ${currencySymbol}`,
    taxDisplay,
    totalDisplay: `${pricing.total.toLocaleString('ar-SA')} ${currencySymbol}`,
    taxLabel,
    isTaxExempt: pricing.isTaxExempt || false
  };
}

module.exports = {
  getTaxRule,
  getAllTaxRules,
  updateTaxRule,
  calculateTax,
  calculateFullPricing,
  getCountryNameAr,
  formatTaxBreakdown,
  DEFAULT_TAX_RATES
};
