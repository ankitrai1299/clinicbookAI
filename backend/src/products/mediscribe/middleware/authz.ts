// MediScribe's binding to the platform permission matrix.
//
// The matrix itself lives in core/authz — there is one matrix for the whole
// platform, not one per product. What differs here is only HOW the acting role
// is found: MediScribe stores a per-user role in its own users collection (an
// admin there can make someone a `doctor`, which ClinicBook's UserRole enum has
// no way to express), and that stored role is more specific than the JWT's.
//
// This does NOT replace the module's existing `requirePermission` from
// contracts/index.ts. That one guards the admin sub-routers and is mirrored into
// both clients verbatim; it stays exactly as it is. This guards the CLINICAL
// routes — recordings, reports, prescriptions — which had no permission check of
// any kind before.

import type { Request } from 'express';

import {
  requirePermission as corePermission,
  type Permission,
  type RoleResolver
} from '../../../core/authz/index.js';
import { usersRepo } from '../repositories/index.js';
import type { AuthedRequest } from './auth.js';

/**
 * The acting role: MediScribe's stored role if the user has one, else whatever
 * the bridge resolved from the ClinicBook session.
 *
 * A lookup failure returns undefined rather than a guess, so authorization fails
 * closed (see core/authz/requirePermission).
 */
export const scribeRole: RoleResolver = async (req: Request) => {
  const auth = (req as AuthedRequest).auth;
  if (!auth) return undefined;
  try {
    const stored = (await usersRepo.findById(auth.userId)) as { role?: string } | null;
    return stored?.role ?? auth.role;
  } catch {
    return auth.role;
  }
};

/** `requirePermission`, already wired to MediScribe's role resolution. */
export const requirePermission = (permission: Permission) => corePermission(permission, scribeRole);
