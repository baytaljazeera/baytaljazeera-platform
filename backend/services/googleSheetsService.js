const { google } = require('googleapis');

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

async function logWhatsAppMessage(phone, message) {
  try {
    if (!SPREADSHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('⚠️ Google Sheets credentials are not fully configured. Skipping Sheets logging.');
      return;
    }

    const timestamp = new Date().toLocaleString('ar-SA');
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:C',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[timestamp, phone, message]]
      }
    });
    console.log('✅ WhatsApp message logged to Google Sheets successfully');
  } catch (error) {
    console.error('❌ Error logging to Google Sheets:', error);
  }
}

module.exports = { logWhatsAppMessage };
