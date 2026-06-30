// Generic id-keyed JSON document repository on Postgres (NovaDoc), one logical
// collection per `collection` value, scoped per clinic. Mirrors the reference
// NovaScribe app's repository contract (findAll / findBy / upsert / count).

import { Prisma } from '@prisma/client';

import { prisma } from '../../../config/prisma.js';

type Doc = Record<string, unknown> & { id: string };

const pickPatientId = (doc: Record<string, unknown>): string | null =>
  typeof doc.patientId === 'string' && doc.patientId ? doc.patientId : null;

export const novaRepo = (collection: string) => ({
  /** Every document in the collection for a clinic, newest-updated first. */
  async findAll(clinicId: string): Promise<Doc[]> {
    const rows = await prisma.novaDoc.findMany({
      where: { clinicId, collection },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });
    return rows.map((r) => r.data as Doc);
  },

  /** Documents for a single patient, oldest-first (history ordering). */
  async findByPatient(clinicId: string, patientId: string): Promise<Doc[]> {
    const rows = await prisma.novaDoc.findMany({
      where: { clinicId, collection, patientId },
      orderBy: [{ createdAt: 'asc' }, { updatedAt: 'asc' }]
    });
    return rows.map((r) => r.data as Doc);
  },

  /** Insert or update by id. `replace` overwrites; otherwise top-level merge. */
  async upsert(clinicId: string, doc: Doc, replace = false): Promise<void> {
    const id = String(doc.id);
    const key = { clinicId_collection_id: { clinicId, collection, id } };

    let data: Record<string, unknown> = doc;
    if (!replace) {
      const existing = await prisma.novaDoc.findUnique({ where: key });
      data = { ...((existing?.data as Record<string, unknown>) ?? {}), ...doc };
    }

    await prisma.novaDoc.upsert({
      where: key,
      create: { clinicId, collection, id, patientId: pickPatientId(data), data: data as Prisma.InputJsonValue },
      update: { patientId: pickPatientId(data), data: data as Prisma.InputJsonValue }
    });
  },

  /** Total document count for a clinic (dashboard stat). */
  count(clinicId: string): Promise<number> {
    return prisma.novaDoc.count({ where: { clinicId, collection } });
  }
});

export const patientsRepo = novaRepo('patients');
export const consultationsRepo = novaRepo('consultations');
export const reportsRepo = novaRepo('reports');
export const prescriptionsRepo = novaRepo('prescriptions');
export const transcriptsRepo = novaRepo('transcripts');
