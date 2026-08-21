import { describe, it, expect, vi, beforeEach } from 'vitest';

// The rule this file exists to hold: a consultation the doctor has not
// finalised must never become a shareable clinical document. Everywhere else
// that gate protects a patient's WhatsApp message; here it protects a national
// health record, which is the one place a retraction is hardest.

type Consultation = Record<string, unknown> | null;

let consultation: Consultation = null;
let patient: Record<string, unknown> | null = null;
let clinic: Record<string, unknown> | null = null;
let doctor: Record<string, unknown> | null = null;

vi.mock('../products/mediscribe/context.js', () => ({
  runWithClinic: async (_c: string, fn: () => unknown) => fn()
}));

vi.mock('../products/mediscribe/repositories/index.js', () => ({
  consultationsRepo: { findById: async () => consultation }
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    patient: { findFirst: async () => patient },
    clinic: { findUnique: async () => clinic },
    doctor: { findFirst: async () => doctor, count: async () => 0 }
  }
}));

const { buildDocumentFor, NotShareable } = await import('./abdmDocument.service.js');

const REPORT = {
  chiefComplaint: ['Fever for three days'],
  clinicalOverview: 'Patient reports fever and body ache.',
  assessment: ['Viral fever'],
  advice: ['Rest', 'Fluids'],
  prescribedMedications: [
    { medicine: 'Paracetamol', strength: '500mg', dose: '1 tab', route: 'Oral', frequency: 'TDS', timing: 'After food', duration: '3 days', instructions: 'If fever persists, review' }
  ]
};

beforeEach(() => {
  consultation = {
    id: 'con_1',
    patientId: 'pat_1',
    status: 'Completed',
    date: '2026-08-20',
    updatedAt: '2026-08-20T09:30:00.000Z',
    report: REPORT
  };
  patient = { id: 'pat_1', name: 'Anish Kumar', gender: 'male', phone: '+919876543210', abhaNumber: null, abhaAddress: null };
  clinic = { id: 'clin_1', name: 'Sunrise Clinic', hfrId: null };
  doctor = { name: 'Dr A K Das', hprId: null };
});

const build = () => buildDocumentFor('clin_1', 'con_1');
const json = async () => JSON.stringify(await build());

describe('only a finalised consultation becomes a document', () => {
  it('refuses a draft', async () => {
    consultation = { ...(consultation as object), status: 'Draft' };
    await expect(build()).rejects.toThrow(NotShareable);
  });

  it('refuses one still recording or processing', async () => {
    for (const status of ['Recording', 'Processing']) {
      consultation = { ...(consultation as object), status };
      await expect(build(), status).rejects.toThrow(NotShareable);
    }
  });

  it('refuses a finalised consultation that somehow has no report', async () => {
    consultation = { id: 'con_1', patientId: 'pat_1', status: 'Completed', date: '2026-08-20' };
    await expect(build()).rejects.toThrow(NotShareable);
  });

  it('builds one the doctor finalised', async () => {
    const doc = await build();
    expect(doc.resourceType).toBe('Bundle');
    expect(doc.type).toBe('document');
  });
});

describe('what it says about identity', () => {
  it('carries the ABHA when the patient has linked one', async () => {
    patient = { ...(patient as object), abhaNumber: '12-3456-7890-1234', abhaAddress: 'anish@abdm' };
    const text = await json();
    expect(text).toContain('12-3456-7890-1234');
    expect(text).toContain('anish@abdm');
  });

  it('invents nothing when the patient has NOT linked one', async () => {
    // Most patients never will. An empty or placeholder identifier in a national
    // health record is worse than no identifier — it looks like data.
    const text = await json();
    expect(text).not.toContain('abha');
    expect(text).not.toContain('"value":""');
    expect(text).not.toContain('null');
  });

  it('uses the HFR id for the clinic once it has one', async () => {
    clinic = { ...(clinic as object), hfrId: 'IN-HFR-0001' };
    expect(await json()).toContain('IN-HFR-0001');
  });

  it('falls back to our own clinic id before HFR registration', async () => {
    // The document still has to identify the organisation. Our id is honest and
    // traceable; a blank or invented HFR id is neither.
    expect(await json()).toContain('clin_1');
  });

  it('omits the registration number until the doctor has an HPR id', async () => {
    const withoutHpr = await json();
    doctor = { name: 'Dr A K Das', hprId: 'HPR-77' };
    const withHpr = await json();
    expect(withoutHpr).not.toContain('HPR-77');
    expect(withHpr).toContain('HPR-77');
  });

  it('still names a practitioner when no doctor is on the visit', async () => {
    doctor = null;
    const text = await json();
    expect(text).toContain('Sunrise Clinic');
  });
});

describe('the clinical content survives the trip', () => {
  it('carries the complaint, assessment, advice and medicine', async () => {
    const text = await json();
    for (const fragment of ['Fever for three days', 'Viral fever', 'Fluids', 'Paracetamol', '500mg']) {
      expect(text, fragment).toContain(fragment);
    }
  });
});

describe('it refuses rather than guesses', () => {
  it('will not build for a consultation that does not exist', async () => {
    consultation = null;
    await expect(build()).rejects.toThrow(NotShareable);
  });

  it('will not build when the patient is gone', async () => {
    patient = null;
    await expect(build()).rejects.toThrow(NotShareable);
  });

  it('will not build for a patient belonging to another clinic', async () => {
    // The lookup is scoped by clinicId, so a cross-clinic id finds nothing —
    // and finding nothing must refuse, never fall back to an unscoped read.
    patient = null;
    await expect(build()).rejects.toThrow(/patient/i);
  });
});
