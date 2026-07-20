import type { LucideIcon } from 'lucide-react';
import { Check, CheckCheck, Mic, Paperclip, Smile } from 'lucide-react';

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
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm text-[11px] leading-snug ${
          isOut ? 'bg-[#d9fdd3] text-slate-800' : 'bg-white text-slate-800'
        }`}
      >
        {item.text && <p className="whitespace-pre-line">{item.text}</p>}

        {item.menu && (
          <div className="mt-1.5 space-y-1">
            {item.menu.map((m, i) => (
              <div key={m} className={`text-[11px] ${t.accent} font-medium`}>
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

        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[8px] text-slate-400">{item.time ?? '10:31 AM'}</span>
          {isOut && <CheckCheck className="w-2.5 h-2.5 text-sky-500" />}
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

        {/* Photo + phone mockup, SIDE BY SIDE — the phone overlaps the photo's
            edge for depth but never covers the face. Without a photo the mockup
            simply centres itself. */}
        <div className={`relative flex justify-center ${photo ? 'md:justify-start md:pl-4' : ''}`}>
          {photo && (
            <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-[52%] max-w-[240px]">
              <img
                src={photo}
                alt={photoAlt || ''}
                loading="lazy"
                decoding="async"
                className="w-full h-auto rounded-2xl shadow-xl object-cover"
              />
            </div>
          )}

          <div
            className={`relative z-10 w-full max-w-[300px] rounded-[34px] bg-slate-900 p-2 shadow-2xl border-4 border-slate-800 ${
              photo ? 'md:max-w-[260px]' : ''
            }`}
          >
            <div className="rounded-[26px] overflow-hidden bg-[#efe7de]">
              {/* Status bar */}
              <div className="bg-[#075e54] px-3 pt-2 pb-0 flex items-center justify-between text-[9px] text-white/90">
                <span>10:31</span>
                <span className="flex items-center gap-1">
                  <span className="tracking-tighter">▂▄▆</span>
                  <span>100%</span>
                </span>
              </div>
              {/* Chat header */}
              <div className="bg-[#075e54] px-3 py-2 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white/20 text-white text-[10px] font-bold flex items-center justify-center">
                  {clinicName.charAt(0)}
                </span>
                <div className="leading-tight min-w-0">
                  <div className="text-white text-[11px] font-semibold flex items-center gap-1 truncate">
                    {clinicName}
                    <Check className="w-2.5 h-2.5 text-emerald-300" />
                  </div>
                  <div className="text-emerald-100 text-[8px]">online</div>
                </div>
              </div>

              {/* Messages */}
              <div className="p-2.5 space-y-1.5 min-h-[300px] max-h-[340px] overflow-hidden">
                {chat.map((item, i) => (
                  <Bubble key={i} item={item} tone={tone} />
                ))}
              </div>

              {/* Composer */}
              <div className="bg-[#f0f0f0] px-2 py-1.5 flex items-center gap-1.5">
                <div className="flex-1 bg-white rounded-full px-2.5 py-1.5 flex items-center gap-1.5">
                  <Smile className="w-3 h-3 text-slate-400" />
                  <span className="text-[9px] text-slate-400">Type a message</span>
                  <Paperclip className="w-3 h-3 text-slate-400 ml-auto" />
                </div>
                <span className="w-7 h-7 rounded-full bg-[#25d366] flex items-center justify-center">
                  <Mic className="w-3.5 h-3.5 text-white" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
