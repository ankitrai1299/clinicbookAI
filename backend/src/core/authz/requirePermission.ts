// Route-level authorization.
//
// This runs AFTER requireAuth (which proves who you are) and answers the second
// question: may this person do this? Two things are deliberate.
//
// It fails CLOSED. No role, an unrecognised role, or a permission nobody holds
// all end the same way — 403. There is no "default to admin" path, which is the
// mistake that makes an RBAC layer decorative.
//
// It records every refusal. A denied request is a security signal (someone is
// probing, or a real user has the wrong role and is stuck) and it is exactly the
// event that is invisible without an audit trail.
//
// Frontend gating is NOT authorization. Every guard here is server-side; hiding
// a button changes nothing about what the API will accept.

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { record, auditContext } from '../audit/audit.service.js';
import { hasPermission, type Permission } from './permissions.js';
import { effectiveRole, type PlatformRole } from './roles.js';

/**
 * How to find the acting role for a request.
 *
 * ClinicBook reads it from the JWT. MediScribe resolves a stored per-user role
 * first (an admin there can make someone a `doctor`, which the ClinicBook enum
 * cannot express), so it passes its own resolver. One matrix, two ways in.
 */
export type RoleResolver = (req: Request) => Promise<string | undefined> | string | undefined;

const fromJwt: RoleResolver = (req) => req.user?.role;

/** The role this request acts with, or null if it has none we recognise. */
export const resolveActingRole = async (
  req: Request,
  resolver: RoleResolver = fromJwt
): Promise<PlatformRole | null> => {
  const raw = await resolver(req);
  // `raw` may be either spelling — a ClinicBook UserRole or an already-resolved
  // platform role — and effectiveRole() prefers the more specific one.
  return effectiveRole({ storedRole: raw, clinicBookRole: req.user?.role });
};

/**
 * Refuse the request unless the acting role holds `permission`.
 *
 * The 403 body deliberately names the missing permission. This is not a leak —
 * the matrix is public in both clients' contracts — and without it a stuck
 * receptionist generates a support ticket that nobody can answer.
 */
export const requirePermission = (permission: Permission, resolver?: RoleResolver): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    void (async () => {
      let role: PlatformRole | null = null;
      try {
        role = await resolveActingRole(req, resolver);
      } catch (err) {
        // A resolver that cannot answer must not become an accidental allow.
        console.error('[authz] role resolution failed', err);
        role = null;
      }

      if (hasPermission(role, permission)) return next();

      record({
        ...auditContext(req),
        action: 'AUTHORIZATION_DENIED',
        outcome: 'denied',
        reason: `missing:${permission}`,
        actorRole: role ?? req.user?.role ?? null,
        resourceType: 'route',
        resourceId: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`
      });

      next(new AppError(`You do not have permission to do this (${permission})`, 403));
    })();
  };
};

/**
 * The same check inside a service, where there is no middleware chain.
 *
 * Used where the permission depends on something only the handler knows (which
 * consultation, whose patient), so it cannot be decided at the route.
 */
export const assertPermission = (role: string | null | undefined, permission: Permission): void => {
  if (!hasPermission(role, permission)) {
    throw new AppError(`You do not have permission to do this (${permission})`, 403);
  }
};
