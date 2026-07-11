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
import { hashPassword, sanitizeUser, newId } from '../services/auth.js';
import { requirePermission } from '../middleware/auth.js';
import type { AdminSettings, SearchResult } from '../contracts/index.js';

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
    const q = String(req.query.search || '').trim();
    let doctors = (await usersRepo.findBy({ role: 'doctor' }, { createdAt: -1 })).map((d) =>
      sanitizeUser(d as any),
    );
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

router.post('/doctors', requirePermission('doctors.manage'), async (req, res) => {
  try {
    const { name, email, password, specialization, licenseNumber, hospital, experience, phone } = req.body ?? {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    const normalized = String(email).toLowerCase().trim();
    if ((await usersRepo.findBy({ email: normalized })).length) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    const doctor = {
      id: newId('usr'),
      name: name || normalized.split('@')[0],
      email: normalized,
      passwordHash: password ? await hashPassword(String(password)) : '',
      role: 'doctor' as const,
      status: 'active' as const,
      hospitalId: '',
      specialization: specialization || '',
      licenseNumber: licenseNumber || '',
      hospital: hospital || '',
      experience: Number(experience) || 0,
      phone: phone || '',
    };
    await usersRepo.upsert(doctor);
    return res.json(sanitizeUser(doctor));
  } catch (error) {
    console.error('[admin:doctor:create]', error);
    return res.status(500).json({ error: 'Failed to create doctor' });
  }
});

router.put('/doctors/:id', requirePermission('doctors.manage'), async (req, res) => {
  try {
    const record = await usersRepo.findById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Doctor not found' });
    const allowed = ['name', 'specialization', 'licenseNumber', 'hospital', 'experience', 'phone', 'email'];
    const patch: Record<string, unknown> = { id: req.params.id };
    for (const key of allowed) if (key in (req.body ?? {})) patch[key] = req.body[key];
    if (typeof patch.experience !== 'undefined') patch.experience = Number(patch.experience) || 0;
    if (req.body?.password) patch.passwordHash = await hashPassword(String(req.body.password));
    await usersRepo.upsert(patch as any);
    const updated = await usersRepo.findById(req.params.id);
    return res.json(sanitizeUser(updated as any));
  } catch (error) {
    console.error('[admin:doctor:update]', error);
    return res.status(500).json({ error: 'Failed to update doctor' });
  }
});

router.delete('/doctors/:id', requirePermission('doctors.manage'), async (req, res) => {
  try {
    const ok = await usersRepo.remove(req.params.id);
    return res.json({ success: ok });
  } catch (error) {
    console.error('[admin:doctor:delete]', error);
    return res.status(500).json({ error: 'Failed to delete doctor' });
  }
});

router.post('/doctors/:id/suspend', requirePermission('doctors.manage'), async (req, res) => {
  try {
    await usersRepo.upsert({ id: req.params.id, status: 'suspended' } as any);
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:doctor:suspend]', error);
    return res.status(500).json({ error: 'Failed to suspend doctor' });
  }
});

router.post('/doctors/:id/activate', requirePermission('doctors.manage'), async (req, res) => {
  try {
    await usersRepo.upsert({ id: req.params.id, status: 'active' } as any);
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:doctor:activate]', error);
    return res.status(500).json({ error: 'Failed to activate doctor' });
  }
});

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
    const normalized = String(email).toLowerCase().trim();
    if ((await usersRepo.findBy({ email: normalized })).length) {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    const user = {
      id: newId('usr'),
      name: name || normalized.split('@')[0],
      email: normalized,
      passwordHash: password ? await hashPassword(String(password)) : '',
      role,
      status: 'active' as const,
      hospitalId: '',
    };
    await usersRepo.upsert(user);
    return res.json(sanitizeUser(user));
  } catch (error) {
    console.error('[admin:user:create]', error);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id/role', requirePermission('users.manage'), async (req, res) => {
  try {
    const { role } = req.body ?? {};
    if (!role) return res.status(400).json({ error: 'role is required' });
    await usersRepo.upsert({ id: req.params.id, role } as any);
    return res.json({ success: true });
  } catch (error) {
    console.error('[admin:user:role]', error);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// ── Patient Management ───────────────────────────────────────
router.get('/patients', requirePermission('patients.view'), async (req, res) => {
  try {
    const q = String(req.query.search || '').trim();
    let patients = await patientsRepo.findAll();
    if (q) patients = patients.filter((p: any) => matchSearch(p.name || '', q) || matchSearch(p.phone || '', q));
    return res.json(patients);
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
    sarvam: { model: d.sarvamModel || 'sarvam-30b', apiConfigured: !!(process.env.SARVAM_API_KEY || '').trim() },
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
      patientsRepo.findAll(),
      usersRepo.findBy({ role: 'doctor' }),
      reportsRepo.findAll(),
    ]);

    const results: SearchResult[] = [];
    for (const p of patients as any[]) {
      if (like(p.name) || like(p.phone)) {
        results.push({ id: p.id, entity: 'patient', title: p.name || 'Unknown', subtitle: `${p.age || '?'}y · ${p.gender || '—'}` });
      }
    }
    for (const d of doctors as any[]) {
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

export { router as adminRouter };
export default router;
