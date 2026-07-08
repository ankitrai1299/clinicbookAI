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
  'IdempotencyKey'
]);

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
