// Reading the audit trail.
//
// GET only. There is no POST, PATCH or DELETE here and none may be added: the
// audit log is append-only, and the only writer is core/audit/audit.service.ts.
// That absence IS the access-control model — a route that cannot be called
// cannot be abused, whatever the caller's role.
//
// Reads go through `req.db`, the clinic-scoped Prisma client, so a clinic admin
// looking at their own audit trail physically cannot address another clinic's
// rows: AuditLog is in TENANT_MODELS and the extension injects the clinicId.
// Rows written before a clinic was known (FAILED_LOGIN for an unknown email)
// have a null clinicId and are therefore invisible here by construction — they
// are read server-side during an investigation, which is the correct audience.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { resolveTenant } from '../../middleware/tenant.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { requirePermission } from '../authz/requirePermission.js';
import { recordFromRequest } from './audit.service.js';
import { verifyChain, type ChainRow } from './audit.hash.js';

const auditRouter = Router();

auditRouter.use(requireAuth, resolveTenant);

// Reading the audit trail is itself an administrative act, so it needs a
// permission — and reading it is itself audited (AUDIT_LOG_VIEWED below).
auditRouter.use(requirePermission('audit.read'));

export const auditQuerySchema = z.object({
  patientId: z.string().trim().min(1).optional(),
  actorId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  // Capped: an audit view is for investigation, not for bulk export. A real
  // export belongs to the Phase 4 rights work, with its own permission.
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).optional()
});

auditRouter.get(
  '/',
  validate(auditQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof auditQuerySchema>;
    const db = req.db;
    if (!db) throw new AppError('Tenant not resolved', 500);

    const where: Record<string, unknown> = {};
    if (q.patientId) where.patientId = q.patientId;
    if (q.actorId) where.actorId = q.actorId;
    if (q.action) where.action = q.action;
    if (q.outcome) where.outcome = q.outcome;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {})
      };
    }

    const rows = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {})
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    // Looking at who accessed which patient is itself a patient-data access.
    recordFromRequest(req, {
      action: 'AUDIT_LOG_VIEWED',
      resourceType: 'audit',
      patientId: q.patientId ?? null,
      metadata: { returned: page.length, filteredBy: Object.keys(where).join(',') || 'none' }
    });

    res.json({
      success: true,
      data: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : null
    });
  })
);

/**
 * Chain integrity for this clinic's rows.
 *
 * Answers "has anything been altered or removed below the application?" — the
 * question the hash chain exists for. Returns the problems, not a boolean, so an
 * investigator can see exactly which rows are implicated.
 */
auditRouter.get(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const db = req.db;
    if (!db) throw new AppError('Tenant not resolved', 500);

    // Oldest first — verifyChain walks forward.
    const rows = (await db.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
      take: 5000
    })) as unknown as ChainRow[];

    const problems = verifyChain(rows);

    res.json({
      success: true,
      data: { checked: rows.length, intact: problems.length === 0, problems }
    });
  })
);

export default auditRouter;
