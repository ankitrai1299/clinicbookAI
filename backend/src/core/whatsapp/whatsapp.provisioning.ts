// Post-connect provisioning — the two Meta steps that stand between "clinic
// clicked Connect WhatsApp" and "clinic can actually message patients".
//
// Embedded Signup gives us a phone_number_id + a token. That is NOT enough:
//
//   1. REGISTER THE NUMBER for Cloud API messaging.
//      A number obtained through Embedded Signup is claimed but not activated.
//      Until POST /{phoneNumberId}/register succeeds, EVERY send fails with
//      Meta error 133010 ("Phone number is not registered"). Registration also
//      sets the number's 6-digit two-step-verification PIN, which Meta then
//      remembers — so we generate one, store it encrypted, and reuse it for any
//      later re-register. A different PIN would be rejected (133005).
//
//   2. SUBMIT THE MESSAGE TEMPLATES to the clinic's OWN WABA.
//      A brand-new WABA has zero templates. Templates are the only way to reach
//      a patient outside the 24h customer-service window — reminders, booking
//      confirmations, prescription-ready. The platform's templates live on the
//      PLATFORM's WABA and are invisible to a clinic's WABA, so the canonical
//      set (whatsapp.templateDefs.ts) is re-submitted per clinic and Meta's
//      async verdict is mirrored into WhatsAppTemplateStatus.
//
// Everything here is BEST-EFFORT by design: a clinic that connected its number
// successfully must never see onboarding fail because template review is slow or
// a Graph call flaked. Failures are recorded and surfaced in the dashboard so
// they can be retried from the UI.
//
// Uses the RAW prisma client: WhatsAppChannel is the routing table and the
// clinicId is always supplied explicitly by the caller (same rule as
// whatsapp.onboarding.ts).

import crypto from 'crypto';

import { AxiosInstance } from 'axios';

import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { buildWhatsAppClient } from '../../config/whatsapp.js';
import { decryptSecret, deriveKey, encryptSecret } from './whatsapp.crypto.js';
import {
  TEMPLATE_DEFINITIONS,
  TEMPLATE_LANGUAGE,
  templateCreatePayload
} from './whatsapp.templateDefs.js';

const encKey = (): Buffer | null => (env.WA_CHANNEL_ENC_KEY ? deriveKey(env.WA_CHANNEL_ENC_KEY) : null);

interface MetaErrorShape {
  response?: { data?: { error?: { message?: string; code?: number; error_subcode?: number } } };
  message?: string;
}

const metaError = (err: unknown): { message: string; code?: number; subcode?: number } => {
  const e = err as MetaErrorShape;
  const g = e?.response?.data?.error;
  return {
    message: g?.message ?? e?.message ?? 'unknown Meta error',
    code: g?.code,
    subcode: g?.error_subcode
  };
};

// ---------------------------------------------------------------------------
// 1. Phone number registration
// ---------------------------------------------------------------------------

export interface RegistrationResult {
  registered: boolean;
  // True when Meta reported the number was ALREADY registered — not an error.
  alreadyRegistered: boolean;
  detail: string;
}

/** A 6-digit Cloud API two-step-verification PIN. Crypto-random, never 000000. */
export const generateRegistrationPin = (): string =>
  String(crypto.randomInt(100000, 1000000));

// PURE: classify Meta's response to POST /{phoneNumberId}/register so the
// decision is unit-testable without the network.
//
// Meta's registration errors are not all failures:
//   133005 — PIN mismatch: two-step verification is already set with a DIFFERENT
//            pin. The number is registered; we just can't re-register with ours.
//   133006 — the number still needs phone/business verification in WhatsApp
//            Manager. A real blocker the clinic must fix at Meta's end.
//   133008 — too many PIN attempts (rate limited); retry later.
//   Anything mentioning "already registered" is a success in disguise.
export const classifyRegistrationError = (err: {
  message: string;
  code?: number;
  subcode?: number;
}): RegistrationResult => {
  const msg = err.message ?? '';
  if (/already\s+registered/i.test(msg)) {
    return { registered: true, alreadyRegistered: true, detail: 'Number was already registered for Cloud API.' };
  }
  if (err.code === 133005) {
    return {
      registered: true,
      alreadyRegistered: true,
      detail:
        'Number already has two-step verification set with a different PIN — it is registered, but ClinicBook could not set its own PIN.'
    };
  }
  if (err.code === 133006) {
    return {
      registered: false,
      alreadyRegistered: false,
      detail:
        'This number still needs to be verified in Meta WhatsApp Manager before it can send messages. Complete phone verification, then reconnect.'
    };
  }
  if (err.code === 133008) {
    return {
      registered: false,
      alreadyRegistered: false,
      detail: 'Too many registration attempts — Meta is rate limiting. Please retry in a few minutes.'
    };
  }
  return { registered: false, alreadyRegistered: false, detail: `Number registration failed: ${msg}` };
};

