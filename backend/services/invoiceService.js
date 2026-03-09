const db = require('../db');

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
    subtotal, 0, 0, subtotal,
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateInvoiceHTML(invoice) {
  const subtotal = parseFloat(invoice.subtotal || invoice.amount);
  const total = subtotal;
  const currencySymbol = escapeHtml(invoice.currency_symbol || 'ر.س');
  const currency = escapeHtml(invoice.currency_code || 'SAR');
  const serviceDescription = escapeHtml(invoice.description || invoice.plan_name || 'اشتراك');
  
  const invoiceDateAr = new Date(invoice.created_at).toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const invoiceDateEn = new Date(invoice.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const invoiceTime = new Date(invoice.created_at).toLocaleTimeString('ar-SA', {
    hour: '2-digit', minute: '2-digit'
  });
  
  const statusLabel = invoice.status === 'paid' ? 'مدفوعة | Paid' : 'مستحقة | Due';
  const statusColor = invoice.status === 'paid' ? '#065F46' : '#92400E';
  const statusBg = invoice.status === 'paid' ? '#D1FAE5' : '#FEF3C7';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>فاتورة ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #FDFBF5; color: #01273C; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(to left, #01273C, #013A5C); padding: 28px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header-title { font-size: 28px; font-weight: bold; color: white; }
    .header-title-en { font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 2px; letter-spacing: 1px; }
    .brand { text-align: left; display: flex; align-items: center; gap: 12px; }
    .brand-name { font-size: 22px; font-weight: bold; color: #D4AF37; }
    .brand-en { font-size: 11px; color: rgba(255,255,255,0.4); letter-spacing: 2px; }
    .subtitle-bar { background: rgba(212,175,55,0.1); border-bottom: 1px solid rgba(212,175,55,0.2); padding: 8px 32px; text-align: center; font-size: 14px; color: #01273C; }
    .subtitle-bar span { color: rgba(1,39,60,0.5); }
    .content { padding: 24px 32px; }
    .info-grid { display: flex; gap: 24px; margin-bottom: 24px; }
    .info-card { flex: 1; background: #FDFBF5; border: 1px solid #E8E0CC; border-radius: 12px; padding: 20px; }
    .info-label { font-size: 11px; font-weight: bold; color: #D4AF37; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .info-label span { color: rgba(1,39,60,0.3); font-weight: normal; }
    .info-name { font-weight: bold; font-size: 14px; color: #01273C; }
    .info-sub { font-size: 12px; color: rgba(1,39,60,0.4); margin-top: 2px; }
    .info-details { margin-top: 8px; font-size: 12px; color: rgba(1,39,60,0.5); line-height: 1.8; }
    .meta-grid { display: flex; gap: 12px; margin-bottom: 24px; }
    .meta-card { flex: 1; background: white; border: 1px solid #E8E0CC; border-radius: 12px; padding: 14px; text-align: center; }
    .meta-label { font-size: 10px; color: rgba(1,39,60,0.35); margin-bottom: 4px; }
    .meta-value { font-weight: bold; font-size: 13px; color: #01273C; }
    .meta-value-sm { font-size: 10px; color: rgba(1,39,60,0.35); }
    .status-badge { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #E8E0CC; border-radius: 12px; overflow: hidden; }
    table thead { background: #01273C; }
    table th { padding: 14px 20px; color: white; font-size: 12px; font-weight: 500; text-align: right; }
    table th span { color: rgba(255,255,255,0.35); font-weight: normal; }
    table td { padding: 20px; border-bottom: 1px solid #E8E0CC; font-size: 13px; }
    .totals { width: 340px; border: 1px solid #E8E0CC; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .totals-row { display: flex; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #E8E0CC; font-size: 13px; background: #FDFBF5; }
    .totals-row span:first-child { color: rgba(1,39,60,0.5); }
    .totals-final { display: flex; justify-content: space-between; padding: 16px 20px; background: #01273C; }
    .totals-final span:first-child { color: white; font-weight: bold; font-size: 13px; }
    .totals-final span:last-child { color: #D4AF37; font-weight: bold; font-size: 18px; }
    .no-vat { text-align: center; font-size: 10px; color: rgba(1,39,60,0.35); margin-top: 8px; }
    .footer { border-top: 2px solid rgba(212,175,55,0.2); padding-top: 24px; margin-top: 16px; text-align: center; }
    .footer p { font-size: 13px; color: #01273C; margin-bottom: 4px; }
    .footer .sub { font-size: 11px; color: rgba(1,39,60,0.4); }
    .footer .en { font-size: 11px; color: rgba(1,39,60,0.25); margin-top: 8px; }
    .sig-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 16px; border-top: 1px dashed #E8E0CC; }
    .sig-line { width: 128px; border-bottom: 1px solid rgba(1,39,60,0.15); margin-bottom: 4px; }
    .sig-label { font-size: 10px; color: rgba(1,39,60,0.35); text-align: center; }
    .contact-info { font-size: 10px; color: rgba(1,39,60,0.25); }
    @media print {
      body { background: white; }
      .invoice { box-shadow: none; }
      @page { size: A4; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <div class="header-title">فاتورة</div>
        <div class="header-title-en">Invoice</div>
      </div>
      <div class="brand">
        <div>
          <div class="brand-name">بيت الجزيرة</div>
          <div class="brand-en">BAIT AL-JAZEERA</div>
        </div>
      </div>
    </div>
    
    <div class="subtitle-bar">
      فاتورة خدمات عقارية <span style="color:#D4AF37;margin:0 8px;">|</span> <span>Real Estate Services Invoice</span>
    </div>
    
    <div class="content">
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">معلومات المزوّد <span>| Seller</span></div>
          <div class="info-name" style="font-size:18px;letter-spacing:1px;">IFAZ</div>
          <div class="info-sub">Digital Real Estate Marketing Platform</div>
          <div class="info-details">
            منصة رقمية متخصصة في التسويق العقاري<br>
            البريد: info@baitaljazeera.com
          </div>
        </div>
        <div class="info-card">
          <div class="info-label">معلومات العميل <span>| Client</span></div>
          <div class="info-name">${escapeHtml(invoice.user_name) || '—'}</div>
          <div class="info-sub">Client</div>
          <div class="info-details">
            البريد: ${escapeHtml(invoice.user_email) || '—'}<br>
            ${invoice.user_phone ? `الجوال: ${escapeHtml(invoice.user_phone)}` : ''}
          </div>
        </div>
      </div>
      
      <div class="meta-grid">
        <div class="meta-card">
          <div class="meta-label">رقم الفاتورة | Invoice No.</div>
          <div class="meta-value" style="font-family:monospace;">${invoice.invoice_number}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">تاريخ الإصدار | Issue Date</div>
          <div class="meta-value">${invoiceDateAr}</div>
          <div class="meta-value-sm">${invoiceTime}</div>
        </div>
        <div class="meta-card">
          <div class="meta-label">الحالة | Status</div>
          <div class="status-badge" style="background:${statusBg};color:${statusColor};">${statusLabel}</div>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>البيان <span>| Description</span></th>
            <th style="text-align:center;">الكمية <span>| Qty</span></th>
            <th style="text-align:center;">سعر الوحدة <span>| Unit Price</span></th>
            <th style="text-align:left;">الإجمالي <span>| Amount</span></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div style="font-weight:bold;">${serviceDescription}</div>
            </td>
            <td style="text-align:center;">1</td>
            <td style="text-align:center;">${subtotal.toLocaleString('en-US', {minimumFractionDigits:2})} ${currency}</td>
            <td style="text-align:left;font-weight:bold;">${subtotal.toLocaleString('en-US', {minimumFractionDigits:2})} ${currency}</td>
          </tr>
        </tbody>
      </table>
      
      <div class="totals">
        <div class="totals-row">
          <span>المجموع الفرعي | Subtotal</span>
          <span>${subtotal.toLocaleString('en-US', {minimumFractionDigits:2})} ${currency}</span>
        </div>
        <div class="totals-row">
          <span>الخصم | Discount</span>
          <span>0.00 ${currency}</span>
        </div>
        <div class="totals-final">
          <span>الإجمالي النهائي | Total</span>
          <span>${total.toLocaleString('en-US', {minimumFractionDigits:2})} ${currency}</span>
        </div>
      </div>
      <div class="no-vat">غير خاضعة لضريبة القيمة المضافة | No VAT Applied</div>
      
      <div class="footer">
        <p>شكراً لثقتكم في بيت الجزيرة</p>
        <p class="sub">نفخر بخدمتكم ونتطلع إلى استمرار التعاون معكم</p>
        <p class="en">Thank you for choosing Bait Al-Jazeera</p>
        <p class="en">We are honored to serve you and look forward to continuing our partnership</p>
      </div>
      
      <div class="sig-section">
        <div class="contact-info">
          info@baitaljazeera.com<br>
          baytaljazeera.com
        </div>
        <div>
          <div class="sig-line"></div>
          <div class="sig-label">الاعتماد | Authorized Signature</div>
        </div>
        <div class="contact-info" style="text-align:left;" dir="ltr">
          ${invoice.invoice_number}<br>
          ${invoiceDateEn}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
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
