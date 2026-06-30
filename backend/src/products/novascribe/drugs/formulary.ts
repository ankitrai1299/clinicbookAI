// Drug-name validation — a core anti-hallucination guard. Generated medicine
// names are checked against a known Indian formulary (brand + generic). A name
// that doesn't match (exactly or via a close fuzzy match) is FLAGGED for the
// doctor, never silently "corrected" or invented.
//
// This is a SEED list for local dev. In production, back this with a licensed
// Indian drug database (CIMS / MIMS India / Jan Aushadhi generics) loaded at
// startup — validateDrug()'s contract stays the same.

interface FormularyEntry {
  canonical: string; // display/brand or generic name
  generic?: string;
}

// Small but representative seed of commonly-prescribed Indian OPD drugs.
const FORMULARY: FormularyEntry[] = [
  { canonical: 'Paracetamol', generic: 'Paracetamol' },
  { canonical: 'Dolo 650', generic: 'Paracetamol' },
  { canonical: 'Crocin', generic: 'Paracetamol' },
  { canonical: 'Azithromycin', generic: 'Azithromycin' },
  { canonical: 'Azithral', generic: 'Azithromycin' },
  { canonical: 'Amoxicillin', generic: 'Amoxicillin' },
  { canonical: 'Augmentin', generic: 'Amoxicillin + Clavulanate' },
  { canonical: 'Cetirizine', generic: 'Cetirizine' },
  { canonical: 'Levocetirizine', generic: 'Levocetirizine' },
  { canonical: 'Montair LC', generic: 'Montelukast + Levocetirizine' },
  { canonical: 'Pantoprazole', generic: 'Pantoprazole' },
  { canonical: 'Pan 40', generic: 'Pantoprazole' },
  { canonical: 'Omeprazole', generic: 'Omeprazole' },
  { canonical: 'Rabeprazole', generic: 'Rabeprazole' },
  { canonical: 'Metformin', generic: 'Metformin' },
  { canonical: 'Amlodipine', generic: 'Amlodipine' },
  { canonical: 'Telmisartan', generic: 'Telmisartan' },
  { canonical: 'Atorvastatin', generic: 'Atorvastatin' },
  { canonical: 'Ibuprofen', generic: 'Ibuprofen' },
  { canonical: 'Combiflam', generic: 'Ibuprofen + Paracetamol' },
  { canonical: 'Diclofenac', generic: 'Diclofenac' },
  { canonical: 'Ondansetron', generic: 'Ondansetron' },
  { canonical: 'Domperidone', generic: 'Domperidone' },
  { canonical: 'ORS', generic: 'Oral Rehydration Salts' },
  { canonical: 'Vitamin D3', generic: 'Cholecalciferol' },
  { canonical: 'Vitamin B Complex', generic: 'B-Complex' },
  { canonical: 'Cefixime', generic: 'Cefixime' },
  { canonical: 'Ciprofloxacin', generic: 'Ciprofloxacin' },
  { canonical: 'Ofloxacin', generic: 'Ofloxacin' },
  { canonical: 'Ofloxacin + Ornidazole', generic: 'Ofloxacin + Ornidazole' },
  { canonical: 'Ornidazole', generic: 'Ornidazole' },
  { canonical: 'Metronidazole', generic: 'Metronidazole' },
  { canonical: 'Ranitidine', generic: 'Ranitidine' },
  { canonical: 'Norflox', generic: 'Norfloxacin' },
  { canonical: 'Loperamide', generic: 'Loperamide' },
  { canonical: 'Racecadotril', generic: 'Racecadotril' }
];

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Levenshtein distance for fuzzy matching mis-spellings / STT errors.
const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j];
  }
  return prev[n];
};

export interface DrugValidation {
  /** True when the name matched the formulary exactly or via a close match. */
  matched: boolean;
  /** The formulary's canonical name when matched. */
  canonical?: string;
  generic?: string;
  /** True when the doctor should double-check (no/weak match). */
  flagged: boolean;
}

/**
 * Validate a single drug name against the formulary. Unknown names are FLAGGED,
 * not invented or auto-replaced.
 */
export const validateDrug = (name: string): DrugValidation => {
  const query = norm(name);
  if (!query) {
    return { matched: false, flagged: true };
  }

  // Exact (normalised) match on canonical or generic.
  for (const entry of FORMULARY) {
    if (norm(entry.canonical) === query || (entry.generic && norm(entry.generic) === query)) {
      return { matched: true, canonical: entry.canonical, generic: entry.generic, flagged: false };
    }
  }

  // Fuzzy match: tolerate small spelling/STT deviations (distance <= 2 and not
  // more than ~30% of the length).
  let best: { entry: FormularyEntry; dist: number } | null = null;
  for (const entry of FORMULARY) {
    const targets = [norm(entry.canonical), ...(entry.generic ? [norm(entry.generic)] : [])];
    for (const t of targets) {
      const dist = levenshtein(query, t);
      if (!best || dist < best.dist) {
        best = { entry, dist };
      }
    }
  }
  if (best && best.dist <= 2 && best.dist <= Math.ceil(query.length * 0.3)) {
    return {
      matched: true,
      canonical: best.entry.canonical,
      generic: best.entry.generic,
      flagged: false
    };
  }

  // No confident match → flag for the doctor (never fabricate a correction).
  return { matched: false, flagged: true };
};
