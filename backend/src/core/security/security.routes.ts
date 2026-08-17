// Reading and closing security alerts.
//
// Gated on `audit.read` rather than a new permission: someone who may read the
// audit trail is exactly the person who should see what fired against it, and
// adding a second, near-identical permission would only create a way for the two
// to drift apart.
//
// Acknowledging is a WRITE, and it is the only one — an alert cannot be deleted,
// only closed with a reason. That reason is what a regulator asks for six months
// later ("you were alerted; what did you conclude?"), and an alert someone could
// simply make disappear would not survive that question.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { requirePermission } from '../authz/requirePermission.js';
import { recordFromRequest } from '../audit/audit.service.js';

const securityRouter = Router();

securityRouter.use(requireAuth, resolveTenant, requirePermission('audit.read'));

const listQuerySchema = z.object({
  /** Default: only what is still open, which is what a person wants to see. */
  status: z.enum(['open', 'acknowledged', 'all']).default('open'),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const resolveSchema = z.object({
  resolution: z.string().trim().min(3, 'Say what you concluded').max(500)
});

/**
 * GET /api/security/alerts
 *
 * Clinic-scoped through req.db, so one clinic never sees another's. Alerts with
 * no clinic (failed sign-ins, detected before any clinic is known) are invisible
 * here by construction and are reviewed server-side — the same rule as the audit
 * rows they come from.
 */
securityRouter.get(
  '/alerts',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const db = req.db;
    if (!db) throw new AppError('Tenant not resolved', 500);

    const where: Record<string, unknown> = {};
    if (q.status === 'open') where.acknowledgedAt = null;
    if (q.status === 'acknowledged') where.acknowledgedAt = { not: null };
    if (q.severity) where.severity = q.severity;

    const alerts = await db.securityAlert.findMany({
      where,
      orderBy: [{ acknowledgedAt: 'asc' }, { createdAt: 'desc' }],
      take: q.limit
    });

    res.json({ success: true, data: alerts });
  })
);

/**
 * POST /api/security/alerts/:id/acknowledge
 *
 * Closes an alert with a written conclusion. Who closed it and what they said
 * is stamped on the row AND recorded in the audit trail, because "we looked and
 * it was a stuck receptionist" is itself a finding someone may need to check.
 */
securityRouter.post(
  '/alerts/:id/acknowledge',
  validate(resolveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const db = req.db;
    if (!db) throw new AppError('Tenant not resolved', 500);

    const { resolution } = req.body as z.infer<typeof resolveSchema>;

    // updateMany, not update: the tenant client constrains the where clause, so
    // an id from another clinic matches nothing instead of throwing a 500 that
    // would confirm the row exists.
    const { count } = await db.securityAlert.updateMany({
      where: { id: req.params.id, acknowledgedAt: null },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: req.user?.email ?? null,
        resolution
      }
    });

    if (!count) throw new AppError('Alert not found, or already closed', 404);

    recordFromRequest(req, {
      action: 'SECURITY_ALERT_ACKNOWLEDGED',
      resourceType: 'security_alert',
      resourceId: req.params.id,
      metadata: { resolution }
    });

    res.json({ success: true, data: { id: req.params.id, acknowledged: true } });
  })
);

export default securityRouter;
