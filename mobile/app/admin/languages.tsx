import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, ErrorBanner } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getLanguages } from '../../src/services/api';
import { LanguageUsageRow, SUPPORTED_LANGUAGES } from '../../src/contracts';
import { colors } from '../../src/theme';

// Merge server rows with the canonical 10-language list so every supported
// language shows even at zero usage, in display order.
function mergeRows(rows: LanguageUsageRow[]): LanguageUsageRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return SUPPORTED_LANGUAGES.map(
    (l) =>
      byCode.get(l.code) || { code: l.code, name: l.name, consultations: 0, sttRequests: 0, reports: 0, percentage: 0 },
  );
}

export default function LanguagesScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<LanguageUsageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(mergeRows(await getLanguages(token)));
    } catch (e: any) {
      setError(e?.message || 'Could not load language usage.');
      setRows(mergeRows([]));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const totalConsults = (rows || []).reduce((a, b) => a + b.consultations, 0);

  return (
    <AdminScreen title="Language Dashboard" subtitle="Usage across 10 languages" permission="analytics.view">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        {!rows ? (
          <View className="items-center py-20"><ActivityIndicator color={colors.brand} /></View>
        ) : totalConsults === 0 ? (
          <EmptyState icon="language-outline" title="No language usage yet" subtitle="Usage appears here once consultations are recorded." />
        ) : (
          rows.map((r) => {
            const pct = Math.max(0, Math.min(100, Math.round(r.percentage)));
            return (
              <Card key={r.code} className="p-4" elevation="sm">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2">
                    <View className="w-9 h-9 rounded-2xl bg-brand-50 items-center justify-center">
                      <Text className="text-[11px] font-bold text-brand-600 uppercase">{r.code}</Text>
                    </View>
                    <Text className="font-bold text-slate-900 text-[15px]">{r.name}</Text>
                  </View>
                  <Text className="text-[15px] font-bold text-brand-600">{pct}%</Text>
                </View>
                <View className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <View className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max(2, pct)}%` }} />
                </View>
                <View className="flex-row gap-4 mt-3">
                  <Metric icon="documents-outline" label="Consultations" value={r.consultations} />
                  <Metric icon="mic-outline" label="STT" value={r.sttRequests} />
                  <Metric icon="document-text-outline" label="Reports" value={r.reports} />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </AdminScreen>
  );
}

function Metric({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Ionicons name={icon} size={14} color={colors.slate400} />
      <Text className="text-xs text-slate-500">{label}</Text>
      <Text className="text-xs font-bold text-slate-800">{value}</Text>
    </View>
  );
}
