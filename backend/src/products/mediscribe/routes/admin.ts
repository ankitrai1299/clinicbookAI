import { Router } from 'express';
import {
  patientsRepo,
  consultationsRepo,
  reportsRepo,
  usersRepo,
  settingsRepo,
  notificationsRepo,
} from '../repositories/index.js';
import { buildOverview, buildAnalytics, buildLanguageDashboard } from '../services/analytics.js';
import { sarvamModel } from '../services/sarvam.js';
import { hashPassword, sanitizeUser, newId } from '../services/auth.js';
import { requirePermission } from '../middleware/auth.js';
import type { AdminSettings, SearchResult } from '../contracts/index.js';
import { currentClinicId } from '../context.js';
import { clinicBookRoleOf, type PlatformRole } from '../../../core/authz/index.js';
import {
  listClinicDoctorsAdmin,
  listClinicPatientsAdmin,
  createClinicDoctor,
  updateClinicDoctor,
  deleteClinicDoctor
} from '../clinicData.js';
import {
  getRegistryStatus,
  setFacilityId,
  setProfessionalId,
} from '../../../services/abdmRegistry.service.js';

const router = Router();

// Every admin route requires a valid token (optionalAuth runs app-wide in
// index.ts); each handler additionally checks a specific permission so a
// Doctor/Receptionist token can only reach what its role allows.

// ── Dashboard & Analytics ────────────────────────────────────
router.get('/overview', requirePermission('dashboard.view'), async (_req, res) => {
  try {
    return res.json(await buildOverview());
  } catch (error) {
    console.error('[admin:overview]', error);
    return res.status(500).json({ error: 'Failed to load overview' });
  }
});

