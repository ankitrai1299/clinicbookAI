import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Consultation } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Avatar, Button, StatusBadge, EmptyState, IconButton, Chip } from '../../src/components/ui';
import AudioPlayer from '../../src/components/AudioPlayer';
import { resolveMediaUrl } from '../../src/services/api';
import { colors, gradients, gradientProps } from '../../src/theme';

type Tab = 'timeline' | 'reports' | 'rx' | 'audio';

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sessionLabel = (s: Consultation): string =>
  s.report?.chiefComplaint?.find(Boolean) ||
  (s.transcript || []).map((l) => l.text).join(' ').trim() ||
  'Empty session';

export default function PatientProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { patients, consultations, startSessionForPatient } = useAppData();
  const [tab, setTab] = useState<Tab>('timeline');

  const patient = patients.find((p) => p.id === id);
  const history = consultations
    .filter((c) => c.patientId === id)
    .sort((a, b) => sessionTime(b) - sessionTime(a));

  const reports = history.filter((c) => c.report && (c.report.chiefComplaint?.length || c.report.clinicalOverview));
  const withRx = history.filter((c) => (c.report?.prescribedMedications?.length || 0) > 0);
  const withAudio = history.filter((c) => c.audioUrl);

  const startNew = () => {
    if (!patient) return;
    const con = startSessionForPatient(patient.id, patient.name);
    router.push(`/consultation/${con.id}?mode=record`);
  };

  const open = (c: Consultation) => router.push(`/consultation/${c.id}`);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'timeline', label: 'Timeline', count: history.length },
    { key: 'reports', label: 'Reports', count: reports.length },
    { key: 'rx', label: 'Rx', count: withRx.length },
    { key: 'audio', label: 'Audio', count: withAudio.length },
  ];

  const VisitCard = ({ c }: { c: Consultation }) => (
    <TouchableOpacity onPress={() => open(c)} activeOpacity={0.7}>
      <Card className="p-3.5">
        <View className="flex-row justify-between items-center mb-1.5">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={13} color={colors.slate500} />
            <Text className="text-xs font-semibold text-slate-600">{c.date}</Text>
          </View>
          <StatusBadge status={c.status} small />
        </View>
        <Text className="text-sm text-slate-800 font-medium" numberOfLines={2}>{sessionLabel(c)}</Text>
        <View className="flex-row gap-3 mt-2">
          {(c.transcript?.length || c.transcriptText) ? (
            <View className="flex-row items-center gap-1"><Ionicons name="document-text-outline" size={12} color={colors.emerald600} /><Text className="text-[11px] text-slate-500">Transcript</Text></View>
          ) : null}
          {c.report ? (
            <View className="flex-row items-center gap-1"><Ionicons name="clipboard-outline" size={12} color={colors.brand} /><Text className="text-[11px] text-slate-500">Report</Text></View>
          ) : null}
          {c.audioUrl ? (
            <View className="flex-row items-center gap-1"><Ionicons name="musical-notes-outline" size={12} color="#9333ea" /><Text className="text-[11px] text-slate-500">Audio</Text></View>
          ) : null}
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View className="overflow-hidden">
        <LinearGradient colors={gradients.brand as any} {...gradientProps.horizontal} className="absolute inset-0" />
        <View className="flex-row items-center gap-3 px-4 pt-3 pb-3">
          <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white/20" color={colors.white} />
          <Text className="text-lg font-bold text-white flex-1">Patient Profile</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {!patient ? (
          <EmptyState icon="person-outline" title="Patient not found" />
        ) : (
          <>
            {/* Details */}
            <Card className="p-5 mb-4">
              <View className="flex-row items-center gap-4">
                <Avatar name={patient.name} size={64} />
                <View className="flex-1">
                  <Text className="text-xl font-bold text-slate-900">{patient.name}</Text>
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <Chip label={patient.age ? `${patient.age} yrs` : 'Age —'} tone="brand" />
                    <Chip label={patient.gender || 'Unknown'} tone="accent" />
                  </View>
                  {patient.phone ? (
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
                  <Text className="text-[11px] text-slate-500 mt-0.5">Visits</Text>
                </View>
                <View className="flex-1 items-center border-l border-r border-slate-100">
                  <Text className="text-xl font-bold text-accent-600">{reports.length}</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">Reports</Text>
                </View>
                <View className="flex-1 items-center">
                  <Text className="text-xl font-bold text-success-600">{withRx.length}</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">Prescriptions</Text>
                </View>
              </View>
              <View className="mt-4">
                <Button label="New Session" icon="mic" onPress={startNew} />
              </View>
            </Card>

            {/* Tabs */}
            <View className="flex-row bg-slate-100 rounded-2xl p-1 mb-4">
              {tabs.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  activeOpacity={0.8}
                  className={`flex-1 py-2 rounded-xl ${tab === t.key ? 'bg-white' : ''}`}
                  style={tab === t.key ? { shadowColor: '#1E293B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : undefined}
                >
                  <Text className={`text-center text-[13px] font-semibold ${tab === t.key ? 'text-brand-600' : 'text-slate-500'}`}>
                    {t.label}{t.count ? ` ${t.count}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tab content */}
            {tab === 'timeline' && (
              history.length === 0 ? (
                <EmptyState icon="time-outline" title="No visits yet" subtitle="Start a new session to build this patient's timeline." />
              ) : (
                <View className="gap-2.5">{history.map((c) => <VisitCard key={c.id} c={c} />)}</View>
              )
            )}

            {tab === 'reports' && (
              reports.length === 0 ? (
                <EmptyState icon="clipboard-outline" title="No reports" subtitle="Generated clinical reports will appear here." />
              ) : (
                <View className="gap-2.5">{reports.map((c) => <VisitCard key={c.id} c={c} />)}</View>
              )
            )}

            {tab === 'rx' && (
              withRx.length === 0 ? (
                <EmptyState icon="medkit-outline" title="No prescriptions" subtitle="Prescribed medications will appear here." />
              ) : (
                <View className="gap-2.5">
                  {withRx.map((c) => (
                    <TouchableOpacity key={c.id} onPress={() => open(c)} activeOpacity={0.7}>
                      <Card className="p-3.5">
                        <View className="flex-row justify-between items-center mb-2">
                          <Text className="text-xs font-semibold text-slate-600">{c.date}</Text>
                          <Ionicons name="chevron-forward" size={16} color={colors.slate300} />
                        </View>
                        {(c.report?.prescribedMedications || []).map((m, i) => (
                          <View key={i} className="flex-row items-start gap-2 py-1">
                            <Ionicons name="ellipse" size={6} color={colors.brand} style={{ marginTop: 6 }} />
                            <Text className="flex-1 text-sm text-slate-800">
                              <Text className="font-semibold">{m.medicine || 'Medicine'}</Text>
                              {[m.strength, m.dose || m.dosage, m.frequency, m.duration].filter(Boolean).length
                                ? `  ${[m.strength, m.dose || m.dosage, m.frequency, m.duration].filter(Boolean).join(' • ')}`
                                : ''}
                            </Text>
                          </View>
                        ))}
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}

            {tab === 'audio' && (
              withAudio.length === 0 ? (
                <EmptyState icon="musical-notes-outline" title="No recordings" subtitle="Uploaded audio for this patient will appear here." />
              ) : (
                <View className="gap-3">
                  {withAudio.map((c) => (
                    <View key={c.id} className="gap-1.5">
                      <Text className="text-xs font-semibold text-slate-500 px-1">{c.date}</Text>
                      <AudioPlayer src={resolveMediaUrl(c.audioUrl || '')} />
                    </View>
                  ))}
                </View>
              )
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