/**
 * Activate the number for Cloud API messaging. Idempotent: re-running with the
 * same PIN succeeds, and an already-registered number is reported as success.
 */
export const registerPhoneNumber = async (
  client: AxiosInstance,
  phoneNumberId: string,
  pin: string
): Promise<RegistrationResult> => {
  try {
    await client.post(`/${phoneNumberId}/register`, { messaging_product: 'whatsapp', pin });
    return { registered: true, alreadyRegistered: false, detail: 'Number registered for Cloud API messaging.' };
  } catch (err) {
    return classifyRegistrationError(metaError(err));
  }
};

/**
 * Register (or re-register) the clinic's number, reusing the PIN we stored the
 * first time — Meta refuses a different PIN once two-step verification is set.
 */
export const ensurePhoneNumberRegistered = async (
  client: AxiosInstance,
  params: { clinicId: string; phoneNumberId: string; existingPin?: string | null }
): Promise<RegistrationResult & { pin: string }> => {
  const key = encKey();
  const pin = params.existingPin ? decryptSecret(params.existingPin, key) : generateRegistrationPin();
  const result = await registerPhoneNumber(client, params.phoneNumberId, pin);

  await prisma.whatsAppChannel
    .update({
      where: { phoneNumberId: params.phoneNumberId },
      data: {
        registered: result.registered,
        registeredAt: result.registered ? new Date() : null,
        // Only persist the PIN once Meta has accepted it as ours.
        ...(result.registered && !result.alreadyRegistered
          ? { registrationPin: encryptSecret(pin, key) }
          : {})
      }
    })
    .catch((e: unknown) => {
      console.error('[WhatsApp][provisioning] failed to persist registration state:', e);
    });

  return { ...result, pin };
};

// ---------------------------------------------------------------------------
// 2. Template provisioning
// ---------------------------------------------------------------------------

export interface TemplateState {
  name: string;
  language: string;
  status: string;
  reason: string | null;
}

export interface TemplateReadiness {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  /**
   * Canonical templates with NO row at all — never submitted to this WABA.
   *
   * Distinct from `pending`, which counts rows Meta is still reviewing. A clinic
   * that connected before a template was added to TEMPLATE_DEFINITIONS has
   * neither: nothing is under review, because nothing was ever sent. Without
   * this count that clinic sits at "not ready" forever, being told Meta is
   * reviewing templates it has never seen.
   */
  missing: number;
  // True once every canonical template is APPROVED on the clinic's own WABA.
  ready: boolean;
  syncedAt: Date | null;
  templates: TemplateState[];
}

// PURE: normalise Meta's template status vocabulary. Unit-testable.
export const normaliseTemplateStatus = (raw?: string | null): string => {
  const s = (raw ?? '').toUpperCase();
  const known = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'PENDING_DELETION'];
  return known.includes(s) ? s : 'PENDING';
};

// PURE: a duplicate-name rejection is not a failure — the template already
// exists on this WABA (Meta: code 100 / subcode 2388023).
export const isDuplicateTemplateError = (err: { message: string; code?: number; subcode?: number }): boolean =>
  err.subcode === 2388023 || /already exists/i.test(err.message ?? '');

const upsertTemplateRow = async (params: {
  clinicId: string;
  wabaId: string;
  name: string;
  language: string;
  status: string;
  metaId?: string | null;
  reason?: string | null;
}): Promise<void> => {
  const data = {
    wabaId: params.wabaId,
    status: params.status,
    metaId: params.metaId ?? null,
    reason: params.reason ?? null
  };
  await prisma.whatsAppTemplateStatus
    .upsert({
      where: {
        clinicId_name_language: {
          clinicId: params.clinicId,
          name: params.name,
          language: params.language
        }
      },
      create: { clinicId: params.clinicId, name: params.name, language: params.language, ...data },
      update: data
    })
    .catch((e: unknown) => {
      console.error(`[WhatsApp][provisioning] failed to record template ${params.name}:`, e);
    });
};

/**
 * Submit every canonical ClinicBook template to THIS clinic's WABA.
 *
 * Idempotent: a template that already exists comes back as a duplicate error,
 * which we treat as "present" and leave to the status sync to classify.
 */
