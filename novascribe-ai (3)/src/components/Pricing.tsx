import React from 'react';
import { FadeIn } from './ui/FadeIn';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';

const plans = [
  {
    name: "Free",
    price: "₹0",
    description: "Perfect for trying out NovaScribe.",
    features: [
      "5 consultations per month",
      "Standard SOAP notes",
      "Email support",
      "7-day history"
    ],
    cta: "Start Free",
    popular: false
  },
  {
    name: "Starter",
    price: "₹1,499",
    period: "/month",
    description: "For independent physicians.",
    features: [
      "100 consultations per month",
      "Premium SOAP notes",
      "Patient timeline",
      "Priority email support"
    ],
    cta: "Start Starter",
    popular: false
  },
  {
    name: "Professional",
    price: "₹2,999",
    period: "/month",
    description: "For busy clinics and hospitals.",
    features: [
      "Unlimited consultations",
      "Unlimited reports",
      "Unlimited patients",
      "Future feature updates",
      "Priority support",
      "Cancel anytime"
    ],
    cta: "Start 14-Day Free Trial",
    popular: true
  }
];

export function Pricing() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <section className="py-16 md:py-24 bg-[#FAFBFD] relative overflow-hidden" id="pricing">
      <div className="absolute inset-0 bg-[#0B0F1F]/[0.02] pointer-events-none" />
      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        <FadeIn className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-[#0B0F1F] mb-6 leading-[1.05]">
            Simple pricing.<br />
            <span className="font-serif italic font-light text-slate-400">Built for modern clinics.</span>
          </h2>
          <p className="text-xl text-slate-500 leading-relaxed font-light max-w-lg mx-auto">
            Everything you need to automate your clinical documentation, with no hidden fees or complex tiers.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, i) => (
            <FadeIn key={plan.name} delay={i * 0.1} className="h-full">
              <motion.div 
                onMouseMove={plan.popular ? handleMouseMove : undefined}
                className={`relative h-full flex flex-col rounded-[32px] p-[1px] overflow-hidden transition-transform duration-300 ${
                  plan.popular 
                    ? 'shadow-2xl shadow-[#4F6BFF]/10 scale-100 md:scale-105 z-10' 
                    : 'shadow-sm border border-slate-200 bg-white hover:-translate-y-1'
                }`}
              >
                {plan.popular && (
                  <>
                    <motion.div
                      className="pointer-events-none absolute -inset-px rounded-[32px] opacity-0 transition duration-500 hover:opacity-100"
                      style={{
                        background: useMotionTemplate`
                          radial-gradient(
                            600px circle at ${mouseX}px ${mouseY}px,
                            rgba(79, 107, 255, 0.4),
                            transparent 80%
                          )
                        `,
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-[#4F6BFF]/20 to-[#4F6BFF]/5 rounded-[32px] -z-10" />
                  </>
                )}

                <div className={`flex flex-col h-full rounded-[31px] p-8 md:p-10 relative overflow-hidden ${
                  plan.popular ? 'bg-white/95 backdrop-blur-xl' : 'bg-transparent'
                }`}>
                  {plan.popular && (
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#4F6BFF]/5 blur-[80px] rounded-full pointer-events-none -z-10" />
                  )}

                  <div className="mb-8">
                    {plan.popular && (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4F6BFF]/10 border border-[#4F6BFF]/20 text-[#4F6BFF] text-[10px] font-bold tracking-widest uppercase mb-6 shadow-sm">
                        Most Popular
                      </div>
                    )}
                    <h3 className="text-2xl font-medium text-[#111827] mb-2">{plan.name}</h3>
                    <p className="text-slate-500 font-medium">{plan.description}</p>
                  </div>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-medium text-[#0B0F1F] tracking-tight">{plan.price}</span>
                      {plan.period && <span className="text-slate-400 font-medium">{plan.period}</span>}
                    </div>
                  </div>

                  <div className="space-y-4 mb-10 flex-1">
                    {plan.features.map((feature, idx) => (
                      <div key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${plan.popular ? 'text-[#4F6BFF]' : 'text-slate-300'}`} />
                        <span className="text-[#111827] font-medium">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button className={`w-full py-4 text-xs uppercase tracking-widest font-bold rounded-full transition-all active:scale-95 flex items-center justify-center gap-2 group ${
                    plan.popular
                      ? 'text-white bg-[#0B0F1F] hover:bg-black shadow-[0_8px_20px_rgba(11,15,31,0.15)]'
                      : 'text-[#0B0F1F] bg-[#FAFBFD] border border-slate-200 hover:bg-slate-100 shadow-sm'
                  }`}>
                    {plan.cta}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
