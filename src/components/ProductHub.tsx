import React from 'react';
import { CalendarCheck, Stethoscope, ArrowRight } from 'lucide-react';

import { BRAND } from '../brand';
import AnvayaLogo from './AnvayaLogo';
import type { ProductKey } from '../api/clinic';

interface ProductHubProps {
  userName?: string | null;
  onOpenClinicBook: () => void;
  onOpenMediScribe: () => void;
  /**
   * What this clinic bought. Undefined means "not known yet", which shows
   * everything — the same answer the server gives when its own lookup fails, so
   * the two cannot disagree and quietly hide a product a clinic pays for.
   */
  products?: ProductKey[];
}

// The picker. Two products, one login — and nothing else on the page, because
// this screen sits between a person and the work they came to do.
//
// The "PatientLoop — coming soon" card that used to be here is gone. That
// product was retired, and a permanent coming-soon card is a promise the
// product is not keeping; it reads as neglect long before anyone asks about it.
export default function ProductHub({ userName, onOpenClinicBook, onOpenMediScribe, products }: ProductHubProps) {
  // Not known yet → show both. A picker that hides a product on a slow response
  // is worse than one that offers a product the server then refuses: the first
  // looks like the product is gone, the second like a page that needs a reload.
  const hasBook = !products || products.includes('clinicbook');
  const hasScribe = !products || products.includes('mediscribe');
  const both = hasBook && hasScribe;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-[#FBF8F3] to-[#F3F1FA] px-4 sm:px-6 lg:px-8 py-14">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-5">
            {/* The cut WITHOUT a line baked in — the slogan is set below as
                text, and the full artwork carries a different one. */}
            <AnvayaLogo height={54} cut="platform-compact" />
            <p
              className="mt-2.5 text-[13px] text-slate-400"
              style={{ fontFamily: 'var(--font-devanagari-text)', letterSpacing: '.005em' }}
            >
              {BRAND.taglineHi}
            </p>
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

        <div className={`grid gap-5 ${both ? 'sm:grid-cols-2' : 'max-w-md mx-auto'}`}>
          {hasBook && (
          <ProductCard
            onClick={onOpenClinicBook}
            icon={<CalendarCheck className="w-7 h-7" />}
            name={<AnvayaLogo height={30} cut="book" decorative />}
            who="For the clinic"
            description="Patients book, reschedule and cancel over WhatsApp — day or night, in their own language. The desk confirms."
            accent="from-[#2E3E8F] to-[#1F2A6B]"
          />
          )}
          {hasScribe && (
          <ProductCard
            onClick={onOpenMediScribe}
            icon={<Stethoscope className="w-7 h-7" />}
            name={<AnvayaLogo height={30} cut="scribe" decorative />}
            who="For the doctor"
            description="Record the consultation and the note writes itself. The doctor edits and approves — nothing reaches a patient before that."
            accent="from-[#E0A03C] to-[#B87A1E]"
          />
          )}
        </div>

        {/* One product, so name the other one rather than leaving a clinic to
            wonder whether they are missing something. It is on the pricing page
            either way; a clinic that finds out here finds out from us. */}
        {!hasScribe && (
          <p className="text-center text-slate-400 text-xs mt-8">
            अन्वयScribe — the AI scribe for the consultation room — is coming soon.
          </p>
        )}
      </div>
    </div>
  );
}

interface ProductCardProps {
  onClick: () => void;
  icon: React.ReactNode;
  name: React.ReactNode;
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
