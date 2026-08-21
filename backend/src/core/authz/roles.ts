// The platform's role vocabulary — ONE vocabulary, not a new one.
//
// Two already existed when this was written:
//
//   ClinicBook  UserRole enum   ADMIN | CLINIC_ADMIN | DOCTOR | STAFF   (the identity)
//   MediScribe  contracts.ts    superadmin | hospital_admin | doctor | receptionist
//
// The MediScribe set is the richer one — it is the only place a DOCTOR exists as
// a distinct role, and it is already the vocabulary both scribe clients read from
// their copy of contracts.ts. So authorization speaks THAT vocabulary, and the
// ClinicBook enum maps into it. Adding a third set would have meant three places
// to get a permission wrong.
//
// Nothing here imports a product: the names are duplicated as string literals on
// purpose (core may not depend on products/mediscribe — see architecture.test.ts),
// and a parity test asserts they stay identical to the product's own list.

export const PLATFORM_ROLES = ['superadmin', 'hospital_admin', 'doctor', 'receptionist'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * ClinicBook's `UserRole` in the platform vocabulary.
 *
 * Returns null — NOT a default role — for anything unrecognised. Authorization
 * must fail closed: a token carrying a role this build has never heard of gets
 * no permissions, rather than quietly inheriting an administrator's.
 */
export const platformRoleOf = (clinicBookRole: string | undefined): PlatformRole | null => {
  switch ((clinicBookRole || '').toUpperCase()) {
    case 'ADMIN':
      return 'superadmin';
    case 'CLINIC_ADMIN':
      return 'hospital_admin';
    // A doctor is now a FIRST-CLASS identity, not a receptionist wearing a
    // second role in another store. Before this, an admin creating a doctor
    // wrote the account as STAFF (the enum had nothing better) and the real
    // role lived in MediScribe's users collection — so the token said
    // "receptionist" and only the routes that did a second lookup disagreed.
    // Same user, two answers, depending on the route. That is gone: the role
    // travels in the token and every route reads the same thing.
    case 'DOCTOR':
      return 'doctor';
    case 'STAFF':
      return 'receptionist';
    default:
      return null;
  }
};

/** The ClinicBook `UserRole` spellings, as literals — core may not import Prisma. */
export type ClinicBookRole = 'ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'STAFF';

/**
 * The reverse of `platformRoleOf`: which `UserRole` to STORE for a platform role.
 *
 * This exists because the mapping was previously written inline, as a ternary
 * chain, in two separate places — and both ended `: UserRole.STAFF`, so every
 * role they had not thought about (doctor) silently became front-desk staff.
 * A round-trip test now pins the two directions together, so neither can learn
 * about a role without the other.
 */
export const clinicBookRoleOf = (role: PlatformRole): ClinicBookRole => {
  switch (role) {
    case 'superadmin':
      return 'ADMIN';
    case 'hospital_admin':
      return 'CLINIC_ADMIN';
    case 'doctor':
      return 'DOCTOR';
    case 'receptionist':
      return 'STAFF';
  }
};

/** A string that is already a platform role, or null. Fails closed, as above. */
export const asPlatformRole = (role: string | undefined): PlatformRole | null =>
  PLATFORM_ROLES.includes((role || '') as PlatformRole) ? ((role as PlatformRole) ?? null) : null;

/**
 * The role to authorize a request with, given both spellings.
 *
 * MediScribe resolves a stored per-user role (an admin can make someone a
 * `doctor` there) which is more specific than the ClinicBook enum can express;
 * when present it wins. Otherwise the JWT's ClinicBook role is mapped.
 */
export const effectiveRole = (opts: {
  storedRole?: string;
  clinicBookRole?: string;
}): PlatformRole | null => asPlatformRole(opts.storedRole) ?? platformRoleOf(opts.clinicBookRole);
