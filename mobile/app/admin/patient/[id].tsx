import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Avatar, Chip, StatusBadge, EmptyState, SectionLabel } from '../../../src/components/ui';
import { AdminScreen } from '../../../src/components/admin/shared';
import { useAuth } from '../../../src/context/Auth';
import {
  getPatientHistory,
  getAdminPatients,
  ConsultationHistoryItem,
} from '../../../src/services/api';
import { Patient } from '../../../src/types';
import { colors } from '../../../src/theme';

export default function AdminPatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<ConsultationHistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [hist, pats] = await Promise.all([
        getPatientHistory(id, token),
        getAdminPatients('', token).catch(() => [] as Patient[]),
      ]);
      setHistory(Array.isArray(hist) ? hist : []);
      setPatient(pats.find((p) => p.id === id) || null);
    } catch {
      setHistory([]);
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const reportCount = history.filter((h) => h.hasReport).length;

  return (
    <AdminScreen title="Patient Details" subtitle={patient?.name} permission="patients.view">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && !loaded ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <>
            <Card className="p-5" elevation="sm">
              <View className="flex-row items-center gap-4">
                <Avatar name={patient?.name} size={60} />
                <View className="flex-1">
                  <Text className="text-xl font-bold text-slate-900">{patient?.name || 'Patient'}</Text>
                  <View className="flex-row items-center gap-1.5 mt-1.5">
                    <Chip label={patient?.age ? `${patient.age} yrs` : 'Age —'} tone="brand" />
                    <Chip label={patient?.gender || 'Unknown'} tone="accent" />
                  </View>
                  {patient?.phone ? (
                    <View className="flex-row items-center gap-1.5 mt-2">
                      <Ionicons name="call-outline" size={13} color={colors.slate400} />
                      <Text className="text-sm text-slate-500">{patient.phone}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View className="flex-row mt-4 pt-4 border-t border-slate-100">
                <View className="flex-1 items-center">
                  <Text className="text-xl font-bold text-brand-600">{history.length}</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">Consultations</Text>
                </View>
                <View className="flex-1 items-center border-l border-slate-100">
                  <Text className="text-xl font-bold text-accent-600">{reportCount}</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">Reports</Text>
                </View>
              </View>
            </Card>

            {/* Consultation history (each item may carry a report + transcript) */}
            <View className="gap-2.5">
              <SectionLabel className="px-1">Consultation History</SectionLabel>
              {history.length === 0 ? (
                <EmptyState icon="time-outline" title="No consultations" subtitle="This patient has no recorded consultations yet." />
              ) : (
                history.map((h) => (
                  <Card key={h.consultationId} className="p-3.5" elevation="sm">
                    <View className="flex-row justify-between items-center mb-1.5">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="time-outline" size={13} color={colors.slate500} />
                        <Text className="text-xs font-semibold text-slate-600">{h.visitDateTime || '—'}</Text>
                      </View>
                      <StatusBadge status={h.reportStatus} small />
                    </View>
                    <Text className="text-sm text-slate-800 font-medium" numberOfLines={2}>
                      {h.chiefComplaints.find(Boolean) || h.diagnosis.find(Boolean) || 'Consultation'}
                    </Text>
                    {h.diagnosis.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5 mt-2">
                        {h.diagnosis.slice(0, 3).map((d, i) => (
                          <Chip key={i} label={d} tone="neutral" />
                        ))}
                      </View>
                    ) : null}
                    <View className="flex-row gap-3 mt-2">
                      {(h.transcriptId || h.transcriptText) ? (
                        <View className="flex-row items-center gap-1"><Ionicons name="document-text-outline" size={12} color={colors.successDark} /><Text className="text-[11px] text-slate-500">Transcript</Text></View>
                      ) : null}
                      {h.hasReport ? (
                        <View className="flex-row items-center gap-1"><Ionicons name="clipboard-outline" size={12} color={colors.brand} /><Text className="text-[11px] text-slate-500">Report</Text></View>
                      ) : null}
                      {h.medicines.length > 0 ? (
                        <View className="flex-row items-center gap-1"><Ionicons name="medkit-outline" size={12} color={colors.accent} /><Text className="text-[11px] text-slate-500">{h.medicines.length} Rx</Text></View>
                      ) : null}
                    </View>
                  </Card>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </AdminScreen>
  );
}
