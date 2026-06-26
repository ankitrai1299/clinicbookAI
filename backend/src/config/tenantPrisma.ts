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

/**
 * Build a Prisma client locked to a single clinic. Every tenant-model query made
 * through the returned client is automatically scoped to `clinicId` via
 * {@link scopeArgs}.
 */
export const forClinic = (clinicId: string) =>
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

export type TenantClient = ReturnType<typeof forClinic>;

// Re-export the namespace so callers can type tenant clients without importing
// Prisma separately.
export type { Prisma };
