// Request-scoped tenant context for the ported MediScribe module.
//
// The reference app was single-tenant: its repositories took no clinic id. Rather
// than thread a clinicId parameter through every route/service/repo call (3k+
// lines), we stash the authenticated clinicId in an AsyncLocalStorage for the
// duration of the request. The NovaDoc-backed repository reads it, so every query
// is automatically scoped to the logged-in clinic and the ported code stays
// byte-for-byte the same.

import { AsyncLocalStorage } from 'node:async_hooks';

interface MediscribeCtx {
  clinicId: string;
}

const storage = new AsyncLocalStorage<MediscribeCtx>();

/** Run `fn` with the given clinic bound as the current tenant. */
export const runWithClinic = <T>(clinicId: string, fn: () => T): T =>
  storage.run({ clinicId }, fn);

/** The clinic id for the in-flight request. Throws if called outside a request. */
export const currentClinicId = (): string => {
  const ctx = storage.getStore();
  if (!ctx?.clinicId) {
    throw new Error('[mediscribe] no clinic context — request ran outside runWithClinic()');
  }
  return ctx.clinicId;
};
