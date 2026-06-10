import { Appointment, Doctor, Patient, ReminderLog, WaitlistPatient, ClinicConfig } from '../types';

export const INITIAL_DOCTORS: Doctor[] = [
  { id: '1', name: 'Dr. Sarah Jenkins', specialty: 'Dermatologist', email: 's.jenkins@pearlclinic.com', phone: '+1 555-0192' },
  { id: '2', name: 'Dr. Amit Patel', specialty: 'General Physician', email: 'a.patel@pearlclinic.com', phone: '+1 555-0143' },
  { id: '3', name: 'Dr. Clara Oswald', specialty: 'Pediatrician', email: 'c.oswald@pearlclinic.com', phone: '+1 555-0187' },
  { id: '4', name: 'Dr. Marcus Vance', specialty: 'Orthopedic', email: 'm.vance@pearlclinic.com', phone: '+1 555-0129' }
];

export const INITIAL_PATIENTS: Patient[] = [
  { id: 'p1', name: 'Rahul Sharma', phone: '+91 98765 43210', email: 'rahul@gmail.com', preferredLanguage: 'Hindi', status: 'active' },
  { id: 'p2', name: 'Emily Bennett', phone: '+1 (555) 765-4321', email: 'emily.b@yahoo.com', preferredLanguage: 'English', status: 'active' },
  { id: 'p3', name: 'Carlos Gomez', phone: '+52 55 1234 5678', email: 'carlos.g@gmail.com', preferredLanguage: 'Spanish', status: 'active' },
  { id: 'p4', name: 'Aarav Mehta', phone: '+91 91234 56789', email: 'aarav@outlook.com', preferredLanguage: 'Hindi', status: 'active' },
  { id: 'p5', name: 'Jessica Taylor', phone: '+1 (555) 321-9876', email: 'jess.taylor@gmail.com', preferredLanguage: 'English', status: 'active' },
  { id: 'p6', name: 'Priya Patel', phone: '+91 88776 55443', email: 'priya@gmail.com', preferredLanguage: 'Hindi', status: 'active' }
];

export const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-1',
    patientName: 'Rahul Sharma',
    patientPhone: '+91 98765 43210',
    doctorName: 'Dr. Sarah Jenkins',
    date: '2026-06-10',
    time: '10:00 AM',
    status: 'Confirmed',
    language: 'Hindi'
  },
  {
    id: 'apt-2',
    patientName: 'Emily Bennett',
    patientPhone: '+1 (555) 765-4321',
    doctorName: 'Dr. Amit Patel',
    date: '2026-06-10',
    time: '11:30 AM',
    status: 'Confirmed',
    language: 'English'
  },
  {
    id: 'apt-3',
    patientName: 'Carlos Gomez',
    patientPhone: '+52 55 1234 5678',
    doctorName: 'Dr. Sarah Jenkins',
    date: '2026-06-10',
    time: '02:00 PM',
    status: 'Cancelled',
    language: 'Spanish'
  },
  {
    id: 'apt-4',
    patientName: 'Aarav Mehta',
    patientPhone: '+91 91234 56789',
    doctorName: 'Dr. Clara Oswald',
    date: '2026-06-10',
    time: '04:00 PM',
    status: 'Pending',
    language: 'Hindi'
  },
  {
    id: 'apt-5',
    patientName: 'Jessica Taylor',
    patientPhone: '+1 (555) 321-9876',
    doctorName: 'Dr. Marcus Vance',
    date: '2026-06-11',
    time: '09:30 AM',
    status: 'Confirmed',
    language: 'English'
  },
  {
    id: 'apt-6',
    patientName: 'Priya Patel',
    patientPhone: '+91 88776 55443',
    doctorName: 'Dr. Sarah Jenkins',
    date: '2026-06-11',
    time: '11:30 AM',
    status: 'Waitlist',
    language: 'Hindi'
  }
];

export const INITIAL_WAITLIST: WaitlistPatient[] = [
  {
    id: 'wl-1',
    patientName: 'Karan Malhotra',
    patientPhone: '+91 99887 76655',
    doctorName: 'Dr. Sarah Jenkins',
    preferredTimeSlot: 'Morning (9:00 AM - 12:00 PM)',
    preferredDoctor: 'Dr. Sarah Jenkins (Dermatologist)',
    language: 'Hindi',
    dateAdded: '2026-06-09',
    status: 'Waiting'
  },
  {
    id: 'wl-2',
    patientName: 'Sophia Loren',
    patientPhone: '+1 (555) 234-5678',
    doctorName: 'Dr. Marcus Vance',
    preferredTimeSlot: 'Afternoon (12:00 PM - 4:00 PM)',
    preferredDoctor: 'Dr. Marcus Vance (Orthopedic)',
    language: 'English',
    dateAdded: '2026-06-10',
    status: 'Waiting'
  },
  {
    id: 'wl-3',
    patientName: 'Rajesh Kumar',
    patientPhone: '+91 77665 44321',
    doctorName: 'Dr. Sarah Jenkins',
    preferredTimeSlot: 'Afternoon (12:00 PM - 4:00 PM)',
    preferredDoctor: 'Dr. Sarah Jenkins (Dermatologist)',
    language: 'Hindi',
    dateAdded: '2026-06-10',
    status: 'Offered'
  }
];

export const INITIAL_REMINDERS: ReminderLog[] = [
  {
    id: 'rem-1',
    patientName: 'Rahul Sharma',
    type: 'booking_confirmed',
    timestamp: 'Today, 8:15 AM',
    status: 'read'
  },
  {
    id: 'rem-2',
    patientName: 'Emily Bennett',
    type: '24h_reminder',
    timestamp: 'Yesterday, 11:30 AM',
    status: 'read'
  },
  {
    id: 'rem-3',
    patientName: 'Emily Bennett',
    type: '2h_reminder',
    timestamp: 'Today, 9:30 AM',
    status: 'delivered'
  },
  {
    id: 'rem-4',
    patientName: 'Rajesh Kumar',
    type: 'slot_recovered',
    timestamp: 'Today, 10:45 AM',
    status: 'sent'
  }
];

export const DEFAULT_CLINIC_CONFIG: ClinicConfig = {
  name: 'Pearl Health Clinic',
  ownerName: 'Dr. Aris Vance',
  email: 'contact@pearlclinic.com',
  phone: '+1 (555) 890-4321',
  country: 'United States',
  clinicType: 'Multi-Specialty Care',
  preferredLanguage: 'English',
  whatsappNumber: '+1 555-890-BOOK',
  workingHours: {
    start: '09:00',
    end: '18:00',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  },
  reminderSettings: {
    send24h: true,
    send2h: true,
    autoWaitlist: true
  },
  supportedLanguages: ['English', 'Hindi', 'Spanish']
};
