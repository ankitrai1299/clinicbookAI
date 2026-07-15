import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SearchBar, EmptyState } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getAdminReports, deleteReport } from '../../src/services/api';
import { ReportRecord } from '../../src/types';
import { colors } from '../../src/theme';

export default function AdminReportsScreen() {
  const router = useRouter();
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('reports.manage');

  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      setLoading(true);
      try {
        setReports(await getAdminReports(search, token));
      } catch {
        setReports([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const onDelete = (r: ReportRecord) => {
    if (!canManage) return;
    Alert.alert('Delete report', `Delete the report for ${r.patientName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteReport(r.id, token);
            load(query);
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Try again.');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen title="Reports" subtitle={`${reports.length} report${reports.length === 1 ? '' : 's'}`} permission="reports.view">
      <View className="px-5 pt-4 pb-2">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search reports by patient..." />
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(query)} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && reports.length === 0 ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : reports.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No reports" subtitle={query ? 'No reports match your search.' : 'Generated reports will appear here.'} />
        ) : (
          <View className="gap-2.5">
            {reports.map((r) => (
              <Card key={r.id} className="p-4" elevation="sm">
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/admin/report/${r.id}`)}>
                  <View className="flex-row items-center">
                    <View className="w-11 h-11 rounded-2xl bg-brand-50 items-center justify-center">
                      <Ionicons name="document-text-outline" size={20} color={colors.brand} />
                    </View>
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>{r.patientName}</Text>
                      <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                        {r.report?.chiefComplaint?.find(Boolean) || 'Clinical report'}
                      </Text>
                      <Text className="text-[11px] text-slate-400 mt-1">{r.date}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                  </View>
                </TouchableOpacity>
                {canManage ? (
                  <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100">
                    <ActionChip icon="eye-outline" label="Open" tint={colors.brand} onPress={() => router.push(`/admin/report/${r.id}`)} />
                    <ActionChip icon="trash-outline" label="Delete" tint={colors.error} onPress={() => onDelete(r)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </AdminScreen>
  );
}

function ActionChip({ icon, label, onPress, tint = colors.slate600 }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tint?: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} className="flex-row items-center gap-1 bg-slate-50 rounded-xl px-3 py-1.5">
      <Ionicons name={icon} size={14} color={tint} />
      <Text className="text-xs font-semibold" style={{ color: tint }}>{label}</Text>
    </TouchableOpacity>
  );
}
