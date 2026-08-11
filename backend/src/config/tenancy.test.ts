import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { TENANT_MODELS, UNSCOPED_BY_DESIGN, SCOPED_DESPITE_NULLABLE, scopeArgs } from './tenantScope.js';

// Tenant isolation, checked against the schema itself rather than against
// somebody's memory of it.
//
// forClinic() only protects models listed in TENANT_MODELS. A new clinic-owned
// table that nobody adds to that list looks completely normal, compiles, passes
// review, and silently has no isolation at all — the failure is invisible until
// one clinic reads another's data.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');
const SCHEMA = path.resolve(SRC, '../prisma/schema.prisma');

/** Every model in schema.prisma that carries a clinicId column. */
const clinicOwnedModels = (): string[] => {
  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const out: string[] = [];
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) {
    if (/^\s*clinicId\s/m.test(m[2])) out.push(m[1]);
  }
  return out;
};

describe('tenant isolation covers every clinic-owned table', () => {
  it('finds the models (so a broken parser cannot pass this file vacuously)', () => {
    const models = clinicOwnedModels();
    expect(models.length).toBeGreaterThan(20);
    expect(models).toContain('Appointment');
    expect(models).toContain('NovaDoc');
  });

  it('leaves no clinic-owned model unscoped without a stated reason', () => {
    const orphans = clinicOwnedModels().filter(
      (m) => !TENANT_MODELS.has(m) && !(m in UNSCOPED_BY_DESIGN)
    );
    expect(
      orphans,
      'These tables carry a clinicId but forClinic() does not scope them. Add each to ' +
        'TENANT_MODELS, or to UNSCOPED_BY_DESIGN with the reason it must stay unscoped:\n  ' +
        orphans.join('\n  ')
    ).toEqual([]);
  });

  it('never scopes a model whose clinicId is optional', () => {
    // A NULLABLE clinicId means rows are written before a clinic is known.
    // Scoping such a table quietly hides exactly those rows — which is how I
    // nearly scoped WhatsAppAudit, where the null rows are the ones kept for
    // diagnosing messages from unrecognised numbers.
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    const nullable: string[] = [];
    const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(schema))) {
      const line = m[2].split('\n').find((l) => /^\s*clinicId\s/.test(l)) ?? '';
      if (/String\?/.test(line) && TENANT_MODELS.has(m[1]) && !(m[1] in SCOPED_DESPITE_NULLABLE)) {
        nullable.push(m[1]);
      }
    }
    expect(
      nullable,
      'These are scoped but their clinicId is optional, so scoping drops the rows ' +
        'written before a clinic was known:\n  ' + nullable.join('\n  ')
    ).toEqual([]);
  });

  it('keeps the two lists disjoint', () => {
    // A model in both would read as protected while being exempt.
    const both = [...TENANT_MODELS].filter((m) => m in UNSCOPED_BY_DESIGN);
    expect(both, `listed as both scoped and unscoped:\n  ${both.join('\n  ')}`).toEqual([]);
  });

  it('states a real reason for every exemption', () => {
    const thin = Object.entries(UNSCOPED_BY_DESIGN).filter(([, why]) => (why || '').trim().length < 20);
    expect(thin.map(([m]) => m), 'exemptions need a reason someone can check later').toEqual([]);
  });
});

describe('scoping the MediScribe clinical record', () => {
  // NovaDoc holds consultations, reports, prescriptions and transcripts. Its
  // repository used to write the clinicId filter by hand in seven places; these
  // pin down that the extension now does it, including on the compound unique
  // key the repository reads and writes by.
  const KEY = { clinicId_collection_id: { clinicId: 'c1', collection: 'consultations', id: 'x' } };

  it('scopes a read even when the caller passes no clinicId', () => {
    const out = scopeArgs('NovaDoc', 'findMany', { where: { collection: 'consultations' } }, 'c1');
    expect(out.where).toEqual({ collection: 'consultations', clinicId: 'c1' });
  });

  it('cannot be pointed at another clinic by a hand-written where', () => {
    // The whole point: an explicit wrong clinicId loses to the client's own.
    const out = scopeArgs('NovaDoc', 'findMany', { where: { clinicId: 'other' } }, 'c1');
    expect(out.where).toEqual({ clinicId: 'c1' });
  });

  it('scopes findUnique on the compound key', () => {
    const out = scopeArgs('NovaDoc', 'findUnique', { where: KEY }, 'c1');
    expect(out.where).toEqual({ ...KEY, clinicId: 'c1' });
  });

  it('scopes an upsert on all three sides', () => {
    const out = scopeArgs(
      'NovaDoc',
      'upsert',
      { where: KEY, create: { collection: 'consultations', id: 'x' }, update: { data: {} } },
      'c1'
    );
    expect((out.where as Record<string, unknown>).clinicId).toBe('c1');
    expect((out.create as Record<string, unknown>).clinicId).toBe('c1');
    // Update too, so a write can never move a row into another clinic.
    expect((out.update as Record<string, unknown>).clinicId).toBe('c1');
  });

  it('scopes a delete, so one clinic cannot remove another clinic’s note', () => {
    const out = scopeArgs('NovaDoc', 'delete', { where: KEY }, 'c1');
    expect((out.where as Record<string, unknown>).clinicId).toBe('c1');
  });

  it('scopes the reminders and timeline derived from those notes', () => {
    for (const model of ['MedicineReminder', 'PatientEvent', 'WhatsAppTemplateStatus']) {
      const out = scopeArgs(model, 'findMany', { where: {} }, 'c1');
      expect(out.where, `${model} is not scoped`).toEqual({ clinicId: 'c1' });
    }
  });
});
