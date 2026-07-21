import type { Consultation, MedicationRow } from '../types';

// The medicines this doctor actually prescribes, ranked by how often.
//
// Typing "Paracetamol / 650mg / 1 tab / TDS / After food" from scratch, several
// times a day, for the same handful of drugs, is most of the typing left in the
// app. Quick Rx had a name-only suggestion list; the main prescription editor had
// nothing at all.
//
// This is derived from the doctor's own saved consultations rather than a drug
// database — it needs no new data, no maintenance, and it is right about THIS
// doctor's practice from the first week. It fills the WHOLE row (strength, dose,
// frequency, timing, duration), because the name alone is the easy part.

/** A remembered prescription line, with how many times it has been used. */
export interface FavouriteMedicine {
  row: MedicationRow;
  /** Display label, e.g. "Paracetamol 650mg · TDS". */
  label: string;
  uses: number;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Identity of a prescription line for counting purposes: same drug at the same
 * strength and frequency is the same favourite, regardless of how the duration
 * or free-text instructions varied between visits.
 */
const keyOf = (m: MedicationRow): string =>
  [clean(m.medicine), clean(m.strength), clean(m.frequency)].join('|').toLowerCase();

export function favouriteMedicines(consultations: Consultation[], limit = 8): FavouriteMedicine[] {
  const counts = new Map<string, FavouriteMedicine>();

  for (const c of consultations) {
    for (const m of c.report?.prescribedMedications || []) {
      if (!clean(m.medicine)) continue;
      const key = keyOf(m);
      const existing = counts.get(key);
      if (existing) {
        existing.uses += 1;
        continue;
      }
      const label = [clean(m.medicine), clean(m.strength)].filter(Boolean).join(' ');
      counts.set(key, {
        row: { ...m },
        label: clean(m.frequency) ? `${label} · ${clean(m.frequency)}` : label,
        uses: 1,
      });
    }
  }

  return Array.from(counts.values())
    // Most-used first; ties broken alphabetically so the row doesn't reshuffle
    // between renders for no reason.
    .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Every distinct medicine NAME the doctor has prescribed, for autocomplete. */
export function knownMedicineNames(consultations: Consultation[], limit = 200): string[] {
  const seen = new Map<string, string>();
  for (const c of consultations) {
    for (const m of c.report?.prescribedMedications || []) {
      const name = clean(m.medicine);
      if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b)).slice(0, limit);
}
