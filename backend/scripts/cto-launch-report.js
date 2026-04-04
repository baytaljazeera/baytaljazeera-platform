#!/usr/bin/env node
/**
 * Prints CTO launch URLs + Arabic banner (no DB). Run: node backend/scripts/cto-launch-report.js
 */
const FE = process.env.FRONTEND_URL || 'http://localhost:5001';

console.log('');
console.log('══════════════════════════════════════════════════════════════');
console.log('🚀 النظام جاهز للتجربة يا باشمهندس!');
console.log('══════════════════════════════════════════════════════════════');
console.log('');
console.log('روابط التجربة المحلية:');
console.log('');
console.log('1) شاشة مراقبة المحادثات (المسح النهائي / المحادثات الموسومة):');
console.log(`   ${FE}/add-listing/admin/customer-conversations`);
console.log('');
console.log('2) شاشة البريد الموحد (الملاحظة السرية + سياق الذكاء الاصطناعي):');
console.log(`   ${FE}/add-listing/admin/omni-inbox`);
console.log('');
