import { ClinicConfig } from '../types';

// Neutral product defaults for the unauthenticated shell (nav product name and
// the empty config skeleton shown before a clinic signs in). NOT demo/seed data
// and NOT a fake clinic identity — every real value (name, email, phone, plan,
// country) is loaded from the backend once the clinic admin logs in.
export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  name: 'NextDot Clinic AI',
  ownerName: '',
  email: '',
  phone: '',
  country: 'India',
  clinicType: '',
  preferredLanguage: 'English',
  whatsappNumber: '',
  plan: 'STARTER',
  workingHours: {
    start: '09:00',
    end: '18:00',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  },
  reminderSettings: {
    send24h: true,
    send2h: true,
    autoWaitlist: true
  },
  supportedLanguages: ['English', 'Hindi']
};
