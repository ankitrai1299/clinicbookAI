/**
 * Shared API contract for the NovaScribe Admin Dashboard.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the admin roles, permission
 * matrix and the request/response shapes exchanged between the backend and
 * BOTH clients (mediscribe-web and mediscribe-app). A verbatim copy is kept in
 * each client (`src/contracts.ts`). When you change a role, permission or DTO
 * here, mirror the change into both clients so Web and Mobile stay in lockstep.
 *
 * Keep this file free of any server/runtime imports so it copies cleanly.
 */

// ─────────────────────────────────────────────────────────────
// Roles & Permissions (RBAC)
// ─────────────────────────────────────────────────────────────

// Canonical role identifiers. These exact strings live in the JWT + DB and are
// what every access check compares against (e.g. role === 'super_admin').
export const ROLES = ['super_admin', 'admin', 'doctor', 'staff'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Clinic Admin',
  doctor: 'Doctor',
  staff: 'Staff',
};

// Human title of each role's home dashboard (used in headers / redirects).
export const ROLE_DASHBOARD_TITLES: Record<Role, string> = {
  super_admin: 'Super Admin Dashboard',
  admin: 'Admin Dashboard',
  doctor: 'Doctor Dashboard',
  staff: 'Staff Dashboard',
};

// Legacy → canonical role remap. Older records/tokens used these names; the
// backend migrates them on boot and this map lets clients tolerate a stale JWT.
export const LEGACY_ROLE_MAP: Record<string, Role> = {
  superadmin: 'super_admin',
  hospital_admin: 'admin',
  receptionist: 'staff',
  super_admin: 'super_admin',
  admin: 'admin',
  doctor: 'doctor',
  staff: 'staff',
};

export function normalizeRole(role: string | undefined): Role {
  if (!role) return 'staff';
  return LEGACY_ROLE_MAP[role] ?? 'staff';
}

/** Roles allowed into the Admin Dashboard area at all (menu + every route). */
export const ADMIN_ROLES: Role[] = ['super_admin', 'admin'];