export const provisionClinicTemplates = async (
  client: AxiosInstance,
  params: { clinicId: string; wabaId: string }
): Promise<{ submitted: number; existing: number; failed: number }> => {
  let submitted = 0;
  let existing = 0;
  let failed = 0;

  for (const tpl of TEMPLATE_DEFINITIONS) {
    try {
      const { data } = await client.post(
        `/${params.wabaId}/message_templates`,
        templateCreatePayload(tpl, TEMPLATE_LANGUAGE)
      );
      submitted += 1;
      await upsertTemplateRow({
        clinicId: params.clinicId,
        wabaId: params.wabaId,
        name: tpl.name,
        language: TEMPLATE_LANGUAGE,
        status: normaliseTemplateStatus(data?.status),
        metaId: data?.id ?? null
      });
    } catch (err) {
      const e = metaError(err);
      if (isDuplicateTemplateError(e)) {
        existing += 1;
        // Already on the WABA — record it as PENDING; syncClinicTemplates will
        // pull the real verdict from Meta a moment later.
        await upsertTemplateRow({
          clinicId: params.clinicId,
          wabaId: params.wabaId,
          name: tpl.name,
          language: TEMPLATE_LANGUAGE,
          status: 'PENDING'
        });
      } else {
        failed += 1;
        console.error(`[WhatsApp][provisioning] template ${tpl.name} submission failed: ${e.message}`);
        await upsertTemplateRow({
          clinicId: params.clinicId,
          wabaId: params.wabaId,
          name: tpl.name,
          language: TEMPLATE_LANGUAGE,
          status: 'ERROR',
          reason: e.message
        });
      }
    }
  }

  // Pull Meta's current verdict for everything we just touched.
  await syncClinicTemplates(client, params).catch(() => undefined);

  return { submitted, existing, failed };
};

/**
 * Mirror Meta's current template verdicts for the clinic's WABA into our DB.
 * Approval is asynchronous, so this is what turns PENDING into APPROVED.
 */
export const syncClinicTemplates = async (
  client: AxiosInstance,
  params: { clinicId: string; wabaId: string }
): Promise<{ synced: number }> => {
  const { data } = await client.get(`/${params.wabaId}/message_templates`, {
    params: { fields: 'id,name,language,status,category,rejected_reason', limit: 200 }
  });

  const rows: Array<{
    id?: string;
    name?: string;
    language?: string;
    status?: string;
    rejected_reason?: string;
  }> = Array.isArray(data?.data) ? data.data : [];

  // Only track the templates ClinicBook owns — a clinic may have its own
  // unrelated marketing templates on the same WABA and those are not our
  // business.
  const ours = new Set(TEMPLATE_DEFINITIONS.map((t) => t.name));
  let synced = 0;

  for (const row of rows) {
    if (!row.name || !ours.has(row.name)) continue;
    await upsertTemplateRow({
      clinicId: params.clinicId,
      wabaId: params.wabaId,
      name: row.name,
      language: row.language ?? TEMPLATE_LANGUAGE,
      status: normaliseTemplateStatus(row.status),
      metaId: row.id ?? null,
      reason: row.rejected_reason && row.rejected_reason !== 'NONE' ? row.rejected_reason : null
    });
    synced += 1;
  }

  await prisma.whatsAppChannel
    .updateMany({ where: { clinicId: params.clinicId }, data: { templatesSyncedAt: new Date() } })
    .catch(() => undefined);

  clearTemplateCache(params.clinicId);
  return { synced };
};

// PURE: roll a set of template rows up into the dashboard readiness summary.
export const summariseTemplates = (
  rows: TemplateState[],
  syncedAt: Date | null
): TemplateReadiness => {
  const approved = rows.filter((r) => r.status === 'APPROVED').length;
  const rejected = rows.filter((r) => r.status === 'REJECTED' || r.status === 'ERROR').length;
  const pending = rows.length - approved - rejected;
  // Counted against the canonical list, not against rows: a WABA may carry
  // templates of its own that are none of our business.
  const present = new Set(rows.map((r) => r.name));
  const missing = TEMPLATE_DEFINITIONS.filter((t) => !present.has(t.name)).length;
  return {
    total: TEMPLATE_DEFINITIONS.length,
    approved,
    pending,
    rejected,
    missing,
    ready: approved >= TEMPLATE_DEFINITIONS.length,
    syncedAt,
    templates: rows
  };
};

/** Dashboard-facing readiness for a clinic (DB only — no Graph call). */
export const getTemplateReadiness = async (clinicId: string): Promise<TemplateReadiness> => {
  const [rows, channel] = await Promise.all([
    prisma.whatsAppTemplateStatus.findMany({
      where: { clinicId },
      orderBy: { name: 'asc' },
      select: { name: true, language: true, status: true, reason: true }
    }),
    prisma.whatsAppChannel.findFirst({
      where: { clinicId },
      orderBy: { updatedAt: 'desc' },
      select: { templatesSyncedAt: true }
    })
  ]);
  return summariseTemplates(rows, channel?.templatesSyncedAt ?? null);
};

