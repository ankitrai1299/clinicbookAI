// Answering the ABDM gateway.
//
// ── Why every answer is a separate outbound call ───────────────────────────
//
// The HIE-CM APIs are asynchronous. When ABDM calls one of our endpoints, the
// body of our HTTP response carries NO answer — it is only an acknowledgement
// that we received the request, and it has to arrive within about five seconds.
// The real answer is a fresh call we make BACK to the gateway, minutes later if
// need be, on a matching `on-` endpoint.
//
// That shape has a security consequence worth stating, because it is not
// obvious and it is the reason these endpoints can be unauthenticated: whoever
// calls our discovery endpoint learns nothing from doing so. The answer never
// travels back down that connection — it goes to the gateway. So a stranger
// probing us cannot use it to ask "is this person a patient at that clinic?",
// which is exactly the question a synchronous design would have answered.
//
// ── `resp.requestId` is not optional ───────────────────────────────────────
//
// Every callback must echo the requestId of the call it answers, inside `resp`.
// The gateway uses it to match our answer to the waiting request; without it the
// answer is dropped, and the patient's app simply spins until it times out.

import { randomUUID } from 'node:crypto';

import { abdmClient } from './abdmSession.js';

/** The `resp` envelope every ABDM callback carries. */
interface RespondingTo {
  requestId: string;
}

export interface AbdmError {
  code: number;
  message: string;
}

/**
 * ABDM error codes we actually use.
 *
 * An error callback is a real, expected answer — not a failure on our part. A
 * patient who has never been to this clinic SHOULD produce a "no match", and
 * saying so promptly is better behaviour than silence, which leaves the
 * patient's app waiting for a timeout.
 */
export const ABDM_ERROR = {
  /** Nobody at this clinic matches the person the gateway described. */
  NO_PATIENT_FOUND: { code: 3404, message: 'No patient found' },
  /** More than one patient matched, so answering would risk the wrong records. */
  MULTIPLE_PATIENTS_FOUND: { code: 3403, message: 'Multiple patients found' },
  /** The X-HIP-ID does not correspond to any clinic on this bridge. */
  UNKNOWN_FACILITY: { code: 3404, message: 'Unknown facility' },
  /** We understand the call but have not built this flow yet. */
  NOT_SUPPORTED: { code: 2500, message: 'Operation not supported yet' }
} as const;

/**
 * POST an answer back to the gateway.
 *
 * Never throws. A callback that fails is logged and dropped: it is already
 * running detached from the request that triggered it, so there is nobody left
 * to hand an exception to, and letting it reject would only produce an
 * unhandled rejection at some unrelated point in the process.
 */
export const postCallback = async (
  path: string,
  body: Record<string, unknown>,
  respondingTo: RespondingTo
): Promise<void> => {
  try {
    const client = await abdmClient();
    await client.post(path, {
      // The gateway reads requestId/timestamp off the body as well as the
      // headers, and rejects a body that omits them.
      requestId: randomUUID(),
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z'),
      ...body,
      resp: { requestId: respondingTo.requestId }
    });
  } catch (err) {
    const detail =
      err && typeof err === 'object' && 'response' in err
        ? JSON.stringify((err as { response?: { data?: unknown } }).response?.data)
        : String(err);
    console.error(`[ABDM] callback ${path} failed:`, detail);
  }
};

/** Tell the gateway we cannot answer, and why. */
export const postError = (
  path: string,
  error: AbdmError,
  respondingTo: RespondingTo,
  extra: Record<string, unknown> = {}
): Promise<void> => postCallback(path, { ...extra, error }, respondingTo);
