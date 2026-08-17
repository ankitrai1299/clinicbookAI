// The staff side of patient rights: the queue, and the export.
//
// The patient's half is on WhatsApp (whatsappRights.ts). This is what the clinic
// sees — what has been asked, what is owed, what is late, and the machine-
// readable file to hand over.
//
// Exporting one patient's entire record is the most powerful read in the
// product, so it has its own permission rather than riding on patient.read. A
// receptionist may look up a patient to book them; that is not the same as
// pulling every consultation, recording reference and message they have ever
// had into one file.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { requirePermission } from '../authz/requirePermission.js';
import { recordFromRequest } from '../audit/audit.service.js';
import { buildPatientExport, summariseExport } from './export.js';
import {
  RIGHTS_KINDS,
  closeRightsRequest,
  createRightsRequest,
  listRightsRequests,
  overdueRightsRequests
} from './rights.service.js';

const rightsRouter = Router();

rightsRouter.use(requireAuth);

const clinicOf = (req: Request): string => {
  const clinicId = req.user?.clinicId;
  if (!clinicId) throw new AppError('Authentication required', 401);
  return clinicId;
};

const listQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

/** GET /api/rights/requests — the queue, oldest deadline first. */
rightsRouter.get(
  '/requests',
  requirePermission('patient.read'),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const clinicId = clinicOf(req);

    const [requests, overdue] = await Promise.all([
      listRightsRequests(clinicId, q.status, q.limit),
      overdueRightsRequests(clinicId)
    ]);

    res.json({
      success: true,
      data: {
        requests,
        // Surfaced separately because "how late are we?" is the question that
        // matters and it should not have to be worked out from a list.
        overdueCount: overdue.length,
        oldestOverdueDueAt: overdue[0]?.dueAt ?? null
      }
    });
  })
);

const createSchema = z.object({
  patientId: z.string().trim().min(1),
  kind: z.enum(RIGHTS_KINDS),
  message: z.string().trim().max(500).optional()
});

/**
 * POST /api/rights/requests — log a request that arrived some other way.
 *
 * A patient who asks at the front desk or on the phone has made the same request
 * as one who typed it on WhatsApp, and it must land in the same queue with the
 * same clock. Without this the desk-side request has no record and no deadline.
 */
rightsRouter.post(
  '/requests',
  requirePermission('patient.update'),
  validate(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const body = req.body as z.infer<typeof createSchema>;

    const row = await createRightsRequest({
      clinicId,
      patientId: body.patientId,
      kind: body.kind,
      channel: 'staff',
      message: body.message ?? null
    });
    if (!row) throw new AppError('Could not record the request. Please try again.', 500);

    res.status(201).json({ success: true, data: row });
  })
);

const closeSchema = z.object({
  status: z.enum(['fulfilled', 'refused']),
  outcome: z.string().trim().min(5, 'Say what was done, or why it was refused').max(2000)
});

/**
 * POST /api/rights/requests/:id/close
 *
 * `outcome` is mandatory and is the whole point of the endpoint. "Refused" is a
 * legitimate answer — "erasure declined: this record is inside the retention
 * period the clinic must observe" is a complete and defensible response — but it
 * has to be written down, because the question asked later is not "what is the
 * status" but "what did you decide, and why".
 */
rightsRouter.post(
  '/requests/:id/close',
  requirePermission('patient.update'),
  validate(closeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const body = req.body as z.infer<typeof closeSchema>;

    const closed = await closeRightsRequest({
      clinicId,
      id: req.params.id,
      status: body.status,
      outcome: body.outcome,
      actorId: req.user?.userId ?? null,
      actorEmail: req.user?.email ?? null,
      actorRole: req.user?.role ?? null
    });

    if (!closed) throw new AppError('Request not found, or already closed', 404);

    res.json({ success: true, data: { id: req.params.id, status: body.status } });
  })
);

/**
 * GET /api/rights/export/:patientId — everything held about one patient.
 *
 * Downloaded as a file, and audited as PATIENT_DATA_EXPORTED with a count per
 * section. The audit row deliberately records the SHAPE of what left rather than
 * its contents — enough to prove what was handed over, without the audit log
 * becoming a second copy of it.
 */
rightsRouter.get(
  '/export/:patientId',
  requirePermission('patient.export'),
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = clinicOf(req);
    const patientId = req.params.patientId;

    let exported;
    try {
      exported = await buildPatientExport(clinicId, patientId);
    } catch {
      // Scoped by clinic inside the builder, so a patient id from another tenant
      // reads as "not found" rather than confirming the id exists.
      throw new AppError('Patient not found', 404);
    }

    const counts = summariseExport(exported);

    recordFromRequest(req, {
      action: 'PATIENT_DATA_EXPORTED',
      resourceType: 'patient',
      resourceId: patientId,
      patientId,
      metadata: {
        sections: Object.keys(counts).length,
        rows: Object.values(counts).reduce((a, b) => a + b, 0)
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="patient-${patientId}-data.json"`);
    res.send(JSON.stringify(exported, null, 2));
  })
);

export default rightsRouter;
