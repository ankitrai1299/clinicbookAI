export type PageType = 'hub' | 'landing' | 'dashboard' | 'novascribe' | 'novascribe-landing' | 'demo' | 'signup' | 'login' | 'verify-email' | 'welcome';

export type DashboardTab = 'overview' | 'appointments' | 'calendar' | 'waitlist' | 'patients' | 'settings' | 'billing';

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email?: string;
  phone?: string;
}

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  preferredLanguage: string;
  status: 'active' | 'inactive';
  age?: number | null;
  gender?: string | null;
  healthConcern?: string | null;
  source?: string | null;
}

export interface Appointment {
  id: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  date: string;
  time: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled' | 'Completed' | 'Waitlist';
  language: string;
  completedAt?: string | null;
}

export interface WaitlistPatient {
  id: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  preferredTimeSlot: string; // e.g. "Morning", "Evening"
  preferredDoctor: string;
  language: string;
  dateAdded: string;
  status: 'Waiting' | 'Offered' | 'Responded';
}

export interface ReminderLog {
  id: string;
  patientName: string;
  type: '24h_reminder' | '2h_reminder' | 'booking_confirmed' | 'slot_recovered';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface ClinicConfig {
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  country: string;
  clinicType: string;
  preferredLanguage: string;
  whatsappNumber: string;
  plan: string;
  workingHours: {
    start: string;
    end: string;
    days: string[];
  };
  reminderSettings: {
    send24h: boolean;
    send2h: boolean;
    autoWaitlist: boolean;
  };
  supportedLanguages: string[];
}
