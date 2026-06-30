import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';

import { env } from '../../config/env.js';

// Verifies Meta's inbound webhook signature: X-Hub-Signature-256 must equal
// "sha256=" + HMAC-SHA256(appSecret, rawBody). Without this, anyone who knows
// the public webhook URL could POST forged "inbound" messages (DB pollution,
// OpenAI spend, outbound sends to attacker numbers).
//
// If WHATSAPP_APP_SECRET is not configured:
//   - in production we FAIL CLOSED (reject every inbound request) so a missing
//     secret can never silently re-open the webhook to forged messages;
//   - outside production we log a loud warning and allow the request through so
//     local/pre-launch testing still works.
let warned = false;

export const verifyWhatsAppSignature = (req: Request, res: Response, next: NextFunction) => {
  const secret = env.WHATSAPP_APP_SECRET;

  if (!secret) {
    if (env.NODE_ENV === 'production') {
      console.error('[WhatsApp] WHATSAPP_APP_SECRET is not set — rejecting inbound webhook (fail-closed in production).');
      return res.status(503).json({ success: false, message: 'Webhook signature verification not configured' });
    }
    if (!warned) {
      console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — inbound webhook signatures are NOT verified (non-production). Set it before going live.');
      warned = true;
    }
    return next();
  }

  const signature = req.header('x-hub-signature-256') ?? '';
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!raw || !signature.startsWith('sha256=')) {
    return res.status(401).json({ success: false, message: 'Missing or malformed webhook signature' });
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn('[WhatsApp] Rejected inbound webhook with invalid signature.');
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }

  return next();
};
