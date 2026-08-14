// Today's Consultations — the drill-down behind the first dashboard card.
import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppData } from '../../src/context/AppData';
import { useTranslation } from 'react-i18next';
import { useDateFilter } from '../../src/context/DateFilter';
import { useRangedConsultations } from '../../src/hooks/useRangedConsultations';
import { Avatar, StatusBadge } from '../../src/components/ui';
import { ListScreen, ListRow } from '../../src/components/ListScreen';
import { patientOf, demographics, formatTime, sessionTime } from '../../src/utils/dashboard';
import { colors } from '../../src/theme';

export default function TodayScreen() {
  const router = useRouter();
  // Patients still come from the app-wide cache — age and gender live on the
  // patient record, and it is small enough to hold in memory. The consultations
  // themselves are filtered by the server.
  const { t } = useTranslation();
  const { patients } = useAppData();
  const { range } = useDateFilter();
  const { consultations, loading, error, reload } = useRangedConsultations(range);
  const rows = [...consultations].sort((a, b) => sessionTime(b) - sessionTime(a));

  return (
    <ListScreen
      title={t('lists.today.title')}
      count={rows.length}
      loading={loading}
      error={error}
      onRefresh={reload}
      isEmpty={rows.length === 0}
      emptyIcon="today-outline"
      emptyTitle={t('lists.today.emptyTitle')}
      emptySubtitle="Try a wider date range, or start a new consultation."
    >
      {rows.map((c) => {
        const patient = patientOf(patients, c);
        const demo = demographics(patient);
        return (
          <ListRow key={c.id} onPress={() => router.push(`/consultation/${c.id}`)}>
            <Avatar name={c.patientName} />
            <View className="flex-1 ml-3">
              <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                {c.patientName || t('common.unknownPatient')}
              </Text>
              {demo ? <Text className="text-xs text-slate-500 mt-0.5">{demo}</Text> : null}
              <View className="flex-row items-center gap-1.5 mt-1.5">
                <Ionicons name="time-outline" size={12} color={colors.slate400} />
                <Text className="text-xs text-slate-400">
                  {formatTime(c.createdAt || c.updatedAt || c.date)}
                </Text>
              </View>
            </View>
            <View className="items-end gap-2">
              <StatusBadge status={c.status} small />
              <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
            </View>
          </ListRow>
        );
      })}
    </ListScreen>
  );
}
