import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service.js';
import { logger, auditLog } from '../utils/logger.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
        roles: string[];
        permissions: string[];
      };
    }
  }
}

// ===== JWT AUTH MIDDLEWARE =====
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };
    next();
  } catch (error) {
    auditLog('INVALID_TOKEN', null, { ip: req.ip || 'unknown', error: (error as Error).message });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ===== RBAC MIDDLEWARE =====
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const hasRole = roles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) {
      auditLog('ACCESS_DENIED', req.user.userId, { requiredRoles: roles, userRoles: req.user.roles, path: req.path });
      res.status(403).json({ error: 'Insufficient role privileges' });
      return;
    }
    next();
  };
}

export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const requiredPerm = `${resource}:${action}`;
    const hasManage = req.user.permissions.includes(`${resource}:manage`);
    const hasPerm = req.user.permissions.includes(requiredPerm);

    if (!hasPerm && !hasManage) {
      auditLog('PERMISSION_DENIED', req.user.userId, { required: requiredPerm, path: req.path });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

// ===== REQUEST LOGGING =====
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.userId || 'anonymous',
  });
  next();
}

// ===== ERROR HANDLER =====
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
  });
}
