import React from 'react';
import {
  Stethoscope, Mic, FileText, Pill, ShieldCheck, Languages, ArrowRight, ArrowLeft, Check,
} from 'lucide-react';

interface Props {
  isLoggedIn: boolean;
  onOpen: () => void;   // open the app (or go to login)
  onBack: () => void;   // back to the platform hub
}

export default function MediScribeLanding({ isLoggedIn, onOpen, onBack }: Props) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#f1faf9] to-[#fafcff]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-8 cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> All apps
        </button>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Hero copy */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-semibold mb-5">
              <Stethoscope className="w-3.5 h-3.5" /> AI Medical Scribe
            </span>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-slate-900 leading-tight">
              Nova<span className="text-sky-600">Scribe</span>
            </h1>
            <p className="font-display text-2xl sm:text-3xl font-bold text-slate-800 mt-1">
              Just talk. The note writes itself.
            </p>
            <p className="text-slate-500 mt-4 text-lg leading-relaxed">
              Record the consultation — MediScribe transcribes it (Hindi, English, Hinglish), then drafts a
              structured SOAP note &amp; prescription. You review, edit and print. Built into ClinicBook, sharing
              the same patients.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-7">
              <button
                onClick={onOpen}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-600 text-white font-semibold shadow-md shadow-sky-100 hover:bg-sky-700 transition-colors cursor-pointer"
              >
                {isLoggedIn ? 'Open MediScribe' : 'Sign in to start'} <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-400">Same login as ClinicBook</span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-7">
              {['No hallucinated facts', 'Medicine names flagged', 'Doctor approves & prints'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                  <Check className="w-4 h-4 text-emerald-500" /> {t}
                </span>
              ))}
            </div>
          </div>

          {/* Feature panel */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-3">
              <Step n="1" icon={<Mic className="w-5 h-5" />} title="Record" desc="One tap. AI listens in the background — you focus on the patient." />
              <Step n="2" icon={<FileText className="w-5 h-5" />} title="Auto SOAP note" desc="Subjective, Objective, Assessment, Plan — drafted from the conversation." />
              <Step n="3" icon={<Pill className="w-5 h-5" />} title="Structured prescription" desc="Medicines, dose, frequency, duration — editable, with safety flags." />
              <Step n="4" icon={<ShieldCheck className="w-5 h-5" />} title="You approve" desc="Review every field, finalize (locked) and print a professional prescription." />
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-500">
              <Languages className="w-4 h-4 text-sky-500" /> Hindi · English · Hinglish · Marathi · Tamil
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-sky-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-slate-800"><span className="text-slate-300 font-mono mr-1.5">{n}</span>{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </div>
  );
}
