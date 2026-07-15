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

export const ROLES = ['superadmin', 'hospital_admin', 'doctor', 'receptionist'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super Admin',
  hospital_admin: 'Hospital Admin',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
};

/**
 * Fine-grained permissions. Every protected admin action maps to one of these.
 * Both the backend route guards and the client UI gating read the SAME matrix,
 * so a feature hidden on the client is also refused by the server.
 */
export const PERMISSIONS = [
  'dashboard.view',
  'analytics.view',
  'doctors.view',
  'doctors.manage', // add / edit / delete / suspend / activate
  'patients.view',
  'patients.manage',
  'consultations.view',
  'consultations.manage', // retry / delete
  'reports.view',
  'reports.manage',
  'settings.view',
  'settings.manage',
  'users.manage', // create admins / assign roles
  'notifications.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ALL,
  hospital_admin: [
    'dashboard.view',
    'analytics.view',
    'doctors.view',
    'doctors.manage',
    'patients.view',
    'patients.manage',
    'consultations.view',
    'consultations.manage',
    'reports.view',
    'reports.manage',
    'settings.view',
    'settings.manage',
    'users.manage',
    'notifications.view',
  ],
  doctor: [
    'dashboard.view',
    'patients.view',
    'consultations.view',
    'consultations.manage',
    'reports.view',
    'reports.manage',
    'settings.view',
  ],
  receptionist: [
    'doctors.view',
    'patients.view',
    'patients.manage',
  ],
};

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
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
