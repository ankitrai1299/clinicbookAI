import React from 'react';
import { CalendarCheck, Stethoscope, ArrowRight } from 'lucide-react';

import { BRAND } from '../brand';
import AnvayaMark from './AnvayaMark';

interface ProductHubProps {
  userName?: string | null;
  onOpenClinicBook: () => void;
  onOpenMediScribe: () => void;
}

// The picker. Two products, one login — and nothing else on the page, because
// this screen sits between a person and the work they came to do.
//
// The "PatientLoop — coming soon" card that used to be here is gone. That
// product was retired, and a permanent coming-soon card is a promise the
// product is not keeping; it reads as neglect long before anyone asks about it.
export default function ProductHub({ userName, onOpenClinicBook, onOpenMediScribe }: ProductHubProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#FBF8F3] to-[#F3F1FA] px-4 sm:px-6 lg:px-8 py-14">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-5">
            <AnvayaMark size={44} title={`${BRAND.name} — ${BRAND.meaning}`} />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#16192A]">
            {userName ? (
              <>Welcome back, {userName.split(' ')[0]}.</>
            ) : (
              <>{BRAND.tagline}.</>
            )}
          </h1>
          <p className="text-slate-500 mt-3 max-w-lg mx-auto">
            One login, one patient record. Open the side you work on.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <ProductCard
            onClick={onOpenClinicBook}
            icon={<CalendarCheck className="w-7 h-7" />}
            name={BRAND.desk}
            who="For the clinic"
            description="Patients book, reschedule and cancel over WhatsApp — day or night, in their own language. The desk confirms."
            accent="from-[#2E3E8F] to-[#1F2A6B]"
          />
          <ProductCard
            onClick={onOpenMediScribe}
            icon={<Stethoscope className="w-7 h-7" />}
            name={BRAND.scribe}
            who="For the doctor"
            description="Record the consultation and the note writes itself. The doctor edits and approves — nothing reaches a patient before that."
            accent="from-[#E0A03C] to-[#B87A1E]"
          />
        </div>
      </div>
    </div>
  );
}

interface ProductCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  who: string;
  description: string;
  accent: string;
}

function ProductCard({ onClick, icon, name, who, description, accent }: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl border border-[#E4DCCE] bg-white p-6 shadow-sm
                 hover:shadow-md hover:border-[#C9BEA8] transition
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E0A03C]"
    >
      <div
        className={`w-14 h-14 rounded-xl bg-gradient-to-br ${accent} text-white
                    flex items-center justify-center mb-4`}
      >
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">{who}</p>
      <p className="font-display text-xl font-bold text-[#16192A] mb-2">{name}</p>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2E3E8F]">
        Open
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
