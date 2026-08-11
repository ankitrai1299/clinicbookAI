import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('../../../config/tenantPrisma.js', () => ({
  forClinic: () => ({ novaDoc: { findMany: (...a: unknown[]) => findMany(...(a as [])) } })
}));
vi.mock('../context.js', () => ({ currentClinicId: () => 'c1' }));

const { createRepository } = await import('./baseRepository.js');

// Reading a patient's history used to load the clinic's ENTIRE collection and
// filter it in JavaScript, while an index on (clinicId, collection, patientId)
// sat unused. These pin down the narrowing — and, just as importantly, that it
// stays a speed-up rather than becoming the only thing deciding whose record is
// returned.
describe('NovaDoc repository — patient-scoped reads', () => {
  const repo = createRepository('consultations');

  const row = (id: string, patientId: string | null, data: Record<string, unknown> = {}) => ({
    id,
    patientId,
    data: { id, patientId, ...data },
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z')
  });

  beforeEach(() => findMany.mockReset());

  it('asks the database for one patient instead of the whole collection', async () => {
    findMany.mockResolvedValue([row('con-1', 'p1')]);
    await repo.findBy({ patientId: 'p1' });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      clinicId: 'c1',
      collection: 'consultations',
      patientId: 'p1'
    });
  });

  it('still scans when the filter is not about a patient', async () => {
    findMany.mockResolvedValue([]);
    await repo.findBy({ status: 'Completed' });

    expect(findMany.mock.calls[0][0].where).toEqual({ clinicId: 'c1', collection: 'consultations' });
  });

  it('does not narrow on an empty or non-string patientId', async () => {
    // '' would match nothing in SQL and silently return an empty history, where
    // the JS filter would have compared it honestly.
    findMany.mockResolvedValue([]);
    await repo.findBy({ patientId: '' });
    expect(findMany.mock.calls[0][0].where.patientId).toBeUndefined();

    findMany.mockResolvedValue([]);
    await repo.findBy({ patientId: { $in: ['p1'] } as unknown as string });
    expect(findMany.mock.calls[1][0].where.patientId).toBeUndefined();
  });

  it('still re-checks the patient in JS, so a stale column cannot hand over the wrong record', async () => {
    // The column is denormalised from the JSON. If the two ever disagree, the
    // document itself wins — a row must never appear in a history it does not
    // belong to just because a column says so.
    findMany.mockResolvedValue([row('con-1', 'p1', { patientId: 'someone-else' })]);
    const out = await repo.findBy({ patientId: 'p1' });
    expect(out).toEqual([]);
  });

  it('combines the SQL narrowing with the remaining filter keys', async () => {
    findMany.mockResolvedValue([
      row('con-1', 'p1', { status: 'Completed' }),
      row('con-2', 'p1', { status: 'Draft' })
    ]);
    const out = await repo.findBy({ patientId: 'p1', status: 'Completed' });
    expect(out.map((d) => d.id)).toEqual(['con-1']);
  });

  it('counts the same way it reads', async () => {
    findMany.mockResolvedValue([row('con-1', 'p1'), row('con-2', 'p1')]);
    const n = await repo.countBy({ patientId: 'p1' });
    expect(findMany.mock.calls[0][0].where.patientId).toBe('p1');
    expect(n).toBe(2);
  });
});
