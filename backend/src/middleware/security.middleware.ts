import { Request, Response, NextFunction } from 'express';
import { generateDeviceFingerprint } from '../services/auth.service.js';
import { auditLog } from '../utils/logger.js';

// ===== DEVICE FINGERPRINT MIDDLEWARE =====
export function attachFingerprint(req: Request, _res: Response, next: NextFunction): void {
  const clientFingerprint = req.headers['x-device-fingerprint'] as string | undefined;
  const serverFingerprint = generateDeviceFingerprint(req as any);

  // Use client-provided fingerprint if available, otherwise generate server-side
  (req as any).deviceFingerprint = clientFingerprint || serverFingerprint;
  next();
}

// ===== IP RATE TRACKING =====
const suspiciousIPs = new Map<string, { count: number; firstSeen: number }>();

export function trackSuspiciousActivity(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  // Clean old entries every 10 minutes
  if (Math.random() < 0.01) {
    for (const [key, val] of suspiciousIPs.entries()) {
      if (now - val.firstSeen > 600000) suspiciousIPs.delete(key);
    }
  }

  const entry = suspiciousIPs.get(ip);
  if (entry) {
    entry.count++;
    if (entry.count > 100) {
      auditLog('SUSPICIOUS_IP', null, { ip, requestCount: entry.count, window: '10min' });
    }
  } else {
    suspiciousIPs.set(ip, { count: 1, firstSeen: now });
  }

  next();
}

// ===== SECURE HEADERS (supplement helmet) =====
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Request-ID', crypto.randomUUID());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
