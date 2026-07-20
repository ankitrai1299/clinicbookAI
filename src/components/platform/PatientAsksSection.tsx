import { FileText, Check } from 'lucide-react';

// "Patients just ask — we send it back." Showcases the report/prescription
// delivery flow: the patient asks in plain language and gets the actual PDF on
// WhatsApp. Composition is a photo (optional) with the conversation floating over
// it — the conversation is the point, so the layout works with or without a photo.
//
// PHOTO SLOT: set VITE_LANDING_PATIENT_PHOTO to a URL of your OWN (or a properly
// licensed) photograph — ideally a patient/person looking at their phone, shot
// with space on the left for the bubbles. Without it a clean branded gradient is
// shown instead, which is deliberately good-looking rather than a broken frame.
const PHOTO = (import.meta.env.VITE_LANDING_PATIENT_PHOTO as string | undefined) || '';

export default function PatientAsksSection() {
  return (
    <section className="py-20 bg-slate-50 border-y border-slate-100" id="patient-asks">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Copy */}
        <div>
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full text-xs font-semibold tracking-wide uppercase">
            <FileText className="w-3.5 h-3.5" />
            Reports &amp; prescriptions
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-5 leading-tight">
            Patients just ask.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              The report comes back.
            </span>
          </h2>
          <p className="text-lg text-slate-600 mt-4 leading-relaxed">
            No portal, no login, no “please visit the clinic to collect it”. A patient asks for their
            prescription in their own words — and the actual PDF lands in the same chat, seconds later.
          </p>

          <ul className="mt-6 space-y-3">
            {[
              'Understands plain language — “I lost my parchi, bhej do”',
              'Sends the real PDF, not a screenshot or a text summary',
              'The same document the clinic prints — signed and formatted',
              'Works after the visit, whenever the patient needs it again',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-slate-700">
                <Check className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Visual — conversation floating over the photo (or branded gradient) */}
        <div className="relative">
          {/* Backdrop */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute -top-8 -right-6 w-72 h-72 bg-teal-200/40 rounded-full blur-3xl" />
            <div className="absolute bottom-0 -left-8 w-72 h-72 bg-sky-200/40 rounded-full blur-3xl" />
          </div>

          <div className="relative rounded-[32px] overflow-hidden min-h-[440px] bg-gradient-to-br from-sky-100 via-white to-teal-100">
            {PHOTO ? (
              <img
                src={PHOTO}
                alt="A patient reading their prescription on WhatsApp"
                className="absolute inset-0 w-full h-full object-cover object-right"
                loading="lazy"
                decoding="async"
              />
            ) : (
              // Branded fallback so the section never looks unfinished.
              <div className="absolute inset-0" aria-hidden="true">
                <div className="absolute right-6 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full bg-white/50 backdrop-blur-sm border border-white" />
                <div className="absolute right-16 top-1/2 -translate-y-1/2 w-36 h-36 rounded-full bg-gradient-to-br from-sky-500/15 to-teal-500/15" />
              </div>
            )}

            {/* Conversation */}
            <div className="relative p-5 sm:p-7 space-y-3 max-w-[92%]">
              {/* Patient asks */}
              <div className="ml-auto max-w-[80%] bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg">
                <p className="text-sm leading-relaxed">
                  I misplaced my prescription. Can you please send it again?
                </p>
              </div>

              {/* Clinic replies */}
              <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-lg border border-slate-100">
                <p className="text-sm leading-relaxed text-slate-700">
                  Hi Priya! Sending your prescription from{' '}
                  <span className="font-semibold text-slate-900">Dr. Mehra</span> — City Care Clinic. One moment 💙
                </p>
              </div>

              {/* The document */}
              <div className="max-w-[85%] bg-white rounded-2xl px-3.5 py-3 shadow-xl border border-slate-100">
                {/* Tiny document preview */}
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 mb-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-sky-700">Prescription</span>
                    <span className="text-[8px] text-slate-400">City Care Clinic</span>
                  </div>
                  {[
                    ['Amoxycillin 500mg', 'Twice daily · 5 days'],
                    ['Paracetamol 650mg', 'If fever · 3 days'],
                  ].map(([drug, dose]) => (
                    <div key={drug} className="flex items-center justify-between py-0.5">
                      <span className="text-[9px] font-semibold text-slate-700">{drug}</span>
                      <span className="text-[8px] text-slate-400">{dose}</span>
                    </div>
                  ))}
                  <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex justify-end">
                    <span className="text-[8px] italic text-slate-400">Dr. Mehra, MBBS MD</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-10 rounded bg-red-50 border border-red-100 text-red-600 text-[9px] font-bold flex items-center justify-center">
                    PDF
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">prescription_priya-patel.pdf</div>
                    <div className="text-[10px] text-slate-400">1 page · PDF</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2">Here’s your prescription. Get well soon!</p>
              </div>

              {/* Patient thanks */}
              <div className="ml-auto max-w-[45%] bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-lg">
                <p className="text-sm">Thank you! 🙏</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
