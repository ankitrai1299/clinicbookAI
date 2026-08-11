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

import { forClinic } from '../../../config/tenantPrisma.js';
import { currentClinicId } from '../context.js';

// The clinic's own Prisma client. Every NovaDoc query made through it is scoped
// to that clinic BY THE CLIENT, so the explicit clinicId kept in each where
// below is now defence in depth rather than the only thing standing between two
// clinics' consultation notes.
const db = () => forClinic(currentClinicId());

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

  /**
   * Rows for this clinic + collection, optionally narrowed to one patient in SQL.
   *
   * patientId is a real column (denormalised from the JSON on every write) with
   * an index on (clinicId, collection, patientId). Reading a patient's history
   * used to load the clinic's ENTIRE collection and filter it in JS — fine at a
   * few dozen consultations, quadratic-feeling at a few thousand across a
   * hundred clinics, and the index existed for exactly this the whole time.
   */
  const allRows = (clinicId: string, patientId?: string): Promise<NovaRow[]> =>
    forClinic(clinicId).novaDoc.findMany({
      where: { clinicId, collection, ...(patientId ? { patientId } : {}) },
      select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
    });

  /**
   * The patientId to push into SQL, or undefined to scan the collection.
   *
   * Only safe because the column is kept in step with data.patientId on every
   * write AND the rows predating the column have been backfilled
   * (scripts/backfillNovaDocPatientId.ts). A row whose column is null while its
   * JSON names a patient would simply vanish from that patient's history — so
   * this narrows ONLY on a non-empty string, and the JS filter below still
   * re-checks the value from the document itself.
   */
  const sqlPatientId = (filter: Record<string, unknown>): string | undefined => {
    const v = filter.patientId;
    return typeof v === 'string' && v.trim() ? v : undefined;
  };

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
      const rows = await db().novaDoc.findMany({
        where: { clinicId: currentClinicId(), collection },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
      });
      return rows.map(toDoc);
    },

    /** A single document by its app `id`, or null. */
    async findById(id: string): Promise<T | null> {
      const row = await db().novaDoc.findUnique({
        where: { clinicId_collection_id: { clinicId: currentClinicId(), collection, id } },
        select: { id: true, patientId: true, data: true, createdAt: true, updatedAt: true }
      });
      return row ? toDoc(row) : null;
    },

    /**
     * Every document matching `filter` (simple equality map), sorted. Defaults to
     * oldest-first by creation time — the patient-history endpoint relies on it.
     *
     * A patientId in the filter is pushed into SQL so the index does the work;
     * every other key is still matched in JS over the returned rows, which keeps
     * the Mongo-like semantics the ported call sites expect. The JS pass also
     * re-checks patientId, so the SQL narrowing is a speed-up rather than the
     * only thing deciding whose record this is.
     */
    async findBy(
      filter: Record<string, unknown>,
      sort: Record<string, 1 | -1> = { createdAt: 1, updatedAt: 1 }
    ): Promise<T[]> {
      const docs = (await allRows(currentClinicId(), sqlPatientId(filter))).map(toDoc);
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
        const existing = await db().novaDoc.findUnique({ where: key, select: { data: true } });
        data = { ...((existing?.data as Record<string, unknown>) ?? {}), ...data };
      }

      await db().novaDoc.upsert({
        where: key,
        create: { clinicId, collection, id, patientId, data: data as Prisma.InputJsonValue },
        update: { patientId, data: data as Prisma.InputJsonValue }
      });
    },

    /** Exact total document count for the clinic. */
    count(): Promise<number> {
      return db().novaDoc.count({ where: { clinicId: currentClinicId(), collection } });
    },

    /** Exact count matching `filter`. Narrowed by patientId in SQL, like findBy. */
    async countBy(filter: Record<string, unknown>): Promise<number> {
      const docs = (await allRows(currentClinicId(), sqlPatientId(filter))).map(toDoc);
      return docs.filter((d) => matches(d, filter)).length;
    },

    /** Delete a document by `id`. Returns true when a row was removed. */
    async remove(id: string): Promise<boolean> {
      try {
        await db().novaDoc.delete({
          where: { clinicId_collection_id: { clinicId: currentClinicId(), collection, id } }
        });
        return true;
      } catch {
        return false; // not found → nothing removed
      }
    }
  };
}
