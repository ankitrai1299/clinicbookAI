import React from 'react';
import { useEffect, useState } from 'react';
import { Languages as LanguagesIcon, Mic, FileText, Activity } from 'lucide-react';
import { LanguageUsageRow, SUPPORTED_LANGUAGES } from '../../../contracts';
import { getLanguages } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, Card, LoadingState, ErrorState } from '../ui';
import { CHART_PALETTE } from '../charts/ChartCard';

export default function LanguagesSection() {
  const { token } = useAuth();
  const [rows, setRows] = useState<LanguageUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    getLanguages(token)
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <LoadingState />;
  if (error) return <Page><ErrorState message={error} /></Page>;

  // Ensure all 10 supported languages appear, backfilling zeros for any the
  // server did not return.
  const byCode = new Map<string, LanguageUsageRow>(rows.map((r) => [r.code, r]));
  const ordered: LanguageUsageRow[] = SUPPORTED_LANGUAGES.map((l) => {
    const existing = byCode.get(l.code);
    if (existing) return existing;
    return { code: l.code, name: l.name, consultations: 0, sttRequests: 0, reports: 0, percentage: 0 };
  });

  return (
    <Page>
      <SectionHeader title="Language Dashboard" description="Usage across all supported languages." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ordered.map((l, i) => {
          const color = CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <Card key={l.code} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    <LanguagesIcon size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">{l.name}</div>
                    <div className="text-xs text-slate-400 uppercase">{l.code}</div>
                  </div>
                </div>
                <span className="text-lg font-bold text-slate-800">{l.percentage}%</span>
              </div>

              <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-4">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(l.percentage, 100)}%`, backgroundColor: color }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat icon={<Activity size={14} />} value={l.consultations} label="Consults" />
                <Stat icon={<Mic size={14} />} value={l.sttRequests} label="STT" />
                <Stat icon={<FileText size={14} />} value={l.reports} label="Reports" />
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-slate-50 rounded-lg py-2">
      <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">{icon}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
