/**
 * Console Helper - Production-safe console logging
 * Prevents console.log from leaking sensitive information in production
 */

const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'debug');

// Override console methods in production to prevent information leakage
if (isProduction) {
  const originalLog = console.log;
  const originalDebug = console.debug;
  const originalInfo = console.info;
  
  // In production, only allow error and warn
  console.log = function(...args) {
    // Only log if LOG_LEVEL allows it
    if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info') {
      originalLog.apply(console, args);
    }
  };
  
  console.debug = function() {
    // Disable debug in production
  };
  
  console.info = function(...args) {
    if (LOG_LEVEL === 'info' || LOG_LEVEL === 'debug') {
      originalInfo.apply(console, args);
    }
  };
}

module.exports = {
  isProduction,
  LOG_LEVEL
};
