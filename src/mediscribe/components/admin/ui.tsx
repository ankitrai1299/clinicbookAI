import { FC, ReactNode } from 'react';
import { motion } from 'motion/react';
import { X, AlertTriangle, LucideIcon } from 'lucide-react';

// ── Page shell ───────────────────────────────────────────────
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 sm:p-8 max-w-7xl mx-auto"
    >
      {children}
    </motion.div>
  );
}

// ── Metric card (matches DashboardView) ──────────────────────
export const MetricCard: FC<{
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  color: string;
  hint?: string;
}> = ({ label, value, icon: Icon, color, hint }) => {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-900 truncate">{value}</div>
        <div className="text-sm font-medium text-slate-500 truncate">{label}</div>
        {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
      </div>
    </div>
  );
};

// ── Status badge ─────────────────────────────────────────────
type Tone = 'emerald' | 'amber' | 'red' | 'blue' | 'slate';
const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

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

export function GhostButton({
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
      className={`bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  );
}

// Shared input class string (matches PatientSelectModal / GenericListView).
export const inputClass =
  'w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`bg-white rounded-2xl shadow-xl w-full overflow-hidden flex flex-col max-h-[90vh] ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto custom-scrollbar">{children}</div>
      </motion.div>
    </div>
  );
}

// ── Confirm dialog ───────────────────────────────────────────
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-500 mt-1">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex gap-3 justify-end">
            <GhostButton onClick={onCancel} disabled={busy}>
              Cancel
            </GhostButton>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-semibold shadow-sm transition-colors"
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── States ───────────────────────────────────────────────────
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

export function EmptyState({ icon: Icon, label }: { icon?: LucideIcon; label: string }) {
  return (
    <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
      {Icon && <Icon size={32} className="text-slate-300" />}
      {label}
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
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
