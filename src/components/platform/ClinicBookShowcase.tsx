import {
  CalendarCheck, Clock, Bell, ShieldCheck, CalendarClock, LayoutGrid, Zap,
  BellRing, RefreshCcw, HeartPulse, FileText, History, Pill, Stethoscope,
} from 'lucide-react';
import { type ShowcasePanelProps } from './ShowcasePanel';
import ShowcaseCarousel from './ShowcaseCarousel';

// The patient-facing story, told as four panels — booking, live availability,
// reminders, and the patient's own health journey. Each shows the REAL WhatsApp
// flow the bot runs, so the marketing can't drift from the product.
//
// Patient photography lives in public/images — one distinct face per panel so the
// page never repeats a person. Served from the app itself (no external host, no
// env var), so the images can't disappear on us.
const PHOTOS = ['/images/patient-1.jpg', '/images/patient-3.jpg', '/images/patient-4.jpg', '/images/patient-5.jpg'];

const PANELS: ShowcasePanelProps[] = [
  {
    tone: 'green',
    eyebrow: 'Booking',
    title: 'Book appointments on',
    accent: 'WhatsApp',
    titleTail: 'in a few taps',
    subtitle: 'Simple, fast and secure — no app to install, no form to fill, no call to make.',
    clinicName: 'CarePlus Clinic',
    photoAlt: 'A patient booking an appointment on WhatsApp',
    features: [
      { icon: CalendarCheck, title: 'Check availability', desc: 'Real-time doctor slots' },
      { icon: Clock, title: 'Book in seconds', desc: 'Confirmed in a few taps' },
      { icon: Bell, title: 'Smart reminders', desc: 'Never miss an appointment' },
      { icon: ShieldCheck, title: 'Private by default', desc: 'Data stays with your clinic' },
    ],
    chat: [
      { from: 'in', text: 'Hello! 👋 Welcome to CarePlus Clinic.\nHow can we help you today?', time: '10:30 AM' },
      { from: 'out', text: 'I want to book an appointment', time: '10:30 AM' },
      { from: 'in', text: 'Sure! Please choose an option 👇', menu: ['Book Appointment', 'Reschedule', 'Cancel', 'Clinic Information'], time: '10:30 AM' },
      { from: 'out', text: 'Book Appointment', time: '10:31 AM' },
      { from: 'in', text: 'Please select the type of consultation', menu: ['In-clinic Visit', 'Online Consultation'], time: '10:31 AM' },
    ],
  },
  {
    tone: 'blue',
    eyebrow: 'Availability',
    title: 'Real-time availability,',
    accent: 'right on WhatsApp',
    subtitle: 'Choose the doctor, the day and the time — instantly, from live schedules.',
    clinicName: 'CarePlus Clinic',
    reverse: true,
    features: [
      { icon: CalendarClock, title: 'Live doctor schedules', desc: 'Always up to date' },
      { icon: LayoutGrid, title: 'Multiple time slots', desc: 'Pick what suits you best' },
      { icon: Zap, title: 'Instant confirmation', desc: 'No calls, no waiting' },
    ],
    chat: [
      { from: 'in', text: 'Please choose a department', menu: ['General Physician', 'Dermatologist', 'Pediatrician'], time: '10:31 AM' },
      { from: 'out', text: 'General Physician', time: '10:32 AM' },
      {
        from: 'in',
        text: 'Available slots for Dr. Rohit Sharma',
        slots: [
          { label: '10:00 AM' }, { label: '10:30 AM' },
          { label: '11:00 AM', active: true }, { label: '11:30 AM' },
          { label: '04:30 PM' }, { label: '05:00 PM' },
        ],
        time: '10:32 AM',
      },
      { from: 'out', text: '11:00 AM', time: '10:32 AM' },
      {
        from: 'in',
        text: '✅ Your appointment is confirmed!',
        card: {
          title: 'Appointment details',
          rows: [['Doctor', 'Dr. Rohit Sharma'], ['Department', 'General Physician'], ['Date', '15 July'], ['Time', '11:00 AM']],
          footer: 'We look forward to seeing you! 😊',
        },
        time: '10:32 AM',
      },
    ],
  },
  {
    tone: 'peach',
    eyebrow: 'Reminders',
    title: 'Smart reminders that keep',
    accent: 'everyone on track',
    subtitle: 'Timely nudges before the visit — and gentle medicine reminders after it.',
    clinicName: 'CarePlus Clinic',
    photoAlt: 'A patient receiving an appointment reminder',
    features: [
      { icon: BellRing, title: 'Appointment reminders', desc: 'Notified before every visit' },
      { icon: RefreshCcw, title: 'Reschedule with ease', desc: 'Change plans in one tap' },
      { icon: Pill, title: 'Medicine reminders', desc: 'Scheduled from the prescription' },
      { icon: HeartPulse, title: 'Fewer no-shows', desc: 'Chairs stay filled' },
    ],
    chat: [
      { from: 'in', text: '⏰ Reminder\nYou have an appointment with Dr. Rohit Sharma on 15 July at 11:00 AM.', menu: ['Confirm', 'Reschedule', 'Cancel'], time: '10:00 AM' },
      { from: 'out', text: 'Confirm', time: '10:01 AM' },
      { from: 'in', text: 'Hi Priya! 👋 This is a reminder for your appointment today at 11:00 AM with Dr. Rohit Sharma. See you soon!', time: '09:00 AM' },
      { from: 'in', text: '💊 Medicine reminder from CarePlus Clinic:\nAmoxycillin 500mg — after food', time: '09:00 PM' },
    ],
  },
  {
    tone: 'violet',
    eyebrow: 'Health journey',
    title: 'Your health journey,',
    accent: 'all in one chat',
    subtitle: 'Appointments, past visits, prescriptions and doctor’s notes — just ask for them.',
    clinicName: 'CarePlus Clinic',
    reverse: true,
    features: [
      { icon: CalendarCheck, title: 'Upcoming appointments', desc: 'See your schedule' },
      { icon: History, title: 'Visit history', desc: 'Every past consultation' },
      { icon: FileText, title: 'Prescriptions', desc: 'Delivered as a real PDF' },
      { icon: Stethoscope, title: 'Doctor’s notes', desc: 'From your consultations' },
    ],
    chat: [
      { from: 'in', text: 'Hi Priya! 👋 What would you like to do?', menu: ['My Appointments', 'Visit History', 'My Prescriptions', 'Doctor Notes'], time: '10:30 AM' },
      { from: 'out', text: 'My Prescriptions', time: '10:31 AM' },
      {
        from: 'in',
        text: '📋 Your latest prescription',
        card: {
          title: 'Dr. Rohit Sharma · 15 July',
          rows: [['Amoxycillin 500mg', 'Twice daily · 5 days'], ['Paracetamol 650mg', 'If fever · 3 days']],
          footer: 'Sending the PDF now 💙',
        },
        time: '10:31 AM',
      },
    ],
  },
];

export default function ClinicBookShowcase() {
  return (
    <section className="py-20 bg-white" id="clinicbook-showcase">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Everything a patient needs —{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              inside one chat
            </span>
          </h2>
          <p className="text-lg text-slate-600 mt-4">
            This is the actual conversation your patients have. No app, no portal, no hold music.
          </p>
        </div>

        <ShowcaseCarousel panels={PANELS.map((p, i) => ({ ...p, photo: PHOTOS[i] }))} />
      </div>
    </section>
  );
}
