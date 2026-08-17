// The permission matrix. PURE — no imports, no express, no database — so the
// rules can be unit-tested on their own and read by anyone in one sitting.
//
// Backward compatibility, stated plainly because it drove the shape of this
// table: `signupUser` never sets a role and `User.role` defaults to CLINIC_ADMIN,
// so EVERY user this system has ever created is a CLINIC_ADMIN. Giving
// hospital_admin the full clinic-level set therefore changes nothing for anyone
// logged in today — turning enforcement on is a no-op for existing accounts, and
// the matrix only starts biting once a clinic actually creates a receptionist or
// a doctor. That is the whole reason it is safe to enforce by default.

export const PERMISSIONS = [
  // Patients
  'patient.read',
  'patient.create',
  'patient.update',
  'patient.delete',
  // Pulling one patient's ENTIRE record into a single file, for a DPDP access
  // request. Separate from patient.read on purpose: looking someone up to book
  // them is not the same act as exporting every consultation, message and
  // recording reference they have.
  'patient.export',

  // Appointments
  'appointment.read',
  'appointment.create',
  'appointment.update',
  'appointment.cancel',

  // Consultations (the scribe's clinical session)
  'consultation.read',
  'consultation.write',

  // Prescriptions. `approve` and `send` are deliberately separate from `create`:
  // drafting is what the AI assists with, approving is what only a doctor does.
  'prescription.read',
  'prescription.create',
  'prescription.update',
  'prescription.approve',
  'prescription.send',

  // Consultation audio
  'recording.read',
  'recording.delete',

  // Generated documents (report / prescription PDF)
  'document.read',
  'document.download',

  // Doctors as a resource
  'doctor.read',
  'doctor.manage',

  // Administration
  'clinic.settings.manage',
  'users.manage',
  'apikey.manage',
  'whatsapp.manage',
  'audit.read'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

type Role = 'superadmin' | 'hospital_admin' | 'doctor' | 'receptionist';

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Who may do what.
 *
 * The two lines worth arguing about:
 *
 *  • A RECEPTIONIST cannot delete a patient, cannot open a consultation
 *    recording, cannot approve or send a prescription, and cannot read the audit
 *    log. Front-desk work is booking and patient contact details; the clinical
 *    record is not front-desk work.
 *
 *  • A DOCTOR cannot manage users, clinic settings, API keys or the WhatsApp
 *    channel, and cannot delete a patient. They own the clinical record, not the
 *    tenant.
 *
 * `prescription.approve` and `prescription.send` belong to the doctor and to the
 * clinic owner ONLY. No non-human actor holds them: there is no 'ai' role in this
 * table, which is the structural reason an AI cannot approve a prescription.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Platform operator (ClinicBook ADMIN). Nothing is created with this role by
  // the application itself.
  superadmin: ALL,

  // The clinic owner — today's default role for every account. Full clinic scope.
  hospital_admin: ALL,

  doctor: [
    'patient.read',
    'appointment.read',
    // A doctor books the follow-up their own note describes.
    'appointment.create',
    'consultation.read',
    'consultation.write',
    'prescription.read',
    'prescription.create',
    'prescription.update',
    'prescription.approve',
    'prescription.send',
    'recording.read',
    'document.read',
    'document.download',
    'doctor.read'
  ],

  receptionist: [
    'patient.read',
    'patient.create',
    'patient.update',
    'appointment.read',
    'appointment.create',
    'appointment.update',
    'appointment.cancel',
    'doctor.read',
    'document.read'
  ]
};

/** Pure check. An unknown/absent role has no permissions — fail closed. */
export const hasPermission = (role: string | null | undefined, permission: Permission): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role as Role]?.includes(permission) ?? false;
};
