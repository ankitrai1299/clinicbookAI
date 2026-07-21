import { ArrowLeft } from 'lucide-react';
import NovaHeroV2 from './novascribe/v2/NovaHeroV2';
import { HowItWorks, BeforeAfter, MedicalReasoning } from './novascribe/v2/NovaProcess';
import { LiveDemo, RealReport } from './novascribe/v2/NovaDemo';
import NovaLanguages from './novascribe/v2/NovaLanguages';
import { Specialties, WhatChanges, PatientJourney, Integrations } from './novascribe/v2/NovaEcosystem';
import { Testimonials, FAQ, FinalCTA } from './novascribe/v2/NovaClose';
import NovaPricing from './novascribe/NovaPricing';

interface Props {
  isLoggedIn: boolean;
  onOpen: () => void; // open the app (or go to login)
  onBack: () => void; // back to the platform hub
}

// NovaScribe's landing page, told as one continuous story rather than a stack of
// feature blocks: what it does (hero + live demo), how it works (timeline), what
// it replaces (before/after), why it can be trusted with medicine (reasoning +
// a real report), who it's for (specialties), how it fits (journey +
// integrations), and then the ask.
export default function MediScribeLanding({ isLoggedIn, onOpen, onBack }: Props) {
  return (
    <div className="bg-white min-h-screen" id="novascribe-landing-root">
      {/* Back to the platform hub */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> All apps
        </button>
      </div>

      {/* 1 — the promise, shown running */}
      <NovaHeroV2 isLoggedIn={isLoggedIn} onOpen={onOpen} />

      {/* 2 — the flow, step by step */}
      <HowItWorks />

      {/* 3 — the product actually running */}
      <LiveDemo />

      {/* 4 — the demo just played in Hindi, so answer "and my language?" right here */}
      <NovaLanguages />

      {/* 5 — what it replaces */}
      <BeforeAfter />

      {/* 5 — why it can be trusted with medicine */}
      <MedicalReasoning />

      {/* 6 — the document it produces */}
      <RealReport />

      {/* 7 — who it's for */}
      <Specialties />

      {/* 8 — what measurably changes */}
      <WhatChanges />

      {/* 9 — the loop with ClinicBook */}
      <PatientJourney />

      {/* 10 — what it connects to */}
      <Integrations />

      {/* 11 — voices from the OPD */}
      <Testimonials />

      {/* Pricing sits just before the questions, where intent is highest */}
      <NovaPricing onOpen={onOpen} />

      {/* 12 — objections */}
      <FAQ />

      {/* 13 — the ask */}
      <FinalCTA isLoggedIn={isLoggedIn} onOpen={onOpen} />
    </div>
  );
}
