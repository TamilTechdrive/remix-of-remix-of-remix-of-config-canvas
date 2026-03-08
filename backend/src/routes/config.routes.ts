import { Router, Request, Response } from 'express';
import { db } from '../database/connection.js';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import { encryptConfig, decryptConfig } from '../services/auth.service.js';
import { auditLog } from '../utils/logger.js';
import { z } from 'zod';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

const router = Router();
router.use(authenticate);

const configSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  configData: z.record(z.unknown()),
  encrypt: z.boolean().optional().default(false),
  encryptionKey: z.string().min(16).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});

// ===== LIST CONFIGS =====
router.get('/', requirePermission('configurations', 'read'), async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const query = db('configurations')
      .where({ owner_id: req.user!.userId })
      .select('id', 'name', 'description', 'is_encrypted', 'version', 'status', 'created_at', 'updated_at')
      .orderBy('updated_at', 'desc');

    if (status) query.andWhere({ status });

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const configs = await query.limit(parseInt(limit as string)).offset(offset);
    const [{ count }] = await db('configurations').where({ owner_id: req.user!.userId }).count('* as count');

    res.json({ data: configs, total: parseInt(count as string), page: parseInt(page as string) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch configurations' });
  }
});

// ===== GET CONFIG =====
router.get('/:id', requirePermission('configurations', 'read'), async (req: Request, res: Response) => {
  try {
    const config = await db('configurations').where({ id: req.params.id, owner_id: req.user!.userId }).first();
    if (!config) { res.status(404).json({ error: 'Configuration not found' }); return; }

    let configData = config.config_data;
    if (config.is_encrypted) {
      const key = req.headers['x-encryption-key'] as string;
      if (!key) { res.status(400).json({ error: 'Encryption key required in X-Encryption-Key header' }); return; }
      try {
        const parsed = typeof configData === 'string' ? JSON.parse(configData) : configData;
        const decrypted = decryptConfig(parsed.encrypted, key, parsed.iv, parsed.tag);
        configData = JSON.parse(decrypted);
      } catch {
        res.status(400).json({ error: 'Decryption failed - invalid key' }); return;
      }
    }

    auditLog('CONFIG_ACCESSED', req.user!.userId, { configId: req.params.id });
    res.json({ ...config, config_data: configData });
  } catch {
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// ===== CREATE CONFIG =====
router.post('/', requirePermission('configurations', 'create'), async (req: Request, res: Response) => {
  try {
    const data = configSchema.parse(req.body);

    // Sanitize string values in config
    const sanitizedData = sanitizeConfigData(data.configData);

    let configData: unknown = sanitizedData;
    let isEncrypted = false;

    if (data.encrypt && data.encryptionKey) {
      const encrypted = encryptConfig(JSON.stringify(sanitizedData), data.encryptionKey);
      configData = encrypted;
      isEncrypted = true;
    }

    const [config] = await db('configurations').insert({
      owner_id: req.user!.userId,
      name: purify.sanitize(data.name),
      description: data.description ? purify.sanitize(data.description) : null,
      config_data: JSON.stringify(configData),
      is_encrypted: isEncrypted,
      status: data.status || 'draft',
    }).returning('*');

    auditLog('CONFIG_CREATED', req.user!.userId, { configId: config.id, encrypted: isEncrypted });
    res.status(201).json(config);
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Failed to create configuration' });
  }
});

// ===== UPDATE CONFIG =====
router.put('/:id', requirePermission('configurations', 'update'), async (req: Request, res: Response) => {
  try {
    const existing = await db('configurations').where({ id: req.params.id, owner_id: req.user!.userId }).first();
    if (!existing) { res.status(404).json({ error: 'Configuration not found' }); return; }

    const data = configSchema.partial().parse(req.body);
    const updates: Record<string, unknown> = { version: existing.version + 1 };

    if (data.name) updates.name = purify.sanitize(data.name);
    if (data.description !== undefined) updates.description = data.description ? purify.sanitize(data.description) : null;
    if (data.status) updates.status = data.status;
    if (data.configData) {
      const sanitized = sanitizeConfigData(data.configData);
      if (data.encrypt && data.encryptionKey) {
        updates.config_data = JSON.stringify(encryptConfig(JSON.stringify(sanitized), data.encryptionKey));
        updates.is_encrypted = true;
      } else {
        updates.config_data = JSON.stringify(sanitized);
      }
    }

    await db('configurations').where({ id: req.params.id }).update(updates);
    auditLog('CONFIG_UPDATED', req.user!.userId, { configId: req.params.id, version: updates.version });
    res.json({ message: 'Configuration updated', version: updates.version });
  } catch (error: any) {
    if (error.name === 'ZodError') { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Update failed' });
  }
});

// ===== DELETE CONFIG =====
router.delete('/:id', requirePermission('configurations', 'delete'), async (req: Request, res: Response) => {
  try {
    const deleted = await db('configurations').where({ id: req.params.id, owner_id: req.user!.userId }).del();
    if (!deleted) { res.status(404).json({ error: 'Configuration not found' }); return; }
    auditLog('CONFIG_DELETED', req.user!.userId, { configId: req.params.id });
    res.json({ message: 'Configuration deleted' });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ===== SANITIZE HELPER =====
function sanitizeConfigData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = purify.sanitize(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeConfigData(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((v) =>
        typeof v === 'string' ? purify.sanitize(v) :
        typeof v === 'object' && v !== null ? sanitizeConfigData(v as Record<string, unknown>) : v
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export default router;
