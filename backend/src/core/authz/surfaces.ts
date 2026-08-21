// WHICH product each role signs in to. PURE — no imports beyond the role type.
//
// The clinic's own description of who uses what:
//
//   patient      →  WhatsApp only, never signs in anywhere
//   admin        →  ClinicBook (runs the desk) AND MediScribe (runs the clinic)
//   doctor       →  MediScribe only
//   receptionist →  ClinicBook only — the front desk is the whole job
//
// Before this, a doctor's account was stored as front-desk STAFF because the
// role enum had nothing better, so a doctor could sign in to ClinicBook and land
// on a desk dashboard that was never meant for them.
//
// Read the limit of this honestly: it is a DOOR, not a lock. What actually
// protects anything is the permission matrix in permissions.ts, which is checked
// on the server for every request and gives a doctor no administrative
// permission at any surface. This table decides where someone is sent and what
// they are told — which matters, because "Invalid email or password" for a
// doctor who typed their password correctly becomes a support call.

import type { PlatformRole } from './roles.js';

export const SURFACES = ['clinicbook', 'mediscribe'] as const;
export type Surface = (typeof SURFACES)[number];

/** The surfaces each role may sign in to. */
export const SURFACE_ACCESS: Record<PlatformRole, readonly Surface[]> = {
  superadmin: ['clinicbook', 'mediscribe'],
  hospital_admin: ['clinicbook', 'mediscribe'],
  doctor: ['mediscribe'],
  receptionist: ['clinicbook']
};

/** May this role sign in here? An unknown role may not — authorization fails closed. */
export const maySignInTo = (role: PlatformRole | null, surface: Surface): boolean =>
  !!role && SURFACE_ACCESS[role].includes(surface);

/**
 * What to tell someone who reached the wrong door.
 *
 * Never "invalid email or password" — they typed it correctly, and a person who
 * is told their password is wrong will try it again, then reset it, then call
 * the clinic. Name the product they should be using instead.
 */
export const wrongSurfaceMessage = (role: PlatformRole, attempted: Surface): string => {
  const elsewhere = SURFACE_ACCESS[role].filter((s) => s !== attempted);
  const name = (s: Surface) => (s === 'mediscribe' ? 'MediScribe' : 'ClinicBook');
  if (elsewhere.length === 0) {
    return 'This account cannot sign in here. Ask your clinic administrator.';
  }
  const who = role === 'doctor' ? 'Doctors' : 'This account';
  return `${who} sign in to ${elsewhere.map(name).join(' or ')}, not ${name(attempted)}.`;
};
