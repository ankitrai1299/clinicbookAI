// Merge a (possibly partial) AI report onto a full empty Premium report so every
// section/field always exists, and derive the flat `chiefComplaint` projection
// the dashboard/lists consume. Ported from the reference app's report util.

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : String(x ?? ''))).filter(Boolean) : [];

const emptyVitals = () => ({
  bloodPressure: '', pulse: '', temperature: '', spo2: '', bloodSugar: '',
  height: '', weight: '', bmi: '', painScore: '', other: ''
});

const emptyFollowUp = () => ({ date: '', duration: '', reports: '', instructions: '' });

export const emptyReport = () => ({
  clinicalOverview: '',
  chiefComplaints: [] as Array<Record<string, string>>,
  historyOfPresentIllness: [] as string[],
  pastMedicalHistory: [] as string[],
  surgicalHistory: [] as string[],
  medicationHistory: [] as Array<Record<string, string>>,
  allergies: [] as Array<Record<string, string>>,
  familyHistory: [] as string[],
  socialHistory: [] as string[],
  reviewOfSystems: [] as Array<{ name: string; findings: string[] }>,
  clinicalMeasurements: emptyVitals(),
  physicalExamination: [] as Array<{ name: string; findings: string[] }>,
  assessment: [] as string[],
  prescribedMedications: [] as Array<Record<string, string>>,
  ordersDiagnostics: [] as Array<{ name: string; findings: string[] }>,
  advice: [] as string[],
  redFlags: [] as string[],
  followUp: emptyFollowUp(),
  notes: '',
  chiefComplaint: [] as string[]
});

export const normalizeReport = (partial: unknown): ReturnType<typeof emptyReport> => {
  const base = emptyReport();
  const p = (partial && typeof partial === 'object' && !Array.isArray(partial))
    ? (partial as Record<string, unknown>)
    : {};

  const merged = {
    ...base,
    ...p,
    clinicalMeasurements: { ...base.clinicalMeasurements, ...(p.clinicalMeasurements as object ?? {}) },
    followUp: { ...base.followUp, ...(p.followUp as object ?? {}) }
  } as ReturnType<typeof emptyReport>;

  // Derive the flat chiefComplaint projection when not already supplied.
  if (!asStringArray(merged.chiefComplaint).length && Array.isArray(merged.chiefComplaints)) {
    merged.chiefComplaint = merged.chiefComplaints
      .map((c) => {
        if (typeof c === 'string') return c;
        const row = c as Record<string, string>;
        return [row.complaint, row.duration, row.severity].filter(Boolean).join(' — ');
      })
      .filter(Boolean);
  }

  return merged;
};
