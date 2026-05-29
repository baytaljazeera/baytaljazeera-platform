const { google } = require('googleapis');

console.log('📧 [EmailService] Starting Gmail API initialization...');

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_USER_EMAIL = process.env.GMAIL_USER_EMAIL || 'info@baytaljazeera.com';
const GMAIL_FROM_NAME = process.env.GMAIL_FROM_NAME || 'بيت الجزيرة';

console.log('📋 [EmailService] Environment variables check:');
console.log(`   - GMAIL_CLIENT_ID: ${GMAIL_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
console.log(`   - GMAIL_CLIENT_SECRET: ${GMAIL_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`   - GMAIL_REFRESH_TOKEN: ${GMAIL_REFRESH_TOKEN ? '✅ Set' : '❌ Missing'}`);

let gmail = null;
let oauth2Client = null;

if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN) {
  try {
    console.log('🔧 [EmailService] Creating OAuth2 client with manual credentials...');
    oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN
    });

    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    console.log('✅ [EmailService] Gmail API initialized with manual credentials!');
  } catch (error) {
    console.error('❌ [EmailService] Failed to initialize Gmail API:', error.message);
  }
} else {
  console.warn('⚠️ [EmailService] GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN not all set. Email sending disabled.');
}

function getGmailClient() {
  return gmail;
}

async function sendEmail(to, subject, htmlBody, textBody = null) {
  console.log(`📧 [EmailService] sendEmail called - To: ${to}, Subject: ${subject}`);
  
  const gmailClient = gmail;

  if (!gmailClient) {
    console.error('❌ [EmailService] No Gmail client available. Cannot send email.');
    return { success: false, error: 'Gmail API not configured' };
  }

  try {
    if (authClient) {
      console.log('🔄 [EmailService] Refreshing access token...');
      try {
        const { credentials } = await authClient.refreshAccessToken();
        authClient.setCredentials(credentials);
        console.log('✅ [EmailService] Access token refreshed');
      } catch (refreshError) {
        console.warn('⚠️ [EmailService] Token refresh failed, continuing...', refreshError.message);
      }
    }
    
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const encodedFromName = `=?UTF-8?B?${Buffer.from(GMAIL_FROM_NAME, 'utf-8').toString('base64')}?=`;
    
    const messageParts = [
      `To: ${to}`,
      `From: ${encodedFromName} <${GMAIL_USER_EMAIL}>`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody, 'utf-8').toString('base64')
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log(`📧 [EmailService] Sending email to ${to}...`);
    const response = await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage }
    });

    const messageId = response.data.id;
    console.log(`✅ [EmailService] Email sent successfully to ${to}, messageId: ${messageId}`);
    
    return { success: true, messageId: messageId };
  } catch (error) {
    console.error('❌ [EmailService] Gmail API error:', error);
    
    let errorMessage = 'Unknown error';
    if (error.response) {
      errorMessage = error.response.data?.error?.message || `HTTP ${error.response.status}`;
    } else {
      errorMessage = error.message;
    }
    
    return { success: false, error: errorMessage };
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
              <table width="80" height="80" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto; border-radius: 50%; background: linear-gradient(135deg, #D4AF37 0%, #f6e27a 50%, #D4AF37 100%);">
                <tr>
                  <td align="center" valign="middle" style="font-size: 36px; line-height: 80px;">🏠</td>
                </tr>
              </table>
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">إعادة تعيين كلمة المرور</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">مرحباً ${userName || 'عزيزنا العميل'}،</p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);">إعادة تعيين كلمة المرور</a>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 30px 0 0 0;">⚠️ هذا الرابط صالح لمدة <strong>ساعة واحدة</strong> فقط.</p>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 10px 0 0 0;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد بأمان.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br><a href="${resetLink}" style="color: #D4AF37; word-break: break-all;">${resetLink}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة</p>
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

async function sendPasswordResetEmail(email, resetToken, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;
  
  const htmlBody = getPasswordResetEmailTemplate(resetLink, userName);
  const subject = 'إعادة تعيين كلمة المرور - بيت الجزيرة';
  
  return await sendEmail(email, subject, htmlBody);
}

function getEmailVerificationTemplate(verifyLink, userName) {
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
              <table width="80" height="80" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto; border-radius: 50%; background: linear-gradient(135deg, #D4AF37 0%, #f6e27a 50%, #D4AF37 100%);">
                <tr>
                  <td align="center" valign="middle" style="font-size: 36px; line-height: 80px;">🏠</td>
                </tr>
              </table>
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">تأكيد البريد الإلكتروني</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">مرحباً ${userName || 'عزيزنا العميل'}،</p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">شكراً لتسجيلك في بيت الجزيرة! يرجى النقر على الزر أدناه لتأكيد بريدك الإلكتروني وتفعيل حسابك:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #0B6B4C 0%, #0a5a40 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(11, 107, 76, 0.4);">تأكيد البريد الإلكتروني</a>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 30px 0 0 0;">⚠️ هذا الرابط صالح لمدة <strong>24 ساعة</strong> فقط.</p>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 10px 0 0 0;">إذا لم تسجّل في بيت الجزيرة، يمكنك تجاهل هذا البريد بأمان.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br><a href="${verifyLink}" style="color: #0B6B4C; word-break: break-all;">${verifyLink}</a></p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة</p>
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

async function sendVerificationEmail(email, verificationToken, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
  
  const htmlBody = getEmailVerificationTemplate(verifyLink, userName);
  const subject = 'تأكيد البريد الإلكتروني - بيت الجزيرة';
  
  return await sendEmail(email, subject, htmlBody);
}

function getWelcomeEmailTemplate(userName) {
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
              <table width="80" height="80" cellpadding="0" cellspacing="0" style="margin: 0 auto 16px auto; border-radius: 50%; background: linear-gradient(135deg, #D4AF37 0%, #f6e27a 50%, #D4AF37 100%);">
                <tr>
                  <td align="center" valign="middle" style="font-size: 36px; line-height: 80px;">🏠</td>
                </tr>
              </table>
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">🎉 مرحباً بك في بيت الجزيرة!</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">مرحباً ${userName || 'عزيزنا العميل'}،</p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">تم تفعيل حسابك بنجاح! أنت الآن جزء من مجتمع بيت الجزيرة - منصة العقارات الخليجية الأولى.</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="https://baytaljazeera.com/search" style="display: inline-block; background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.4);">استكشف العقارات</a>
                  </td>
                </tr>
              </table>
              <p style="color: #666; line-height: 1.8; margin: 30px 0 0 0; text-align: center;">ابدأ رحلتك العقارية معنا اليوم!</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} بيت الجزيرة - جميع الحقوق محفوظة</p>
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

async function sendWelcomeEmail(email, userName) {
  const htmlBody = getWelcomeEmailTemplate(userName);
  const subject = 'مرحباً بك في بيت الجزيرة! 🏠';
  
  return await sendEmail(email, subject, htmlBody);
}

module.exports = {
  getGmailClient,
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  resendVerificationEmail: sendVerificationEmail,
  sendEmailVerificationEmail: sendVerificationEmail,
  sendWelcomeEmail,
  getEmailVerificationTemplate,
  getPasswordResetEmailTemplate
};
