import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticate, requireRole, requirePermission } from '../middleware/auth.middleware.js';
import { auditLog } from '../utils/logger.js';
import { getUserRolesAndPermissions } from '../services/auth.service.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ===== LIST USERS (admin only) =====
router.get('/', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const users = await db('users')
      .select('id', 'email', 'username', 'display_name', 'is_active', 'email_verified', 'last_login_at', 'failed_login_attempts', 'locked_until', 'created_at')
      .orderBy('created_at', 'desc');

    const enriched = await Promise.all(users.map(async (u: any) => {
      const { roles } = await getUserRolesAndPermissions(u.id);
      return { ...u, roles };
    }));

    res.json(enriched);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ===== GET USER BY ID =====
router.get('/:id', requirePermission('users', 'read'), async (req: Request, res: Response) => {
  try {
    const user = await db('users').where({ id: req.params.id })
      .select('id', 'email', 'username', 'display_name', 'is_active', 'email_verified', 'last_login_at', 'created_at')
      .first();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    const { roles, permissions } = await getUserRolesAndPermissions(user.id);
    res.json({ ...user, roles, permissions });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ===== UPDATE USER (admin) =====
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      displayName: z.string().max(200).optional(),
      isActive: z.boolean().optional(),
      emailVerified: z.boolean().optional(),
    });
    const data = schema.parse(req.body);
    const updates: Record<string, unknown> = {};
    if (data.displayName !== undefined) updates.display_name = data.displayName;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    if (data.emailVerified !== undefined) updates.email_verified = data.emailVerified;

    await db('users').where({ id: req.params.id }).update(updates);
    auditLog('USER_UPDATED', req.user!.userId, { targetUser: req.params.id, changes: Object.keys(updates) });
    res.json({ message: 'User updated' });
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Update failed' });
  }
});

// ===== ASSIGN ROLE =====
router.post('/:id/roles', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { roleName } = z.object({ roleName: z.string() }).parse(req.body);
    const role = await db('roles').where({ name: roleName }).first();
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }

    await db('user_roles').insert({ user_id: req.params.id, role_id: role.id }).onConflict(['user_id', 'role_id']).ignore();
    auditLog('ROLE_ASSIGNED', req.user!.userId, { targetUser: req.params.id, role: roleName });
    res.json({ message: `Role '${roleName}' assigned` });
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ error: 'Validation failed' }); return; }
    res.status(500).json({ error: 'Role assignment failed' });
  }
});

// ===== REMOVE ROLE =====
router.delete('/:id/roles/:roleName', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const role = await db('roles').where({ name: req.params.roleName }).first();
    if (!role) { res.status(404).json({ error: 'Role not found' }); return; }

    await db('user_roles').where({ user_id: req.params.id, role_id: role.id }).del();
    auditLog('ROLE_REMOVED', req.user!.userId, { targetUser: req.params.id, role: req.params.roleName });
    res.json({ message: `Role '${req.params.roleName}' removed` });
  } catch {
    res.status(500).json({ error: 'Role removal failed' });
  }
});

// ===== UNLOCK ACCOUNT =====
router.post('/:id/unlock', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await db('users').where({ id: req.params.id }).update({ failed_login_attempts: 0, locked_until: null });
    auditLog('ACCOUNT_UNLOCKED', req.user!.userId, { targetUser: req.params.id });
    res.json({ message: 'Account unlocked' });
  } catch {
    res.status(500).json({ error: 'Unlock failed' });
  }
});

// ===== GET DEVICES =====
router.get('/:id/devices', async (req: Request, res: Response) => {
  try {
    // Users can only see their own devices unless admin
    if (req.user!.userId !== req.params.id && !req.user!.roles.includes('admin')) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const devices = await db('device_fingerprints').where({ user_id: req.params.id })
      .select('id', 'device_name', 'is_trusted', 'last_seen_at', 'ip_address', 'created_at')
      .orderBy('last_seen_at', 'desc');
    res.json(devices);
  } catch {
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

export default router;
