import type { LucideIcon } from 'lucide-react';
import { Check, CheckCheck } from 'lucide-react';

// One marketing "panel": headline + feature cards + a live WhatsApp mockup, with
// an optional photograph behind it. Built in code rather than exported as a flat
// image so it stays responsive, readable on a phone, translatable, and always in
// sync with what the product actually says.

export type PanelTone = 'green' | 'blue' | 'peach' | 'violet';

const TONES: Record<PanelTone, { bg: string; accent: string; chip: string; chipIcon: string }> = {
  green: {
    bg: 'from-emerald-50 via-white to-emerald-50/40',
    accent: 'text-emerald-600',
    chip: 'bg-white border-emerald-100',
    chipIcon: 'bg-emerald-50 text-emerald-600',
  },
  blue: {
    bg: 'from-sky-50 via-white to-sky-50/40',
    accent: 'text-sky-600',
    chip: 'bg-white border-sky-100',
    chipIcon: 'bg-sky-50 text-sky-600',
  },
  peach: {
    bg: 'from-amber-50 via-white to-orange-50/40',
    accent: 'text-amber-600',
    chip: 'bg-white border-amber-100',
    chipIcon: 'bg-amber-50 text-amber-600',
  },
  violet: {
    bg: 'from-violet-50 via-white to-violet-50/40',
    accent: 'text-violet-600',
    chip: 'bg-white border-violet-100',
    chipIcon: 'bg-violet-50 text-violet-600',
  },
};

export interface PanelFeature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

/** One WhatsApp bubble. `menu` renders the numbered option list the bot sends. */
export interface ChatItem {
  from: 'in' | 'out';
  text?: string;
  time?: string;
  menu?: string[];
  slots?: { label: string; active?: boolean }[];
  card?: { title: string; rows: [string, string][]; footer?: string };
}

export interface ShowcasePanelProps {
  // Declared so panels can be rendered from a .map() (React consumes `key`;
  // TypeScript otherwise rejects it on an explicit props interface).
  key?: string | number;
  tone: PanelTone;
  eyebrow?: string;
  title: string;
  /** Rendered in the tone colour, on its own line. */
  accent: string;
  titleTail?: string;
  subtitle: string;
  features: PanelFeature[];
  clinicName: string;
  chat: ChatItem[];
  /** Optional photograph URL — the panel is designed to look complete without one. */
  photo?: string;
  photoAlt?: string;
  reverse?: boolean;
}

function Bubble({ item, tone }: { item: ChatItem; tone: PanelTone; key?: string | number }) {
  const t = TONES[tone];
  const isOut = item.from === 'out';

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-xl text-[12px] leading-snug backdrop-blur-[2px] ${
          isOut
            ? 'bg-emerald-500 text-white rounded-tr-sm'
            : 'bg-white/95 text-slate-800 rounded-tl-sm border border-white'
        }`}
      >
        {item.text && <p className="whitespace-pre-line">{item.text}</p>}

        {item.menu && (
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            {item.menu.map((m, i) => (
              <div key={m} className={`text-[12px] font-semibold ${isOut ? 'text-white' : t.accent}`}>
                {i + 1}. {m}
              </div>
            ))}
          </div>
        )}

        {item.slots && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {item.slots.map((s) => (
              <div
                key={s.label}
                className={`text-[10px] text-center py-1 rounded border font-medium ${
                  s.active
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {s.label}
              </div>
            ))}
          </div>
        )}

        {item.card && (
          <div className="mt-1.5 rounded border border-slate-200 bg-slate-50 p-2">
            <p className="text-[10px] font-bold text-slate-800 mb-1">{item.card.title}</p>
            {item.card.rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 text-[10px] py-px">
                <span className="text-slate-500">{k}</span>
                <span className="font-semibold text-slate-800 text-right">{v}</span>
              </div>
            ))}
            {item.card.footer && <p className="text-[10px] text-slate-500 mt-1">{item.card.footer}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-1 mt-1">
          <span className={`text-[9px] ${isOut ? 'text-emerald-50' : 'text-slate-400'}`}>
            {item.time ?? '10:31 AM'}
          </span>
          {isOut && <CheckCheck className="w-3 h-3 text-emerald-100" />}
        </div>
      </div>
    </div>
  );
}

export default function ShowcasePanel({
  tone,
  eyebrow,
  title,
  accent,
  titleTail,
  subtitle,
  features,
  clinicName,
  chat,
  photo,
  photoAlt,
  reverse,
}: ShowcasePanelProps) {
  const t = TONES[tone];

  return (
    <div className={`rounded-3xl border border-slate-200 bg-gradient-to-br ${t.bg} overflow-hidden`}>
      <div
        className={`grid lg:grid-cols-2 gap-8 p-6 sm:p-8 lg:p-10 items-center ${
          reverse ? 'lg:[&>*:first-child]:order-2' : ''
        }`}
      >
        {/* Copy + features */}
        <div>
          {eyebrow && (
            <span className={`text-[11px] font-bold uppercase tracking-widest ${t.accent}`}>{eyebrow}</span>
          )}
          <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight mt-2">
            {title} <span className={t.accent}>{accent}</span>
            {titleTail ? <> {titleTail}</> : null}
          </h3>
          <p className="text-slate-600 mt-3 leading-relaxed">{subtitle}</p>

          <div className="mt-6 space-y-2.5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`flex items-start gap-3 rounded-xl border p-3 shadow-xs ${t.chip}`}
                >
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.chipIcon}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-slate-900 text-sm">{f.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* The conversation floats OVER the photograph — one composition rather
            than a phone box sitting next to a portrait. The person is anchored
            right so the bubbles always land on clear space. */}
        <div className="relative rounded-3xl overflow-hidden min-h-[420px] sm:min-h-[460px] bg-gradient-to-br from-white/60 to-white/20">
          {photo && (
            <img
              src={photo}
              alt={photoAlt || ''}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover object-[75%_center]"
            />
          )}

          {/* Soft wash so white bubbles stay readable over any photo */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/40 to-transparent" />

          <div className="relative p-4 sm:p-5">
            {/* Clinic chip — keeps the WhatsApp context without a phone frame */}
            <div className="inline-flex items-center gap-2 bg-white/95 border border-white rounded-full pl-1.5 pr-3 py-1.5 shadow-lg mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                {clinicName.charAt(0)}
              </span>
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                {clinicName}
                <Check className="w-3 h-3 text-emerald-600" />
              </span>
            </div>

            <div className="space-y-2 max-w-[85%]">
              {chat.map((item, i) => (
                <Bubble key={i} item={item} tone={tone} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
