import {
  consultationsRepo,
  reportsRepo,
  usageRepo,
  usersRepo,
} from '../repositories/index.js';
import type {
  AdminAnalytics,
  AdminOverview,
  LanguageUsageRow,
  NamedCount,
  TimeSeriesPoint,
} from '../contracts/index.js';
import { SUPPORTED_LANGUAGES } from '../contracts/index.js';
import { currentClinicId } from '../context.js';
import { countClinicDoctors, countClinicPatients, listClinicPatientsAdmin } from '../clinicData.js';

type Rec = Record<string, any>;

// ── Date helpers ─────────────────────────────────────────────
// Prefer the Mongo `createdAt` timestamp; fall back to the app `date` string.
function recDate(rec: Rec): Date | null {
  const raw = rec?.createdAt || rec?.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}
function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build a last-N-days time series counting records per calendar day.
function dailySeries(records: Rec[], days: number): TimeSeriesPoint[] {
  const now = startOfDay(new Date());
  const buckets: TimeSeriesPoint[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dayKey(d);
    index.set(key, buckets.length);
    buckets.push({ label: `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`, value: 0 });
  }
  for (const rec of records) {
    const d = recDate(rec);
    if (!d) continue;
    const pos = index.get(dayKey(d));
    if (pos != null) buckets[pos].value += 1;
  }
  return buckets;
}

// Last-N-weeks series (ISO week buckets, labelled by week-start date).
function weeklySeries(records: Rec[], weeks: number): TimeSeriesPoint[] {
  const now = startOfDay(new Date());
  const monday = new Date(now);
  const dow = (now.getDay() + 6) % 7; // 0 = Monday
  monday.setDate(now.getDate() - dow);
  const buckets: TimeSeriesPoint[] = [];
  const starts: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = new Date(monday);
    s.setDate(monday.getDate() - i * 7);
    starts.push(s.getTime());
    buckets.push({ label: `${MONTH_LABELS[s.getMonth()]} ${s.getDate()}`, value: 0 });
  }
  for (const rec of records) {
    const d = recDate(rec);
    if (!d) continue;
    const t = d.getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= starts[i]) {
        buckets[i].value += 1;
        break;
      }
    }
  }
  return buckets;
}

// Last-N-months series.
function monthlySeries(records: Rec[], months: number): TimeSeriesPoint[] {
  const now = new Date();
  const buckets: TimeSeriesPoint[] = [];
  const index = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    index.set(monthKey(d), buckets.length);
    buckets.push({ label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, value: 0 });
  }
  for (const rec of records) {
    const d = recDate(rec);
    if (!d) continue;
    const pos = index.get(monthKey(d));
    if (pos != null) buckets[pos].value += 1;
  }
  return buckets;
}

// Cumulative running total across the monthly buckets (patient growth).
function cumulative(series: TimeSeriesPoint[], priorTotal: number): TimeSeriesPoint[] {
  let running = priorTotal;
  return series.map((p) => {
    running += p.value;
    return { label: p.label, value: running };
  });
}

