// The platform's role vocabulary — ONE vocabulary, not a new one.
//
// Two already existed when this was written:
//
//   ClinicBook  UserRole enum   ADMIN | CLINIC_ADMIN | STAFF        (the identity)
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
    case 'STAFF':
      return 'receptionist';
    default:
      return null;
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
