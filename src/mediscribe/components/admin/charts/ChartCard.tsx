import { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** When true, an empty-state placeholder replaces the chart body. */
  empty?: boolean;
  emptyLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Height of the chart area in px. */
  height?: number;
}

// Shared white rounded-2xl wrapper for every admin chart. Renders a tasteful
// "No data yet" empty state so an all-zero series never shows an empty axis box.
export default function ChartCard({
  title,
  subtitle,
  empty,
  emptyLabel = 'No data yet',
  action,
  children,
  height = 260,
}: ChartCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {empty ? (
        <div
          className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2"
          style={{ height }}
        >
          <BarChart3 size={28} className="text-slate-300" />
          <span className="text-sm font-medium">{emptyLabel}</span>
        </div>
      ) : (
        <div style={{ width: '100%', height }}>{children}</div>
      )}
    </div>
  );
}

// Shared chart theme tokens so every chart reads as one system.
export const CHART = {
  blue: '#2563eb',
  indigo: '#6366f1',
  emerald: '#10b981',
  purple: '#a855f7',
  amber: '#f59e0b',
  grid: '#e2e8f0',
  axis: '#94a3b8',
};

// Categorical palette for donut / multi-series charts.
export const CHART_PALETTE = [
  '#2563eb',
  '#6366f1',
  '#a855f7',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
  '#8b5cf6',
  '#0ea5e9',
];

// A series is "empty" when it has no points or every value is zero.
export function isEmptySeries(data: { value: number }[] | undefined | null): boolean {
  if (!data || data.length === 0) return true;
  return data.every((d) => !d.value);
}

// Compact tooltip matching the app's card styling.
export const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
    fontSize: 12,
  },
  labelStyle: { color: '#0f172a', fontWeight: 600 },
};
