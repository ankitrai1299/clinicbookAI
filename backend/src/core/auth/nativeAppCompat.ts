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

import { platformRoleOf } from '../authz/roles.js';

/**
 * ClinicBook's roles in the vocabulary the scribe products use.
 *
 * The map itself now lives in core/authz/roles.ts, which is the one place the
 * platform decides what a role means — authorization and this display mapping
 * must never disagree about who someone is.
 *
 * The fallback differs on purpose. `platformRoleOf` returns null for an
 * unrecognised role because AUTHORIZATION must fail closed. This function is not
 * authorization: it fills in the `user.role` field the native app renders its
 * menu from, and returning null there would leave the app with no role at all.
 * A parity test pins it to the product's own mapping, which has always defaulted
 * to hospital_admin. Nothing is granted by this value — every permission is
 * checked server-side against the matrix.
 */
export const toScribeRole = (role: string | undefined): string =>
  platformRoleOf(role) ?? 'hospital_admin';

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
