import { Router, type Request, type Response } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ensureClinicJoinCode } from '../whatsapp/whatsapp.binding.js';
import { getMyClinicHandler, registerClinicHandler, updateMyClinicHandler } from './clinic.controller.js';
import { registerClinicSchema, updateClinicSchema } from './clinic.schemas.js';

const clinicRouter = Router();

clinicRouter.post('/register', authLimiter, validate(registerClinicSchema), registerClinicHandler);
clinicRouter.get('/me', requireAuth, getMyClinicHandler);
clinicRouter.patch('/me', requireAuth, validate(updateClinicSchema), updateMyClinicHandler);

// The clinic's shareable WhatsApp join link + code. Patients scan the QR / open
// the link on the shared platform number and are routed to THIS clinic — zero
// Meta setup for the clinic.
clinicRouter.get(
  '/whatsapp-link',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const clinicId = (req as Request & { user?: { clinicId?: string } }).user?.clinicId;
    if (!clinicId) throw new AppError('Authentication required', 401);

    const joinCode = await ensureClinicJoinCode(clinicId);

    // The shared platform number = the display number of the platform clinic's channel.
    let sharedNumber: string | null = null;
    if (env.WHATSAPP_CLINIC_ID) {
      const ch = await prisma.whatsAppChannel.findFirst({
        where: { clinicId: env.WHATSAPP_CLINIC_ID },
        select: { displayPhoneNumber: true }
      });
      sharedNumber = (ch?.displayPhoneNumber || '').replace(/\D/g, '') || null;
    }

    const prefill = `join ${joinCode}`;
    const link = sharedNumber ? `https://wa.me/${sharedNumber}?text=${encodeURIComponent(prefill)}` : null;

    res.json({
      success: true,
      data: {
        joinCode,
        sharedNumber,
        prefillText: prefill,
        link,
        instruction: `Share this link/QR with your patients. They open it and send "${prefill}" — every message then reaches your clinic.`
      }
    });
  })
);

export default clinicRouter;
