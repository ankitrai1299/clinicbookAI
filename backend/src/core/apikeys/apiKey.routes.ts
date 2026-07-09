// Dashboard-facing management of PUBLIC API keys. Authenticated by the clinic's
// JWT (requireAuth) — never by an api key, so a leaked partner key can never mint
// itself a stronger one, nor discover its siblings.
//
// Note this router deliberately does NOT use resolveTenant/req.db: apiKey.service
// works on the raw client because ApiKey is a routing table (see tenantScope.ts),
// and because a TEST key lives under the SANDBOX clinic's id, which a client
// scoped to the real clinic could never see. The service filters on the clinic's
// owned ids instead, so isolation is still enforced.

import { Router } from 'express';
import { z } from 'zod';
import { ApiKeyMode } from '@prisma/client';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { API_SCOPES, issueApiKey, listApiKeys, revokeApiKey } from './apiKey.service.js';
import { findSandboxClinic } from './sandbox.service.js';

const apiKeyRouter = Router();

apiKeyRouter.use(requireAuth);

const createKeySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  mode: z.nativeEnum(ApiKeyMode).default(ApiKeyMode.LIVE),
  // At least one scope, so a key that can do literally nothing is unreachable.
  scopes: z.array(z.enum(API_SCOPES)).min(1).default([...API_SCOPES])
});

const keyIdParamsSchema = z.object({ id: z.string().min(1) });

/** GET /api/api-keys — every key for this clinic AND its sandbox. */
apiKeyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const clinicId = req.user!.clinicId;
    const [keys, sandbox] = await Promise.all([listApiKeys(clinicId), findSandboxClinic(clinicId)]);
    res.status(200).json({
      success: true,
      data: { keys, sandboxClinicId: sandbox?.id ?? null }
    });
  })
);

/**
 * POST /api/api-keys — mint one. The plaintext is in this response and NOWHERE
 * else, ever; the UI must make the user copy it before closing the dialog.
 * A TEST key lazily provisions the clinic's sandbox twin + demo doctors.
 */
apiKeyRouter.post(
  '/',
  validate(createKeySchema),
  asyncHandler(async (req, res) => {
    const { name, mode, scopes } = req.body as z.infer<typeof createKeySchema>;
    const issued = await issueApiKey(req.user!.clinicId, name, { mode, scopes });
    res.status(201).json({ success: true, data: issued });
  })
);

/** DELETE /api/api-keys/:id — revoke. Immediate: resolveApiKey rejects on revokedAt. */
apiKeyRouter.delete(
  '/:id',
  validate(keyIdParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await revokeApiKey(req.user!.clinicId, req.params.id);
    res.status(200).json({ success: true, data: { id: req.params.id, revoked: true } });
  })
);

export default apiKeyRouter;
