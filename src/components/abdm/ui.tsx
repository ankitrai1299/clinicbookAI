// The handful of building blocks the ABDM screen needs.
//
// Copied from the scribe's admin kit rather than imported from it. Sixty lines
// of Tailwind wrappers duplicated is a smaller price than ClinicBook reaching
// into MediScribe's internals for them: the two products are meant to be
// separable, and a shared import here is the kind that is never noticed until
// one of them has to move.

import { FC, ReactNode } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

type Tone = 'slate' | 'green' | 'emerald' | 'amber' | 'red' | 'blue';

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-50 text-slate-600 border-slate-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-sky-50 text-sky-700 border-sky-200'
};

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="text-slate-500 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  // The entrance animation came from framer-motion, which this side of the app
  // does not carry, so the wrapper is a plain div.
  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      {children}
    </div>
  );
}

// ── Metric card (matches DashboardView) ──────────────────────

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${TONES[tone]}`}>
      {children}
    </span>
  );
}

// ── Buttons ──────────────────────────────────────────────────

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  );
}

export const inputClass =
  'w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="p-12 text-center text-slate-500">{label}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium flex items-center gap-2">
      <AlertTriangle size={18} /> {message}
    </div>
  );
}

export const Card: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────
