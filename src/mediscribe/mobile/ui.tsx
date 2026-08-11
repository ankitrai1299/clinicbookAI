import React from 'react';

// Shared pieces for the phone app's screens, in the design language of the
// native MediScribe app: one restrained indigo used only on the primary action,
// calm white cards on a near-white canvas, a hairline border, and colour
// reserved for meaning rather than decoration.
//
//   brand    #5B5CEB   the single accent
//   canvas   #FAFBFC   app background
//   surface  #FFFFFF   cards
//   border   #E8ECF2   hairline
//
// Tailwind has no #5B5CEB, so the brand appears as explicit arbitrary values
// ([#5B5CEB]) rather than an approximate indigo-600 — the whole point of the
// palette is that it is ONE colour, so it must be the same one everywhere.

export const BRAND = '#5B5CEB';

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
  if (deltaMin <= 0) return 'now';
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

// ── Date range ──────────────────────────────────────────────────────────────

export type RangeKey = 'today' | 'week' | 'month' | 'all';

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All' }
];

/** Start of a range, as a timestamp. `all` starts at the epoch. */
export const rangeStart = (range: RangeKey, now: Date = new Date()): number => {
  if (range === 'all') return 0;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'today') return start.getTime();
  return start.getTime() - (range === 'week' ? 6 : 29) * 86_400_000;
};

export const inRange = (ts: number, range: RangeKey, now: Date = new Date()): boolean =>
  range === 'all' ? true : Boolean(ts) && ts >= rangeStart(range, now);

/**
 * The equal-length window immediately BEFORE `range`, for a period-over-period
 * comparison. Returns null for 'all', which has nothing before it — a trend
 * against "all time" would be meaningless, so no chip is shown.
 */
export const previousWindow = (range: RangeKey, now: Date = new Date()): { from: number; to: number } | null => {
  if (range === 'all') return null;
  const to = rangeStart(range, now);
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  return { from: to - days * 86_400_000, to };
};

export type Trend = { pct: number; up: boolean } | 'new' | null;

/**
 * Direction and size of the change from the previous equal-length period.
 * 'new' when there was nothing before to compare against; null when unchanged
 * or unknowable — so a chip appears only when it actually means something,
 * never as decoration.
 */
export const trendOf = (current: number, previous: number | null): Trend => {
  if (previous === null) return null;
  if (previous === 0) return current > 0 ? 'new' : null;
  if (current === previous) return null;
  return { pct: Math.round(((current - previous) / previous) * 100), up: current > previous };
};

// ── Components ──────────────────────────────────────────────────────────────

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}> = ({ children, className = '', onClick }) => {
  const cls = `bg-white rounded-2xl border border-[#E8ECF2] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`;
  return onClick ? (
    <button onClick={onClick} className={`${cls} text-left w-full active:scale-[0.995] transition-transform`}>
      {children}
    </button>
  ) : (
    <div className={cls}>{children}</div>
  );
};

export const Avatar = ({ name, size = 44 }: { name?: string; size?: number }) => (
  <span
    className="rounded-full bg-[#EEEFFE] text-[#5B5CEB] font-bold flex items-center justify-center flex-shrink-0"
    style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
  >
    {initials(name)}
  </span>
);

