import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { StatCard, SectionLabel, ErrorBanner } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { LineChart, DonutChart, RankBars } from '../../src/components/admin/charts';
import { useAuth } from '../../src/context/Auth';
import { getAnalytics } from '../../src/services/api';
import { AdminAnalytics } from '../../src/contracts';
import { colors } from '../../src/theme';

export default function AnalyticsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getAnalytics(token));
    } catch (e: any) {
      setError(e?.message || 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminScreen title="Analytics" subtitle="Trends & clinical insights" permission="analytics.view">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        {!data ? (
          <View className="items-center py-20"><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <>
            {/* Headline KPIs */}
            <View className="flex-row justify-between" style={{ gap: 12 }}>
              <StatCard icon="documents-outline" iconBg="bg-brand-50" iconColor={colors.brand} value={data.consultationCount} label="Consultations" width="47.5%" />
              <StatCard icon="stopwatch-outline" iconBg="bg-accent-50" iconColor={colors.accent} value={`${data.averageConsultationDurationMin} min`} label="Avg. Duration" width="47.5%" />
            </View>

            {/* STT accuracy */}
            <SectionLabel>Speech Recognition</SectionLabel>
            <LineChart title="STT Accuracy" subtitle="Average confidence %" icon="mic-outline" data={data.sttAccuracy} color={colors.warning} suffix="%" />

            {/* Language usage */}
            <SectionLabel>Language Usage</SectionLabel>
            <DonutChart title="Consultations by Language" data={data.languageUsage} />

            {/* Ranked clinical lists */}
            <SectionLabel>Top Clinical Codes</SectionLabel>
            <RankBars title="Most Used Medicines" icon="medkit-outline" data={data.mostUsedMedicines} color={colors.brand} emptyLabel="No medicines recorded" />
            <RankBars title="Most Used Diagnoses" icon="medical-outline" data={data.mostUsedDiagnoses} color={colors.accent} emptyLabel="No diagnoses recorded" />
            <RankBars title="Most Used ICD Codes" icon="pricetag-outline" data={data.mostUsedIcdCodes} color={colors.successDark} emptyLabel="No ICD codes recorded" />
            <RankBars title="Most Used LOINC Tests" icon="flask-outline" data={data.mostUsedLoincTests} color={colors.warningDark} emptyLabel="No LOINC tests recorded" />

            {/* Doctor activity */}
            <SectionLabel>Doctor Activity</SectionLabel>
            <RankBars title="Consultations per Doctor" icon="podium-outline" data={data.doctorActivity} color={colors.brand} emptyLabel="No doctor activity yet" />
          </>
        )}
      </ScrollView>
    </AdminScreen>
  );
}
