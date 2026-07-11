// Auth bridge for the MediScribe port.
//
// The module is mounted BEHIND ClinicBook's own `requireAuth`, which verifies the
// shared JWT and sets `req.user = { userId, clinicId, email, role }`. This bridge
// turns that into the principal the ported routes expect (`req.auth`) and binds
// the request's clinic into AsyncLocalStorage so the NovaDoc repository scopes
// every query to it. One login, one token — SSO with ClinicBook by construction.

import type { Request, Response, NextFunction } from 'express';

import { can, type Permission, type Role } from '../contracts/index.js';
import { mapClinicBookRole } from '../services/auth.js';
import { runWithClinic } from '../context.js';

// ClinicBook's JWT payload (see config/jwt.ts), attached by its requireAuth.
interface ClinicBookUser {
  userId: string;
  clinicId: string;
  email: string;
  role: string;
}

export interface AuthedRequest extends Request {
  auth?: { userId: string; role: Role; email: string };
}

/**
 * Translate the ClinicBook session into `req.auth` and run the rest of the
 * request inside this clinic's tenant context. Rejects if the upstream auth did
 * not run (defence in depth — the mount always applies requireAuth first).
 */
export function bridgeAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = (req as Request & { user?: ClinicBookUser }).user;
  if (!user?.clinicId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.auth = { userId: user.userId, role: mapClinicBookRole(user.role), email: user.email };
  // Bind clinicId for the whole downstream chain (handlers + their async work).
  runWithClinic(user.clinicId, () => next());
}

/** No-op: real authentication is already enforced by the mount + bridgeAuth. */
export function optionalAuth(_req: AuthedRequest, _res: Response, next: NextFunction) {
  next();
}

/** Require a resolved principal; 401 otherwise. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Require one of the given roles; 403 otherwise. */
export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}

/**
 * Require a specific permission. The permission matrix is the SAME one the client
 * uses for UI gating (contracts.ts), so the server enforces exactly what the UI
 * advertises.
 */
export function requirePermission(permission: Permission) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
    if (!can(req.auth.role, permission)) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}
