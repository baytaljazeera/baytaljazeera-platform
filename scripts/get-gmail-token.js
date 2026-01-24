#!/usr/bin/env node

/**
 * Script to get Gmail Refresh Token
 * 
 * Usage:
 * 1. Fill in CLIENT_ID and CLIENT_SECRET below
 * 2. Run: node scripts/get-gmail-token.js
 * 3. Visit the URL shown in console
 * 4. Copy the authorization code
 * 5. Paste it when prompted
 * 6. Copy the Refresh Token from output
 */

const { google } = require('googleapis');
const readline = require('readline');

// ============================================
// STEP 1: Fill these from Google Cloud Console
// ============================================
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET_HERE';
// ============================================

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob' // Redirect URI for installed apps
);

const scopes = ['https://mail.google.com/'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Important: needed for refresh token
  scope: scopes,
  prompt: 'consent', // Force consent screen to get refresh token
});

console.log('\n========================================');
console.log('📧 Gmail API Token Generator');
console.log('========================================\n');
console.log('1. Visit this URL in your browser:');
console.log('\n   ' + authUrl);
console.log('\n2. Sign in with: info@baytaljazeera.com');
console.log('3. Click "Allow" to grant permissions');
console.log('4. Copy the authorization code from the page');
console.log('\n========================================\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the authorization code here: ', (code) => {
  rl.close();
  
  oauth2Client.getToken(code, (err, token) => {
    if (err) {
      console.error('\n❌ Error retrieving access token:', err.message);
      console.error('\nCommon issues:');
      console.error('- Invalid authorization code');
      console.error('- Code expired (codes expire quickly)');
      console.error('- Wrong Client ID or Client Secret');
      process.exit(1);
    }
    
    console.log('\n========================================');
    console.log('✅ Success! Here are your tokens:');
    console.log('========================================\n');
    console.log('Access Token:', token.access_token);
    console.log('\n🔑 REFRESH TOKEN (Copy this!):');
    console.log('   ' + token.refresh_token);
    console.log('\n========================================');
    console.log('\n📋 Add these to Render Dashboard:');
    console.log('\nGMAIL_CLIENT_ID=' + CLIENT_ID);
    console.log('GMAIL_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('GMAIL_REFRESH_TOKEN=' + token.refresh_token);
    console.log('GMAIL_USER_EMAIL=info@baytaljazeera.com');
    console.log('GMAIL_FROM_NAME=بيت الجزيرة');
    console.log('\n========================================\n');
  });
});
