import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { db } from '../database/connection.js';
import { logger, auditLog } from '../utils/logger.js';
import { z } from 'zod';

// ===== PASSWORD COMPLEXITY =====
const passwordSchema = z.string()
  .min(env.PASSWORD_MIN_LENGTH, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`)
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')
  .refine((val) => !/(.)\1{2,}/.test(val), 'Must not contain 3+ repeated characters')
  .refine((val) => !['password', '12345678', 'qwerty'].some(w => val.toLowerCase().includes(w)), 'Password too common');

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, underscore, hyphen only'),
  password: passwordSchema,
  displayName: z.string().trim().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  deviceFingerprint: z.string().optional(),
});

// ===== ARGON2 CONFIG =====
const ARGON2_OPTIONS: argon2.Options & { raw: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
  raw: false,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// ===== JWT =====
interface TokenPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN, issuer: 'configflow', audience: 'configflow-client' });
}

export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN, issuer: 'configflow' });
}

export function verifyToken(token: string): TokenPayload & jwt.JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'configflow' }) as TokenPayload & jwt.JwtPayload;
}

// ===== ACCOUNT LOCK =====
export async function checkAccountLock(userId: string): Promise<{ locked: boolean; minutesRemaining?: number }> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) return { locked: false };

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    return { locked: true, minutesRemaining: remaining };
  }
  return { locked: false };
}

export async function recordFailedLogin(userId: string, ip: string): Promise<boolean> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) return false;

  const attempts = (user.failed_login_attempts || 0) + 1;
  const updates: Record<string, unknown> = { failed_login_attempts: attempts };

  if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + env.LOCK_DURATION_MINUTES * 60 * 1000);
    updates.locked_until = lockUntil;
    auditLog('ACCOUNT_LOCKED', userId, { attempts, lockUntil: lockUntil.toISOString(), ip });
    logger.warn(`Account locked: ${user.email} after ${attempts} failed attempts`);
  }

  await db('users').where({ id: userId }).update(updates);
  return attempts >= env.MAX_LOGIN_ATTEMPTS;
}

export async function resetFailedAttempts(userId: string): Promise<void> {
  await db('users').where({ id: userId }).update({ failed_login_attempts: 0, locked_until: null });
}

// ===== DEVICE FINGERPRINTING =====
export function generateDeviceFingerprint(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.ip || '',
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex');
}

export async function registerDevice(userId: string, fingerprint: string, ip: string, userAgent: string): Promise<void> {
  const existing = await db('device_fingerprints').where({ user_id: userId, fingerprint_hash: fingerprint }).first();
  if (existing) {
    await db('device_fingerprints').where({ id: existing.id }).update({ last_seen_at: new Date(), ip_address: ip });
  } else {
    await db('device_fingerprints').insert({
      user_id: userId,
      fingerprint_hash: fingerprint,
      ip_address: ip,
      user_agent: userAgent,
    });
    auditLog('NEW_DEVICE_DETECTED', userId, { fingerprint: fingerprint.slice(0, 8) + '...', ip });
  }
}

export async function isKnownDevice(userId: string, fingerprint: string): Promise<boolean> {
  const device = await db('device_fingerprints').where({ user_id: userId, fingerprint_hash: fingerprint, is_trusted: true }).first();
  return !!device;
}

// ===== RBAC =====
export async function getUserRolesAndPermissions(userId: string): Promise<{ roles: string[]; permissions: string[] }> {
  const roles = await db('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .where('user_roles.user_id', userId)
    .select('roles.name');

  const roleIds = await db('user_roles').where('user_id', userId).pluck('role_id');

  const permissions = roleIds.length > 0
    ? await db('role_permissions')
        .join('permissions', 'permissions.id', 'role_permissions.permission_id')
        .whereIn('role_permissions.role_id', roleIds)
        .select(db.raw("CONCAT(permissions.resource, ':', permissions.action) as perm"))
    : [];

  return {
    roles: roles.map((r: { name: string }) => r.name),
    permissions: permissions.map((p: { perm: string }) => p.perm),
  };
}

// ===== CONFIG ENCRYPTION =====
const ALGORITHM = 'aes-256-gcm';

export function encryptConfig(data: string, key: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(key, 'configflow-salt', 32);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return { encrypted, iv: iv.toString('hex'), tag: tag.toString('hex') };
}

export function decryptConfig(encrypted: string, key: string, iv: string, tag: string): string {
  const derivedKey = crypto.scryptSync(key, 'configflow-salt', 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
