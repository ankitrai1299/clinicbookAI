// Extra fields on the auth responses, for the native MediScribe app.
//
// That app is reproduced from its reference verbatim and must not be edited, so
// where it and the web disagree the SERVER bends. It reads the token and user
// from the top level:
//
//     { token, user }          ← the app
//     { success, data: { accessToken, user } }   ← the web, unchanged
//
// Both go out in the same response. The web reads `data` and ignores what it
// does not know about, so nothing there changes; the app reads the top level and
// never sees the envelope. Additive only — no existing field is moved or renamed.

/**
 * ClinicBook's roles in the vocabulary the scribe products use.
 *
 * Deliberately duplicated here rather than imported from products/mediscribe:
 * core must not depend on a product (see architecture.test.ts), and this is a
 * three-line pure map. A parity test asserts the two never drift, which is the
 * risk duplication actually carries.
 */
export const toScribeRole = (role: string | undefined): string => {
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
};

interface ClinicBookUser {
  id: string;
  clinicId: string;
  name: string;
  email: string;
  role: string;
}

/** The user shape the native app's `AuthUser` expects. */
export interface NativeAppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active';
  hospitalId: string;
}

/**
 * A ClinicBook user in the shape the app reads.
 *
 * `hospitalId` is our clinicId: the app calls a tenant a hospital, and every
 * query it makes is already scoped server-side by the JWT, so this is a label
 * rather than a key it can act on.
 *
 * `status` is always 'active' — a suspended account cannot reach a login
 * response at all, so anything that gets here is by definition active. It is
 * NOT read from anywhere, because we have no such column; inventing a value
 * that looked authoritative would be worse than this fixed one.
 */
export const toNativeAppUser = (user: ClinicBookUser): NativeAppUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  // CLINIC_ADMIN → hospital_admin, STAFF → receptionist, ADMIN → superadmin —
  // the same mapping the MediScribe module uses, so the app and the web scribe
  // agree about who someone is.
  role: toScribeRole(user.role),
  status: 'active',
  hospitalId: user.clinicId
});

/** Merge the app's flat fields into an auth response body. */
export const withNativeAppAuth = <T extends Record<string, unknown>>(
  body: T,
  result: { user: ClinicBookUser; accessToken: string }
): T & { token: string; user: NativeAppUser } => ({
  ...body,
  token: result.accessToken,
  user: toNativeAppUser(result.user)
});
