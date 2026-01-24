const express = require('express');
const router = express.Router();
const workflowService = require('../services/workflowService');
const taxService = require('../services/taxService');
const invoiceService = require('../services/invoiceService');
const pricingService = require('../services/pricingService');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../utils/queryHelpers');
const db = require('../db');

router.post('/create', authMiddleware, asyncHandler(async (req, res) => {
  const { propertyId, countryCode = 'SA', currencyCode = 'SAR', currencySymbol = 'ر.س' } = req.body;
  
  if (!propertyId) {
    return res.status(400).json({ error: 'معرف العقار مطلوب' });
  }
  
  const property = await db.query('SELECT * FROM properties WHERE id = $1 AND user_id = $2', [propertyId, req.user.id]);
  if (!property.rows[0]) {
    return res.status(404).json({ error: 'العقار غير موجود' });
  }
  
  const workflow = await workflowService.createWorkflow(propertyId, countryCode, currencyCode, currencySymbol);
  res.json({ workflow, message: 'تم إنشاء مسار الإعلان' });
}));

router.get('/property/:propertyId', authMiddleware, asyncHandler(async (req, res) => {
  const { propertyId } = req.params;
  
  const workflow = await workflowService.getWorkflow(propertyId);
  if (!workflow) {
    return res.status(404).json({ error: 'لا يوجد مسار لهذا الإعلان' });
  }
  
  const auditLog = await workflowService.getAuditLog(propertyId, 20);
  
  res.json({ workflow, auditLog });
}));

router.get('/property/:propertyId/audit', authMiddleware, asyncHandler(async (req, res) => {
  const { propertyId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  
  const auditLog = await workflowService.getAuditLog(propertyId, limit);
  res.json({ auditLog });
}));

router.post('/calculate-pricing', authMiddleware, asyncHandler(async (req, res) => {
  const { planId, countryCode = 'SA', isTaxExempt = false } = req.body;
  
  let subtotal = 0;
  let currencyCode = 'SAR';
  let currencySymbol = 'ر.س';
  let planName = '';
  
  if (planId) {
    const planResult = await db.query('SELECT * FROM plans WHERE id = $1', [planId]);
    if (planResult.rows[0]) {
      const plan = planResult.rows[0];
      subtotal = parseFloat(plan.price);
      planName = plan.name_ar;
      
      const countryPricing = await pricingService.getPlanPriceByCountry(planId, countryCode);
      if (countryPricing) {
        subtotal = parseFloat(countryPricing.price);
        currencyCode = countryPricing.currency_code;
        currencySymbol = countryPricing.currency_symbol;
      }
    }
  }
  
  const pricing = await taxService.calculateFullPricing(subtotal, countryCode, isTaxExempt);
  const breakdown = taxService.formatTaxBreakdown(pricing, currencySymbol);
  
  res.json({
    planName,
    countryCode,
    currencyCode,
    currencySymbol,
    isTaxExempt,
    pricing,
    breakdown
  });
}));

router.post('/generate-invoice', authMiddleware, asyncHandler(async (req, res) => {
  const { 
    planId, propertyId, workflowId, 
    countryCode = 'SA', currencyCode = 'SAR', currencySymbol = 'ر.س',
    subtotal, description 
  } = req.body;
  
  if (!subtotal || subtotal <= 0) {
    return res.status(400).json({ error: 'المبلغ غير صالح' });
  }
  
  const invoice = await invoiceService.createInvoice({
    userId: req.user.id,
    type: planId ? 'subscription' : 'listing',
    planId,
    propertyId,
    workflowId,
    countryCode,
    currencyCode,
    currencySymbol,
    subtotal,
    description
  });
  
  if (workflowId) {
    await workflowService.linkInvoice(workflowId, invoice.id);
    await workflowService.updateWorkflowStatus(workflowId, 'pending_payment', req.user.id);
  }
  
  res.json({ 
    invoice, 
    message: 'تم إنشاء الفاتورة بنجاح',
    invoiceNumber: invoice.invoice_number 
  });
}));

router.get('/invoice/:invoiceId', authMiddleware, asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  const invoice = await invoiceService.getInvoice(invoiceId);
  if (!invoice) {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }
  
  if (invoice.user_id !== req.user.id && !['super_admin', 'finance_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }
  
  res.json({ invoice });
}));

router.get('/invoice/:invoiceId/html', authMiddleware, asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;
  
  const invoice = await invoiceService.getInvoice(invoiceId);
  if (!invoice) {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }
  
  if (invoice.user_id !== req.user.id && !['super_admin', 'finance_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'غير مصرح' });
  }
  
  const html = invoiceService.generateInvoiceHTML(invoice);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

router.get('/my-invoices', authMiddleware, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  
  const result = await invoiceService.getUserInvoices(req.user.id, page, limit);
  res.json(result);
}));

router.get('/tax-rules', asyncHandler(async (req, res) => {
  const countryCode = req.query.country || 'SA';
  const taxRule = await taxService.getTaxRule(countryCode);
  res.json({ taxRule });
}));

router.get('/tax-preview', asyncHandler(async (req, res) => {
  const { amount, country = 'SA', exempt } = req.query;
  const subtotal = parseFloat(amount) || 0;
  const isTaxExempt = exempt === 'true' || exempt === '1';
  
  const pricing = await taxService.calculateFullPricing(subtotal, country, isTaxExempt);
  
  const countryInfo = {
    SA: { symbol: 'ر.س', code: 'SAR' },
    AE: { symbol: 'د.إ', code: 'AED' },
    KW: { symbol: 'د.ك', code: 'KWD' },
    QA: { symbol: 'ر.ق', code: 'QAR' },
    BH: { symbol: 'د.ب', code: 'BHD' },
    OM: { symbol: 'ر.ع', code: 'OMR' },
    EG: { symbol: 'ج.م', code: 'EGP' },
    LB: { symbol: 'ل.ل', code: 'LBP' },
    TR: { symbol: '₺', code: 'TRY' }
  };
  
  const info = countryInfo[country] || countryInfo.SA;
  const breakdown = taxService.formatTaxBreakdown(pricing, info.symbol);
  
  res.json({
    country,
    currencyCode: info.code,
    currencySymbol: info.symbol,
    isTaxExempt,
    pricing,
    breakdown
  });
}));

router.get('/admin/pending-reviews', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  
  const result = await workflowService.getPendingReviews(page, limit);
  res.json(result);
}));

