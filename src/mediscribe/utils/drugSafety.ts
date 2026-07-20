// Prescribing safety checks — run on the report the doctor is about to finalize.
//
// Three checks, all from data the report ALREADY carries (no new model, no API):
//   1. ALLERGY  — a prescribed medicine conflicts with a recorded allergy,
//                 including drug-class allergies (penicillin → amoxicillin).
//   2. INTERACTION — a clinically meaningful pair in the treatment plan (or
//                 against the patient's existing medication history).
//   3. DUPLICATE — the same medicine (or same class) prescribed twice.
//
// This is a SAFETY NET, not a pharmacology engine: it is deliberately a small,
// curated set of high-signal rules common in Indian primary care, so it warns
// rarely and meaningfully. The doctor always decides — nothing is blocked.

import type { ReportData, MedicationRow, AllergyRow } from '../types';

export type SafetySeverity = 'critical' | 'warning';

export interface SafetyAlert {
  severity: SafetySeverity;
  kind: 'allergy' | 'interaction' | 'duplicate';
  title: string;
  detail: string;
}

// ── Drug classes ─────────────────────────────────────────────
// Fragments are matched against the normalised medicine name, so "Tab. Amoxycillin
// 500mg" still resolves to the penicillin class.
const CLASSES: Record<string, string[]> = {
  penicillin: ['amoxicillin', 'amoxycillin', 'ampicillin', 'cloxacillin', 'penicillin', 'augmentin', 'piperacillin'],
  cephalosporin: ['cefixime', 'cefuroxime', 'ceftriaxone', 'cephalexin', 'cefpodoxime', 'cefadroxil'],
  sulfa: ['cotrimoxazole', 'sulfamethoxazole', 'trimethoprim', 'sulfadiazine'],
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aceclofenac', 'indomethacin', 'ketorolac', 'nimesulide', 'piroxicam', 'mefenamic'],
  salicylate: ['aspirin', 'acetylsalicylic'],
  ace_inhibitor: ['lisinopril', 'enalapril', 'ramipril', 'perindopril', 'captopril'],
  arb: ['losartan', 'telmisartan', 'olmesartan', 'valsartan', 'irbesartan'],
  potassium_sparing: ['spironolactone', 'eplerenone', 'amiloride', 'potassium chloride', 'potassium'],
  statin: ['simvastatin', 'atorvastatin', 'rosuvastatin', 'lovastatin', 'pravastatin'],
  macrolide: ['clarithromycin', 'erythromycin', 'azithromycin'],
  ssri: ['fluoxetine', 'sertraline', 'paroxetine', 'escitalopram', 'citalopram', 'fluvoxamine'],
  opioid: ['tramadol', 'morphine', 'codeine', 'fentanyl', 'oxycodone', 'buprenorphine'],
  benzodiazepine: ['alprazolam', 'diazepam', 'lorazepam', 'clonazepam', 'etizolam'],
  anticoagulant: ['warfarin', 'acenocoumarol', 'dabigatran', 'rivaroxaban', 'apixaban', 'heparin'],
  antiplatelet: ['clopidogrel', 'ticagrelor', 'prasugrel'],
  ppi: ['omeprazole', 'esomeprazole', 'pantoprazole', 'rabeprazole', 'lansoprazole'],
  quinolone: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin', 'norfloxacin'],
  metformin: ['metformin'],
  methotrexate: ['methotrexate'],
  digoxin: ['digoxin'],
  amiodarone: ['amiodarone'],
  theophylline: ['theophylline', 'aminophylline'],
  fluconazole: ['fluconazole', 'itraconazole', 'ketoconazole'],
};

