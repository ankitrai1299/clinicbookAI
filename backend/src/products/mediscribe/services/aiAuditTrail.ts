// The AI audit trail: what the model proposed, what the doctor changed, and what
// was finally approved.
//
// The compliance question this answers is not "was a prescription sent?" — the
// existing timeline already records that. It is the one asked six months later,
// when a prescription is disputed: *what did the AI actually write, and did a
// human change it before approving?* Without a stored draft that question has no
// answer at all, and an AI-assisted clinical system that cannot answer it is
// difficult to defend.
//
// Two deliberate design decisions:
//
//  1. THE DRAFT IS CLINICAL DATA, so it is stored in the clinical record (a
//     NovaDoc collection, tenant-scoped and retained like every other note), NOT
//     in the audit log. The audit row carries the draft's ID and a content hash.
//     Putting prescription text into the audit table would create a second copy
//     of the medical record with weaker controls — see core/audit/audit.redact.
//
//  2. THE DRAFT IS KEYED BY THE TRANSCRIPT, not by a consultation id. Both
//     clients call POST /generate-report with `{ transcript }` and nothing else,
//     and the native app is reproduced from its reference verbatim so it cannot
//     be changed to send more. Hashing the transcript links the draft to the
//     finalised note WITHOUT any client change — which is the only way to get
//     this trail from the app that already ships.
//
//     The cost is honest and recorded: if the doctor edits or translates the
//     transcript after generating, the hash no longer matches and the finalised
//     note is audited with `draftLinked: false` rather than being linked to the
//     wrong draft.

import { createHash } from 'node:crypto';

import { record } from '../../../core/audit/audit.service.js';
import { createRepository } from '../repositories/baseRepository.js';

/** Where AI drafts live. A normal clinical collection — scoped, retained, listable. */
const aiDraftsRepo = createRepository('ai_drafts');

/** Stable hash of any clinical object, used to prove WHICH version was involved. */
export const contentHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 32);

/** The draft id for a transcript. Deterministic, so finalisation can find it again. */
export const draftIdFor = (clinicId: string, transcript: string): string =>
  `draft_${createHash('sha256').update(`${clinicId}\n${(transcript || '').trim()}`).digest('hex').slice(0, 32)}`;

/** The medicine list a report carries, under either of the two shapes in use. */
const medicinesOf = (report: unknown): Array<Record<string, unknown>> => {
  const r = (report ?? {}) as Record<string, unknown>;
  if (Array.isArray(r.prescribedMedications)) return r.prescribedMedications as Array<Record<string, unknown>>;
  if (Array.isArray(r.prescriptions)) return r.prescriptions as Array<Record<string, unknown>>;
  return [];
};

const medicineName = (m: Record<string, unknown>): string =>
  String(m?.name ?? m?.medicine ?? m?.drug ?? '').trim().toLowerCase();

export interface DraftRecord {
  draftId: string;
  hash: string;
  medicineCount: number;
}

/**
 * Persist what the AI produced and audit that it happened.
 *
 * Called on the generation path. Never throws: a failure here must not stop a
 * doctor getting their report, so it degrades to "no draft stored", which the
 * finalisation audit then reports honestly as unlinked.
 */
export const recordAiDraft = async (opts: {
  clinicId: string;
  transcript: string;
  report: unknown;
  model?: string;
}): Promise<DraftRecord | null> => {
  try {
    const draftId = draftIdFor(opts.clinicId, opts.transcript);
    const meds = medicinesOf(opts.report);
    const hash = contentHash(opts.report);

    await aiDraftsRepo.upsert({
      id: draftId,
      report: opts.report,
      model: opts.model ?? null,
      hash,
      generatedAt: new Date().toISOString()
    } as never);

    // Two rows, because they are two different claims: the model wrote a
    // clinical summary, and (separately) it proposed medicines. A clinic that
    // never lets AI touch prescriptions still wants the first.
    record({
      clinicId: opts.clinicId,
      action: 'AI_SUMMARY_GENERATED',
      actorType: 'ai',
      actorName: opts.model ?? 'sarvam',
      resourceType: 'ai_draft',
      resourceId: draftId,
      metadata: { hash, model: opts.model ?? '', transcriptChars: (opts.transcript || '').length }
    });

    if (meds.length) {
      record({
        clinicId: opts.clinicId,
        action: 'AI_PRESCRIPTION_DRAFT_CREATED',
        actorType: 'ai',
        actorName: opts.model ?? 'sarvam',
        resourceType: 'ai_draft',
        resourceId: draftId,
        // The COUNT, never the medicines themselves.
        metadata: { hash, medicineCount: meds.length }
      });
    }

    return { draftId, hash, medicineCount: meds.length };
  } catch (err) {
    console.error('[mediscribe:ai-audit] could not store the AI draft', err);
    return null;
  }
};

export interface ReviewDiff {
  draftId: string | null;
  draftLinked: boolean;
  /** Top-level report fields the doctor altered. Names only — never values. */
  changedFields: string[];
  medicinesAdded: number;
  medicinesRemoved: number;
  medicinesModified: number;
  finalHash: string;
  draftHash: string | null;
}

/**
 * Compare the finalised note against the AI draft it came from.
 *
 * Returns field NAMES and COUNTS only. "The doctor changed `prescribedMedications`
 * and removed one medicine" is the auditable fact; which medicine it was lives in
 * the two clinical records this diff points at, and an investigator with the
 * right to see them can read both.
 */
export const diffAgainstDraft = async (clinicId: string, consultation: unknown): Promise<ReviewDiff> => {
  const c = (consultation ?? {}) as Record<string, unknown>;
  const finalReport = c.report ?? null;
  const finalHash = contentHash(finalReport);
  const transcript = String(c.transcript ?? '');

  const empty: ReviewDiff = {
    draftId: null,
    draftLinked: false,
    changedFields: [],
    medicinesAdded: 0,
    medicinesRemoved: 0,
    medicinesModified: 0,
    finalHash,
    draftHash: null
  };

  if (!transcript) return empty;

  try {
    const draftId = draftIdFor(clinicId, transcript);
    const draft = (await aiDraftsRepo.findById(draftId)) as { report?: unknown; hash?: string } | null;
    if (!draft) return { ...empty, draftId };

    const draftReport = (draft.report ?? {}) as Record<string, unknown>;
    const final = (finalReport ?? {}) as Record<string, unknown>;

    const keys = new Set([...Object.keys(draftReport), ...Object.keys(final)]);
    const changedFields = [...keys]
      .filter((k) => JSON.stringify(draftReport[k] ?? null) !== JSON.stringify(final[k] ?? null))
      .sort();

    const before = medicinesOf(draftReport);
    const after = medicinesOf(final);
    const beforeByName = new Map(before.map((m) => [medicineName(m), m]));
    const afterByName = new Map(after.map((m) => [medicineName(m), m]));

    let medicinesAdded = 0;
    let medicinesRemoved = 0;
    let medicinesModified = 0;

    for (const [name, m] of afterByName) {
      const original = beforeByName.get(name);
      if (!original) medicinesAdded++;
      else if (JSON.stringify(original) !== JSON.stringify(m)) medicinesModified++;
    }
    for (const name of beforeByName.keys()) {
      if (!afterByName.has(name)) medicinesRemoved++;
    }

    return {
      draftId,
      draftLinked: true,
      changedFields,
      medicinesAdded,
      medicinesRemoved,
      medicinesModified,
      finalHash,
      draftHash: draft.hash ?? contentHash(draftReport)
    };
  } catch (err) {
    console.error('[mediscribe:ai-audit] could not diff against the AI draft', err);
    return empty;
  }
};
