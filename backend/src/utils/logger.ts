import winston from 'winston';
import { env } from '../config/env.js';
import crypto from 'crypto';

const sensitiveFields = ['password', 'token', 'secret', 'authorization', 'cookie'];

const redactSensitive = winston.format((info) => {
  if (typeof info.message === 'string') {
    for (const field of sensitiveFields) {
      const regex = new RegExp(`("${field}"\\s*:\\s*)"[^"]*"`, 'gi');
      info.message = info.message.replace(regex, `$1"[REDACTED]"`);
    }
  }
  return info;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    redactSensitive(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'configflow-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10485760, maxFiles: 10 }),
    new winston.transports.File({ filename: 'logs/security.log', level: 'warn', maxsize: 5242880, maxFiles: 5 }),
  ],
});

if (env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  }));
}

// Audit logger for security events
export const auditLog = (event: string, userId: string | null, details: Record<string, unknown>) => {
  logger.warn('SECURITY_AUDIT', {
    event,
    userId,
    ...details,
    auditId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
};