/** Consultation status, in the one place that decides its colour. */
export const StatusBadge = ({ status }: { status?: string }) => {
  const s = (status || '').toLowerCase();
  const style =
    s === 'completed'
      ? 'bg-[#ECFAF1] text-[#16A34A]'
      : s === 'recording' || s === 'processing'
        ? 'bg-[#EEEFFE] text-[#4A4BD4]'
        : 'bg-[#FEF8EB] text-[#D97706]';
  const label = s === 'completed' ? 'Completed' : s === 'recording' ? 'Recording' : s === 'processing' ? 'Processing' : 'Draft';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${style}`}>{label}</span>;
};

export const TrendChip = ({ trend }: { trend: Trend }) => {
  if (!trend) return null;
  if (trend === 'new') {
    return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#EEEFFE] text-[#4A4BD4]">New</span>;
  }
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 ${
        trend.up ? 'bg-[#ECFAF1] text-[#15803D]' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {trend.up ? '↑' : '↓'}
      {Math.abs(trend.pct)}%
    </span>
  );
};

export const StatCard: React.FC<{
  icon: React.ReactNode;
  tint: string;
  bg: string;
  value: number | string;
  label: string;
  trend?: Trend;
  onClick?: () => void;
}> = ({ icon, tint, bg, value, label, trend, onClick }) => (
  <Card className="p-4" onClick={onClick}>
    <div className="flex items-start justify-between">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} ${tint}`}>{icon}</span>
      <TrendChip trend={trend ?? null} />
    </div>
    <div className="text-[28px] font-bold text-slate-900 mt-3 tracking-tight leading-9">{value}</div>
    <div className="text-[12.5px] font-medium text-slate-500 mt-0.5 truncate">{label}</div>
    {onClick && <div className="text-[11.5px] font-semibold text-[#5B5CEB] mt-2">View details →</div>}
  </Card>
);

export const SectionHeader = ({
  title,
  action,
  onAction
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">{title}</h2>
    {action && onAction && (
      <button onClick={onAction} className="text-[13px] font-semibold text-[#5B5CEB]">
        {action}
      </button>
    )}
  </div>
);

export const ScreenHeader = ({
  title,
  onBack,
  right
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) => (
  <div className="sticky top-0 z-20 bg-[#FAFBFC]/95 backdrop-blur px-5 pt-4 pb-3 flex items-center gap-3">
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

export const SearchBar = ({
  value,
  onChange,
  placeholder
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
      className="w-full pl-10 pr-4 py-3 bg-white border border-[#E8ECF2] rounded-2xl text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5B5CEB]/15 focus:border-[#5B5CEB]"
    />
  </div>
);

/** Today / 7 days / 30 days / All — the period every stat on a screen obeys. */
export const DateRangeBar = ({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) => (
  <div className="flex gap-1.5 p-1 bg-white border border-[#E8ECF2] rounded-2xl mb-3">
    {RANGES.map((r) => (
      <button
        key={r.key}
        onClick={() => onChange(r.key)}
        className={`flex-1 py-2 rounded-xl text-[12.5px] font-semibold transition-colors ${
          value === r.key ? 'bg-[#5B5CEB] text-white' : 'text-slate-500'
        }`}
      >
        {r.label}
      </button>
    ))}
  </div>
);

/** Filter chips used by the list screens. */
export const Chips = <T extends string>({
  value,
  onChange,
  options
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
    {options.map((o) => (
      <button
        key={o.key}
        onClick={() => onChange(o.key)}
        className={`flex-shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold transition-colors ${
          value === o.key ? 'bg-[#5B5CEB] text-white' : 'bg-white text-slate-500 border border-[#E8ECF2]'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const EmptyState = ({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) => (
  <Card className="p-8 text-center">
    <div className="w-14 h-14 rounded-full bg-[#EEEFFE] text-[#5B5CEB] flex items-center justify-center mx-auto mb-3">
      {icon}
    </div>
    <p className="font-bold text-slate-700">{title}</p>
    {hint && <p className="text-[13px] text-slate-400 mt-1">{hint}</p>}
  </Card>
);

export const WarningBanner = ({ title, message }: { title: string; message: string }) => (
  <div className="flex items-start gap-2.5 p-3.5 rounded-2xl border border-amber-200 bg-[#FEF8EB] mb-5">
    <span className="text-amber-600 shrink-0 mt-0.5">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
    </span>
    <div className="text-[13px]">
      <div className="font-bold text-amber-900">{title}</div>
      <p className="text-amber-800 mt-0.5 leading-snug">{message}</p>
    </div>
  </div>
);