// Count top-N string occurrences into NamedCount[].
function topCounts(values: string[], limit = 8): NamedCount[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const name = (raw || '').toString().trim();
    if (!name) continue;
    map.set(name, (map.get(name) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

const LANG_NAME = new Map(SUPPORTED_LANGUAGES.map((l) => [l.code, l.name]));

// ── Public API ───────────────────────────────────────────────

export async function buildOverview(): Promise<AdminOverview> {
  // Doctors & patients are owned by ClinicBook (same Postgres + clinicId) — count
  // them there so the scribe dashboard matches ClinicBook exactly. Consultations /
  // reports / usage are the scribe's own (NovaDoc).
  const clinicId = currentClinicId();
  const [
    totalDoctors,
    totalPatients,
    totalConsultations,
    reportsGenerated,
    draftReports,
    activeUsers,
    sttRequests,
    aiReportRequests,
    consultations,
    usage,
  ] = await Promise.all([
    countClinicDoctors(clinicId),
    countClinicPatients(clinicId),
    consultationsRepo.count(),
    reportsRepo.count(),
    reportsRepo.countBy({ status: 'Draft' }),
    usersRepo.countBy({ status: 'active' }),
    usageRepo.countBy({ type: 'stt' }),
    usageRepo.countBy({ type: 'ai_report' }),
    consultationsRepo.findAll(),
    usageRepo.findAll(),
  ]);

  const today = dayKey(startOfDay(new Date()));
  const thisMonth = monthKey(new Date());
  let todayConsultations = 0;
  let monthlyConsultations = 0;
  for (const c of consultations) {
    const d = recDate(c);
    if (!d) continue;
    if (dayKey(d) === today) todayConsultations += 1;
    if (monthKey(d) === thisMonth) monthlyConsultations += 1;
  }

  const storageUsedBytes = usage.reduce((sum, u: Rec) => sum + (Number(u.bytes) || 0), 0);

  return {
    totalDoctors,
    activeDoctors: totalDoctors, // ClinicBook doctors are bookable resources — all active
    totalPatients,
    totalConsultations,
    todayConsultations,
    monthlyConsultations,
    reportsGenerated,
    draftReports,
    totalRevenue: 0, // future ready — no billing yet
    activeUsers,
    sttRequests,
    aiReportRequests,
    storageUsedBytes,
  };
}

export async function buildAnalytics(): Promise<AdminAnalytics> {
  const [consultations, reports, patients, usage] = await Promise.all([
    consultationsRepo.findAll(),
    reportsRepo.findAll(),
    listClinicPatientsAdmin(currentClinicId()), // patient growth from ClinicBook (shared source)
    usageRepo.findAll(),
  ]);

  const sttEvents = usage.filter((u: Rec) => u.type === 'stt');
  const aiEvents = usage.filter((u: Rec) => u.type === 'ai_report');

  // Language usage: prefer consultation.language, fall back to usage events.
  const langValues = [
    ...consultations.map((c: Rec) => c.language),
    ...(consultations.every((c: Rec) => !c.language) ? sttEvents.map((e: Rec) => e.language) : []),
  ].filter(Boolean);
  const languageUsage = topCounts(
    langValues.map((code: string) => LANG_NAME.get(code) || code),
    10,
  );

  // STT accuracy over time — only where a real confidence exists.
  const graded = sttEvents.filter((e: Rec) => Number(e.sttConfidence) >= 0);
  const sttAccuracy = buildDailyAverage(graded, 14, (e) => Number(e.sttConfidence) * 100);

  // Average consultation duration (minutes) from records that recorded one.
  const durations = consultations
    .map((c: Rec) => Number(c.durationMs) || 0)
    .filter((ms: number) => ms > 0);
  const averageConsultationDurationMin = durations.length
    ? Math.round((durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60000) * 10) / 10
    : 0;

  // Leaderboards drawn from embedded report data.
  const meds: string[] = [];
  const diagnoses: string[] = [];
  const icd: string[] = [];
  const loinc: string[] = [];
  for (const r of reports as Rec[]) {
    const rep = r.report || {};
    for (const m of rep.prescribedMedications || []) meds.push(m?.medicine || '');
    for (const a of rep.assessment || []) diagnoses.push(typeof a === 'string' ? a : a?.diagnosis || '');
    for (const code of r.icdCodes || []) icd.push(code);
    for (const code of r.loincCodes || []) loinc.push(code);
    for (const g of rep.ordersDiagnostics || []) for (const f of g?.findings || []) loinc.push(f);
  }

  const priorPatients = patients.length - monthlySeries(patients, 6).reduce((a, b) => a + b.value, 0);

  return {
    dailyConsultations: dailySeries(consultations, 14),
    weeklyUsage: weeklySeries(consultations, 8),
    monthlyAnalytics: monthlySeries(consultations, 6),
    languageUsage,
    aiReportUsage: dailySeries(aiEvents.length ? aiEvents : reports, 14),
    sttAccuracy,
    doctorActivity: topCounts(
      consultations.map((c: Rec) => c.doctorName || '').filter(Boolean),
      8,
    ),
    patientGrowth: cumulative(monthlySeries(patients, 6), Math.max(0, priorPatients)),
    consultationCount: consultations.length,
    averageConsultationDurationMin,
    mostUsedMedicines: topCounts(meds),
    mostUsedDiagnoses: topCounts(diagnoses),
    mostUsedIcdCodes: topCounts(icd),
    mostUsedLoincTests: topCounts(loinc),
  };
}

// Daily average of a numeric metric (used for STT confidence).
function buildDailyAverage(records: Rec[], days: number, valueOf: (r: Rec) => number): TimeSeriesPoint[] {
  const base = dailySeries(records, days).map((p) => ({ ...p, value: 0 }));
  const sums = new Array(base.length).fill(0);
  const counts = new Array(base.length).fill(0);
  const now = startOfDay(new Date());
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    index.set(dayKey(d), days - 1 - i);
  }
  for (const rec of records) {
    const d = recDate(rec);
    if (!d) continue;
    const pos = index.get(dayKey(d));
    if (pos == null) continue;
    sums[pos] += valueOf(rec);
    counts[pos] += 1;
  }
  return base.map((p, i) => ({ label: p.label, value: counts[i] ? Math.round(sums[i] / counts[i]) : 0 }));
}

export async function buildLanguageDashboard(): Promise<LanguageUsageRow[]> {
  const [consultations, reports, usage] = await Promise.all([
    consultationsRepo.findAll(),
    reportsRepo.findAll(),
    usageRepo.findAll(),
  ]);

  const countBy = (records: Rec[], code: string) => records.filter((r) => r.language === code).length;
  const reportLang = new Map<string, string>();
  for (const c of consultations as Rec[]) reportLang.set(c.id, c.language);

  const rows = SUPPORTED_LANGUAGES.map((l) => ({
    code: l.code,
    name: l.name,
    consultations: countBy(consultations, l.code),
    sttRequests: usage.filter((u: Rec) => u.type === 'stt' && u.language === l.code).length,
    reports: (reports as Rec[]).filter((r) => reportLang.get(r.consultationId) === l.code).length,
    percentage: 0,
  }));

  const total = rows.reduce((sum, r) => sum + r.consultations, 0) || 1;
  for (const r of rows) r.percentage = Math.round((r.consultations / total) * 1000) / 10;
  return rows;
}
