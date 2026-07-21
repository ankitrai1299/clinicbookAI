import { MessageSquare, Mic, FileText, Bell, CalendarClock, ArrowRight, Stethoscope, Check } from 'lucide-react';
import PlatformDemo from './PlatformDemo';

// "One platform, two apps" — the section that finally explains what ClinicBook
// and NovaScribe DO together: the patient lives on WhatsApp, the doctor lives in
// the scribe, and both write to the same patient record. Shown on BOTH landing
// pages so the story is identical wherever a visitor lands.
//
// The visuals are real product mockups (a WhatsApp thread and the doctor's app)
// rather than stock photography — that's the part that actually sells a SaaS, and
// it can't go out of date or misrepresent the product.

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

        {/* Two sides — one clock. The doctor consults, then the patient receives. */}
        <PlatformDemo />

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
