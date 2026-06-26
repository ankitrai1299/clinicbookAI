// Pure tenant-scoping rules — NO imports, NO database, NO env. Extracted from
// tenantPrisma.ts so this security-critical logic can be unit-tested in complete
// isolation (importing the Prisma client would pull in env validation + a DB
// connection). tenantPrisma.ts composes these into the live Prisma extension.

// Every model that carries a `clinicId` column and must therefore be tenant-
// scoped. Keep in sync with schema.prisma. Models without a clinicId (Reminder,
// AiMessage, WhatsAppConversation, WhatsAppAudit) are reached only via a scoped
// parent and are deliberately absent.
//
// `WhatsAppSession` is intentionally EXCLUDED until Phase 2 re-keys it to
// @@unique(clinicId, phone). It is currently @@unique(phone) only, so injecting
// clinicId into an upsert's where would break the upsert (a row for that phone
// under a different clinic would fail the conflict match). Session ops stay on
// the raw client until the re-key lands.
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
  'WhatsAppLog'
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
