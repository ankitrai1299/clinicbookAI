import type { Patient } from '../types';

// Find a patient the way a clinic actually looks one up.
//
// Search was name-only in every list, which is the wrong single choice: the
// front desk knows the number the patient called from, duplicate names are
// common in a clinic and duplicate numbers are not. Add Patient already dedupes
// on phone — the lists just couldn't search by it.
//
// Digits are compared with separators stripped, so "98765 43210", "+91 98765
// 43210" and "9876543210" all find the same person. A very short digit string is
// ignored for phone matching so typing "12" doesn't match half the clinic.

const MIN_PHONE_DIGITS = 3;

/** Does this patient match the query, by name or by phone number? */
export function patientMatches(patient: Patient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((patient.name || '').toLowerCase().includes(q)) return true;

  const digits = q.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return false;
  return (patient.phone || '').replace(/\D/g, '').includes(digits);
}

/** Filter a patient list by name or phone. */
export const searchPatients = (patients: Patient[], query: string): Patient[] =>
  query.trim() ? patients.filter(p => patientMatches(p, query)) : patients;
