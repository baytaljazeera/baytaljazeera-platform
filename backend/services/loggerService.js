/**
 * Logger Service - Centralized structured logging
 * Provides consistent logging across the application
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = process.env.LOG_LEVEL || 'info';
const currentLevelNum = LOG_LEVELS[currentLevel] || 2;

function formatMessage(level, module, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    module,
    message,
    ...data
  };

  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(logEntry);
  }

  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`;
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= currentLevelNum;
}

function createLogger(module) {
  return {
    error: (message, data = {}) => {
      if (shouldLog('error')) {
        console.error(formatMessage('error', module, message, data));
      }
    },
    
    warn: (message, data = {}) => {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', module, message, data));
      }
    },
    
    info: (message, data = {}) => {
      if (shouldLog('info')) {
        console.log(formatMessage('info', module, message, data));
      }
    },
    
    debug: (message, data = {}) => {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', module, message, data));
      }
    },

    audit: (action, userId, details = {}) => {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        type: 'AUDIT',
        module,
        action,
        userId,
        ...details
      };
      console.log(JSON.stringify(auditEntry));
    },

    security: (event, details = {}) => {
      const securityEntry = {
        timestamp: new Date().toISOString(),
        type: 'SECURITY',
        module,
        event,
        ...details
      };
      console.warn(JSON.stringify(securityEntry));
    },

    performance: (operation, durationMs, details = {}) => {
      if (shouldLog('info')) {
        const perfEntry = {
          timestamp: new Date().toISOString(),
          type: 'PERF',
          module,
          operation,
          durationMs,
          ...details
        };
        console.log(JSON.stringify(perfEntry));
      }
    }
  };
}

const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.requestId = requestId;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('user-agent'),
      ip: req.ip
    };

    if (res.statusCode >= 500) {
      console.error(JSON.stringify({ type: 'REQUEST', level: 'ERROR', ...logData }));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify({ type: 'REQUEST', level: 'WARN', ...logData }));
    } else if (duration > 1000) {
      console.warn(JSON.stringify({ type: 'REQUEST', level: 'SLOW', ...logData }));
    } else if (shouldLog('debug') || duration > 500) {
      console.log(JSON.stringify({ type: 'REQUEST', level: 'INFO', ...logData }));
    }
  });
  
  next();
};

const errorReporter = (err, req, res, next) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: 'ERROR',
    requestId: req.requestId,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  };
  
  console.error(JSON.stringify(errorLog));
  
  next(err);
};

module.exports = {
  createLogger,
  requestLogger,
  errorReporter,
  LOG_LEVELS
};
