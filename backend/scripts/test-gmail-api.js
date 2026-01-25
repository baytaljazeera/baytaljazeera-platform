#!/usr/bin/env node
/**
 * Gmail API Test Script
 * Tests Gmail API connection and email sending functionality
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { google } = require('googleapis');

console.log('🧪 [Gmail Test] Starting Gmail API test...\n');

// Get environment variables
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_USER_EMAIL = process.env.GMAIL_USER_EMAIL || 'info@baytaljazeera.com';
const GMAIL_FROM_NAME = process.env.GMAIL_FROM_NAME || 'بيت الجزيرة';

console.log('📋 [Gmail Test] Environment variables check:');
console.log(`   - GMAIL_CLIENT_ID: ${GMAIL_CLIENT_ID ? '✅ Set (' + GMAIL_CLIENT_ID.substring(0, 20) + '...)' : '❌ Missing'}`);
console.log(`   - GMAIL_CLIENT_SECRET: ${GMAIL_CLIENT_SECRET ? '✅ Set (' + GMAIL_CLIENT_SECRET.substring(0, 10) + '...)' : '❌ Missing'}`);
console.log(`   - GMAIL_REFRESH_TOKEN: ${GMAIL_REFRESH_TOKEN ? '✅ Set (' + GMAIL_REFRESH_TOKEN.substring(0, 20) + '...)' : '❌ Missing'}`);
console.log(`   - GMAIL_USER_EMAIL: ${GMAIL_USER_EMAIL}`);
console.log(`   - GMAIL_FROM_NAME: ${GMAIL_FROM_NAME}\n`);

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error('❌ [Gmail Test] Missing required environment variables!');
  process.exit(1);
}

// Test email (use command line argument or default)
const testEmail = process.argv[2] || process.env.TEST_EMAIL || 'test@example.com';

async function testGmailAPI() {
  try {
    console.log('🔧 [Gmail Test] Step 1: Creating OAuth2 client...');
    const oauth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );
    console.log('✅ [Gmail Test] OAuth2 client created\n');

    console.log('🔧 [Gmail Test] Step 2: Setting credentials with refresh token...');
    oauth2Client.setCredentials({
      refresh_token: GMAIL_REFRESH_TOKEN
    });
    console.log('✅ [Gmail Test] Credentials set\n');

    console.log('🔧 [Gmail Test] Step 3: Testing access token refresh...');
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('✅ [Gmail Test] Access token refreshed successfully');
    console.log(`   - Access token: ${credentials.access_token ? credentials.access_token.substring(0, 20) + '...' : 'Missing'}\n`);

    console.log('🔧 [Gmail Test] Step 4: Initializing Gmail API...');
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    console.log('✅ [Gmail Test] Gmail API initialized\n');

    console.log('🔧 [Gmail Test] Step 5: Getting user profile...');
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log('✅ [Gmail Test] User profile retrieved:');
    console.log(`   - Email: ${profile.data.emailAddress}`);
    console.log(`   - Messages Total: ${profile.data.messagesTotal}`);
    console.log(`   - Threads Total: ${profile.data.threadsTotal}\n`);

    console.log('🔧 [Gmail Test] Step 6: Creating test email message...');
    const htmlBody = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h1>🧪 اختبار Gmail API</h1>
  <p>هذا إيميل اختبار من بيت الجزيرة</p>
  <p>إذا وصلت هذا الإيميل، يعني أن Gmail API يعمل بشكل صحيح! ✅</p>
  <p>Time: ${new Date().toISOString()}</p>
</body>
</html>
    `;

    const messageParts = [
      `To: ${testEmail}`,
      `From: ${GMAIL_FROM_NAME} <${GMAIL_USER_EMAIL}>`,
      `Subject: 🧪 اختبار Gmail API - بيت الجزيرة`,
      'Content-Type: text/html; charset=utf-8',
      '',
      htmlBody
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log(`📧 [Gmail Test] Sending test email to: ${testEmail}...`);
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    const messageId = response.data.id;
    console.log('✅ [Gmail Test] Email sent successfully!');
    console.log(`   - Message ID: ${messageId}`);
    console.log(`   - Thread ID: ${response.data.threadId || 'N/A'}\n`);

    console.log('🎉 [Gmail Test] All tests passed! Gmail API is working correctly.\n');
    console.log(`📬 Check your inbox at: ${testEmail}`);
    console.log('   (Also check Spam folder if not found)\n');

    return { success: true, messageId };

  } catch (error) {
    console.error('\n❌ [Gmail Test] Test failed!\n');
    console.error('Error details:');
    console.error(`   - Type: ${error.constructor.name}`);
    console.error(`   - Message: ${error.message}\n`);

    if (error.response) {
      const { data, status } = error.response;
      console.error('Gmail API Error Response:');
      console.error(`   - HTTP Status: ${status}`);
      console.error(`   - Error Code: ${data?.error?.code || 'N/A'}`);
      console.error(`   - Error Message: ${data?.error?.message || 'N/A'}`);
      console.error(`   - Error Details: ${JSON.stringify(data?.error, null, 2)}\n`);

      // Common error solutions
      if (data?.error?.message?.includes('invalid_grant')) {
        console.error('💡 Solution: Refresh token is expired or invalid. You need to generate a new refresh token.');
      } else if (data?.error?.message?.includes('insufficient_permissions')) {
        console.error('💡 Solution: OAuth scopes are insufficient. Make sure you have gmail.send scope.');
      } else if (data?.error?.message?.includes('invalid_client')) {
        console.error('💡 Solution: Client ID or Client Secret is incorrect.');
      }
    } else if (error.code) {
      console.error(`   - Error Code: ${error.code}`);
    }

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    return { success: false, error: error.message };
  }
}

// Run test
testGmailAPI()
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ [Gmail Test] Unexpected error:', error);
    process.exit(1);
  });
