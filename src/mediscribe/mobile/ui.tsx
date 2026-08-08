import React from 'react';

// Shared pieces for the phone app's screens. Kept in one file so the header,
// the chips and the date arithmetic can't drift apart between tabs.

/** Initials for an avatar circle, ignoring a leading "Dr.". */
export const initials = (name?: string): string =>
  (name || 'P')
    .replace(/^dr\.?\s*/i, '')
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The doctor's name without a leading "Dr." — callers re-add it themselves. */
export const bareName = (name?: string): string => (name || '').replace(/^dr\.?\s*/i, '').trim();

export const greeting = (d: Date = new Date()): string => {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Local YYYY-MM-DD. Never toISOString — that silently shifts the day in IST. */
export const localDay = (d: Date = new Date()): string => d.toLocaleDateString('en-CA');

/**
 * "09:45 AM" → minutes since midnight, or null when it isn't a time we can read.
 * Null matters: a slot we can't place must not be treated as midnight, which
 * would make every unparseable appointment look overdue.
 */
export const minutesOfDay = (time?: string): number | null => {
  const m = (time || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

export const nowMinutes = (d: Date = new Date()): number => d.getHours() * 60 + d.getMinutes();

/** "in 15 min" / "in 2h 10m" — for a slot that is still ahead. */
export const relativeIn = (deltaMin: number): string => {
  if (deltaMin < 60) return `in ${deltaMin} min`;
  const h = Math.floor(deltaMin / 60);
  const m = deltaMin % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
};

/** Parses whatever timestamp a record carries; NaN-safe. */
export const recordTime = (r: { updatedAt?: string; createdAt?: string; date?: string }): number => {
  const raw = r?.updatedAt || r?.createdAt || r?.date;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

export type RangeKey = 'all' | 'today' | 'week' | 'month';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

/**
 * Is this timestamp inside the chosen range? "This week" counts back seven days
 * rather than to Monday — a doctor scanning on a Monday morning wants the week
 * they just worked, not an empty list.
 */
export const inRange = (ts: number, range: RangeKey, now: Date = new Date()): boolean => {
  if (range === 'all') return true;
  if (!ts) return false;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'today') return ts >= start.getTime();
  if (range === 'week') return ts >= start.getTime() - 6 * 86_400_000;
  return ts >= start.getTime() - 29 * 86_400_000;
};

/** Screen header: a title, an optional back arrow, an optional right slot. */
export const ScreenHeader = ({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) => (
  <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
    {onBack && (
      <button onClick={onBack} aria-label="Back" className="text-slate-500 -ml-1 p-1">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )}
    <h1 className="text-[22px] font-bold tracking-tight text-slate-900 flex-1 truncate">{title}</h1>
    {right}
  </div>
);

/** Search field used by the Notes and Prescriptions lists. */
export const SearchBar = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) => (
  <div className="relative">
    <svg
      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
    />
  </div>
);

/** All / Today / This Week / This Month. */
export const RangeChips = ({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
    {RANGES.map((r) => (
      <button
        key={r.key}
        onClick={() => onChange(r.key)}
        className={`flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
          value === r.key
            ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30'
            : 'bg-white text-slate-500 border border-slate-200'
        }`}
      >
        {r.label}
      </button>
    ))}
  </div>
);

export const EmptyState = ({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) => (
  <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
    <div className="w-14 h-14 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center mx-auto mb-3">
      {icon}
    </div>
    <p className="font-bold text-slate-700">{title}</p>
    {hint && <p className="text-[13px] text-slate-400 mt-1">{hint}</p>}
  </div>
);
