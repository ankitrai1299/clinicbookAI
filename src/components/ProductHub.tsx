import React from 'react';
import { CalendarCheck, Stethoscope, HeartPulse, ArrowRight, Sparkles } from 'lucide-react';

interface ProductHubProps {
  userName?: string | null;
  onOpenClinicBook: () => void;
  onOpenMediScribe: () => void;
}

export default function ProductHub({ userName, onOpenClinicBook, onOpenMediScribe }: ProductHubProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f3fbfa] to-[#fafcff] px-4 sm:px-6 lg:px-8 py-14">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Healthcare AI Platform
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
            {userName ? <>Welcome back, {userName.split(' ')[0]}.</> : <>One platform. Every clinic workflow.</>}
          </h1>
          <p className="text-slate-500 mt-3 max-w-xl mx-auto">
            Choose an app to open. All apps share the same login and the same patient records.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <ProductCard
            onClick={onOpenClinicBook}
            icon={<CalendarCheck className="w-7 h-7" />}
            name={<>ClinicBook <span className="text-sky-600">AI</span></>}
            tagline="AI Receptionist"
            description="Patients book, reschedule, cancel & join the waitlist over WhatsApp — 24/7, in any language."
            accent="from-sky-500 to-sky-700"
          />
          <ProductCard
            onClick={onOpenMediScribe}
            icon={<Stethoscope className="w-7 h-7" />}
            name={<>Nova<span className="text-sky-600">Scribe</span></>}
            tagline="AI Medical Scribe"
            description="Record a consultation — AI drafts the SOAP note & prescription. The doctor reviews, edits and prints."
            accent="from-teal-500 to-teal-700"
          />
        </div>

        {/* Coming soon */}
        <div className="mt-5">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5 flex items-center gap-4 opacity-80">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <HeartPulse className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <p className="font-display font-bold text-slate-700">PatientLoop <span className="ml-2 text-[10px] font-mono uppercase tracking-widest bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full">Coming soon</span></p>
              <p className="text-sm text-slate-500">Medicine & follow-up reminders, lab-report explanations and daily patient check-ins.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ onClick, icon, name, tagline, description, accent }: {
  onClick: () => void;
  icon: React.ReactNode;
  name: React.ReactNode;
  tagline: string;
  description: string;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-2xl border border-slate-200 bg-white p-6 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-50 transition-all duration-200 cursor-pointer"
    >
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${accent} text-white flex items-center justify-center shadow-md mb-4`}>
        {icon}
      </div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400">{tagline}</p>
      <h2 className="font-display text-2xl font-bold text-slate-900 mt-0.5">{name}</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
      <span className="inline-flex items-center gap-1.5 mt-4 text-sm font-semibold text-sky-600 group-hover:gap-2.5 transition-all">
        Open app <ArrowRight className="w-4 h-4" />
      </span>
    </button>
  );
}
