// Shared NovaScribe domain types (used by the pipeline, service and controller).

export interface PrescriptionItem {
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  notes: string;
  // True when the doctor should double-check: drug not confidently in the
  // formulary, or the medicine wasn't grounded in the transcript.
  flagged?: boolean;
  // Formulary canonical name when matched (helps standardise brand/generic).
  canonical?: string;
}

export interface SoapSections {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface EvidenceItem {
  quote: string; // verbatim span from the transcript supporting a fact
  confidence?: number; // 0..1
}

// field name (e.g. 'assessment', 'prescription') -> supporting quotes.
export type EvidenceMap = Record<string, EvidenceItem[]>;

export interface UnderstandingResult {
  sections: SoapSections;
  prescription: PrescriptionItem[];
  evidence: EvidenceMap;
}

// Optional patient context fed to the model to improve accuracy (NOT invented).
export interface ConsultationContext {
  patientName?: string;
  age?: number;
  sex?: string;
}
