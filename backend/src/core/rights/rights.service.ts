// Patient rights requests: recording them, and closing them.
//
// The identity problem is the whole design. A patient has no account — by
// product decision, not oversight — so "prove you are who you say" cannot mean a
// password. What it CAN mean is the number: Meta has verified it, the clinic
// knows the patient by it, and a request about that number's own record,
// arriving from that number, is as good an identity check as this product can
// offer. It is stated here rather than assumed, because the whole mechanism
// rests on it.
//
// ERASURE IS NEVER EXECUTED HERE. Indian medical-record rules require clinics to
// retain records for years and DPDP's erasure right yields to that; which
// records and for how long is still a legal question (audit §8). So an erasure
// request creates a row, starts a clock and tells a human — and the human
// decides, in writing. Deleting a record the clinic is legally required to keep
// would be a worse failure than not deleting it, and it would be irreversible.

import { prisma } from '../../config/prisma.js';
import { record } from '../audit/audit.service.js';
import { phoneKey } from '../consent/consent.service.js';

export const RIGHTS_KINDS = ['access', 'correction', 'erasure', 'grievance'] as const;
export type RightsKind = (typeof RIGHTS_KINDS)[number];

/**
 * How long the clinic has to respond, in days.
 *
 * This is OUR commitment, not a statute. The DPDP Rules set their own periods
 * and they must be confirmed with counsel before this number is quoted to a
 * patient as a legal one — the audit's §8 lists it. Seven days is short enough
 * to be meaningful and long enough that a small clinic can meet it.
 */
export const RESPONSE_DAYS = Number(process.env.RIGHTS_RESPONSE_DAYS) || 7;

export interface CreateRequestInput {
  clinicId: string;
  patientId: string;
  kind: RightsKind;
  channel?: 'whatsapp' | 'staff' | 'web';
  phone?: string | null;
  /** The patient's own words, capped. Never clinical content. */
  message?: string | null;
}

/**
 * Record a request and start its clock.
 *
 * Returns the row, or null if it could not be written. The caller must NOT tell
 * the patient their request was received when this returns null: a promise we
 * have no record of is worse than an error message, because the patient stops
 * chasing it.
 */
export const createRightsRequest = async (input: CreateRequestInput) => {
  try {
    const dueAt = new Date(Date.now() + RESPONSE_DAYS * 24 * 60 * 60_000);

    const row = await prisma.patientRightsRequest.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        phoneKey: input.phone ? phoneKey(input.phone) : null,
        kind: input.kind,
        channel: input.channel ?? 'whatsapp',
        message: (input.message || '').slice(0, 500) || null,
        dueAt
      }
    });

    record({
      clinicId: input.clinicId,
      patientId: input.patientId,
      actorType: 'patient',
      action: 'RIGHTS_REQUEST_RECEIVED',
      resourceType: 'rights_request',
      resourceId: row.id,
      metadata: { kind: input.kind, channel: input.channel ?? 'whatsapp', dueAt: dueAt.toISOString() }
    });

    return row;
  } catch (err) {
    console.error('[rights] could not record the request', input.kind, err);
    return null;
  }
};

/** Open requests for a clinic, oldest deadline first — the order to work in. */
export const listRightsRequests = (
  clinicId: string,
  status: 'open' | 'closed' | 'all' = 'open',
  limit = 100
) =>
  prisma.patientRightsRequest.findMany({
    where: {
      clinicId,
      ...(status === 'open' ? { status: 'open' } : {}),
      ...(status === 'closed' ? { status: { not: 'open' } } : {})
    },
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    take: limit
  });

/**
 * Close a request with what was actually done.
 *
 * `outcome` is required and free text: "you were asked, what happened?" is the
 * question a regulator puts six months later, and a status field alone cannot
 * answer it. Refusing is a legitimate outcome — a clinic must be able to write
 * "erasure declined: this record is within the 3-year retention period" — so
 * the vocabulary includes it rather than forcing everything into "fulfilled".
 */
export const closeRightsRequest = async (params: {
  clinicId: string;
  id: string;
  status: 'fulfilled' | 'refused';
  outcome: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}): Promise<boolean> => {
  const { count } = await prisma.patientRightsRequest.updateMany({
    where: { id: params.id, clinicId: params.clinicId, status: 'open' },
    data: {
      status: params.status,
      outcome: params.outcome.slice(0, 2000),
      fulfilledAt: new Date(),
      fulfilledBy: params.actorEmail ?? null
    }
  });
  if (!count) return false;

  const row = await prisma.patientRightsRequest.findFirst({
    where: { id: params.id, clinicId: params.clinicId },
    select: { patientId: true, kind: true }
  });

  record({
    clinicId: params.clinicId,
    patientId: row?.patientId ?? null,
    actorId: params.actorId ?? null,
    actorType: 'user',
    actorRole: params.actorRole ?? null,
    action: 'RIGHTS_REQUEST_FULFILLED',
    resourceType: 'rights_request',
    resourceId: params.id,
    outcome: params.status === 'fulfilled' ? 'success' : 'failure',
    reason: params.status === 'refused' ? 'refused' : null,
    metadata: { kind: row?.kind ?? '', decision: params.status, outcome: params.outcome.slice(0, 200) }
  });

  return true;
};

/** Requests past their due date. What a clinic is late on, and by how long. */
export const overdueRightsRequests = (clinicId: string) =>
  prisma.patientRightsRequest.findMany({
    where: { clinicId, status: 'open', dueAt: { lt: new Date() } },
    orderBy: { dueAt: 'asc' }
  });
