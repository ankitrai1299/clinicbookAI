import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SearchBar, Avatar, Tabs, EmptyState, Chip } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getAdminConsultations, retryConsultation, deleteConsultation } from '../../src/services/api';
import { Consultation } from '../../src/types';
import { ConsultationBucket } from '../../src/contracts';
import { colors } from '../../src/theme';

const BUCKETS: { label: string; value: ConsultationBucket }[] = [
  { label: 'Live', value: 'live' },
  { label: 'Previous', value: 'previous' },
  { label: 'Draft', value: 'draft' },
  { label: 'Failed', value: 'failed' },
];

const label = (c: Consultation): string =>
  c.report?.chiefComplaint?.find(Boolean) ||
  (c.transcript || []).map((l) => l.text).join(' ').trim() ||
  c.transcriptText ||
  'Consultation';

export default function ConsultationsScreen() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('consultations.manage');

  const [tab, setTab] = useState('Live');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(false);

  const bucket = BUCKETS.find((b) => b.label === tab)?.value || 'live';

  const load = useCallback(
    async (b: ConsultationBucket, search: string) => {
      if (!token) return;
      setLoading(true);
      try {
        setItems(await getAdminConsultations(b, search, token));
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => load(bucket, query), 300);
    return () => clearTimeout(t);
  }, [bucket, query, load]);

  const onRetry = async (c: Consultation) => {
    try {
      await retryConsultation(c.id, token);
      Alert.alert('Retry started', 'The consultation was re-queued for processing.');
      load(bucket, query);
    } catch (e: any) {
      Alert.alert('Retry failed', e?.message || 'Try again.');
    }
  };

  const onDelete = (c: Consultation) => {
    Alert.alert('Delete consultation', `Delete this consultation for ${c.patientName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteConsultation(c.id, token);
            load(bucket, query);
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Try again.');
          }
        },
      },
    ]);
  };

  const canRetry = bucket === 'failed' || bucket === 'draft';

  return (
    <AdminScreen title="Consultations" subtitle={`${items.length} in ${tab.toLowerCase()}`} permission="consultations.view">
      <View className="px-5 pt-4 gap-3">
        <Tabs tabs={BUCKETS.map((b) => b.label)} active={tab} onChange={setTab} />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by patient..." />
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(bucket, query)} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && items.length === 0 ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <EmptyState icon="pulse-outline" title={`No ${tab.toLowerCase()} consultations`} subtitle="Nothing to show in this bucket right now." />
        ) : (
          <View className="gap-2.5">
            {items.map((c) => {
              const hasTranscript = !!(c.transcript?.length || c.transcriptText);
              const hasReport = !!c.report;
              return (
                <Card key={c.id} className="p-4" elevation="sm">
                  <View className="flex-row items-center">
                    <Avatar name={c.patientName} size={44} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>{c.patientName || 'Unknown Patient'}</Text>
                      <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{label(c)}</Text>
                      <Text className="text-[11px] text-slate-400 mt-1">{c.date}</Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-1.5 mt-3">
                    <Chip label={hasTranscript ? 'Transcript ready' : 'No transcript'} tone={hasTranscript ? 'success' : 'neutral'} icon={hasTranscript ? 'checkmark-circle' : 'ellipse-outline'} />
                    <Chip label={hasReport ? 'Report ready' : 'No report'} tone={hasReport ? 'brand' : 'neutral'} icon={hasReport ? 'clipboard' : 'ellipse-outline'} />
                    <Chip label={c.status} tone={c.status === 'Completed' ? 'success' : c.status === 'Recording' ? 'error' : 'warning'} />
                  </View>
                  {canManage ? (
                    <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100">
                      {canRetry ? <ActionChip icon="refresh-outline" label="Retry" tint={colors.brand} onPress={() => onRetry(c)} /> : null}
                      <ActionChip icon="trash-outline" label="Delete" tint={colors.error} onPress={() => onDelete(c)} />
                    </View>
                  ) : null}
                </Card>
              );
            })}
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
