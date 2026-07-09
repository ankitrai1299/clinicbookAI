// Tenant-scoped Prisma client — the structural core of multi-tenant isolation.
//
//   forClinic(clinicId)  →  a Prisma client whose EVERY query on a tenant-owned
//                           model is automatically constrained to that clinicId.
//
// This kills the "forgot to add clinicId / wrote `where:{ id }` instead of
// `where:{ id, clinicId }`" class of cross-tenant bugs at the source: a handler
// that does `req.db.appointment.update({ where: { id } })` for an id belonging to
// another clinic updates ZERO rows, because the extension rewrites the where to
// `{ id, clinicId }`. Reads, counts, aggregates, deletes and creates are all
// scoped the same way.
//
// Relies on Prisma's extendedWhereUnique behaviour (GA since v5): non-unique
// fields are allowed alongside a unique field in findUnique/update/delete where
// clauses. The existing code already depends on this (e.g. appointment status
// race guards do `update({ where: { id, status } })`), so it is safe here too.
//
// NOTE: `Clinic` itself is intentionally NOT in TENANT_MODELS — its tenant key is
// its own primary key, not a `clinicId` column. Clinic-row access (registration,
// billing, settings) uses the raw `prisma` client deliberately. Likewise the
// cross-tenant background workers (reminder/waitlist crons) use the raw client on
// purpose and re-scope per row.
//
// The actual scoping RULE lives in ./tenantScope.ts (a pure, dependency-free
// module) so it can be unit-tested without a DB. This file only wires that rule
// into the live Prisma client extension.

import { Prisma } from '@prisma/client';

import { prisma } from './prisma.js';
import { TENANT_MODELS, scopeArgs } from './tenantScope.js';

export { TENANT_MODELS, scopeArgs };

const buildForClinic = (clinicId: string) =>
  prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        // Single hook for all operations; the scoping rule lives in scopeArgs so
        // it can be unit-tested in isolation.
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }
          return query(scopeArgs(model, operation, args, clinicId) as typeof args);
        }
      }
    }
  });

// `prisma.$extends` is NOT free — it clones the client's model delegates — and
// the data-source seam calls forClinic several times per resolve, on a path the
// WhatsApp FSM walks ~30x per inbound message (21-day slot scan + date picker).
// The extension closure captures ONLY clinicId and the shared `prisma` instance
// (same connection pool), so one client per clinic is safe to reuse for the
// process lifetime. Bounded by the number of clinics, which is small.
const clinicClients = new Map<string, ReturnType<typeof buildForClinic>>();

/**
 * A Prisma client locked to a single clinic. Every tenant-model query made
 * through it is automatically scoped to `clinicId` via {@link scopeArgs}.
 * Memoized per clinic — callers may hold or re-request it freely.
 */
export const forClinic = (clinicId: string) => {
  const cached = clinicClients.get(clinicId);
  if (cached) return cached;
  const client = buildForClinic(clinicId);
  clinicClients.set(clinicId, client);
  return client;
};

export type TenantClient = ReturnType<typeof buildForClinic>;

// Re-export the namespace so callers can type tenant clients without importing
// Prisma separately.
export type { Prisma };
