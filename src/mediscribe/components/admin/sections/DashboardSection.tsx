import { useEffect, useState } from 'react';
import {
  Stethoscope,
  UserCheck,
  Users,
  Activity,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileClock,
  IndianRupee,
  UserCog,
  Mic,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import { AdminOverview, AdminAnalytics } from '../../../contracts';
import { getOverview, getAnalytics } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, MetricCard, LoadingState, ErrorState, formatBytes } from '../ui';
import LineChartCard from '../charts/LineChartCard';
import AreaChartCard from '../charts/AreaChartCard';
import BarChartCard from '../charts/BarChartCard';
import DonutChart from '../charts/DonutChart';
import { CHART } from '../charts/ChartCard';

export default function DashboardSection() {
  const { token, hasPermission } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAnalytics = hasPermission('analytics.view');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getOverview(token),
      canAnalytics ? getAnalytics(token) : Promise.resolve(null),
    ])
      .then(([o, a]) => {
        if (cancelled) return;
        setOverview(o);
        setAnalytics(a);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, canAnalytics]);

  if (loading) return <LoadingState />;
  if (error) return <Page><ErrorState message={error} /></Page>;
  if (!overview) return null;

  const metrics = [
    { label: 'Total Doctors', value: overview.totalDoctors, icon: Stethoscope, color: 'bg-blue-50 text-blue-600' },
    { label: 'Active Doctors', value: overview.activeDoctors, icon: UserCheck, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total Patients', value: overview.totalPatients, icon: Users, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Total Consultations', value: overview.totalConsultations, icon: Activity, color: 'bg-purple-50 text-purple-600' },
    { label: "Today's Consultations", value: overview.todayConsultations, icon: CalendarDays, color: 'bg-amber-50 text-amber-600' },
    { label: 'Monthly Consultations', value: overview.monthlyConsultations, icon: CalendarRange, color: 'bg-sky-50 text-sky-600' },
    { label: 'Reports Generated', value: overview.reportsGenerated, icon: ClipboardList, color: 'bg-teal-50 text-teal-600' },
    { label: 'Draft Reports', value: overview.draftReports, icon: FileClock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Total Revenue', value: '₹0', hint: 'Billing coming soon', icon: IndianRupee, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Active Users', value: overview.activeUsers, icon: UserCog, color: 'bg-blue-50 text-blue-600' },
    { label: 'STT Requests', value: overview.sttRequests, icon: Mic, color: 'bg-rose-50 text-rose-600' },
    { label: 'AI Report Requests', value: overview.aiReportRequests, icon: Sparkles, color: 'bg-purple-50 text-purple-600' },
    { label: 'Storage Used', value: formatBytes(overview.storageUsedBytes), icon: HardDrive, color: 'bg-slate-100 text-slate-600' },
  ];

  return (
    <Page>
      <SectionHeader title="Admin Dashboard" description="Platform-wide overview and analytics." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {metrics.map((m) => (
          <MetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            icon={m.icon}
            color={m.color}
            hint={m.hint}
          />
        ))}
      </div>

      {canAnalytics && analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AreaChartCard title="Daily Consultations" subtitle="Last 14 days" data={analytics.dailyConsultations} color={CHART.blue} />
          <BarChartCard title="Weekly Usage" subtitle="Last 8 weeks" data={analytics.weeklyUsage} color={CHART.indigo} />
          <BarChartCard title="Monthly Analytics" subtitle="Last 6 months" data={analytics.monthlyAnalytics} color={CHART.purple} />
          <DonutChart title="Language Usage" subtitle="Consultations by language" data={analytics.languageUsage} />
          <LineChartCard title="AI Report Usage" subtitle="Reports generated over time" data={analytics.aiReportUsage} color={CHART.emerald} />
          <LineChartCard title="STT Accuracy" subtitle="Average confidence %" data={analytics.sttAccuracy} color={CHART.amber} unit="%" />
          <BarChartCard title="Doctor Activity" subtitle="Consultations per doctor" data={analytics.doctorActivity} horizontal multicolor />
          <AreaChartCard title="Patient Growth" subtitle="Cumulative patients" data={analytics.patientGrowth} color={CHART.indigo} />
        </div>
      )}
    </Page>
  );
}
