import { Mic, FileText, ShieldAlert, Send, CalendarClock, Users, Clock, Pill } from 'lucide-react';
import ShowcasePanel, { type ShowcasePanelProps } from './ShowcasePanel';

// The doctor-facing story. Same panel component as the patient showcase, but the
// mockup shows what the DOCTOR sends the patient after a visit — so a doctor
// reading this sees exactly where their work ends up.
//
// PHOTO SLOT (optional): VITE_LANDING_DOCTOR_PHOTO — a photograph of a doctor
// with a phone/tablet. The panels look finished without one.
const PHOTO = (import.meta.env.VITE_LANDING_DOCTOR_PHOTO as string | undefined) || undefined;

const PANELS: ShowcasePanelProps[] = [
  {
    tone: 'blue',
    eyebrow: "Your clinic day",
    title: 'Today’s patients,',
    accent: 'one tap away',
    subtitle:
      'Every appointment booked on WhatsApp lands in your queue automatically. Tap a patient and the consultation opens, already linked to their record.',
    clinicName: 'CarePlus Clinic',
    photo: PHOTO,
    photoAlt: 'A doctor reviewing the day’s appointments',
    features: [
      { icon: CalendarClock, title: 'Today’s queue', desc: 'Bookings arrive on their own' },
      { icon: Users, title: 'Only your patients', desc: 'One doctor never sees another’s' },
      { icon: Clock, title: 'Visit context first', desc: 'Last visit, meds and follow-up at a glance' },
    ],
    chat: [
      { from: 'in', text: 'Hello! 👋 Welcome to CarePlus Clinic.\nHow can we help you today?', time: '09:12 AM' },
      { from: 'out', text: 'Dr. Rohit se milna hai kal', time: '09:12 AM' },
      {
        from: 'in',
        text: '✅ Booked!',
        card: {
          title: 'Appointment confirmed',
          rows: [['Doctor', 'Dr. Rohit Sharma'], ['Date', 'Tomorrow'], ['Time', '11:00 AM']],
          footer: 'It’s already in the doctor’s queue.',
        },
        time: '09:13 AM',
      },
    ],
  },
  {
    tone: 'green',
    eyebrow: 'The scribe',
    title: 'Just talk —',
    accent: 'the note writes itself',
    subtitle:
      'Record the consultation in Hindi, English or Hinglish. The AI writes a structured clinical note and prescription; you review and edit before anything is saved.',
    clinicName: 'CarePlus Clinic',
    reverse: true,
    features: [
      { icon: Mic, title: 'One-tap recording', desc: 'Crash-safe — audio is never lost' },
      { icon: FileText, title: 'Structured note', desc: 'Written like a clinician, fully editable' },
      { icon: ShieldAlert, title: 'Prescribing safety', desc: 'Allergy, interaction & duplicate checks' },
    ],
    chat: [
      { from: 'in', text: '📋 *Your prescription* — Dr. Rohit Sharma', time: '11:42 AM' },
      {
        from: 'in',
        text: '',
        card: {
          title: 'Medicines',
          rows: [['Amoxycillin 500mg', 'Twice daily · 5 days'], ['Paracetamol 650mg', 'If fever · 3 days']],
          footer: 'Advice: plenty of fluids, rest',
        },
        time: '11:42 AM',
      },
      { from: 'out', text: 'Thank you doctor 🙏', time: '11:43 AM' },
    ],
  },
  {
    tone: 'violet',
    eyebrow: 'After the visit',
    title: 'The prescription reaches them',
    accent: 'before they reach home',
    subtitle:
      'Finalize the note and the patient gets the real PDF on WhatsApp — plus medicine reminders scheduled straight from what you prescribed.',
    clinicName: 'CarePlus Clinic',
    features: [
      { icon: Send, title: 'PDF on WhatsApp', desc: 'The same document you print' },
      { icon: Pill, title: 'Medicine reminders', desc: 'Timed from the prescription itself' },
      { icon: FileText, title: 'Ask anytime', desc: '“Send my parchi again” just works' },
    ],
    chat: [
      { from: 'out', text: 'I misplaced my prescription, can you send it again?', time: '06:20 PM' },
      { from: 'in', text: 'Of course! Sending your prescription from Dr. Rohit Sharma 💙', time: '06:20 PM' },
      {
        from: 'in',
        text: '📎 prescription_priya-patel.pdf',
        card: { title: 'Prescription · 1 page', rows: [['Amoxycillin 500mg', 'Twice daily'], ['Paracetamol 650mg', 'If fever']] },
        time: '06:20 PM',
      },
      { from: 'out', text: 'Thank you! 🙏', time: '06:21 PM' },
    ],
  },
];

export default function NovaScribeShowcase() {
  return (
    <section className="py-20 bg-white border-y border-slate-100" id="novascribe-showcase">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            A clinic day,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              end to end
            </span>
          </h2>
          <p className="text-lg text-slate-600 mt-4">
            From the booking that arrives on its own to the prescription that reaches the patient’s phone.
          </p>
        </div>

        <div className="space-y-8">
          {PANELS.map((p) => (
            <ShowcasePanel key={p.title} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