export function isAdminRole(role: Role | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

/**
 * Fine-grained permissions. Every protected admin action maps to one of these.
 * Both the backend route guards and the client UI gating read the SAME matrix,
 * so a feature hidden on the client is also refused by the server. `admin.access`
 * is the master gate for the whole /api/admin surface.
 */
export const PERMISSIONS = [
  'admin.access', // legacy master gate — retained for compatibility
  'dashboard.view',
  'analytics.view',
  'organizations.view',
  'organizations.manage',
  'clinics.view',
  'clinics.manage',
  'billing.view',
  'doctors.view',
  'doctors.manage', // add / edit / delete / suspend / activate
  'staff.view',
  'staff.manage',
  'patients.view',
  'patients.manage',
  'consultations.view',
  'consultations.manage', // retry / delete
  'transcripts.view',
  'reports.view',
  'reports.manage',
  'prescriptions.view',
  'prescriptions.manage',
  'appointments.view',
  'appointments.manage',
  'settings.view',
  'settings.manage',
  'users.manage', // create admins / assign roles
  'notifications.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

// Each role holds exactly the permissions its dashboard menu needs (see
// ROLE_MENUS below). The backend enforces THIS matrix on every route; the
// clients gate the SAME matrix for UI. Keep the two in lockstep.
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Platform owner — organizations, clinics, doctors, analytics, billing, system.
  super_admin: ALL,
  // Clinic Admin — doctors, staff, patients, sessions, reports, analytics.
  admin: [
    'admin.access',
    'dashboard.view',
    'analytics.view',
    'doctors.view',
    'doctors.manage',
    'staff.view',
    'staff.manage',
    'patients.view',
    'patients.manage',
    'consultations.view',
    'consultations.manage',
    'reports.view',
    'reports.manage',
    'appointments.view',
    'appointments.manage',
    'notifications.view',
  ],
  // Doctor — patients, sessions, transcripts, AI reports, prescriptions.
  doctor: [
    'dashboard.view',
    'patients.view',
    'consultations.view',
    'consultations.manage',
    'transcripts.view',
    'reports.view',
    'reports.manage',
    'prescriptions.view',
    'prescriptions.manage',
  ],
  // Staff — patients, appointments, sessions.
  staff: [
    'dashboard.view',
    'patients.view',
    'patients.manage',
    'appointments.view',
    'appointments.manage',
    'consultations.view',
  ],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ─────────────────────────────────────────────────────────────
// Role dashboards & menus
// ─────────────────────────────────────────────────────────────
// Each role gets its OWN dashboard with its OWN ordered menu. The sidebar (web)
// and navigation (mobile) render ROLE_MENUS[role] verbatim, so both platforms
// show identical items. The first item is the role's landing page.

export type MenuId =
  | 'organizations'
  | 'clinics'
  | 'billing'
  | 'system_settings'
  | 'doctors'
  | 'staff'
  | 'patients'
  | 'sessions'
  | 'reports'
  | 'ai_reports'
  | 'transcripts'
  | 'prescriptions'
  | 'analytics'
  | 'appointments';

// Registry: label + the permission required to see/open each item. Icons are
// chosen per-platform (lucide on web, Ionicons on mobile), keyed by MenuId.
export const MENU_ITEMS: Record<MenuId, { label: string; permission: Permission }> = {
  organizations: { label: 'Organizations', permission: 'organizations.view' },
  clinics: { label: 'Clinics', permission: 'clinics.view' },
  billing: { label: 'Billing', permission: 'billing.view' },
  system_settings: { label: 'System Settings', permission: 'settings.view' },
  doctors: { label: 'Doctors', permission: 'doctors.view' },
  staff: { label: 'Staff', permission: 'staff.view' },
  patients: { label: 'Patients', permission: 'patients.view' },
  sessions: { label: 'Sessions', permission: 'consultations.view' },
  reports: { label: 'Reports', permission: 'reports.view' },
  ai_reports: { label: 'AI Reports', permission: 'reports.view' },
  transcripts: { label: 'Transcripts', permission: 'transcripts.view' },
  prescriptions: { label: 'Prescriptions', permission: 'prescriptions.view' },
  analytics: { label: 'Analytics', permission: 'analytics.view' },
  appointments: { label: 'Appointments', permission: 'appointments.view' },
};

// The four role dashboards, exactly as specified.
export const ROLE_MENUS: Record<Role, MenuId[]> = {
  super_admin: ['organizations', 'doctors', 'clinics', 'analytics', 'billing', 'system_settings'],
  admin: ['doctors', 'staff', 'patients', 'sessions', 'reports', 'analytics'],
  doctor: ['patients', 'sessions', 'transcripts', 'ai_reports', 'prescriptions'],
  staff: ['patients', 'appointments', 'sessions'],
};

/** The ordered menu for a role (empty when unknown). */
export function menuFor(role: Role | undefined): MenuId[] {
  return role ? ROLE_MENUS[role] ?? [] : [];
}

/** The landing menu item a role is redirected to after login. */
export function roleLanding(role: Role | undefined): MenuId | null {
  return menuFor(role)[0] ?? null;
}

/** True when `role`'s dashboard includes the given menu item. */
export function canSeeMenu(role: Role | undefined, id: MenuId): boolean {
  return menuFor(role).includes(id);
}

/** The permission the backend requires for a menu item's data. */
export function menuPermission(id: MenuId): Permission {
  return MENU_ITEMS[id].permission;
}

// ─────────────────────────────────────────────────────────────
// Auth DTOs
// ─────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended';
  hospitalId: string;
  // Doctor profile fields (present when role === 'doctor')
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
  experience?: number;
  phone?: string;
  avatarUrl?: string;
  city?: string;
  state?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  name: string;
  role?: Role;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ─────────────────────────────────────────────────────────────
// Admin Dashboard DTOs
// ─────────────────────────────────────────────────────────────

export interface AdminOverview {
  totalDoctors: number;
  activeDoctors: number;
  totalPatients: number;
  totalConsultations: number;
  todayConsultations: number;
  monthlyConsultations: number;
  reportsGenerated: number;
  draftReports: number;
  totalRevenue: number; // future ready — 0 until billing exists
  activeUsers: number;
  sttRequests: number;
  aiReportRequests: number;
  storageUsedBytes: number;
}

export interface TimeSeriesPoint {
  label: string; // e.g. "Mon", "Jul 10", "2026-07"
  value: number;
}

export interface NamedCount {
  name: string;
  value: number;
}

export interface AdminAnalytics {
  dailyConsultations: TimeSeriesPoint[]; // last 14 days
  weeklyUsage: TimeSeriesPoint[]; // last 8 weeks
  monthlyAnalytics: TimeSeriesPoint[]; // last 6 months
  languageUsage: NamedCount[];
  aiReportUsage: TimeSeriesPoint[];
  sttAccuracy: TimeSeriesPoint[]; // avg confidence %, empty when no ground truth
  doctorActivity: NamedCount[];
  patientGrowth: TimeSeriesPoint[]; // cumulative
  consultationCount: number;
  averageConsultationDurationMin: number;
  mostUsedMedicines: NamedCount[];
  mostUsedDiagnoses: NamedCount[];
  mostUsedIcdCodes: NamedCount[];
  mostUsedLoincTests: NamedCount[];
}

/** Per-language usage row for the Language Dashboard. */
export interface LanguageUsageRow {
  code: string;
  name: string;
  consultations: number;
  sttRequests: number;
  reports: number;
  percentage: number;
}

// The ten supported languages, in display order (shared by both clients).
export const SUPPORTED_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'or', name: 'Odia' },
];