router.get('/analytics', requirePermission('analytics.view'), async (_req, res) => {
  try {
    return res.json(await buildAnalytics());
  } catch (error) {
    console.error('[admin:analytics]', error);
    return res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/languages', requirePermission('analytics.view'), async (_req, res) => {
  try {
    return res.json(await buildLanguageDashboard());
  } catch (error) {
    console.error('[admin:languages]', error);
    return res.status(500).json({ error: 'Failed to load language dashboard' });
  }
});

// ── Doctor Management (users where role === 'doctor') ─────────
function matchSearch(hay: string, q: string) {
  return hay.toLowerCase().includes(q.toLowerCase());
}

router.get('/doctors', requirePermission('doctors.view'), async (req, res) => {
  try {
    // Doctors are owned by ClinicBook (same clinic id) — list THOSE so the scribe
    // shows exactly the clinic's doctors, not a separate NovaDoc set.
    const q = String(req.query.search || '').trim();
    let doctors = await listClinicDoctorsAdmin(currentClinicId());
    if (q) {
      doctors = doctors.filter(
        (d) =>
          matchSearch(d.name, q) ||
          matchSearch(d.email, q) ||
          matchSearch(d.specialization || '', q) ||
          matchSearch(d.licenseNumber || '', q),
      );
    }
    return res.json(doctors);
  } catch (error) {
    console.error('[admin:doctors]', error);
    return res.status(500).json({ error: 'Failed to load doctors' });
  }
});

// Give (or reset) a doctor an app login.
//
// This is the ONE place a doctor becomes a person who can sign in. It writes all
// three things that make a doctor whole, together:
//
//   1. the login account          (email + password, role DOCTOR)
//   2. the link                   (Doctor.userId → that account)
//   3. the scribe's stored role   ('doctor', what the admin lists read)
//
// The link is the point. It used to be an email compared against an email, so an
// admin who left the field blank or typed a different address produced a doctor
// who signed in fine and saw an EMPTY day — nothing failed, so nothing was
// reported. A key cannot be mistyped.
//
// No email or no password → no login, and we SAY so in the response rather than
// returning silently. A bookable doctor with no login is a legitimate thing to
// want; a doctor the admin THINKS has a login and doesn't is the bug.
type LoginResult = { login: 'created' | 'updated' | 'skipped'; reason?: string };

async function giveDoctorLogin(
  clinicId: string,
  doctor: { id: string; name: string; email?: string | null },
  emailInput?: string,
  passwordInput?: string
): Promise<LoginResult> {
  const password = passwordInput ? String(passwordInput) : '';
  const email = String(emailInput ?? doctor.email ?? '').toLowerCase().trim();
  if (!email) return { login: 'skipped', reason: 'No email — add one to give this doctor a login.' };
  if (password.length < 6) {
    return { login: 'skipped', reason: 'No password (min 6 chars) — this doctor cannot sign in yet.' };
  }

  const { prisma } = await import('../../../config/prisma.js');
  const bcrypt = (await import('bcryptjs')).default;
  const { forClinic } = await import('../../../config/tenantPrisma.js');
  const { clinicBookRoleOf } = await import('../../../core/authz/index.js');

  const passwordHash = await bcrypt.hash(password, 12);
  if (email !== (doctor.email ?? '').toLowerCase()) {
    await forClinic(clinicId).doctor.update({ where: { id: doctor.id }, data: { email } }).catch(() => undefined);
  }

  // `User.email` is unique across the WHOLE platform, so this lookup can only be
  // done unscoped — and that is exactly why the clinic must be checked after it.
  // Without the check, an admin of clinic A typing an address that belongs to
  // clinic B would RESET THAT PERSON'S PASSWORD and hand their account to a
  // different tenant. Refuse instead, and say why.
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, clinicId: true }
  });
  if (existing && existing.clinicId !== clinicId) {
    throw new Error('That email already belongs to an account at another clinic.');
  }

  const role = clinicBookRoleOf('doctor');
  let userId: string;
  let outcome: 'created' | 'updated';
  if (existing) {
    // Promote to DOCTOR as well as resetting the password: an account that was
    // created before this role existed is still stored as STAFF.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, emailVerified: true, role }
    });
    userId = existing.id;
    outcome = 'updated';
  } else {
    const created = await prisma.user.create({
      data: { clinicId, name: doctor.name, email, passwordHash, role, emailVerified: true },
      select: { id: true }
    });
    userId = created.id;
    outcome = 'created';
  }

  // The link, written last so it only ever points at an account that exists.
  // Unique, so a second doctor cannot claim the same login: if that happens the
  // link is left alone rather than silently stolen from the first doctor.
  await forClinic(clinicId)
    .doctor.update({ where: { id: doctor.id }, data: { userId } })
    .catch(() => undefined);

  await usersRepo.upsert({ id: userId, name: doctor.name, email, role: 'doctor', status: 'active', hospitalId: '' });
  return { login: outcome };
}

// The mirror of giveDoctorLogin: an account was created FIRST (from Roles &
// Users, where the admin picks a role rather than filling a doctor form), so now
// the bookable half has to catch up.
//
// Prefer an existing unlinked Doctor with the same address — an admin who added
// the doctor to the Doctors page last week and is only now giving them a login
// should end up with ONE doctor, not two with the same name.
async function linkOrCreateDoctorFor(
  clinicId: string,
  account: { id: string; name: string; email: string },
  specialization: string
): Promise<void> {
  const { forClinic } = await import('../../../config/tenantPrisma.js');
  const db = forClinic(clinicId);

  const existing = await db.doctor.findFirst({
    where: { userId: null, email: { equals: account.email, mode: 'insensitive' } },
    select: { id: true }
  });
  if (existing) {
    await db.doctor.update({ where: { id: existing.id }, data: { userId: account.id } }).catch(() => undefined);
    return;
  }

  // `@@unique([clinicId, name])` — a clash means a doctor of that name is already
  // on the books. Linking the account to THAT record is wrong (it may be someone
  // else entirely), so leave it: the admin can set the email on the Doctors page
  // and the link is made there. Failing loudly here would block a login that is
  // otherwise fine.
  await db.doctor
    .create({
      data: {
        clinicId,
        name: account.name,
        speciality: specialization.trim() || 'General',
        email: account.email,
        userId: account.id
      }
    })
    .catch(() => undefined);
}

