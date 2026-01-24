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
  
  // لا نحسب ضريبة - خدمة رقمية عابرة للحدود
  // No tax calculation - cross-border digital service
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
    subtotal, 0, 0, subtotal, // No tax: tax_rate=0, tax_amount=0, amount=subtotal
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
  const subtotal = parseFloat(invoice.subtotal || invoice.amount);
  const total = subtotal; // No tax
  const currencySymbol = invoice.currency_symbol || 'ر.س';
  
  // Generate service description
  const serviceDescription = invoice.description || invoice.plan_name || 'اشتراك';
  const digitalServiceDescription = `تقديم خدمة نشر إعلان رقمي على منصة بيت الجزيرة لعرض محتوى عقاري أو استثماري، موجه لأسواق متعددة وفق إعدادات العميل، دون ارتباط بموقع جغرافي محدد ودون أي تدخل في عمليات البيع أو التملك.`;
  
  // Format dates
  const invoiceDate = new Date(invoice.created_at).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة خدمة رقمية ${invoice.invoice_number}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; background: #f5f5f5; }
        .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #D4AF37; padding-bottom: 20px; margin-bottom: 30px; }
        .logo-section { flex: 1; }
        .logo { font-size: 28px; font-weight: bold; color: #01273C; margin-bottom: 8px; }
        .provider-info { font-size: 14px; color: #666; line-height: 1.6; }
        .provider-info strong { color: #01273C; }
        .invoice-info { text-align: left; }
        .invoice-title { font-size: 20px; font-weight: bold; color: #01273C; margin-bottom: 8px; }
        .invoice-title-en { font-size: 14px; color: #666; font-weight: normal; margin-top: 4px; }
        .invoice-number { font-size: 24px; color: #D4AF37; font-weight: bold; margin-top: 8px; }
        .section { margin: 20px 0; padding: 20px; background: #f9f9f9; border-radius: 8px; }
        .section-title { font-weight: bold; color: #01273C; margin-bottom: 10px; font-size: 16px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th, .items-table td { padding: 12px; text-align: right; border-bottom: 1px solid #eee; }
        .items-table th { background: #01273C; color: white; }
        .service-description { font-size: 13px; color: #555; line-height: 1.8; margin-top: 8px; padding: 12px; background: #f0f0f0; border-radius: 6px; }
        .totals { margin-top: 20px; padding: 20px; background: #01273C; color: white; border-radius: 8px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .total-row.final { font-size: 20px; font-weight: bold; color: #D4AF37; border-top: 2px solid #D4AF37; margin-top: 10px; padding-top: 15px; }
        .status { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: bold; margin-top: 8px; }
        .status.pending { background: #FEF3C7; color: #92400E; }
        .status.paid { background: #D1FAE5; color: #065F46; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 14px; }
        .legal-notice { margin-top: 30px; padding: 20px; background: #f9f9f9; border-left: 4px solid #D4AF37; border-radius: 6px; }
        .legal-notice-title { font-weight: bold; color: #01273C; margin-bottom: 8px; }
        .legal-notice-text { font-size: 13px; color: #555; line-height: 1.8; }
      </style>
    </head>
    <body>
      <div class="invoice">
        <div class="header">
          <div class="logo-section">
            <div class="logo">🏠 بيت الجزيرة – Bait Al Jazeera</div>
            <div class="provider-info">
              <strong>مزود الخدمة</strong><br>
              منصة إعلانات رقمية متعددة الأسواق<br>
              <span style="font-size: 12px; color: #888;">(International Digital Advertising Platform)</span>
            </div>
          </div>
          <div class="invoice-info">
            <div class="invoice-title">فاتورة خدمة رقمية</div>
            <div class="invoice-title-en" style="font-size: 12px; color: #888;">Digital Service Invoice</div>
            <div class="invoice-number">${invoice.invoice_number}</div>
            <div style="margin-top: 8px; color: #666;">التاريخ: ${invoiceDate}</div>
            <span class="status ${invoice.status}">${invoice.status === 'paid' ? '✓ مدفوعة' : '⏳ معلقة'}</span>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">بيانات العميل</div>
          <div>الاسم: ${invoice.user_name || '-'}</div>
          <div>البريد: ${invoice.user_email || '-'}</div>
          ${invoice.user_phone ? `<div>الهاتف: ${invoice.user_phone}</div>` : ''}
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th>الوصف</th>
              <th>المبلغ</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style="font-weight: 500;">${serviceDescription}</div>
                <div class="service-description">
                  ${digitalServiceDescription}
                </div>
                <div style="margin-top: 8px; font-size: 12px; color: #888;">
                  مدة تفعيل الإعلان الرقمي حسب الباقة المختارة
                </div>
              </td>
              <td style="font-weight: bold; font-size: 16px;">${subtotal.toLocaleString('ar-SA')} ${currencySymbol}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row final">
            <span>إجمالي المبلغ:</span>
            <span>${total.toLocaleString('ar-SA')} ${currencySymbol}</span>
          </div>
        </div>
        
        <div class="legal-notice">
          <div class="legal-notice-title">تنويه:</div>
          <div class="legal-notice-text">
            هذه الفاتورة تخص خدمة رقمية عابرة للحدود (Cross-Border Digital Service).<br>
            أي التزامات ضريبية محلية – إن وُجدت – تقع على عاتق العميل وفق أنظمة دولته.
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
