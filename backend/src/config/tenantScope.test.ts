import { describe, it, expect } from 'vitest';

// Import the PURE scoping module directly (no .js extension so Vite resolves the
// .ts source; this file is excluded from the NodeNext tsc build). Importing the
// live Prisma client would pull in env validation + a DB connection — the whole
// point of tenantScope.ts is that this rule is testable in isolation.
import { scopeArgs, TENANT_MODELS } from './tenantScope';

const CLINIC_A = 'clinic_aaa';
const CLINIC_B = 'clinic_bbb';

describe('scopeArgs — tenant isolation rule', () => {
  describe('where-based reads inject clinicId', () => {
    it('findUnique by id alone becomes {id, clinicId}', () => {
      const out = scopeArgs('Patient', 'findUnique', { where: { id: 'p1' } }, CLINIC_A);
      expect(out.where).toEqual({ id: 'p1', clinicId: CLINIC_A });
    });

    it('findFirst merges clinicId into an existing where', () => {
      const out = scopeArgs('Doctor', 'findFirst', { where: { name: 'Dr X' } }, CLINIC_A);
      expect(out.where).toEqual({ name: 'Dr X', clinicId: CLINIC_A });
    });

    it('findMany with no args still gets a clinicId where', () => {
      const out = scopeArgs('Appointment', 'findMany', undefined, CLINIC_A);
      expect(out.where).toEqual({ clinicId: CLINIC_A });
    });

    it('count / aggregate / groupBy are scoped', () => {
      for (const op of ['count', 'aggregate', 'groupBy']) {
        const out = scopeArgs('Patient', op, { where: { language: 'English' } }, CLINIC_A);
        expect(out.where).toMatchObject({ clinicId: CLINIC_A });
      }
    });
  });

  describe('writes-by-where inject clinicId (closes the TOCTOU/IDOR class)', () => {
    it('update by id alone becomes {id, clinicId}', () => {
      const out = scopeArgs('Appointment', 'update', { where: { id: 'a1' }, data: { status: 'CONFIRMED' } }, CLINIC_A);
      expect(out.where).toEqual({ id: 'a1', clinicId: CLINIC_A });
      // data is untouched (other than its own contents)
      expect(out.data).toEqual({ status: 'CONFIRMED' });
    });

    it('delete by id alone becomes {id, clinicId}', () => {
      const out = scopeArgs('Patient', 'delete', { where: { id: 'p1' } }, CLINIC_A);
      expect(out.where).toEqual({ id: 'p1', clinicId: CLINIC_A });
    });

    it('updateMany / deleteMany are scoped', () => {
      const u = scopeArgs('Notification', 'updateMany', { where: { read: false }, data: { read: true } }, CLINIC_A);
      expect(u.where).toEqual({ read: false, clinicId: CLINIC_A });
      const d = scopeArgs('Waitlist', 'deleteMany', { where: {} }, CLINIC_A);
      expect(d.where).toEqual({ clinicId: CLINIC_A });
    });
  });

  describe('creates inject clinicId into data', () => {
    it('create adds clinicId to data', () => {
      const out = scopeArgs('Doctor', 'create', { data: { name: 'Dr Y', speciality: 'ENT' } }, CLINIC_A);
      expect(out.data).toEqual({ name: 'Dr Y', speciality: 'ENT', clinicId: CLINIC_A });
    });

    it('createMany adds clinicId to every row', () => {
      const out = scopeArgs(
        'DoctorSchedule',
        'createMany',
        { data: [{ dayOfWeek: 1 }, { dayOfWeek: 2 }] },
        CLINIC_A
      );
      expect(out.data).toEqual([
        { dayOfWeek: 1, clinicId: CLINIC_A },
        { dayOfWeek: 2, clinicId: CLINIC_A }
      ]);
    });

    it('upsert scopes where, create AND update', () => {
      const out = scopeArgs(
        'Patient',
        'upsert',
        { where: { id: 'p1' }, create: { name: 'New' }, update: { name: 'Upd' } },
        CLINIC_A
      );
      expect(out.where).toEqual({ id: 'p1', clinicId: CLINIC_A });
      expect(out.create).toEqual({ name: 'New', clinicId: CLINIC_A });
      expect(out.update).toEqual({ name: 'Upd', clinicId: CLINIC_A });
    });
  });

  describe('cross-tenant safety', () => {
    it("clinic A's client injects clinic A — an id owned by clinic B cannot be reached", () => {
      // Handler in clinic A tries to update an appointment id that actually
      // belongs to clinic B. The scoped where pins clinicId=A, so the DB matches
      // ZERO rows — the write is a no-op, not a cross-tenant mutation.
      const out = scopeArgs('Appointment', 'update', { where: { id: 'belongs_to_B' } }, CLINIC_A);
      expect(out.where).toEqual({ id: 'belongs_to_B', clinicId: CLINIC_A });
      expect((out.where as { clinicId: string }).clinicId).not.toBe(CLINIC_B);
    });

    it('the same args scoped by two clinics differ only by clinicId', () => {
      const args = { where: { id: 'p1' } };
      const a = scopeArgs('Patient', 'findUnique', args, CLINIC_A);
      const b = scopeArgs('Patient', 'findUnique', args, CLINIC_B);
      expect(a.where).toEqual({ id: 'p1', clinicId: CLINIC_A });
      expect(b.where).toEqual({ id: 'p1', clinicId: CLINIC_B });
    });

    it('does NOT mutate the caller-supplied args object', () => {
      const args = { where: { id: 'p1' } };
      scopeArgs('Patient', 'update', args, CLINIC_A);
      expect(args).toEqual({ where: { id: 'p1' } }); // unchanged
    });
  });

  describe('non-tenant models are left untouched', () => {
    it('Clinic row access is not scoped (its tenant key is its own id)', () => {
      const out = scopeArgs('Clinic', 'findUnique', { where: { id: CLINIC_A } }, CLINIC_A);
      expect(out.where).toEqual({ id: CLINIC_A });
      expect((out.where as Record<string, unknown>).clinicId).toBeUndefined();
    });

    it('Reminder (no clinicId column) is not scoped', () => {
      const out = scopeArgs('Reminder', 'update', { where: { id: 'r1' }, data: { sent: true } }, CLINIC_A);
      expect(out.where).toEqual({ id: 'r1' });
    });

    it('AiMessage (owned via conversation) is not scoped', () => {
      const out = scopeArgs('AiMessage', 'findMany', { where: { conversationId: 'c1' } }, CLINIC_A);
      expect(out.where).toEqual({ conversationId: 'c1' });
    });

    it('WhatsAppAudit (no clinicId column) is not scoped', () => {
      const out = scopeArgs('WhatsAppAudit', 'create', { data: { phone: '9990001111' } }, CLINIC_A);
      expect(out.data).toEqual({ phone: '9990001111' });
    });
  });

  describe('TENANT_MODELS membership', () => {
    it('includes the core business tables', () => {
      for (const m of ['Patient', 'Doctor', 'Appointment', 'Waitlist', 'Notification', 'AiConversation', 'DoctorSchedule', 'DoctorLeave', 'User']) {
        expect(TENANT_MODELS.has(m)).toBe(true);
      }
    });

    it('includes the Phase-2 re-keyed WhatsApp session tables', () => {
      expect(TENANT_MODELS.has('WhatsAppSession')).toBe(true);
      expect(TENANT_MODELS.has('WhatsAppConversation')).toBe(true);
    });

    it('excludes non-tenant tables (Clinic-like, no-clinicId, and the channel routing table)', () => {
      for (const m of ['Clinic', 'Reminder', 'AiMessage', 'WhatsAppAudit', 'WhatsAppChannel']) {
        expect(TENANT_MODELS.has(m)).toBe(false);
      }
    });
  });
});