router.post('/admin/review/:workflowId', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { workflowId } = req.params;
  const { action, notes } = req.body;
  
  if (!['approve', 'reject', 'request_changes'].includes(action)) {
    return res.status(400).json({ error: 'إجراء غير صالح' });
  }
  
  let newStatus;
  switch (action) {
    case 'approve':
      newStatus = 'approved';
      break;
    case 'reject':
      newStatus = 'rejected';
      break;
    case 'request_changes':
      newStatus = 'pending_review';
      break;
  }
  
  const workflow = await workflowService.updateWorkflowStatus(workflowId, newStatus, req.user.id, notes);
  
  res.json({ 
    workflow, 
    message: action === 'approve' ? 'تمت الموافقة على الإعلان' : 
             action === 'reject' ? 'تم رفض الإعلان' : 
             'تم طلب تعديلات'
  });
}));

router.get('/admin/tax-rules', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const rules = await taxService.getAllTaxRules();
  res.json({ rules });
}));

router.put('/admin/tax-rules/:countryCode', authMiddleware, adminMiddleware, asyncHandler(async (req, res) => {
  const { countryCode } = req.params;
  const { taxRate, notes } = req.body;
  
  if (taxRate === undefined || taxRate < 0 || taxRate > 100) {
    return res.status(400).json({ error: 'نسبة الضريبة غير صالحة' });
  }
  
  const rule = await taxService.updateTaxRule(countryCode, taxRate, notes);
  res.json({ rule, message: 'تم تحديث نسبة الضريبة' });
}));

module.exports = router;
