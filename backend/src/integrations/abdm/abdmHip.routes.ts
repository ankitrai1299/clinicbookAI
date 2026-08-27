// The endpoints ABDM calls on US — our side of the HIP contract.
//
// This whole router is the "callback URL" registered against our bridge. One
// client id may carry only ONE callback URL, and every clinic on the platform
// is served through it; which clinic a call is for arrives in X-HIP-ID.
//
// ── Acknowledge in milliseconds, answer in minutes ─────────────────────────
//
// The gateway expects an HTTP 202 within about five seconds and treats a slow
// reply as a dead HIP. The response body carries no answer — the answer is a
// separate call we make back to the gateway. So every handler here does the
// least possible work, acknowledges, and hands off; nothing that touches the
// database happens before the response is sent.
//
// A consequence worth being explicit about: once acknowledged, an error has
// nowhere to go but a log and an error callback. There is no request left to
// fail. That is why the async half never throws.
//
// ── Why these endpoints have no authentication ─────────────────────────────
//
// ABDM v0.5 does not sign its calls, so there is no signature to check. What
// keeps this safe is the asynchronous design itself: the answer never travels
// back down the connection the request arrived on — it goes to the gateway. A
// stranger who POSTs to /care-contexts/discover therefore learns nothing at
// all, not even whether the person exists. The one thing they could do is make
// us send a callback nobody asked for, and the gateway discards those.
//
// This must be re-examined before production, where ABDM signs requests.

import { Router, type Request, type Response } from 'express';

import { ABDM_ERROR, postError } from './abdmCallback.js';
import { handleDiscovery } from './abdmHip.service.js';

const router = Router();

/**
 * The gateway names the facility in X-HIP-ID; it is the clinic's HFR id.
 *
 * Returned as-is rather than resolved to a clinic here, because resolving hits
 * the database and nothing may do that before the acknowledgement is sent.
 */
const hipIdOf = (req: Request): string | null => {
  const raw = req.header('X-HIP-ID');
  return raw && raw.trim() ? raw.trim() : null;
};

/**
 * Acknowledge, then run the real work detached.
 *
 * `void` on the promise is deliberate and the comment is here because it looks
 * like a mistake: the work MUST NOT be awaited, or the acknowledgement misses
 * its five-second window on exactly the requests that take longest.
 */
const ack = (res: Response, work: () => Promise<void>): void => {
  res.status(202).json({});
  void work().catch((err) => console.error('[ABDM] async handler failed:', err));
};

/** Everything the gateway sends carries these two. */
interface AbdmRequestBody {
  requestId?: string;
  transactionId?: string;
}

/**
 * A call we cannot serve yet.
 *
 * It still gets a real protocol answer. Acknowledging and then saying nothing
 * would leave the patient's app waiting for a timeout with no explanation,
 * which is worse for them than being told plainly that this HIP cannot do it.
 */
const notImplemented = (path: string) => (req: Request, res: Response) => {
  const body = (req.body ?? {}) as AbdmRequestBody;
  ack(res, async () => {
    console.info(`[ABDM] ${req.path} received but not implemented yet`);
    if (body.requestId) {
      await postError(path, ABDM_ERROR.NOT_SUPPORTED, { requestId: body.requestId });
    }
  });
};

// ── Discovery ──────────────────────────────────────────────────────────────
//
// "Is this person a patient of yours, and what visits do they have?" The entry
// point of the whole M2 flow: nothing else can happen until this answers.
router.post('/v0.5/care-contexts/discover', (req, res) => {
  const body = req.body ?? {};
  const hipId = hipIdOf(req);
  ack(res, () => handleDiscovery(hipId, body));
});

// ── Linking ────────────────────────────────────────────────────────────────
//
// Next: the patient picks visits from what discovery returned, receives an OTP,
// and the link is confirmed. Not built yet — see the note on notImplemented for
// why it answers rather than going quiet.
router.post('/v0.5/links/link/init', notImplemented('/gateway/v0.5/links/link/on-init'));
router.post('/v0.5/links/link/confirm', notImplemented('/gateway/v0.5/links/link/on-confirm'));

// ── Consent and the records themselves ─────────────────────────────────────
router.post('/v0.5/consents/hip/notify', notImplemented('/gateway/v0.5/consents/hip/on-notify'));
router.post(
  '/v0.5/health-information/hip/request',
  notImplemented('/gateway/v0.5/health-information/hip/on-request')
);

/**
 * Somewhere to point a browser at while setting the bridge URL up.
 *
 * Registering a callback URL is a one-shot action with a slow feedback loop —
 * ABDM caches it and takes minutes to propagate — so being able to confirm the
 * address is live and is ours, before registering it, is worth one route. It
 * deliberately reveals nothing about any clinic or patient.
 */
router.get('/', (_req, res) => {
  res.json({ service: 'abdm-hip', status: 'ok' });
});

export { router as abdmHipRouter };
export default router;
