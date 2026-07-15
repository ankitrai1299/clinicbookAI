import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Consultation } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import { Card, SearchBar, Avatar, Skeleton, EmptyState, Button, Chip } from '../../src/components/ui';
import NewConsultationModal from '../../src/components/NewConsultationModal';
import { colors, gradients, gradientProps, shadow } from '../../src/theme';

const sessionTime = (c: Consultation): number => {
  const raw = c?.updatedAt || c?.createdAt || c?.date;
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Short, chip-friendly condition tags derived from a patient's consultations.
const conditionTags = (list: Consultation[]): string[] => {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const c of list.sort((a, b) => sessionTime(b) - sessionTime(a))) {
    const src = [...(c.report?.chiefComplaint || []), ...(c.report?.assessment || [])];
    for (const raw of src) {
      const t = (raw || '').split(/[,.;(]/)[0].trim();
      if (t && t.length <= 22 && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        tags.push(t);
      }
      if (tags.length >= 3) return tags;
    }
  }
  return tags;
};

const TONES = ['brand', 'accent', 'success'] as const;

export default function Patients() {
  const router = useRouter();
  const { patients, consultations, loading, reload } = useAppData();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = patients.filter((p) =>
    (p.name || '').toLowerCase().includes(query.trim().toLowerCase()),
  );

  const dataFor = (patientId: string) => {
    const list = consultations.filter((c) => c.patientId === patientId);
    const last = [...list].sort((a, b) => sessionTime(b) - sessionTime(a))[0];
    return { count: list.length, lastVisit: last?.date || null, tags: conditionTags(list) };
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-[26px] font-bold text-slate-900 tracking-tight">Patients</Text>
          <Text className="text-slate-500 mt-0.5 text-[13px]">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'} · records & visit history
          </Text>
        </View>
        <TouchableOpacity onPress={() => setModalOpen(true)} activeOpacity={0.9} style={shadow.brand} className="rounded-2xl overflow-hidden">
          <LinearGradient colors={gradients.brand as any} {...gradientProps.diagonal} className="w-12 h-12 items-center justify-center">
            <Ionicons name="add" size={26} color={colors.white} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View className="px-5 pb-3">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search patients by name..." />
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && patients.length === 0 ? (
          <View className="gap-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px]" />)}</View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title={patients.length === 0 ? 'No patients yet' : 'No matches'}
            subtitle={patients.length === 0 ? 'Add a patient to start their first consultation.' : 'Try a different name.'}
            action={patients.length === 0 ? <Button label="Add Patient" icon="person-add" onPress={() => setModalOpen(true)} /> : undefined}
          />
        ) : (
          <View className="gap-2.5">
            {filtered.map((p) => {
              const { count, lastVisit, tags } = dataFor(p.id);
              return (
                <TouchableOpacity key={p.id} onPress={() => router.push(`/patient/${p.id}`)} activeOpacity={0.7}>
                  <Card className="p-4" elevation="sm">
                    <View className="flex-row items-center">
                      <Avatar name={p.name} size={50} />
                      <View className="flex-1 ml-3">
                        <Text className="font-bold text-slate-900 text-base">{p.name}</Text>
                        <View className="flex-row items-center gap-2 mt-1">
                          <View className="flex-row items-center gap-1">
                            <Ionicons name="person-outline" size={12} color={colors.slate400} />
                            <Text className="text-xs text-slate-500">{p.age ? `${p.age} yrs` : 'Age —'}</Text>
                          </View>
                          <View className="w-1 h-1 rounded-full bg-slate-300" />
                          <Text className="text-xs text-slate-500">{p.gender || 'Unknown'}</Text>
                        </View>
                      </View>
                      <View className="w-8 h-8 rounded-full bg-slate-50 items-center justify-center">
                        <Ionicons name="chevron-forward" size={16} color={colors.slate400} />
                      </View>
                    </View>

                    {tags.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5 mt-3">
                        {tags.map((t, i) => (
                          <Chip key={t} label={t} tone={TONES[i % TONES.length]} />
                        ))}
                      </View>
                    ) : null}

                    <View className="flex-row items-center gap-4 mt-3 pt-3 border-t border-slate-100">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="calendar-outline" size={13} color={colors.slate400} />
                        <Text className="text-xs text-slate-500">{lastVisit ? `Last visit ${lastVisit}` : 'No visits yet'}</Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons name="documents-outline" size={13} color={colors.slate400} />
                        <Text className="text-xs text-slate-500">
                          {count} {count === 1 ? 'consultation' : 'consultations'}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <NewConsultationModal visible={modalOpen} onClose={() => setModalOpen(false)} />
    </SafeAreaView>
  );
}
