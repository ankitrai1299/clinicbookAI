import { CheckCircle2, ArrowRight } from 'lucide-react';
import { FadeIn } from './FadeIn';

// NovaScribe pricing — ClinicBook theme. The popular plan gets the sky accent
// treatment rather than the original dark card, so it sits in the same palette as
// the rest of the platform.

const PLANS = [
  {
    name: 'Free',
    price: '₹0',
    description: 'Perfect for trying NovaScribe out.',
    features: ['5 consultations per month', 'Standard clinical notes', 'Email support', '7-day history'],
    cta: 'Start free',
    popular: false,
  },
  {
    name: 'Starter',
    price: '₹1,499',
    period: '/month',
    description: 'For independent physicians.',
    features: ['100 consultations per month', 'Premium clinical notes', 'Patient timeline', 'Priority email support'],
    cta: 'Choose Starter',
    popular: false,
  },
  {
    name: 'Professional',
    price: '₹2,999',
    period: '/month',
    description: 'For busy clinics and hospitals.',
    features: [
      'Unlimited consultations',
      'Unlimited reports & patients',
      'WhatsApp prescription delivery',
      'Future feature updates',
      'Priority support',
      'Cancel anytime',
    ],
    cta: 'Start 14-day free trial',
    popular: true,
  },
];

export function NovaPricing({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-20 bg-white border-b border-slate-100" id="novascribe-pricing">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Simple pricing.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-teal-600">
              Built for modern clinics.
            </span>
          </h2>
          <p className="text-slate-600 mt-4 text-lg">
            Everything you need to automate clinical documentation — no hidden fees, no complex tiers.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {PLANS.map((plan, i) => (
            <FadeIn key={plan.name} delay={i * 0.1} className="h-full">
              <div
                className={`h-full flex flex-col rounded-2xl p-8 relative transition-all ${
                  plan.popular
                    ? 'bg-sky-50/60 border-2 border-sky-200 shadow-xl shadow-sky-100/60 md:-translate-y-2'
                    : 'bg-white border border-slate-200 shadow-xs hover:-translate-y-1 hover:shadow-md'
                }`}
              >
                {plan.popular && (
                  <span className="inline-flex self-start items-center px-3 py-1 rounded-full bg-sky-600 text-white text-[10px] font-bold tracking-widest uppercase mb-5 shadow-sm">
                    Most popular
                  </span>
                )}

                <h3 className="font-display text-xl font-extrabold text-slate-900">{plan.name}</h3>
                <p className="text-slate-500 text-sm mt-1">{plan.description}</p>

                <div className="flex items-baseline gap-1 mt-6">
                  <span className="font-display text-4xl font-extrabold text-slate-900 tracking-tight">
                    {plan.price}
                  </span>
                  {plan.period && <span className="text-slate-400 font-medium">{plan.period}</span>}
                </div>

                <div className="space-y-3 mt-7 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5">
                      <CheckCircle2
                        className={`w-5 h-5 shrink-0 mt-0.5 ${plan.popular ? 'text-sky-600' : 'text-teal-600'}`}
                      />
                      <span className="text-sm font-medium text-slate-700">{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={onOpen}
                  className={`w-full py-3.5 rounded-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer ${
                    plan.popular
                      ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-lg shadow-sky-100'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

export default NovaPricing;
