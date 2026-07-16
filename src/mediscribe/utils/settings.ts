// Per-device doctor preferences for the scribe: the letterhead profile that
// prints on reports/prescriptions and the default transcription language. Stored
// in localStorage (so it persists on this browser / the phone app) — there is no
// per-doctor server profile yet, and the report already reads doctorName from
// here at render time.

export interface DoctorProfile {
  name: string;
  qualification: string;
  regNo: string;
  clinicName: string;
}

const PROFILE_KEY = 'mediscribe.doctorProfile';
const LANG_KEY = 'mediscribe.language';

const EMPTY: DoctorProfile = { name: '', qualification: '', regNo: '', clinicName: '' };

export function loadDoctorProfile(): DoctorProfile {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') as Partial<DoctorProfile>) };
  } catch {
    return { ...EMPTY };
  }
}

export function saveDoctorProfile(profile: DoctorProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadLanguage(): string {
  return localStorage.getItem(LANG_KEY) || 'Auto Detect';
}

export function saveLanguage(language: string): void {
  localStorage.setItem(LANG_KEY, language);
}

// The languages the scribe supports, in display order (Auto Detect first).
export const LANGUAGES: string[] = [
  'Auto Detect',
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Gujarati',
  'Kannada',
  'Malayalam',
  'Punjabi',
];
