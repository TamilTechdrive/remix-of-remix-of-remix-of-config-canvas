import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

// ===== LIST AUDIT LOGS (admin) =====
router.get('/', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      userId: z.string().uuid().optional(),
      event: z.string().optional(),
      severity: z.enum(['info', 'warning', 'critical']).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
    });
    const filters = schema.parse(req.query);

    const query = db('audit_logs')
      .leftJoin('users', 'users.id', 'audit_logs.user_id')
      .select('audit_logs.*', 'users.email as user_email')
      .orderBy('audit_logs.created_at', 'desc');

    if (filters.userId) query.where('audit_logs.user_id', filters.userId);
    if (filters.event) query.where('audit_logs.event', 'like', `%${filters.event}%`);
    if (filters.severity) query.where('audit_logs.severity', filters.severity);
    if (filters.from) query.where('audit_logs.created_at', '>=', filters.from);
    if (filters.to) query.where('audit_logs.created_at', '<=', filters.to);

    const offset = (filters.page - 1) * filters.limit;
    const logs = await query.limit(filters.limit).offset(offset);
    const [{ count }] = await db('audit_logs').count('* as count');

    res.json({ data: logs, total: parseInt(count as string), page: filters.page });
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ error: 'Invalid filters', details: error.errors }); return; }
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ===== SECURITY DASHBOARD (admin) =====
router.get('/dashboard', requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    const [failedLogins] = await db('audit_logs').where('event', 'LOGIN_FAILED').where('created_at', '>', db.raw("NOW() - INTERVAL '24 hours'")).count('* as count');
    const [lockedAccounts] = await db('users').whereNotNull('locked_until').where('locked_until', '>', db.fn.now()).count('* as count');
    const [newDevices] = await db('audit_logs').where('event', 'NEW_DEVICE_DETECTED').where('created_at', '>', db.raw("NOW() - INTERVAL '24 hours'")).count('* as count');
    const [suspiciousActivity] = await db('audit_logs').where('severity', 'critical').where('created_at', '>', db.raw("NOW() - INTERVAL '24 hours'")).count('* as count');
    const recentEvents = await db('audit_logs').whereIn('severity', ['warning', 'critical']).orderBy('created_at', 'desc').limit(10);

    res.json({
      last24h: {
        failedLogins: parseInt((failedLogins as any).count),
        lockedAccounts: parseInt((lockedAccounts as any).count),
        newDevices: parseInt((newDevices as any).count),
        suspiciousActivity: parseInt((suspiciousActivity as any).count),
      },
      recentEvents,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

export default router;
