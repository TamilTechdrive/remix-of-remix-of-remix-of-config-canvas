import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { auditLog } from '../utils/logger.js';
import {
  registerSchema, loginSchema, hashPassword, verifyPassword,
  generateAccessToken, generateRefreshToken, verifyToken,
  checkAccountLock, recordFailedLogin, resetFailedAttempts,
  getUserRolesAndPermissions, registerDevice,
} from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import crypto from 'crypto';

const router = Router();

// ===== REGISTER =====
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await db('users').where({ email: data.email }).orWhere({ username: data.username }).first();
    if (existing) {
      res.status(409).json({ error: 'Email or username already exists' });
      return;
    }

    const passwordHash = await hashPassword(data.password);
    const [user] = await db('users').insert({
      email: data.email,
      username: data.username,
      display_name: data.displayName || data.username,
      password_hash: passwordHash,
    }).returning(['id', 'email', 'username']);

    // Assign default viewer role
    const viewerRole = await db('roles').where({ name: 'viewer' }).first();
    if (viewerRole) {
      await db('user_roles').insert({ user_id: user.id, role_id: viewerRole.id });
    }

    auditLog('USER_REGISTERED', user.id, { email: data.email, ip: req.ip || 'unknown' });
    res.status(201).json({ message: 'Registration successful', userId: user.id });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ===== LOGIN =====
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await db('users').where({ email: data.email }).first();
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check account lock
    const lockStatus = await checkAccountLock(user.id);
    if (lockStatus.locked) {
      auditLog('LOGIN_ATTEMPT_LOCKED', user.id, { ip: req.ip || 'unknown' });
      res.status(423).json({ error: `Account locked. Try again in ${lockStatus.minutesRemaining} minutes.` });
      return;
    }

    // Verify password
    const valid = await verifyPassword(user.password_hash, data.password);
    if (!valid) {
      const locked = await recordFailedLogin(user.id, req.ip || 'unknown');
      auditLog('LOGIN_FAILED', user.id, { ip: req.ip || 'unknown' });
      res.status(401).json({
        error: 'Invalid credentials',
        ...(locked && { message: 'Account has been locked due to too many failed attempts' }),
      });
      return;
    }

    // Check if account is active
    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    await resetFailedAttempts(user.id);

    // Device fingerprinting
    const fingerprint = (req as any).deviceFingerprint || data.deviceFingerprint || '';
    if (fingerprint) {
      await registerDevice(user.id, fingerprint, req.ip || 'unknown', req.headers['user-agent'] || '');
    }

    // Get roles & permissions
    const { roles, permissions } = await getUserRolesAndPermissions(user.id);

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email, roles, permissions });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db('refresh_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      device_fingerprint: fingerprint || null,
      ip_address: req.ip || null,
      user_agent: req.headers['user-agent'] || null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Update last login
    await db('users').where({ id: user.id }).update({
      last_login_at: new Date(),
      last_login_ip: req.ip || null,
      last_user_agent: req.headers['user-agent'] || null,
    });

    // Set secure cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    auditLog('LOGIN_SUCCESS', user.id, { ip: req.ip || 'unknown', fingerprint: fingerprint?.slice(0, 8) });

    res.json({
      accessToken,
      user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, roles },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Login failed' });
  }
});

// ===== REFRESH TOKEN =====
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }

    const decoded = verifyToken(token);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const stored = await db('refresh_tokens').where({ token_hash: tokenHash, is_revoked: false }).first();

    if (!stored || new Date(stored.expires_at) < new Date()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Rotate refresh token
    await db('refresh_tokens').where({ id: stored.id }).update({ is_revoked: true });

    const { roles, permissions } = await getUserRolesAndPermissions(decoded.userId);
    const newAccessToken = generateAccessToken({ userId: decoded.userId, email: decoded.email, roles, permissions });
    const newRefreshToken = generateRefreshToken({ userId: decoded.userId });

    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    await db('refresh_tokens').insert({
      user_id: decoded.userId,
      token_hash: newHash,
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// ===== LOGOUT =====
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    // Revoke all refresh tokens for this user
    await db('refresh_tokens').where({ user_id: req.user!.userId }).update({ is_revoked: true });
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    auditLog('LOGOUT', req.user!.userId, { ip: req.ip || 'unknown' });
    res.json({ message: 'Logged out successfully' });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ===== CHANGE PASSWORD =====
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = registerSchema.pick({ password: true }).extend({ currentPassword: z.string() });
    const { currentPassword, password } = schema.parse(req.body);

    const user = await db('users').where({ id: req.user!.userId }).first();
    const valid = await verifyPassword(user.password_hash, currentPassword);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = await hashPassword(password);
    await db('users').where({ id: req.user!.userId }).update({ password_hash: newHash, password_changed_at: new Date() });

    // Revoke all tokens to force re-login
    await db('refresh_tokens').where({ user_id: req.user!.userId }).update({ is_revoked: true });

    auditLog('PASSWORD_CHANGED', req.user!.userId, { ip: req.ip || 'unknown' });
    res.json({ message: 'Password changed. Please log in again.' });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Password change failed' });
  }
});

// ===== GET CURRENT USER =====
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await db('users')
      .where({ id: req.user!.userId })
      .select('id', 'email', 'username', 'display_name', 'is_active', 'email_verified', 'last_login_at', 'created_at')
      .first();
    const { roles, permissions } = await getUserRolesAndPermissions(req.user!.userId);
    res.json({ ...user, roles, permissions });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Need to import z for change-password validation
import { z } from 'zod';

export default router;
