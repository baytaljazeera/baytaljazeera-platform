const db = require('../db');
const taxService = require('./taxService');

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const result = await db.query(`
    SELECT COUNT(*) + 1 as next_num FROM invoices WHERE EXTRACT(YEAR FROM created_at) = $1
  `, [year]);
  
  const nextNum = result.rows[0].next_num.toString().padStart(6, '0');
  return `INV-${year}-${nextNum}`;
}

async function createInvoice({
  userId,
  type = 'subscription',
  planId = null,
  propertyId = null,
  workflowId = null,
  countryCode = 'SA',
  currencyCode = 'SAR',
  currencySymbol = 'ر.س',
  subtotal,
  description = null,
  referrerId = null,
  referrerCode = null
}) {
  const invoiceNumber = await generateInvoiceNumber();
  const taxRule = await taxService.getTaxRule(countryCode);
  const pricing = taxService.calculateTax(subtotal, taxRule.taxRate);
  
  const result = await db.query(`
    INSERT INTO invoices (
      invoice_number, user_id, plan_id, property_id, workflow_id,
      country_code, currency_code, currency_symbol,
      subtotal, tax_rate, tax_amount, amount,
      invoice_type, description, status,
      referrer_id, referrer_code,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending', $15, $16, NOW())
    RETURNING *
  `, [
    invoiceNumber, userId, planId, propertyId, workflowId,
    countryCode, currencyCode, currencySymbol,
    pricing.subtotal, pricing.taxRate, pricing.taxAmount, pricing.total,
    type, description,
    referrerId, referrerCode
  ]);
  
  return result.rows[0];
}

async function getInvoice(invoiceId) {
  const result = await db.query(`
    SELECT i.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           p.name_ar as plan_name,
           pr.title as property_title,
           ref.name as referrer_name
    FROM invoices i
    LEFT JOIN users u ON u.id = i.user_id
    LEFT JOIN plans p ON p.id = i.plan_id
    LEFT JOIN properties pr ON pr.id = i.property_id
    LEFT JOIN users ref ON ref.id = i.referrer_id
    WHERE i.id = $1
  `, [invoiceId]);
  
  return result.rows[0];
}

async function getInvoiceByNumber(invoiceNumber) {
  const result = await db.query(`
    SELECT i.*, 
           u.name as user_name, u.email as user_email, u.phone as user_phone,
           p.name_ar as plan_name
    FROM invoices i
    LEFT JOIN users u ON u.id = i.user_id
    LEFT JOIN plans p ON p.id = i.plan_id
    WHERE i.invoice_number = $1
  `, [invoiceNumber]);
  
  return result.rows[0];
}

async function getUserInvoices(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  const result = await db.query(`
    SELECT i.*, p.name_ar as plan_name
    FROM invoices i
    LEFT JOIN plans p ON p.id = i.plan_id
    WHERE i.user_id = $1
    ORDER BY i.created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  
  const countResult = await db.query('SELECT COUNT(*) FROM invoices WHERE user_id = $1', [userId]);
  
  return {
    items: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    limit
  };
}

async function updateInvoiceStatus(invoiceId, status, paymentId = null) {
  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [status];
  let paramIndex = 2;
  
  if (paymentId) {
    updates.push(`payment_id = $${paramIndex++}`);
    values.push(paymentId);
  }
  
  if (status === 'paid') {
    updates.push(`paid_at = NOW()`);
  }
  
  values.push(invoiceId);
  
  const result = await db.query(`
    UPDATE invoices SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING *
  `, values);
  
  return result.rows[0];
}

function generateInvoiceHTML(invoice) {
  const taxBreakdown = taxService.formatTaxBreakdown({
    subtotal: parseFloat(invoice.subtotal || invoice.amount),
    taxRate: parseFloat(invoice.tax_rate || 0),
    taxAmount: parseFloat(invoice.tax_amount || 0),
    total: parseFloat(invoice.amount),
    taxNameAr: 'ضريبة القيمة المضافة'
  }, invoice.currency_symbol || 'ر.س');

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة ${invoice.invoice_number}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; background: #f5f5f5; }
        .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #D4AF37; padding-bottom: 20px; margin-bottom: 30px; }
        .logo { font-size: 28px; font-weight: bold; color: #01273C; }
        .invoice-info { text-align: left; }
        .invoice-number { font-size: 24px; color: #D4AF37; font-weight: bold; }
        .section { margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .section-title { font-weight: bold; color: #01273C; margin-bottom: 10px; font-size: 16px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th, .items-table td { padding: 12px; text-align: right; border-bottom: 1px solid #eee; }
        .items-table th { background: #01273C; color: white; }
        .totals { margin-top: 20px; padding: 20px; background: #01273C; color: white; border-radius: 8px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .total-row.final { font-size: 20px; font-weight: bold; color: #D4AF37; border-top: 2px solid #D4AF37; margin-top: 10px; padding-top: 15px; }
        .status { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: bold; }
        .status.pending { background: #FEF3C7; color: #92400E; }
        .status.paid { background: #D1FAE5; color: #065F46; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="invoice">
        <div class="header">
          <div class="logo">🏠 بيت الجزيرة</div>
          <div class="invoice-info">
            <div class="invoice-number">${invoice.invoice_number}</div>
            <div>التاريخ: ${new Date(invoice.created_at).toLocaleDateString('ar-SA')}</div>
            <span class="status ${invoice.status}">${invoice.status === 'paid' ? '✓ مدفوعة' : '⏳ معلقة'}</span>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">بيانات العميل</div>
          <div>الاسم: ${invoice.user_name || '-'}</div>
          <div>البريد: ${invoice.user_email || '-'}</div>
          <div>الهاتف: ${invoice.user_phone || '-'}</div>
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>البيان</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${invoice.description || invoice.plan_name || 'اشتراك'}</td>
              <td>${taxBreakdown.subtotalDisplay}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span>المجموع الفرعي:</span>
            <span>${taxBreakdown.subtotalDisplay}</span>
          </div>
          <div class="total-row">
            <span>${taxBreakdown.taxLabel}:</span>
            <span>${taxBreakdown.taxDisplay}</span>
          </div>
          <div class="total-row final">
            <span>الإجمالي:</span>
            <span>${taxBreakdown.totalDisplay}</span>
          </div>
        </div>
        
        <div class="footer">
          <p>شكراً لتعاملكم مع بيت الجزيرة</p>
          <p>للاستفسارات: support@bait-aljazeera.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  generateInvoiceNumber,
  createInvoice,
  getInvoice,
  getInvoiceByNumber,
  getUserInvoices,
  updateInvoiceStatus,
  generateInvoiceHTML
};