// Class-level interactions. Kept short and high-signal.
const INTERACTIONS: Array<{ a: string; b: string; severity: SafetySeverity; why: string }> = [
  { a: 'anticoagulant', b: 'nsaid', severity: 'critical', why: 'Markedly increased bleeding risk.' },
  { a: 'anticoagulant', b: 'salicylate', severity: 'critical', why: 'Markedly increased bleeding risk.' },
  { a: 'anticoagulant', b: 'antiplatelet', severity: 'critical', why: 'Additive bleeding risk.' },
  { a: 'anticoagulant', b: 'fluconazole', severity: 'critical', why: 'Azoles raise anticoagulant levels — bleeding risk.' },
  { a: 'anticoagulant', b: 'macrolide', severity: 'warning', why: 'May raise anticoagulant effect — monitor INR.' },
  { a: 'ace_inhibitor', b: 'potassium_sparing', severity: 'critical', why: 'Risk of hyperkalaemia.' },
  { a: 'arb', b: 'potassium_sparing', severity: 'critical', why: 'Risk of hyperkalaemia.' },
  { a: 'ace_inhibitor', b: 'nsaid', severity: 'warning', why: 'Reduced antihypertensive effect; renal risk.' },
  { a: 'arb', b: 'nsaid', severity: 'warning', why: 'Reduced antihypertensive effect; renal risk.' },
  { a: 'statin', b: 'macrolide', severity: 'critical', why: 'Raised statin levels — myopathy/rhabdomyolysis risk.' },
  { a: 'statin', b: 'fluconazole', severity: 'warning', why: 'Raised statin levels — myopathy risk.' },
  { a: 'ssri', b: 'opioid', severity: 'critical', why: 'Serotonin syndrome risk (notably with tramadol).' },
  { a: 'ssri', b: 'nsaid', severity: 'warning', why: 'Increased GI bleeding risk.' },
  { a: 'ssri', b: 'salicylate', severity: 'warning', why: 'Increased GI bleeding risk.' },
  { a: 'opioid', b: 'benzodiazepine', severity: 'critical', why: 'Additive sedation and respiratory depression.' },
  { a: 'antiplatelet', b: 'ppi', severity: 'warning', why: 'Omeprazole/esomeprazole can reduce clopidogrel efficacy.' },
  { a: 'digoxin', b: 'amiodarone', severity: 'critical', why: 'Amiodarone raises digoxin levels — toxicity risk.' },
  { a: 'methotrexate', b: 'nsaid', severity: 'critical', why: 'Reduced methotrexate clearance — toxicity risk.' },
  { a: 'theophylline', b: 'quinolone', severity: 'warning', why: 'Ciprofloxacin raises theophylline levels.' },
  { a: 'nsaid', b: 'salicylate', severity: 'warning', why: 'Additive GI bleeding risk.' },
];

