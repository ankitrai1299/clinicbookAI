// Data-access layer for the MediScribe module — the SAME contract the reference
// app's Mongoose repository exposed (findAll/findById/findBy/upsert/count/
// countBy/remove), but backed by the shared ClinicBook Postgres via the NovaDoc
// JSON store, scoped to the current request's clinic. Because the method
// signatures are identical, every ported route/service uses it unchanged.
//
// NovaDoc row = (clinicId, collection, id) → data JSON. Timestamps live in the
// row columns (createdAt/updatedAt); we re-inject them into the returned document
// so the frontend still sees them, and strip any incoming copies on write so the
// columns stay the source of truth.

import type { Prisma } from '@prisma/client';

import { prisma } from '../../../config/prisma.js';
import { currentClinicId } from '../context.js';

export interface WithId {
  id: string;
  [key: string]: unknown;
}

interface NovaRow {
  id: string;
  patientId: string | null;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

export function createRepository<T extends WithId = WithId>(collection: string) {
  // Merge the row's authoritative column timestamps into its JSON payload.
  const toDoc = (row: NovaRow): T => ({
    ...(row.data as Record<string, unknown>),
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  }) as unknown as T;

  const allRows = (clinicId: string): Promise<NovaRow[]> =>
    prisma.novaDoc.findMany({
      where: { clinicId, collection },
      select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
    });

  const compareBy = (sort: Record<string, 1 | -1>) => (a: T, b: T): number => {
    for (const [key, dir] of Object.entries(sort)) {
      const av = a[key] as unknown;
      const bv = b[key] as unknown;
      if (av === bv) continue;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === 1 ? cmp : -cmp;
    }
    return 0;
  };

  const matches = (doc: T, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([k, v]) => (doc as Record<string, unknown>)[k] === v);

  return {
    /** Every document, newest-updated first. */
    async findAll(): Promise<T[]> {
      const rows = await prisma.novaDoc.findMany({
        where: { clinicId: currentClinicId(), collection },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
      });
      return rows.map(toDoc);
    },

    /** A single document by its app `id`, or null. */
    async findById(id: string): Promise<T | null> {
      const row = await prisma.novaDoc.findUnique({
        where: { clinicId_collection_id: { clinicId: currentClinicId(), collection, id } },
        select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
      });
      return row ? toDoc(row) : null;
    },

    /**
     * Every document matching `filter` (simple equality map), sorted. Defaults to
     * oldest-first by creation time — the patient-history endpoint relies on it.
     * Filtering/sorting is done in JS over the clinic's rows (mirrors the Mongo
     * semantics exactly; per-clinic volumes are small).
     */
    async findBy(
      filter: Record<string, unknown>,
      sort: Record<string, 1 | -1> = { createdAt: 1, updatedAt: 1 }
    ): Promise<T[]> {
      const docs = (await allRows(currentClinicId())).map(toDoc);
      return docs.filter((d) => matches(d, filter)).sort(compareBy(sort));
    },

    /**
     * Insert or update by `id`. `replace` overwrites the whole document; otherwise
     * fields are shallow-merged ($set semantics). Timestamps are owned by columns.
     */
    async upsert(doc: T, replace = false): Promise<void> {
      const clinicId = currentClinicId();
      const id = String(doc.id);
      const patientId = typeof doc.patientId === 'string' && doc.patientId ? doc.patientId : null;
      const key = { clinicId_collection_id: { clinicId, collection, id } };

      const strip = (o: Record<string, unknown>) => {
        const { createdAt, updatedAt, ...rest } = o;
        return rest;
      };

      let data: Record<string, unknown> = strip({ ...doc });
      if (!replace) {
        const existing = await prisma.novaDoc.findUnique({ where: key, select: { data: true } });
        data = { ...((existing?.data as Record<string, unknown>) ?? {}), ...data };
      }

      await prisma.novaDoc.upsert({
        where: key,
        create: { clinicId, collection, id, patientId, data: data as Prisma.InputJsonValue },
        update: { patientId, data: data as Prisma.InputJsonValue }
      });
    },

    /** Exact total document count for the clinic. */
    count(): Promise<number> {
      return prisma.novaDoc.count({ where: { clinicId: currentClinicId(), collection } });
    },

    /** Exact count matching `filter`. */
    async countBy(filter: Record<string, unknown>): Promise<number> {
      const docs = (await allRows(currentClinicId())).map(toDoc);
      return docs.filter((d) => matches(d, filter)).length;
    },

    /** Delete a document by `id`. Returns true when a row was removed. */
    async remove(id: string): Promise<boolean> {
      try {
        await prisma.novaDoc.delete({
          where: { clinicId_collection_id: { clinicId: currentClinicId(), collection, id } }
        });
        return true;
      } catch {
        return false; // not found → nothing removed
      }
    }
  };
}
