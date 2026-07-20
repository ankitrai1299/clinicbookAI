import { ShieldCheck, Languages, Clock, Smartphone } from 'lucide-react';

// A quiet credibility strip that sits just under the hero on both landing pages.
// Deliberately states only things the product actually does — no invented
// customer counts or logos.
const POINTS = [
  { icon: Smartphone, title: 'Zero install for patients', desc: 'Everything happens in WhatsApp' },
  { icon: Languages, title: '10 Indian languages', desc: 'Hindi, English, Hinglish & more' },
  { icon: Clock, title: 'Works 24/7', desc: 'Bookings never wait for the front desk' },
  { icon: ShieldCheck, title: 'Clinic-scoped data', desc: 'One clinic can never see another’s' },
];

export default function TrustStrip() {
  return (
    <section className="bg-slate-50 border-b border-slate-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-sky-600 flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display font-bold text-slate-900 text-sm leading-snug">{p.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
