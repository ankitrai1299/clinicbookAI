// Draft Reports — consultations that still owe a finished report.
import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDateFilter } from '../../src/context/DateFilter';
import { useRangedConsultations } from '../../src/hooks/useRangedConsultations';
import { Avatar, StatusBadge } from '../../src/components/ui';
import { ListScreen, ListRow, RowAction } from '../../src/components/ListScreen';
import { deleteConsultation } from '../../src/services/api';
import { draftConsultations, formatDate, relativeDay, hasReport } from '../../src/utils/dashboard';
import { colors } from '../../src/theme';

export default function DraftsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { range } = useDateFilter();
  const { consultations, loading, error, reload } = useRangedConsultations(range);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = draftConsultations(consultations);

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      t('lists.drafts.deleteTitle'),
      t('lists.drafts.deleteBody', { name: name || t('common.unknownPatient') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              await deleteConsultation(id);
              // Refetch rather than splicing local state, so the list reflects
              // what the server actually holds after the cascade delete.
              await reload();
            } catch (err) {
              Alert.alert(
                t('lists.drafts.deleteFailedTitle'),
                err instanceof Error ? err.message : t('errors.generic'),
              );
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <ListScreen
      title={t('lists.drafts.title')}
      subtitle={t('lists.drafts.subtitle')}
      count={rows.length}
      loading={loading}
      error={error}
      onRefresh={reload}
      isEmpty={rows.length === 0}
      emptyIcon="create-outline"
      emptyTitle={t('lists.drafts.emptyTitle')}
      emptySubtitle="Every consultation in this range has been completed."
    >
      {rows.map((c) => {
        const ready = hasReport(c);
        return (
          <ListRow
            key={c.id}
            onPress={() => router.push(`/consultation/${c.id}`)}
            actions={
              <>
                <RowAction
                  icon="create-outline"
                  label={t('lists.drafts.continue')}
                  onPress={() => router.push(`/consultation/${c.id}`)}
                />
                <RowAction
                  icon={ready ? 'document-text-outline' : 'sparkles-outline'}
                  label={ready ? t('lists.drafts.openReport') : t('lists.drafts.generate')}
                  tone="success"
                  // Both land on the consultation screen, which owns generation
                  // and holds the transcript the report is built from. Routing
                  // straight to /report for a draft with no report yet would
                  // show an empty page with nothing to act on.
                  onPress={() =>
                    router.push(ready ? `/report/${c.id}` : `/consultation/${c.id}`)
                  }
                />
                <RowAction
                  icon="trash-outline"
                  label={t('common.delete')}
                  tone="danger"
                  busy={busyId === c.id}
                  onPress={() => confirmDelete(c.id, c.patientName)}
                />
              </>
            }
          >
            <Avatar name={c.patientName} />
            <View className="flex-1 ml-3">
              <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>
                {c.patientName || t('common.unknownPatient')}
              </Text>
              <View className="flex-row items-center gap-1.5 mt-1">
                <Ionicons name="calendar-outline" size={12} color={colors.slate400} />
                <Text className="text-xs text-slate-400">
                  {t('lists.createdOn', { date: formatDate(c.createdAt || c.date) })}
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 mt-0.5">
                <Ionicons name="pencil-outline" size={12} color={colors.slate400} />
                <Text className="text-xs text-slate-400">
                  {t('lists.editedOn', { when: relativeDay(c.updatedAt || c.createdAt || c.date) })}
                </Text>
              </View>
            </View>
            <StatusBadge status={c.status} small />
          </ListRow>
        );
      })}
    </ListScreen>
  );
}
