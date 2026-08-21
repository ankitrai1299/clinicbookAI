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

    // A MediScribe role explicitly ASSIGNED to this user (Roles & Users) is the
    // source of truth — this is what makes Doctor / Staff / Clinic Admin / Super
    // Admin per-user. Only when none is assigned do we fall back to the default
    // derived from the ClinicBook session (mapClinicBookRole).
    const assignedRole = stored?.role as typeof auth.role | undefined;
    const effectiveRole = assignedRole ?? auth.role;

    const merged: Record<string, unknown> = {
      name: auth.email.split('@')[0],
      ...(stored ?? {}),
      id: auth.userId,
      email: auth.email,
      role: effectiveRole,
      status: 'active',
    };

    // Mirror IDENTITY so admin user lists include this user — name, email,
    // status. Never the role.
    //
    // This used to also write the role derived from the ClinicBook session when
    // the user had none stored. That single write FROZE it: from then on the
    // stored value won here forever, even after the ClinicBook role changed. Two
    // accounts spent months showing "Super Admin" in the scribe because that is
    // what they happened to be the first time they opened it; the User table had
    // said CLINIC_ADMIN for a long time and nothing could dislodge the label.
    //
    // With nothing written, an unassigned user falls through to the ClinicBook
    // role on every request, which is by definition current. A stored role now
    // means one thing only: an admin deliberately assigned it in Roles & Users.
    // (The store shallow-merges, so omitting `role` leaves any assigned one be.)
    usersRepo
      .upsert({
        id: auth.userId,
        name: merged.name,
        email: auth.email,
        status: 'active',
      })
      .catch(() => undefined);

    return res.json({ user: sanitizeUser(merged) });
  } catch (error) {
    console.error('[mediscribe:auth:me]', error);
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

export default router;
