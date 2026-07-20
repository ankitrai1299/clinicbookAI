import { MessageSquare, Mic, FileText, Bell, CalendarClock, ArrowRight, Stethoscope, Check } from 'lucide-react';

// "One platform, two apps" — the section that finally explains what ClinicBook
// and NovaScribe DO together: the patient lives on WhatsApp, the doctor lives in
// the scribe, and both write to the same patient record. Shown on BOTH landing
// pages so the story is identical wherever a visitor lands.
//
// The visuals are real product mockups (a WhatsApp thread and the doctor's app)
// rather than stock photography — that's the part that actually sells a SaaS, and
// it can't go out of date or misrepresent the product.

const PATIENT_CHAT = [
  { from: 'in' as const, text: 'Hi! 👋 Book an appointment?\nReply with a doctor or symptom.' },
  { from: 'out' as const, text: 'Skin doctor kal subah' },
  { from: 'in' as const, text: 'Dr. Mehra (Dermatology), tomorrow:\n① 10:00 AM  ② 11:30 AM' },
  { from: 'out' as const, text: '1' },
  { from: 'in' as const, text: 'Booked ✅ Tue 10:00 AM.\nWe’ll remind you the evening before.' },
];

const FLOW = [
  { icon: MessageSquare, title: 'Patient books', desc: 'On WhatsApp — no app, no form, any language.', tone: 'sky' as const },
  { icon: CalendarClock, title: 'Doctor sees it', desc: "The visit appears in the doctor's queue automatically.", tone: 'teal' as const },
  { icon: Mic, title: 'Doctor records', desc: 'One tap. The consultation is captured as it happens.', tone: 'sky' as const },
  { icon: FileText, title: 'AI writes the note', desc: 'Structured clinical note + prescription, ready to edit.', tone: 'teal' as const },
  { icon: Bell, title: 'Patient gets it', desc: 'Prescription PDF + medicine reminders on WhatsApp.', tone: 'sky' as const },
];

export default function PlatformStory() {
  return (
    <section className="py-20 bg-white border-y border-slate-100" id="platform-story">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 border border-sky-100 text-sky-700 rounded-full text-xs font-semibold tracking-wide uppercase shadow-2xs">
            <Stethoscope className="w-4 h-4 text-sky-500" />
            <span>How it works together</span>
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight mt-5 leading-tight">
            One platform. Two apps.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              One patient record.
            </span>
          </h2>
          <p className="text-lg text-slate-600 mt-4 leading-relaxed">
            Your patients never install anything — they just message the clinic. Your doctors never type a
            note — they just talk. Both sides write to the same record, so nothing is entered twice.
          </p>
        </div>

        {/* Two sides */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-stretch">
          {/* PATIENT SIDE — WhatsApp */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">Patient side</span>
            </div>
            <h3 className="font-display text-2xl font-extrabold text-slate-900 mt-2">ClinicBook — on WhatsApp</h3>
            <p className="text-slate-600 mt-2 mb-6">
              Booking, rescheduling, reminders and reports — entirely in the chat your patients already use.
            </p>

            {/* Phone mockup */}
            <div className="mt-auto mx-auto w-full max-w-[320px] rounded-[32px] bg-slate-900 p-2.5 shadow-2xl border-4 border-slate-800">
              <div className="rounded-[24px] overflow-hidden bg-[#e5ddd5]">
                <div className="bg-emerald-700 px-4 py-3 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-white/20 text-white font-bold flex items-center justify-center text-sm">
                    C
                  </span>
                  <div className="leading-tight">
                    <div className="text-white text-sm font-semibold">City Care Clinic</div>
                    <div className="text-emerald-100 text-[10px]">online</div>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {PATIENT_CHAT.map((m, i) => (
                    <div
                      key={i}
                      className={`max-w-[85%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed shadow-xs whitespace-pre-line ${
                        m.from === 'in'
                          ? 'bg-white text-slate-800 rounded-tl-none'
                          : 'bg-[#dcf8c6] text-slate-800 ml-auto rounded-tr-none'
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                  {/* The document the patient receives after the visit */}
                  <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-none p-2.5 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-9 rounded bg-red-50 text-red-600 flex items-center justify-center text-[9px] font-bold border border-red-100">
                        PDF
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-slate-800 truncate">prescription.pdf</div>
                        <div className="text-[9px] text-slate-400">1 page</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1.5">Here’s your prescription 💙</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DOCTOR SIDE — NovaScribe */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 sm:p-8 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-sky-700">Doctor side</span>
            </div>
            <h3 className="font-display text-2xl font-extrabold text-slate-900 mt-2">NovaScribe — the AI scribe</h3>
            <p className="text-slate-600 mt-2 mb-6">
              Today’s queue, one-tap recording, and a structured clinical note written for you.
            </p>

            {/* App mockup */}
            <div className="mt-auto rounded-2xl bg-white border border-slate-200 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-sky-600" /> Today’s Queue
                </span>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
                  3 waiting
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {[
                  { n: 'Priya Patel', t: '10:00 AM' },
                  { n: 'Anish Kumar', t: '10:30 AM' },
                ].map((p) => (
                  <div key={p.n} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-sky-100 text-sky-700 text-[11px] font-bold flex items-center justify-center">
                      {p.n.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{p.n}</div>
                      <div className="text-[10px] text-slate-500">{p.t}</div>
                    </div>
                    <span className="text-[10px] font-bold text-white bg-sky-600 px-2.5 py-1 rounded-md flex items-center gap-1">
                      <Mic className="w-3 h-3" /> Start
                    </span>
                  </div>
                ))}
              </div>

              {/* Generated note preview */}
              <div className="p-4 bg-slate-50/60 border-t border-slate-100">
                <div className="flex items-center gap-1.5 mb-2">
                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Note written by AI
                  </span>
                </div>
                <div className="bg-white rounded-lg border border-slate-100 p-2.5 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600">Assessment</p>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    Orthostatic hypotension, likely secondary to the Lisinopril adjustment.
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['Lisinopril 5mg — once daily', 'BP monitoring'].map((t) => (
                      <span
                        key={t}
                        className="text-[9px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* The loop */}
        <div className="mt-14">
          <div className="overflow-x-auto pb-2">
            <div className="flex items-stretch gap-3 min-w-[860px]">
              {FLOW.map((s, i) => {
                const Icon = s.icon;
                const isSky = s.tone === 'sky';
                return (
                  <div key={s.title} className="flex items-stretch gap-3 flex-1">
                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
                          isSky ? 'bg-sky-50 text-sky-600' : 'bg-teal-50 text-teal-600'
                        }`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </span>
                      <h4 className="font-display font-extrabold text-slate-900 text-sm">{s.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed mt-1">{s.desc}</p>
                    </div>
                    {i < FLOW.length - 1 && (
                      <div className="flex items-center text-slate-300">
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-sm text-slate-600">
            {[
              'Follow-up date books the next visit — the loop closes itself',
              'One shared patient timeline across both apps',
              'Nothing entered twice',
            ].map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-teal-600" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
