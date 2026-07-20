import { Mic, FileText, ShieldAlert, Send, CalendarClock, Users, Keyboard, Pill, Printer, BellRing } from 'lucide-react';
import { type ShowcasePanelProps } from './ShowcasePanel';
import ShowcaseCarousel from './ShowcaseCarousel';

// The doctor's story. These panels show the SCRIBE's own screens — the queue, the
// recording, the note, the prescription — not a WhatsApp thread: NovaScribe's job
// is writing the note, and that is what a doctor needs to see.
//
// Copy is written for a doctor skimming, not a buyer reading: each line says what
// they no longer have to do.
const PHOTOS = ['/images/doctor-1.jpg', '/images/doctor-2.jpg', '/images/doctor-4.jpg'];

const PANELS: ShowcasePanelProps[] = [
  {
    tone: 'blue',
    eyebrow: 'Your clinic day',
    title: 'Today’s patients,',
    accent: 'already waiting for you',
    subtitle:
      'Appointments booked on WhatsApp land in your queue on their own. Open a patient and their last visit, current medicines and pending follow-up are already on screen — before you say a word.',
    clinicName: 'CarePlus Clinic',
    scene: 'queue',
    photoAlt: 'A doctor reviewing the day’s appointments',
    features: [
      { icon: CalendarClock, title: 'No appointment entry', desc: 'You never create a booking' },
      { icon: FileText, title: 'History before you ask', desc: 'Last visit, meds, follow-up — ready' },
      { icon: Users, title: 'Only your patients', desc: 'One doctor never sees another’s' },
    ],
  },
  {
    tone: 'green',
    eyebrow: 'The consultation',
    title: 'Just talk.',
    accent: 'The note writes itself.',
    subtitle:
      'Speak to your patient the way you always do — Hindi, English or Hinglish. NovaScribe listens and writes the clinical note and the prescription for you. You read, correct if needed, and sign off.',
    clinicName: 'CarePlus Clinic',
    scene: 'record',
    reverse: true,
    features: [
      { icon: Keyboard, title: 'No typing at all', desc: 'Speak — don’t write between patients' },
      { icon: Pill, title: 'Medicines picked up for you', desc: 'Drug, dose, frequency, duration' },
      { icon: Mic, title: 'Nothing gets lost', desc: 'Audio is safe even if the call drops' },
    ],
  },
  {
    tone: 'violet',
    eyebrow: 'The prescription',
    title: 'Prescription ready',
    accent: 'before the patient stands up',
    subtitle:
      'The medicines you spoke are already in the prescription — checked for allergies and interactions, formatted on your letterhead, and sent to the patient’s WhatsApp with reminders set.',
    clinicName: 'CarePlus Clinic',
    scene: 'prescription',
    features: [
      { icon: ShieldAlert, title: 'Warns before you sign', desc: 'Allergy, interaction & duplicate checks' },
      { icon: Printer, title: 'Print or send, same file', desc: 'Your letterhead, real PDF' },
      { icon: Send, title: 'Reaches the patient', desc: 'On WhatsApp, no paper to lose' },
      { icon: BellRing, title: 'Reminders set for you', desc: 'Timed from the dose you wrote' },
    ],
  },
];

export default function NovaScribeShowcase() {
  return (
    <section className="py-20 bg-white border-y border-slate-100" id="novascribe-showcase">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Less paperwork,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              more patient
            </span>
          </h2>
          <p className="text-lg text-slate-600 mt-4">
            What NovaScribe takes off your desk — from the booking you didn’t enter to the prescription you
            didn’t type.
          </p>
        </div>

        <ShowcaseCarousel panels={PANELS.map((p, i) => ({ ...p, photo: PHOTOS[i] }))} />
      </div>
    </section>
  );
}