// ─────────────────────────────────────────────────────────────
// Settings DTO
// ─────────────────────────────────────────────────────────────

export interface AdminSettings {
  aiProvider: 'sarvam' | 'openai';
  sttProvider: 'sarvam' | 'whisper';
  sarvam: { model: string; apiConfigured: boolean };
  openai: { model: string; apiConfigured: boolean }; // future ready
  whisper: { model: string; apiConfigured: boolean };
  defaultLanguage: string;
  reportSettings: { autoSave: boolean; includeSignature: boolean; letterhead: string };
  security: { sessionTimeoutMin: number; enforce2fa: boolean };
  backup: { autoBackup: boolean; frequency: 'daily' | 'weekly' | 'monthly'; lastBackupAt: string };
}

// ─────────────────────────────────────────────────────────────
// Notifications & Search
// ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'failed_stt'
  | 'failed_report'
  | 'doctor_login'
  | 'new_consultation'
  | 'new_patient';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export type SearchEntity =
  | 'patient'
  | 'doctor'
  | 'report'
  | 'medicine'
  | 'icd'
  | 'loinc'
  | 'rxnorm';

export interface SearchResult {
  id: string;
  entity: SearchEntity;
  title: string;
  subtitle: string;
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResult[];
}

// Consultation lifecycle buckets used by Consultation Management.
export type ConsultationBucket =
  | 'live'
  | 'previous'
  | 'draft'
  | 'failed';

// ─────────────────────────────────────────────────────────────
// Role-module DTOs (Organizations / Clinics / Billing / Appointments)
// ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  contactEmail: string;
  phone: string;
  createdAt?: string;
}

export interface Clinic {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended';
  createdAt?: string;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  reason: string;
  notes: string;
  createdAt?: string;
}

export interface BillingSummary {
  totalRevenue: number;
  mrr: number;
  currency: string;
  activeSubscriptions: number;
  plans: { plan: string; count: number }[];
  invoices: { id: string; amount: number; status: string; date: string }[];
}
