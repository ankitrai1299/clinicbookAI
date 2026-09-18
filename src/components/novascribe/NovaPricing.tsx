import { CheckCircle2 } from 'lucide-react';
import { FadeIn } from './FadeIn';

// अन्वयScribe has no price yet, and this page says so.
//
// It carried three plans — ₹0, ₹1,499 and ₹2,999 — with working buttons. None of
// them could be honoured: Scribe has not been through a single real consultation
// with a real doctor, and nothing here can take a payment for it. A price on a
// pricing page is a promise, and three promises for something nobody can buy is
// worse than an empty space, because a clinic that plans around a number and
// then meets a different one has been misled rather than disappointed.
//
// What the page keeps is what Scribe DOES, because that part is certain and it
// is the part a clinic is deciding on. The price follows the testing.
const CAPABILITIES = [
  'Records the consultation as it happens, in the language it happens in',
  'Writes the clinical note and the prescription for the doctor to check',
  'Hindi, Bhojpuri, Bengali, English — and the mix a real clinic speaks',
  'The doctor edits and signs. Nothing is filed that they did not approve',
  'A patient booked on WhatsApp is already in that doctor’s queue',
  'Every note stays with the patient’s own record, not in a separate app',
];

export function NovaPricing({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-20 bg-white border-b border-slate-100" id="novascribe-pricing">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold tracking-widest uppercase mb-5">
            Coming soon
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            In testing with doctors.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              Pricing when it is ready.
            </span>
          </h2>
          <p className="text-slate-600 mt-4 text-lg">
            We would rather tell you the price once, correctly, than put a number here and
            change it after you have planned around it.
          </p>
        </FadeIn>

        <FadeIn className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs p-8 sm:p-10">
            <h3 className="font-display text-xl font-extrabold text-slate-900">What it will do</h3>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-7">
              {CAPABILITIES.map((c) => (
                <div key={c} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-teal-600" />
                  <span className="text-sm font-medium text-slate-700">{c}</span>
                </div>
              ))}
            </div>

            {/* The reason to start on Book now instead of waiting for both.
                A clinic already on Book has its doctors, patients and bookings
                here — the scribe is a switch, not a migration. */}
            <div className="mt-9 pt-7 border-t border-slate-100">
              <p className="text-sm text-slate-600 leading-relaxed">
                <strong className="text-slate-900">Already on अन्वयBook?</strong> Scribe switches on
                for you the day it opens. Your doctors, your patients and your bookings are already
                here — there is nothing to move and nothing to re-enter.
              </p>
              <button
                onClick={onOpen}
                className="mt-6 px-6 py-3 rounded-xl font-bold text-sm bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
              >
                See how it works
              </button>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default NovaPricing;