const norm = (s?: string): string => (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const medName = (m: MedicationRow): string => (m.medicine || '').trim();

/** Every class a medicine belongs to (usually 0 or 1). */
function classesOf(name: string): string[] {
  const n = norm(name);
  if (!n) return [];
  return Object.entries(CLASSES)
    .filter(([, members]) => members.some((frag) => n.includes(frag)))
    .map(([cls]) => cls);
}

const LABEL: Record<string, string> = {
  penicillin: 'penicillins',
  cephalosporin: 'cephalosporins',
  sulfa: 'sulfa drugs',
  nsaid: 'NSAIDs',
  salicylate: 'aspirin',
  ace_inhibitor: 'ACE inhibitors',
  arb: 'ARBs',
  potassium_sparing: 'potassium-sparing agents',
  statin: 'statins',
  macrolide: 'macrolides',
  ssri: 'SSRIs',
  opioid: 'opioids',
  benzodiazepine: 'benzodiazepines',
  anticoagulant: 'anticoagulants',
  antiplatelet: 'antiplatelets',
  ppi: 'PPIs',
  quinolone: 'quinolones',
  theophylline: 'theophylline',
  fluconazole: 'azole antifungals',
  digoxin: 'digoxin',
  amiodarone: 'amiodarone',
  methotrexate: 'methotrexate',
  metformin: 'metformin',
};

/** Does a recorded allergy cover this medicine (by name or by drug class)? */
function allergyHits(allergy: AllergyRow, name: string): string | null {
  const a = norm(allergy.allergy);
  const n = norm(name);
  if (!a || !n) return null;

  // Direct name overlap (guard against short/noise tokens).
  for (const token of a.split(' ')) {
    if (token.length >= 5 && n.includes(token)) return token;
  }
  // Class allergy: "allergic to penicillin" → amoxicillin.
  for (const [cls, members] of Object.entries(CLASSES)) {
    const allergyIsClass = members.some((m) => a.includes(m)) || a.includes(cls.replace('_', ' '));
    if (allergyIsClass && members.some((m) => n.includes(m))) return LABEL[cls] ?? cls;
  }
  return null;
}

/**
 * All safety alerts for a report, most severe first. Empty array = nothing to
 * flag (the common case — this stays quiet unless it matters).
 */
export function checkDrugSafety(report: ReportData): SafetyAlert[] {
  const prescribed = (report.prescribedMedications || []).filter((m) => medName(m));
  if (prescribed.length === 0) return [];

  const history = (report.medicationHistory || []).filter((m) => medName(m));
  const allergies = (report.allergies || []).filter((a) => (a.allergy || '').trim());
  const alerts: SafetyAlert[] = [];

  // 1) Allergy conflicts
  for (const med of prescribed) {
    for (const allergy of allergies) {
      const hit = allergyHits(allergy, medName(med));
      if (hit) {
        alerts.push({
          severity: 'critical',
          kind: 'allergy',
          title: `${medName(med)} vs recorded allergy`,
          detail: `Patient is recorded as allergic to ${allergy.allergy.trim()}${
            allergy.reaction ? ` (${allergy.reaction.trim()})` : ''
          }. ${medName(med)} matches ${hit}.`,
        });
      }
    }
  }

  // 2) Duplicates within the treatment plan (same name, or same class twice)
  const seenName = new Map<string, string>();
  const seenClass = new Map<string, string>();
  for (const med of prescribed) {
    const name = medName(med);
    const key = norm(name);
    const prevName = seenName.get(key);
    if (prevName) {
      alerts.push({
        severity: 'warning',
        kind: 'duplicate',
        title: `${name} appears twice`,
        detail: 'The same medicine is listed more than once in this treatment plan.',
      });
    } else {
      seenName.set(key, name);
      for (const cls of classesOf(name)) {
        const prev = seenClass.get(cls);
        if (prev && norm(prev) !== key) {
          alerts.push({
            severity: 'warning',
            kind: 'duplicate',
            title: `Two ${LABEL[cls] ?? cls} prescribed`,
            detail: `${prev} and ${name} are both ${LABEL[cls] ?? cls} — usually not given together.`,
          });
        } else if (!prev) {
          seenClass.set(cls, name);
        }
      }
    }
  }

  // 3) Interactions — within the plan, and plan vs existing medication history
  const withClasses = (rows: MedicationRow[]) =>
    rows.map((m) => ({ name: medName(m), classes: classesOf(medName(m)) })).filter((x) => x.classes.length);

  const planned = withClasses(prescribed);
  const existing = withClasses(history);

  const pairSeen = new Set<string>();
  const checkPair = (x: { name: string; classes: string[] }, y: { name: string; classes: string[] }, ongoing: boolean) => {
    if (norm(x.name) === norm(y.name)) return;
    for (const rule of INTERACTIONS) {
      const match =
        (x.classes.includes(rule.a) && y.classes.includes(rule.b)) ||
        (x.classes.includes(rule.b) && y.classes.includes(rule.a));
      if (!match) continue;
      const key = [norm(x.name), norm(y.name), rule.a, rule.b].sort().join('|');
      if (pairSeen.has(key)) continue;
      pairSeen.add(key);
      alerts.push({
        severity: rule.severity,
        kind: 'interaction',
        title: `${x.name} + ${y.name}`,
        detail: `${rule.why}${ongoing ? ' (patient is already on this medicine).' : ''}`,
      });
    }
  };

  for (let i = 0; i < planned.length; i++) {
    for (let j = i + 1; j < planned.length; j++) checkPair(planned[i], planned[j], false);
    for (const e of existing) checkPair(planned[i], e, true);
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}