// ---------------------------------------------------------------------------
// Send-path gate
// ---------------------------------------------------------------------------

// Short TTL cache — the send path consults this on every out-of-window message.
const TEMPLATE_CACHE_TTL_MS = 60_000;
const templateCache = new Map<string, { value: Map<string, string>; at: number }>();

export const clearTemplateCache = (clinicId?: string): void => {
  if (clinicId) templateCache.delete(clinicId);
  else templateCache.clear();
};

// PURE: decide whether a template send may proceed.
//
// FAIL-OPEN on purpose. We block only when we POSITIVELY know Meta rejected the
// template for this clinic. An unknown template (never synced, clinic still on
// the platform's env default channel, sync failed) must still be attempted —
// otherwise a sync hiccup would silently stop every reminder in the system.
export const decideTemplateSend = (params: {
  known: boolean;
  status?: string;
}): { allowed: boolean; reason?: string } => {
  if (!params.known) return { allowed: true };
  if (params.status === 'REJECTED' || params.status === 'ERROR' || params.status === 'DISABLED') {
    return {
      allowed: false,
      reason: `template_not_approved:${params.status.toLowerCase()}`
    };
  }
  return { allowed: true };
};

/**
 * Send-path gate: is this template usable for this clinic right now?
 * Returns `{ allowed: true }` whenever we don't positively know otherwise.
 */
export const checkTemplateSendable = async (
  clinicId: string | null | undefined,
  templateName: string,
  now: number = Date.now()
): Promise<{ allowed: boolean; reason?: string }> => {
  if (!clinicId) return { allowed: true };

  let entry = templateCache.get(clinicId);
  if (!entry || now - entry.at >= TEMPLATE_CACHE_TTL_MS) {
    try {
      const rows = await prisma.whatsAppTemplateStatus.findMany({
        where: { clinicId },
        select: { name: true, status: true }
      });
      entry = { value: new Map(rows.map((r) => [r.name, r.status])), at: now };
      templateCache.set(clinicId, entry);
    } catch (e) {
      console.error('[WhatsApp][provisioning] template status lookup failed — allowing send:', e);
      return { allowed: true };
    }
  }

  const status = entry.value.get(templateName);
  return decideTemplateSend({ known: status !== undefined, status });
};

// ---------------------------------------------------------------------------
// Clinic-scoped entry points (resolve the channel + build a client)
// ---------------------------------------------------------------------------

const clinicGraphClient = async (
  clinicId: string
): Promise<{ client: AxiosInstance; wabaId: string; phoneNumberId: string; registrationPin: string | null } | null> => {
  const row = await prisma.whatsAppChannel.findFirst({
    where: { clinicId, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    select: { accessToken: true, wabaId: true, phoneNumberId: true, registrationPin: true }
  });
  if (!row?.wabaId) return null;
  return {
    client: buildWhatsAppClient(decryptSecret(row.accessToken, encKey())),
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    registrationPin: row.registrationPin
  };
};

/** Re-pull template verdicts from Meta for a clinic (dashboard "Refresh"). */
export const refreshClinicTemplates = async (clinicId: string): Promise<TemplateReadiness> => {
  const ctx = await clinicGraphClient(clinicId);
  if (ctx) {
    await syncClinicTemplates(ctx.client, { clinicId, wabaId: ctx.wabaId }).catch((e: unknown) => {
      console.error('[WhatsApp][provisioning] template refresh failed:', e);
    });
  }
  return getTemplateReadiness(clinicId);
};

/** (Re)submit any missing templates for a clinic (dashboard "Retry"). */
export const reprovisionClinicTemplates = async (clinicId: string): Promise<TemplateReadiness> => {
  const ctx = await clinicGraphClient(clinicId);
  if (ctx) {
    await provisionClinicTemplates(ctx.client, { clinicId, wabaId: ctx.wabaId }).catch((e: unknown) => {
      console.error('[WhatsApp][provisioning] template reprovision failed:', e);
    });
  }
  return getTemplateReadiness(clinicId);
};

/** Re-run number registration for a clinic (dashboard "Activate number"). */
export const reregisterClinicNumber = async (clinicId: string): Promise<RegistrationResult> => {
  const ctx = await clinicGraphClient(clinicId);
  if (!ctx) {
    return { registered: false, alreadyRegistered: false, detail: 'No connected WhatsApp number for this clinic.' };
  }
  const { pin: _pin, ...result } = await ensurePhoneNumberRegistered(ctx.client, {
    clinicId,
    phoneNumberId: ctx.phoneNumberId,
    existingPin: ctx.registrationPin
  });
  return result;
};
