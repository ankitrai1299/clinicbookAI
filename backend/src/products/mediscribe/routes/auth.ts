// MediScribe auth routes. Login/registration are owned by ClinicBook (one shared
// session — SSO), so only `/me` remains: it resolves the current principal from
// the bridged ClinicBook session and mirrors it into the users collection so the
// logged-in clinic admin shows up in the admin dashboard's user/doctor lists.

import { Router } from 'express';

import { usersRepo } from '../repositories/index.js';
import { sanitizeUser } from '../services/auth.js';
import type { AuthedRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/mediscribe/auth/me — current user, derived from the ClinicBook session.
router.get('/me', async (req: AuthedRequest, res) => {
  try {
    const auth = req.auth!; // guaranteed by the bridge + requireAuth on the mount
    const stored = (await usersRepo.findById(auth.userId)) as Record<string, unknown> | null;

    const merged: Record<string, unknown> = {
      name: auth.email.split('@')[0],
      ...(stored ?? {}),
      // ClinicBook session is authoritative for identity + role.
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      status: 'active',
    };

    // Mirror (best-effort) so admin user/doctor lists include this clinic admin.
    usersRepo
      .upsert({ id: auth.userId, name: merged.name, email: auth.email, role: auth.role, status: 'active' })
      .catch(() => undefined);

    return res.json({ user: sanitizeUser(merged) });
  } catch (error) {
    console.error('[mediscribe:auth:me]', error);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

export default router;
