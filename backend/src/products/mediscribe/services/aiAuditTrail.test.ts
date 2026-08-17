import { describe, it, expect, vi, beforeEach } from 'vitest';

// The clinical store and the audit writer are the two sides this service sits
// between; both are mocked so the REVIEW LOGIC — what the doctor changed — can be
// asserted exactly.
const drafts = new Map<string, Record<string, unknown>>();
const audited: Array<Record<string, unknown>> = [];

vi.mock('../repositories/baseRepository.js', () => ({
  createRepository: () => ({
    upsert: async (doc: Record<string, unknown>) => {
      drafts.set(String(doc.id), doc);
      return doc;
    },
    findById: async (id: string) => drafts.get(id) ?? null
  })
}));

vi.mock('../../../core/audit/audit.service.js', () => ({
  record: (entry: Record<string, unknown>) => {
    audited.push(entry);
  }
}));

const { recordAiDraft, diffAgainstDraft, draftIdFor, contentHash } = await import('./aiAuditTrail.js');

const TRANSCRIPT = 'Doctor: what brings you in? Patient: cough for four days.';

const aiReport = {
  chiefComplaint: ['cough'],
  diagnosis: 'Acute bronchitis',
  prescribedMedications: [
    { name: 'Amoxicillin', dose: '500mg', frequency: 'BD', duration: '5 days' },
    { name: 'Paracetamol', dose: '650mg', frequency: 'SOS', duration: '3 days' }
  ],
  followUp: { date: 'in 5 days' }
};

beforeEach(() => {
  drafts.clear();
  audited.length = 0;
});

describe('what the AI produced', () => {
  it('stores the draft in the clinical record, not in the audit log', () => {
    // The draft is a clinical document. The audit row that points at it must
    // carry no clinical content of its own — only ids, hashes and counts.
    return recordAiDraft({ clinicId: 'c1', transcript: TRANSCRIPT, report: aiReport, model: 'sarvam-105b' }).then(
      (res) => {
        expect(res?.draftId).toBe(draftIdFor('c1', TRANSCRIPT));
        expect(drafts.get(res!.draftId)?.report).toEqual(aiReport);

        const summary = audited.find((a) => a.action === 'AI_SUMMARY_GENERATED')!;
        const meta = JSON.stringify(summary.metadata);
        expect(meta).not.toContain('Amoxicillin');
        expect(meta).not.toContain('bronchitis');
        expect(meta).not.toContain('cough');
      }
    );
  });

  it('names the AI as the actor, not the doctor', async () => {
    await recordAiDraft({ clinicId: 'c1', transcript: TRANSCRIPT, report: aiReport, model: 'sarvam-105b' });
    for (const row of audited) expect(row.actorType).toBe('ai');
  });

  it('records the medicine draft separately from the summary', async () => {
    // A clinic that never lets AI near prescriptions still wants the summary
    // row, so these are two claims and two rows.
    await recordAiDraft({ clinicId: 'c1', transcript: TRANSCRIPT, report: aiReport });
    expect(audited.map((a) => a.action)).toEqual(['AI_SUMMARY_GENERATED', 'AI_PRESCRIPTION_DRAFT_CREATED']);
    expect(audited[1].metadata).toMatchObject({ medicineCount: 2 });
  });

  it('writes no prescription row when the AI proposed no medicines', async () => {
    await recordAiDraft({ clinicId: 'c1', transcript: TRANSCRIPT, report: { diagnosis: 'viral, rest' } });
    expect(audited.map((a) => a.action)).toEqual(['AI_SUMMARY_GENERATED']);
  });

  it('keeps one clinic’s draft out of another’s', async () => {
    // The id is derived from the clinic as well as the transcript, so two
    // clinics with an identical transcript never share a draft.
    expect(draftIdFor('c1', TRANSCRIPT)).not.toBe(draftIdFor('c2', TRANSCRIPT));
  });
});

describe('what the doctor changed before approving', () => {
  const finalise = (report: unknown) => ({ id: 'k1', patientId: 'p1', transcript: TRANSCRIPT, report });

  beforeEach(async () => {
    await recordAiDraft({ clinicId: 'c1', transcript: TRANSCRIPT, report: aiReport, model: 'sarvam-105b' });
    audited.length = 0;
  });

  it('reports an untouched approval as no changes at all', async () => {
    // The doctor read the AI note and accepted it. That is a legitimate and
    // common outcome, and it must be distinguishable from having edited it.
    const diff = await diffAgainstDraft('c1', finalise(aiReport));
    expect(diff.draftLinked).toBe(true);
    expect(diff.changedFields).toEqual([]);
    expect(diff.medicinesAdded + diff.medicinesRemoved + diff.medicinesModified).toBe(0);
    expect(diff.finalHash).toBe(diff.draftHash);
  });

  it('counts a medicine the doctor removed', async () => {
    const edited = { ...aiReport, prescribedMedications: [aiReport.prescribedMedications[0]] };
    const diff = await diffAgainstDraft('c1', finalise(edited));
    expect(diff.medicinesRemoved).toBe(1);
    expect(diff.medicinesAdded).toBe(0);
    expect(diff.changedFields).toContain('prescribedMedications');
  });

  it('counts a medicine the doctor added', async () => {
    const edited = {
      ...aiReport,
      prescribedMedications: [...aiReport.prescribedMedications, { name: 'Azithromycin', dose: '500mg' }]
    };
    const diff = await diffAgainstDraft('c1', finalise(edited));
    expect(diff.medicinesAdded).toBe(1);
  });

  it('counts a dose the doctor corrected as modified, not as add-plus-remove', async () => {
    // This is the change that matters most clinically and it must not be
    // reported as two unrelated events.
    const edited = {
      ...aiReport,
      prescribedMedications: [
        { ...aiReport.prescribedMedications[0], dose: '250mg' },
        aiReport.prescribedMedications[1]
      ]
    };
    const diff = await diffAgainstDraft('c1', finalise(edited));
    expect(diff.medicinesModified).toBe(1);
    expect(diff.medicinesAdded).toBe(0);
    expect(diff.medicinesRemoved).toBe(0);
  });

  it('names the fields that changed but never their values', async () => {
    const edited = { ...aiReport, diagnosis: 'Acute pharyngitis' };
    const diff = await diffAgainstDraft('c1', finalise(edited));
    expect(diff.changedFields).toEqual(['diagnosis']);
    expect(JSON.stringify(diff)).not.toContain('pharyngitis');
  });

  it('says so plainly when the draft cannot be linked', async () => {
    // The doctor edited or translated the transcript after generating, so the
    // hash no longer matches. Reporting `draftLinked: false` is the honest
    // answer; linking to a nearby draft would be worse than linking to none.
    const diff = await diffAgainstDraft('c1', {
      id: 'k1',
      transcript: 'a completely different transcript',
      report: aiReport
    });
    expect(diff.draftLinked).toBe(false);
    expect(diff.finalHash).toBe(contentHash(aiReport));
  });

  it('never links across clinics', async () => {
    const diff = await diffAgainstDraft('c2', finalise(aiReport));
    expect(diff.draftLinked).toBe(false);
  });
});
