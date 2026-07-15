// Auth helpers for the MediScribe port. Token issuing/verifying is NOT here any
// more — ClinicBook owns the session (one shared JWT), and the bridge middleware
// maps that session onto this module's principal (see middleware/auth.ts). What
// remains are the pieces the ADMIN features still need: password hashing (an
// admin creating doctor accounts in the users collection), id generation, the
// user DTO sanitizer, and the ClinicBook→MediScribe role mapping.

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import type { AuthUser, Role } from '../contracts/index.js';

export interface TokenPayload {
  sub: string; // user id
  role: Role;
  email: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** Generate a collision-resistant string id for new records. */
export function newId(prefix = 'usr'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * DEFAULT MediScribe RBAC role derived from the ClinicBook session — used only when
 * the user has no explicitly-assigned MediScribe role yet (see /me). Once a Super
 * Admin / Clinic Admin assigns a role (e.g. Doctor) in Roles & Users, that stored
 * role wins. Four RBAC roles: superadmin, hospital_admin, doctor, receptionist.
 *   ADMIN        → superadmin      (Super Admin)
 *   CLINIC_ADMIN → hospital_admin  (Clinic Admin)
 *   STAFF        → receptionist    (Staff — front desk)
 * (There is no ClinicBook DOCTOR role — the Doctor login role is assigned per-user
 * inside MediScribe.)
 */
export function mapClinicBookRole(role: string | undefined): Role {
  switch ((role || '').toUpperCase()) {
    case 'ADMIN':
      return 'superadmin';
    case 'CLINIC_ADMIN':
      return 'hospital_admin';
    case 'STAFF':
      return 'receptionist';
    default:
      return 'hospital_admin';
  }
}

/** Strip secret fields before a user document is returned to a client. */
export function sanitizeUser(doc: Record<string, unknown>): AuthUser {
  const { passwordHash: _omit, _id: _omitId, __v: _omitV, ...rest } = doc as Record<string, unknown> & {
    createdAt?: Date;
    updatedAt?: Date;
  };
  return {
    id: String(rest.id ?? ''),
    name: String(rest.name ?? ''),
    email: String(rest.email ?? ''),
    role: (rest.role as Role) ?? 'doctor',
    status: (rest.status as 'active' | 'suspended') ?? 'active',
    hospitalId: String(rest.hospitalId ?? ''),
    specialization: (rest.specialization as string) ?? '',
    licenseNumber: (rest.licenseNumber as string) ?? '',
    hospital: (rest.hospital as string) ?? '',
    experience: Number(rest.experience ?? 0),
    phone: (rest.phone as string) ?? '',
    avatarUrl: (rest.avatarUrl as string) ?? '',
    createdAt: rest.createdAt ? new Date(rest.createdAt as Date).toISOString() : undefined,
    lastLoginAt: (rest.lastLoginAt as string) || undefined,
  };
}
