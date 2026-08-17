// Pure tenant-scoping rules — NO imports, NO database, NO env. Extracted from
// tenantPrisma.ts so this security-critical logic can be unit-tested in complete
// isolation (importing the Prisma client would pull in env validation + a DB
// connection). tenantPrisma.ts composes these into the live Prisma extension.

// Every model that carries a `clinicId` column and must therefore be tenant-
// scoped. Keep in sync with schema.prisma. Models without a clinicId (Reminder,
// AiMessage, WhatsAppAudit) are reached only via a scoped parent and are absent.
//
// WhatsAppSession + WhatsAppConversation joined this set in Phase 2 once they were
// re-keyed to @@unique(clinicId, phone): the SAME patient phone is now a distinct
// session/24h-window per clinic, and the scoped client injects clinicId so one
// clinic can never read or overwrite another's session/window.
//
// WhatsAppChannel is NOT here: it is the routing table looked up by phoneNumberId
// BEFORE a clinic is known (resolving WHICH clinic), so it uses the raw client —
// like Clinic itself.
export const TENANT_MODELS = new Set<string>([
  'User',
  'Patient',
  'Doctor',
  'DoctorSchedule',
  'DoctorLeave',
  'Appointment',
  'Notification',
  'Waitlist',
  'AiConversation',
  'WhatsAppLog',
  'WhatsAppSession',
  'WhatsAppConversation',
  // NovaScribe consultation notes — clinic-scoped like everything else.
  'ConsultationNote',
  // Healthcare MCP channel-agnostic conversation session — clinic-scoped so one
  // clinic can never read/overwrite another's patient conversation state.
  'ConversationSession',
  // EMR integration: local↔external id map, clinic-scoped so one clinic's
  // mapping can never be read/overwritten by another.
  'ExternalIdMap',
  // Public-API idempotency keys. Scoped so two partners may reuse the same key
  // string without colliding. (ApiKey itself is NOT here — like WhatsAppChannel
  // it is the routing table consulted BEFORE a clinic is known.)
  'IdempotencyKey',
  // Outbound webhooks. Management (register/list/disable) is clinic-scoped; the
  // delivery cron sweeps across ALL clinics with the raw client and re-scopes per
  // row, exactly like the reminder/waitlist crons.
  'WebhookEndpoint',
  'WebhookDelivery',
  // The MediScribe clinical record — consultations, reports, prescriptions,
  // transcripts, all of it. It was isolated only by hand-written clinicId
  // filters in the repository, which is the one class of bug this extension
  // exists to make impossible.
  'NovaDoc',
  // Patient timeline events, and the medicine reminders derived from a
  // prescription. Both are patient clinical data. The reminder CRON still sweeps
  // across clinics with the raw client and re-scopes per row, like the others.
  'PatientEvent',
  'MedicineReminder',
  // Per-device sign-in credentials. Clinic-scoped so one clinic's admin can
  // never list or revoke another clinic's.
  'AppPassword',
  // Detected security patterns. Scoped so a clinic admin reviewing their own
  // alerts can never see another clinic's.
  'SecurityAlert',
  // Patient rights requests — clinic-scoped like the records they are about.
  'PatientRightsRequest',
  // Consent state, per clinic + patient + purpose.
  'PatientConsent',
  // Per-clinic template approval state on the clinic's own WABA.
  'WhatsAppTemplateStatus',
  // The compliance audit trail. Scoped so a clinic admin reading their own audit
  // can never see another clinic's — the audit view would otherwise be the one
  // screen that leaks every tenant at once.
  'AuditLog'
]);

/**
 * Clinic-owned models deliberately NOT scoped, with the reason. Every one of
 * these is consulted BEFORE a clinic is known — they are the routing tables that
 * answer "which clinic is this?", so scoping them to a clinic would be circular.
 *
 * Kept as data, not a comment, so the test that no clinic-owned model is
 * forgotten can tell "deliberately out" from "nobody noticed".
 */
export const UNSCOPED_BY_DESIGN: Readonly<Record<string, string>> = {
  Clinic: 'its tenant key IS its primary key, not a clinicId column',
  WhatsAppChannel: 'the routing table: phone_number_id → clinic, read before a clinic is known',
  WhatsAppPatientBinding: 'answers which clinic a phone belongs to, so it cannot presuppose one',
  ApiKey: 'maps a key to a clinic, read before a clinic is known',
  WhatsAppAudit:
    'its clinicId is NULLABLE on purpose — a message from an unrecognised number ' +
    'is audited before any clinic is resolved, and scoping would drop exactly the ' +
    'rows kept for diagnosing that case'
};

/**
 * Scoped models whose clinicId is nevertheless NULLABLE, and why that is the
 * right call. Scoping such a table hides its null rows from every clinic, so the
 * question is always "is hiding them correct?" — not a detail to leave implicit.
 */
export const SCOPED_DESPITE_NULLABLE: Readonly<Record<string, string>> = {
  WhatsAppLog:
    'a send logged before a clinic is resolved has no owner, so no clinic should ' +
    'see it in its own message log; writes through forClinic always carry one',
  SecurityAlert:
    'a failed-sign-in burst is detected BEFORE any clinic is known, so those rows ' +
    'have no owner and no clinic dashboard should show them; they are reviewed ' +
    'server-side during an investigation, like the audit rows they come from',
  AuditLog:
    'FAILED_LOGIN and a login for an unknown email are recorded BEFORE a clinic ' +
    'is known, and hiding those ownerless rows from every clinic dashboard is ' +
    'correct — they are read server-side, not from a tenant view; the audit ' +
    'writer uses the raw client and supplies clinicId whenever one is known'
};

// Operations whose `where` we constrain with clinicId.
export const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany'
]);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * PURE function that rewrites a Prisma operation's args to enforce tenant
 * scoping. Returns NEW args (never mutates the input) with `clinicId` injected
 * into where/data as appropriate. Non-tenant models are returned unchanged.
 *
 * Rules:
 *  - where-based ops (find / update / delete / count / aggregate / groupBy):
 *    inject clinicId into `where` (relies on Prisma extendedWhereUnique).
 *  - create: inject clinicId into `data`.
 *  - createMany: inject clinicId into each row of `data`.
 *  - upsert: inject clinicId into `where`, `create` and `update`.
 */
export const scopeArgs = (
  model: string | undefined,
  operation: string,
  args: unknown,
  clinicId: string
): Record<string, unknown> => {
  const a: Record<string, unknown> = isRecord(args) ? { ...args } : {};

  if (!model || !TENANT_MODELS.has(model)) {
    return a;
  }

  if (WHERE_OPS.has(operation)) {
    a.where = { ...(isRecord(a.where) ? a.where : {}), clinicId };
  }

  if (operation === 'create') {
    a.data = { ...(isRecord(a.data) ? a.data : {}), clinicId };
  }

  if (operation === 'createMany') {
    const data = a.data;
    if (Array.isArray(data)) {
      a.data = data.map((row) => (isRecord(row) ? { ...row, clinicId } : row));
    } else if (isRecord(data)) {
      a.data = { ...data, clinicId };
    }
  }

  if (operation === 'upsert') {
    a.where = { ...(isRecord(a.where) ? a.where : {}), clinicId };
    a.create = { ...(isRecord(a.create) ? a.create : {}), clinicId };
    // `update` side is already filtered by the scoped where; ensure clinicId can
    // never be flipped to another tenant on update.
    a.update = { ...(isRecord(a.update) ? a.update : {}), clinicId };
  }

  return a;
};