// Add a doctor from the scribe → creates a REAL ClinicBook doctor (shows in both
// apps). If a password is supplied, the doctor also gets an app login (see
// giveDoctorLogin); otherwise they're a bookable resource with no login.
router.post('/doctors', requirePermission('doctors.manage'), async (req, res) => {
  try {
    const { name, specialization, experience, email, phone, password, hprId } = req.body ?? {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Doctor name is required' });
    const doctor = await createClinicDoctor(currentClinicId(), { name, specialization, experience, email, phone });
    // Written separately, not as part of the doctor: the roster may be owned by
    // an EMR, but the registry id is ours. See abdmRegistry.service.
    if (hprId !== undefined) {
      await setProfessionalId(currentClinicId(), (doctor as { id: string }).id, hprId);
    }
    const login = await giveDoctorLogin(
      currentClinicId(),
      doctor as { id: string; name: string; email?: string | null },
      email,
      password
    );
    // Additive: the client keeps reading the doctor exactly as before and simply
    // ignores what it does not know about. But now, if no login was created, the
    // reason travelled back instead of vanishing.
    return res.json({ ...(doctor as object), ...login });
  } catch (error: any) {
    console.error('[admin:doctor:create]', error);
    return res.status(400).json({ error: error?.message || 'Failed to create doctor' });
  }
});

router.put('/doctors/:id', requirePermission('doctors.manage'), async (req, res) => {
  try {
    const { name, specialization, experience, email, phone, password, hprId } = req.body ?? {};
    const doctor = await updateClinicDoctor(currentClinicId(), req.params.id, { name, specialization, experience, email, phone });
    if (hprId !== undefined) {
      await setProfessionalId(currentClinicId(), req.params.id, hprId);
    }
    const login = await giveDoctorLogin(
      currentClinicId(),
      doctor as { id: string; name: string; email?: string | null },
      email,
      password
    );
    return res.json({ ...(doctor as object), ...login });
  } catch (error: any) {
    console.error('[admin:doctor:update]', error);
    const status = /not found/i.test(error?.message || '') ? 404 : 400;
    return res.status(status).json({ error: error?.message || 'Failed to update doctor' });
  }
});

router.delete('/doctors/:id', requirePermission('doctors.manage'), async (req, res) => {
  try {
    await deleteClinicDoctor(currentClinicId(), req.params.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[admin:doctor:delete]', error);
    // ClinicBook blocks deleting a doctor with existing appointments — surface that.
    return res.status(409).json({ error: error?.message || 'Failed to delete doctor' });
  }
});

// ClinicBook doctors have no suspend/active state (they're always bookable) — accept
// the call so the scribe UI doesn't error, but there's nothing to toggle.
router.post('/doctors/:id/suspend', requirePermission('doctors.manage'), async (_req, res) =>
  res.json({ success: true, note: 'ClinicBook doctors have no suspended state' })
);
router.post('/doctors/:id/activate', requirePermission('doctors.manage'), async (_req, res) =>
  res.json({ success: true })
);

// ── Users & Roles (Super Admin) ──────────────────────────────
router.get('/users', requirePermission('users.manage'), async (_req, res) => {
  try {
    const users = (await usersRepo.findBy({}, { createdAt: -1 })).map((u) => sanitizeUser(u as any));
    return res.json(users);
  } catch (error) {
    console.error('[admin:users]', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/users', requirePermission('users.manage'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body ?? {};
    if (!email || !role) return res.status(400).json({ error: 'email and role are required' });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'A password (min 6 chars) is required' });
    }
    const normalized = String(email).toLowerCase().trim();

    // Create a REAL, pre-verified ClinicBook login account in THIS clinic. The
    // ClinicBook role is mapped from the chosen role, and the same role is stored
    // keyed by the new account id, so on login /me returns it and the correct
    // panel opens — "doctorx@clinic → doctor panel, adminx@clinic → admin panel".
    const { prisma } = await import('../../../config/prisma.js');
    const bcrypt = (await import('bcryptjs')).default;

    const exists = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
    if (exists) return res.status(409).json({ error: 'A user with that email already exists' });

    // One mapper, shared with its inverse and round-trip tested. This used to be
    // a ternary chain ending `: UserRole.STAFF`, duplicated here and below — so
    // 'doctor', which neither branch named, silently became front-desk staff.
    const clinicRole = clinicBookRoleOf(role as PlatformRole);

    const account = await prisma.user.create({
      data: {
        clinicId: currentClinicId(),
        name: name || normalized.split('@')[0],
        email: normalized,
        passwordHash: await bcrypt.hash(String(password), 12),
        role: clinicRole,
        emailVerified: true,
      },
      select: { id: true, name: true, email: true },
    });

    // Persist the MediScribe role keyed by the ClinicBook account id (what /me reads).
    const mUser = { id: account.id, name: account.name, email: account.email, role, status: 'active' as const, hospitalId: '' };
    await usersRepo.upsert(mUser);

    // A DOCTOR needs the other half too, or the admin has created someone who can
    // sign in but whom no patient can book — and whose queue is therefore empty
    // for a reason nothing on screen explains. Reuse the clinic's existing Doctor
    // record when one already matches this address; otherwise make one.
    if (role === 'doctor') {
      await linkOrCreateDoctorFor(currentClinicId(), account, String(req.body?.specialization ?? ''));
    }
    return res.json(sanitizeUser(mUser));
  } catch (error) {
    console.error('[admin:user:create]', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id/role', requirePermission('users.manage'), async (req, res) => {
  try {
    const { role } = req.body ?? {};
    if (!role) return res.status(400).json({ error: 'role is required' });
    // The MediScribe role (what /me reads → drives the panel).
    await usersRepo.upsert({ id: req.params.id, role } as any);
    // Keep the ClinicBook account role aligned (best-effort; no-op for records that
    // aren't a real ClinicBook account).
    try {
      const { prisma } = await import('../../../config/prisma.js');
      const clinicRole = clinicBookRoleOf(role as PlatformRole);
      await prisma.user.update({ where: { id: req.params.id }, data: { role: clinicRole } });
    } catch {
      /* not a ClinicBook account row — MediScribe role is enough */
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:user:role]', error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// ── Patient Management ───────────────────────────────────────
router.get('/patients', requirePermission('patients.view'), async (req, res) => {
  try {
    // Patients are owned by ClinicBook (same clinic id) — list THOSE so the scribe
    // matches the clinic's patient list (a patient added in either app appears here).
    const q = String(req.query.search || '').trim();
    let patients = await listClinicPatientsAdmin(currentClinicId());
    if (q) patients = patients.filter((p) => matchSearch(p.name || '', q) || matchSearch(p.phone || '', q));

    // Annotate each patient with the doctor(s) who attended them, so the admin can
    // see which doctor saw which patient (attribution). Derived from consultations.
    const cons = (await consultationsRepo.findAll()) as Array<{ patientId?: string; doctorName?: string }>;
    const byPatient = new Map<string, Set<string>>();
    for (const c of cons) {
      const name = (c.doctorName || '').trim();
      if (!c.patientId || !name) continue;
      if (!byPatient.has(c.patientId)) byPatient.set(c.patientId, new Set());
      byPatient.get(c.patientId)!.add(name);
    }
    const withDoctors = patients.map((p) => ({
      ...p,
      attendingDoctors: Array.from(byPatient.get(p.id) ?? [])
    }));
    return res.json(withDoctors);
  } catch (error) {
    console.error('[admin:patients]', error);
    return res.json([]);
  }
});

router.delete('/patients/:id', requirePermission('patients.manage'), async (req, res) => {
  try {
    const ok = await patientsRepo.remove(req.params.id);
    return res.json({ success: ok });
  } catch (error) {
    console.error('[admin:patient:delete]', error);
    return res.status(500).json({ error: 'Failed to delete patient' });
  }
});

router.get('/patients/:id/history', requirePermission('patients.view'), async (req, res) => {
  try {
    const { buildPatientHistory } = await import('../services/patientHistory.js');
    const order = req.query.order === 'asc' ? 'asc' : 'desc';
    return res.json(await buildPatientHistory(req.params.id, order));
  } catch (error) {
    console.error('[admin:patient:history]', error);
    return res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── Consultation Management ──────────────────────────────────
router.get('/consultations', requirePermission('consultations.view'), async (req, res) => {
  try {
    const bucket = String(req.query.bucket || '').trim();
    const q = String(req.query.search || '').trim();
    let items = await consultationsRepo.findAll();
    if (bucket) {
      items = items.filter((c: any) => {
        const s = (c.status || '').toLowerCase();
        if (bucket === 'live') return s === 'recording' || s === 'processing';
        if (bucket === 'draft') return s === 'draft';
        if (bucket === 'failed') return s === 'failed';
        if (bucket === 'previous') return s === 'completed';
        return true;
      });
    }
    if (q) items = items.filter((c: any) => matchSearch(c.patientName || '', q) || matchSearch(c.date || '', q));
    return res.json(items);
  } catch (error) {
    console.error('[admin:consultations]', error);
    return res.json([]);
  }
});

// Retry processing a failed/draft session: re-run report generation from its
// stored transcript. Marks the session Completed (or Failed) based on outcome.
router.post('/consultations/:id/retry', requirePermission('consultations.manage'), async (req, res) => {
  try {
    const consultation: any = await consultationsRepo.findById(req.params.id);
    if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
    const transcript = consultation.transcriptText || consultation.originalTranscript || '';
    if (!transcript.trim()) {
      return res.status(400).json({ error: 'No transcript available to reprocess' });
    }
    await consultationsRepo.upsert({ id: consultation.id, status: 'Processing' });
    try {
      const { generateMedicalReport } = await import('../services/report.js');
      const report = await generateMedicalReport(transcript);
      await consultationsRepo.upsert({ id: consultation.id, status: 'Completed', report });
      await reportsRepo.upsert({
        id: consultation.id,
        consultationId: consultation.id,
        patientId: consultation.patientId || '',
        patientName: consultation.patientName || '',
        doctorId: consultation.doctorId || '',
        status: 'Completed',
        date: consultation.date || new Date().toISOString(),
        report,
      });
      return res.json({ success: true, status: 'Completed' });
    } catch (genErr: any) {
      await consultationsRepo.upsert({ id: consultation.id, status: 'Failed' });
      return res.status(502).json({ error: `Reprocessing failed: ${genErr?.message || 'unknown error'}` });
    }
  } catch (error) {
    console.error('[admin:consultation:retry]', error);
    return res.status(500).json({ error: 'Failed to retry consultation' });
  }
});

router.delete('/consultations/:id', requirePermission('consultations.manage'), async (req, res) => {
  try {
    const ok = await consultationsRepo.remove(req.params.id);
    return res.json({ success: ok });
  } catch (error) {
    console.error('[admin:consultation:delete]', error);
    return res.status(500).json({ error: 'Failed to delete consultation' });
  }
});

// ── Reports Management ───────────────────────────────────────
router.get('/reports', requirePermission('reports.view'), async (req, res) => {
  try {
    const q = String(req.query.search || '').trim();
    let items = await reportsRepo.findAll();
    if (q) items = items.filter((r: any) => matchSearch(r.patientName || '', q) || matchSearch(r.date || '', q));
    return res.json(items);
  } catch (error) {
    console.error('[admin:reports]', error);
    return res.json([]);
  }
});

router.delete('/reports/:id', requirePermission('reports.manage'), async (req, res) => {
  try {
    const ok = await reportsRepo.remove(req.params.id);
    return res.json({ success: ok });
  } catch (error) {
    console.error('[admin:report:delete]', error);
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

// ── Settings ─────────────────────────────────────────────────
function toSettingsDto(doc: any): AdminSettings {
  const d = doc || {};
  return {
    aiProvider: d.aiProvider || 'sarvam',
    sttProvider: d.sttProvider || 'sarvam',
    // Same default the chat client actually uses, so the settings screen can
    // never advertise a model that is not the one being called.
    sarvam: { model: d.sarvamModel || sarvamModel(), apiConfigured: !!(process.env.SARVAM_API_KEY || '').trim() },
    openai: { model: d.openaiModel || 'gpt-4o', apiConfigured: !!(process.env.OPENAI_API_KEY || '').trim() },
    whisper: { model: d.whisperModel || 'whisper-1', apiConfigured: !!(process.env.WHISPER_API_KEY || '').trim() },
    defaultLanguage: d.defaultLanguage || 'en',
    reportSettings: {
      autoSave: d.autoSave ?? true,
      includeSignature: d.includeSignature ?? true,
      letterhead: d.letterhead || '',
    },
    security: { sessionTimeoutMin: d.sessionTimeoutMin ?? 60, enforce2fa: d.enforce2fa ?? false },
    backup: {
      autoBackup: d.autoBackup ?? false,
      frequency: d.backupFrequency || 'weekly',
      lastBackupAt: d.lastBackupAt || '',
    },
  };
}

router.get('/settings', requirePermission('settings.view'), async (_req, res) => {
  try {
    const doc = await settingsRepo.findById('global');
    return res.json(toSettingsDto(doc));
  } catch (error) {
    console.error('[admin:settings:get]', error);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings', requirePermission('settings.manage'), async (req, res) => {
  try {
    const b = req.body ?? {};
    await settingsRepo.upsert({
      id: 'global',
      aiProvider: b.aiProvider,
      sttProvider: b.sttProvider,
      sarvamModel: b.sarvam?.model,
      openaiModel: b.openai?.model,
      whisperModel: b.whisper?.model,
      defaultLanguage: b.defaultLanguage,
      autoSave: b.reportSettings?.autoSave,
      includeSignature: b.reportSettings?.includeSignature,
      letterhead: b.reportSettings?.letterhead,
      sessionTimeoutMin: b.security?.sessionTimeoutMin,
      enforce2fa: b.security?.enforce2fa,
      autoBackup: b.backup?.autoBackup,
      backupFrequency: b.backup?.frequency,
    } as any);
    const doc = await settingsRepo.findById('global');
    return res.json(toSettingsDto(doc));
  } catch (error) {
    console.error('[admin:settings:put]', error);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Trigger a (logical) backup — records the timestamp. Real off-site backup is
// a deployment concern; this marks intent and surfaces "last backup" in the UI.
router.post('/backup', requirePermission('settings.manage'), async (_req, res) => {
  try {
    const now = new Date().toISOString();
    await settingsRepo.upsert({ id: 'global', lastBackupAt: now } as any);
    return res.json({ success: true, lastBackupAt: now });
  } catch (error) {
    console.error('[admin:backup]', error);
    return res.status(500).json({ error: 'Backup failed' });
  }
});

// ── Notifications ────────────────────────────────────────────
router.get('/notifications', requirePermission('notifications.view'), async (_req, res) => {
  try {
    return res.json(await notificationsRepo.findAll());
  } catch (error) {
    console.error('[admin:notifications]', error);
    return res.json([]);
  }
});

router.post('/notifications/:id/read', requirePermission('notifications.view'), async (req, res) => {
  try {
    await notificationsRepo.upsert({ id: req.params.id, read: true } as any);
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:notification:read]', error);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
});

router.post('/notifications/read-all', requirePermission('notifications.view'), async (_req, res) => {
  try {
    const all = await notificationsRepo.findAll();
    await Promise.all(all.map((n: any) => notificationsRepo.upsert({ id: n.id, read: true } as any)));
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:notifications:read-all]', error);
    return res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// ── Global Search ────────────────────────────────────────────
// A small static reference set for coding lookups (ICD / LOINC / RxNorm). In a
// full deployment these would be backed by a terminology service; here they let
// the global search surface clinical codes alongside live records.
const REFERENCE: SearchResult[] = [
  { id: 'J06.9', entity: 'icd', title: 'J06.9', subtitle: 'Acute upper respiratory infection, unspecified' },
  { id: 'E11.9', entity: 'icd', title: 'E11.9', subtitle: 'Type 2 diabetes mellitus without complications' },
  { id: 'I10', entity: 'icd', title: 'I10', subtitle: 'Essential (primary) hypertension' },
  { id: 'J45.909', entity: 'icd', title: 'J45.909', subtitle: 'Unspecified asthma, uncomplicated' },
  { id: '2345-7', entity: 'loinc', title: '2345-7', subtitle: 'Glucose [Mass/volume] in Serum or Plasma' },
  { id: '4548-4', entity: 'loinc', title: '4548-4', subtitle: 'Hemoglobin A1c/Hemoglobin.total in Blood' },
  { id: '2093-3', entity: 'loinc', title: '2093-3', subtitle: 'Cholesterol [Mass/volume] in Serum or Plasma' },
  { id: '860975', entity: 'rxnorm', title: 'Metformin 500 mg', subtitle: 'RxNorm 860975' },
  { id: '197361', entity: 'rxnorm', title: 'Amlodipine 5 mg', subtitle: 'RxNorm 197361' },
  { id: '1049502', entity: 'rxnorm', title: 'Paracetamol 500 mg', subtitle: 'RxNorm 1049502' },
];

router.get('/search', requirePermission('dashboard.view'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ query: q, results: [] });
    const ql = q.toLowerCase();
    const like = (s: string) => (s || '').toLowerCase().includes(ql);

    const [patients, doctors, reports] = await Promise.all([
      listClinicPatientsAdmin(currentClinicId()), // ClinicBook (shared source)
      listClinicDoctorsAdmin(currentClinicId()),
      reportsRepo.findAll(),
    ]);

    const results: SearchResult[] = [];
    for (const p of patients) {
      if (like(p.name) || like(p.phone || '')) {
        results.push({ id: p.id, entity: 'patient', title: p.name || 'Unknown', subtitle: `${p.age || '?'}y · ${p.gender || '—'}` });
      }
    }
    for (const d of doctors) {
      if (like(d.name) || like(d.email) || like(d.specialization)) {
        results.push({ id: d.id, entity: 'doctor', title: d.name || d.email, subtitle: d.specialization || 'Doctor' });
      }
    }
    for (const r of reports as any[]) {
      if (like(r.patientName) || like(r.date)) {
        results.push({ id: r.id, entity: 'report', title: r.patientName || 'Report', subtitle: r.date || '' });
      }
    }
    // Medicines from stored reports.
    const meds = new Set<string>();
    for (const r of reports as any[]) for (const m of r.report?.prescribedMedications || []) {
      if (m?.medicine && like(m.medicine)) meds.add(m.medicine);
    }
    for (const m of meds) results.push({ id: m, entity: 'medicine', title: m, subtitle: 'Medicine' });
    // Reference codes.
    for (const ref of REFERENCE) if (like(ref.title) || like(ref.subtitle)) results.push(ref);

    return res.json({ query: q, results: results.slice(0, 50) });
  } catch (error) {
    console.error('[admin:search]', error);
    return res.status(500).json({ error: 'Search failed' });
  }
});

// ── ABDM registry ─────────────────────────────────────────────────────────
//
// One screen showing what this clinic still has to register with the government
// and where each id goes. Read is `settings.view` because seeing what is missing
// is not a privileged act; writing an id is `settings.manage`.

router.get('/abdm', requirePermission('settings.view'), async (_req, res) => {
  try {
    return res.json(await getRegistryStatus(currentClinicId()));
  } catch (error: any) {
    console.error('[admin:abdm]', error);
    return res.status(500).json({ error: 'Failed to load registration status' });
  }
});

router.put('/abdm/facility', requirePermission('settings.manage'), async (req, res) => {
  try {
    return res.json(await setFacilityId(currentClinicId(), req.body?.hfrId));
  } catch (error: any) {
    console.error('[admin:abdm:facility]', error);
    return res.status(error?.statusCode || 400).json({ error: error?.message || 'Failed to save HFR id' });
  }
});

router.put('/abdm/doctors/:id', requirePermission('settings.manage'), async (req, res) => {
  try {
    return res.json(await setProfessionalId(currentClinicId(), req.params.id, req.body?.hprId));
  } catch (error: any) {
    console.error('[admin:abdm:doctor]', error);
    return res.status(error?.statusCode || 400).json({ error: error?.message || 'Failed to save HPR id' });
  }
});

export { router as adminRouter };
export default router;
