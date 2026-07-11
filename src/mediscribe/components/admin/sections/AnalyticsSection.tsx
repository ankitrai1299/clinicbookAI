import { useEffect, useState } from 'react';
import { Activity, Clock, Pill, Stethoscope, FileCode, FlaskConical } from 'lucide-react';
import { AdminAnalytics, NamedCount } from '../../../contracts';
import { getAnalytics } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, MetricCard, Card, LoadingState, ErrorState } from '../ui';
import LineChartCard from '../charts/LineChartCard';
import DonutChart from '../charts/DonutChart';
import { CHART, CHART_PALETTE } from '../charts/ChartCard';

export default function AnalyticsSection() {
  const { token } = useAuth();
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    getAnalytics(token)
      .then((a) => !cancelled && setAnalytics(a))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <LoadingState />;
  if (error) return <Page><ErrorState message={error} /></Page>;
  if (!analytics) return null;

  return (
    <Page>
      <SectionHeader title="Analytics" description="Clinical usage insights across the platform." />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Total Consultations"
          value={analytics.consultationCount}
          icon={Activity}
          color="bg-blue-50 text-blue-600"
        />
        <MetricCard
          label="Avg. Consultation Duration"
          value={`${analytics.averageConsultationDurationMin} min`}
          icon={Clock}
          color="bg-indigo-50 text-indigo-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <LineChartCard title="STT Accuracy" subtitle="Average confidence %" data={analytics.sttAccuracy} color={CHART.amber} unit="%" />
        <DonutChart title="Language Usage" subtitle="Consultations by language" data={analytics.languageUsage} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankedList title="Most Used Medicines" icon={Pill} data={analytics.mostUsedMedicines} />
        <RankedList title="Most Used Diagnoses" icon={Stethoscope} data={analytics.mostUsedDiagnoses} />
        <RankedList title="Most Used ICD Codes" icon={FileCode} data={analytics.mostUsedIcdCodes} />
        <RankedList title="Most Used LOINC Tests" icon={FlaskConical} data={analytics.mostUsedLoincTests} />
      </div>
    </Page>
  );
}

function RankedList({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: typeof Pill;
  data: NamedCount[];
}) {
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, 10);
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className="text-blue-500" />
        <h3 className="font-semibold text-slate-800">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center">No data yet</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.name} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-slate-700 truncate">{r.name}</span>
                  <span className="text-xs font-semibold text-slate-500 ml-2">{r.value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(r.value / max) * 100}%`, backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
