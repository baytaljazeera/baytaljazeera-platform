const { google } = require('googleapis');

// Initialize Gmail API
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_USER_EMAIL = process.env.GMAIL_USER_EMAIL || 'info@baytaljazeera.com';
const GMAIL_FROM_NAME = process.env.GMAIL_FROM_NAME || 'بيت الجزيرة';

let gmail = null;

if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for installed apps
    );

    oauth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN
    });

    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    console.log('✅ Gmail API initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Gmail API:', error.message);
  }
} else {
  console.warn('⚠️ Gmail credentials not set. Email sending will be disabled.');
}

/**
 * Send email using Gmail API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML email body
 * @param {string} textBody - Optional plain text body
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, htmlBody, textBody = null) {
  // If Gmail is not configured, log and return error
  if (!gmail) {
    console.error('❌ Gmail API not configured. Cannot send email.');
    return { 
      success: false, 
      error: 'Gmail API not configured' 
    };
  }

  try {
    // Create email message
    const messageParts = [
      `To: ${to}`,
      `From: ${GMAIL_FROM_NAME} <${GMAIL_USER_EMAIL}>`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody
    ];

    const message = messageParts.join('\n');
    
    // Encode message in base64url format
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    const messageId = response.data.id;
    console.log(`📧 Email sent successfully to ${to}, messageId: ${messageId}`);
    
    return { 
      success: true, 
      messageId: messageId 
    };
  } catch (error) {
    console.error('❌ Gmail API email send error:', error);
    
    // Extract error message
    let errorMessage = 'Unknown error';
    if (error.response) {
      const { data, status } = error.response;
      errorMessage = data?.error?.message || `HTTP ${status}`;
      console.error('Gmail API error details:', JSON.stringify(data, null, 2));
    } else {
      errorMessage = error.message;
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}

function getPasswordResetEmailTemplate(resetLink, userName) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #002845 0%, #01375e 100%); padding: 40px; text-align: center;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">إعادة تعيين كلمة المرور</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">
                مرحباً ${userName || 'عزيزنا العميل'}،
              </p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">
                تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);">
                      إعادة تعيين كلمة المرور
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 30px 0 0 0;">
                ⚠️ هذا الرابط صالح لمدة <strong>ساعة واحدة</strong> فقط.
              </p>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 10px 0 0 0;">
                إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد بأمان.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br>
                <a href="${resetLink}" style="color: #D4AF37; word-break: break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Send email verification email
 * @param {string} email - User email
 * @param {string} verificationToken - Verification token
 * @param {string} userName - User name
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmailVerificationEmail(email, verificationToken, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  const verificationLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
  
  const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #002845 0%, #01375e 100%); padding: 40px; text-align: center;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">تأكيد بريدك الإلكتروني</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">
                مرحباً ${userName || 'عزيزنا العميل'}،
              </p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">
                نشكرك على التسجيل في بيت الجزيرة! يرجى تأكيد بريدك الإلكتروني للتمكن من استخدام جميع ميزات المنصة.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationLink}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);">
                      تأكيد البريد الإلكتروني
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 30px 0 0 0;">
                ⚠️ هذا الرابط صالح لمدة <strong>24 ساعة</strong> فقط.
              </p>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 10px 0 0 0;">
                إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد بأمان.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br>
                <a href="${verificationLink}" style="color: #D4AF37; word-break: break-all;">${verificationLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  
  const subject = 'تأكيد بريدك الإلكتروني - بيت الجزيرة';
  return await sendEmail(email, subject, htmlBody);
}

async function sendPasswordResetEmail(email, resetToken, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  const htmlBody = getPasswordResetEmailTemplate(resetLink, userName);
  const subject = 'إعادة تعيين كلمة المرور - بيت الجزيرة';
  
  return await sendEmail(email, subject, htmlBody);
}

/**
 * Send welcome email to new users
 * @param {string} email - User email
 * @param {string} userName - User name
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendWelcomeEmail(email, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  
  const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #002845 0%, #01375e 100%); padding: 40px; text-align: center;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">مرحباً بك في بيت الجزيرة!</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">
                مرحباً ${userName || 'عزيزنا العميل'}،
              </p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">
                نشكرك على انضمامك إلى منصة بيت الجزيرة. يمكنك الآن استكشاف آلاف العقارات في جميع أنحاء الخليج العربي.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${frontendUrl}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);">
                      ابدأ الاستكشاف
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
  
  const subject = 'مرحباً بك في بيت الجزيرة!';
  return await sendEmail(email, subject, htmlBody);
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmailVerificationEmail
};
