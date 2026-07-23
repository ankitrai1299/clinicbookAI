import type { ConsultationHistoryItem, HistoryMedicine, HistoryAllergy } from './patientHistory.js';
import type { AskIntent } from './assistant.intent.js';

// Turn records into a sentence. No model runs in this file, by design: every
// answer is assembled from data we hold, so the assistant cannot invent a drug,
// a dose, a date or an allergy.
//
// THE RULE THAT MATTERS MOST — absence of evidence.
// These records only contain what was SAID during a consultation. "No allergies
// in the report" therefore means "nothing was recorded", never "this patient has
// no allergies". A doctor who hears "no allergies" and prescribes penicillin on
// the strength of it could kill someone. Every answer below that reports an empty
// result says what is missing from the RECORD, and never makes a claim about the
// patient. This is not a wording preference; treat it as a safety requirement.

export interface Answer {
  /** What the doctor is shown / told. */
  text: string;
  /** Present when the answer is derived from a specific visit. */
  visitDate?: string;
  /** Set when the answer reports an absence, so the UI can caution accordingly. */
  isAbsence?: boolean;
}

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "12 days ago" / "yesterday" — how a colleague would say it. */
const relativeDay = (iso: string): string => {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

const medLine = (m: HistoryMedicine): string =>
  [m.medicine, m.strength, m.dose, m.frequency, m.duration, m.instructions]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' · ');

/** Every distinct allergy across all visits — an old allergy is still an allergy. */
const allAllergies = (visits: ConsultationHistoryItem[]): { lines: string[]; since?: string } => {
  const seen = new Map<string, HistoryAllergy>();
  let since = '';
  for (const v of visits) {
    for (const a of v.allergies) {
      const key = a.allergy.toLowerCase();
      if (a.allergy && !seen.has(key)) {
        seen.set(key, a);
        since = since || v.visitDateTime;
      }
    }
  }
  return { lines: Array.from(seen.values()).map(allergyLine).filter(Boolean), since: since || undefined };
};

const allergyLine = (a: HistoryAllergy): string =>
  [a.allergy, a.reaction && `→ ${a.reaction}`, a.severity && `(${a.severity})`]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');

/**
 * Build the answer.
 *
 * `visits` must be newest-first (buildPatientHistory(..., 'desc')).
 * `patientName` is only used to address the answer, never to look anything up.
 */
export function buildAnswer(opts: {
  intent: AskIntent;
  patientName: string;
  visits: ConsultationHistoryItem[];
  draftCount?: number;
  unsupportedReason?: string;
}): Answer {
  const { intent, patientName, visits, draftCount, unsupportedReason } = opts;
  const who = patientName || 'This patient';

  if (intent === 'unsupported') {
    return {
      text: `I can't answer that — ${unsupportedReason ?? 'that isn\'t recorded in the app'}.`,
      isAbsence: true,
    };
  }

  if (intent === 'my_drafts') {
    const n = draftCount ?? 0;
    return {
      text:
        n === 0
          ? 'No unfinished notes — everything is saved.'
          : `${n} unfinished note${n === 1 ? '' : 's'} waiting to be completed.`,
    };
  }

  if (!visits.length) {
    return { text: `No previous visits recorded for ${who}.`, isAbsence: true };
  }

  const latest = visits[0];

  switch (intent) {
    case 'last_visit': {
      const when = relativeDay(latest.visitDateTime);
      const date = fmtDate(latest.visitDateTime);
      const dx = latest.diagnosis.filter(Boolean);
      const forWhat = dx.length ? ` for ${dx.join(', ')}` : '';
      return {
        text: `${who} was last seen ${when}${date ? ` (${date})` : ''}${forWhat}.`,
        visitDate: latest.visitDateTime,
      };
    }

    case 'last_prescription': {
      // A visit whose medicine rows all render blank (a legacy row carrying only
      // a stray field) must be skipped, not shown as "Last prescribed: ."
      const found = visits
        .map((v) => ({ v, lines: v.medicines.map(medLine).filter(Boolean) }))
        .find((x) => x.lines.length);
      if (!found) {
        return {
          text: `No prescription is recorded for ${who} in any previous visit.`,
          isAbsence: true,
        };
      }
      return {
        text: `Last prescribed ${relativeDay(found.v.visitDateTime)}: ${found.lines.join('; ')}.`,
        visitDate: found.v.visitDateTime,
      };
    }

    case 'last_diagnosis': {
      const found = visits.find((v) => v.diagnosis.filter(Boolean).length);
      if (!found) {
        return { text: `No diagnosis is recorded for ${who}.`, isAbsence: true };
      }
      return {
        text: `${relativeDay(found.visitDateTime)}: ${found.diagnosis.filter(Boolean).join(', ')}.`,
        visitDate: found.visitDateTime,
      };
    }

    case 'allergies': {
      const { lines, since } = allAllergies(visits);
      if (!lines.length) {
        // The exact wording here is the safety requirement described at the top
        // of this file. It reports the state of the RECORD, and explicitly hands
        // the clinical judgement back to the doctor.
        return {
          text: `No allergies are recorded for ${who}. That only means none were noted in a previous visit — please confirm with the patient.`,
          isAbsence: true,
        };
      }
      return { text: `Recorded allergies for ${who}: ${lines.join('; ')}.`, visitDate: since };
    }

    case 'current_medications': {
      const found = visits
        .map((v) => ({ v, lines: v.currentMedications.map(medLine).filter(Boolean) }))
        .find((x) => x.lines.length);
      if (!found) {
        return {
          text: `No ongoing medicines are recorded for ${who}. That only means none were noted — please confirm with the patient.`,
          isAbsence: true,
        };
      }
      return {
        text: `As of ${relativeDay(found.v.visitDateTime)}, ${who} was taking: ${found.lines.join('; ')}.`,
        visitDate: found.v.visitDateTime,
      };
    }

    case 'patient_summary': {
      const parts: string[] = [
        `${who}: ${visits.length} recorded visit${visits.length === 1 ? '' : 's'}, last ${relativeDay(latest.visitDateTime)}.`,
      ];
      const dx = latest.diagnosis.filter(Boolean);
      if (dx.length) parts.push(`Last diagnosis: ${dx.join(', ')}.`);

      const rx = visits.find((v) => v.medicines.map(medLine).filter(Boolean).length);
      if (rx) parts.push(`Last prescription: ${rx.medicines.map(medLine).filter(Boolean).join('; ')}.`);

      // ALL allergies across every visit — a summary that dropped an old
      // penicillin allergy because a newer visit only noted dust would be
      // dangerous. Same union the dedicated allergy answer uses.
      const { lines: allergyLines } = allAllergies(visits);
      parts.push(
        allergyLines.length
          ? `Allergies: ${allergyLines.join('; ')}.`
          : 'No allergies recorded — please confirm with the patient.',
      );

      if (latest.followUp) parts.push(`Follow-up: ${latest.followUp}`);
      return { text: parts.join(' '), visitDate: latest.visitDateTime };
    }

    default:
      return {
        text: "I didn't catch that. Try asking about a patient's last visit, prescription, diagnosis, allergies, or current medicines.",
        isAbsence: true,
      };
  }
}
