const { google } = require('googleapis');

let connectionSettings = null;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings?.expires_at && 
      new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  connectionSettings = data.items?.[0];

  const accessToken = connectionSettings?.settings?.access_token || 
                      connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createMimeMessage(to, subject, htmlBody) {
  const boundary = '----=_Part_' + Date.now();
  
  const message = [
    'MIME-Version: 1.0',
    `To: ${to}`,
    `From: "بيت الجزيرة" <noreply@baytaljazeera.com>`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${boundary}--`
  ].join('\r\n');

  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmail(to, subject, htmlBody) {
  try {
    const gmail = await getGmailClient();
    const raw = createMimeMessage(to, subject, htmlBody);
    
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    });
    
    console.log(`📧 Email sent successfully to ${to}, messageId: ${result.data.id}`);
    return { success: true, messageId: result.data.id };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
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
              <h1 style="color: #D4AF37; margin: 0; font-size: 32px; font-weight: bold;">بيت الجزيرة</h1>
              <p style="color: rgba(212, 175, 55, 0.8); margin: 8px 0 0 0; font-size: 14px;">منصة العقارات الخليجية الأولى</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #002845; margin: 0 0 20px 0; font-size: 24px;">🎉 مرحباً بك في بيت الجزيرة!</h2>
              <p style="color: #666; line-height: 1.8; margin: 0 0 20px 0;">
                أهلاً ${userName || 'عزيزنا العميل'}،
              </p>
              <p style="color: #666; line-height: 1.8; margin: 0 0 30px 0;">
                شكراً لتسجيلك معنا! يرجى تأكيد بريدك الإلكتروني بالنقر على الزر أدناه لتفعيل حسابك:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #0B6B4C 0%, #085239 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 15px rgba(11, 107, 76, 0.4);">
                      تأكيد البريد الإلكتروني
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 14px; line-height: 1.8; margin: 30px 0 0 0;">
                ⚠️ هذا الرابط صالح لمدة <strong>24 ساعة</strong> فقط.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; line-height: 1.6; margin: 0;">
                إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:<br>
                <a href="${verifyLink}" style="color: #0B6B4C; word-break: break-all;">${verifyLink}</a>
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

async function sendVerificationEmail(email, verificationToken, userName) {
  const frontendUrl = process.env.FRONTEND_URL || 'https://baytaljazeera.com';
  const verifyLink = `${frontendUrl}/verify-email?token=${verificationToken}`;
  
  const htmlBody = getEmailVerificationTemplate(verifyLink, userName);
  const subject = 'تأكيد البريد الإلكتروني - بيت الجزيرة';
  
  return await sendEmail(email, subject, htmlBody);
}

async function resendVerificationEmail(email, verificationToken, userName) {
  return await sendVerificationEmail(email, verificationToken, userName);
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  resendVerificationEmail,
  getGmailClient
};
