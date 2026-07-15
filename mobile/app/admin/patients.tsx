import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SearchBar, Avatar, EmptyState, IconButton } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { PatientFormModal } from '../../src/components/admin/PatientFormModal';
import { useAuth } from '../../src/context/Auth';
import { getAdminPatients, deletePatient } from '../../src/services/api';
import { Patient } from '../../src/types';
import { colors } from '../../src/theme';

export default function AdminPatientsScreen() {
  const router = useRouter();
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('patients.manage');

  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      setLoading(true);
      try {
        setPatients(await getAdminPatients(search, token));
      } catch {
        setPatients([]);
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

  const onDelete = (p: Patient) => {
    if (!canManage) return;
    Alert.alert('Delete patient', `Remove ${p.name} and all their records?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePatient(p.id, token);
            load(query);
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Try again.');
          }
        },
      },
    ]);
  };

  return (
    <AdminScreen
      title="Patient Management"
      subtitle={`${patients.length} patient${patients.length === 1 ? '' : 's'}`}
      permission="patients.view"
      right={canManage ? <IconButton icon="add" onPress={() => { setEditing(null); setModalOpen(true); }} bg="bg-white/20" color={colors.white} /> : undefined}
    >
      <View className="px-5 pt-4 pb-2">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search patients by name..." />
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(query)} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && patients.length === 0 ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : patients.length === 0 ? (
          <EmptyState icon="people-outline" title="No patients" subtitle={query ? 'No patients match your search.' : 'Add your first patient.'} />
        ) : (
          <View className="gap-2.5">
            {patients.map((p) => (
              <Card key={p.id} className="p-4" elevation="sm">
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/admin/patient/${p.id}`)}>
                  <View className="flex-row items-center">
                    <Avatar name={p.name} size={48} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]">{p.name}</Text>
                      <View className="flex-row items-center gap-2 mt-1">
                        <Text className="text-xs text-slate-500">{p.age ? `${p.age} yrs` : 'Age —'}</Text>
                        <View className="w-1 h-1 rounded-full bg-slate-300" />
                        <Text className="text-xs text-slate-500">{p.gender || 'Unknown'}</Text>
                        {p.phone ? (
                          <>
                            <View className="w-1 h-1 rounded-full bg-slate-300" />
                            <Text className="text-xs text-slate-500">{p.phone}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                  </View>
                </TouchableOpacity>
                {canManage ? (
                  <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100">
                    <ActionChip icon="create-outline" label="Edit" onPress={() => { setEditing(p); setModalOpen(true); }} />
                    <ActionChip icon="time-outline" label="History" onPress={() => router.push(`/admin/patient/${p.id}`)} />
                    <ActionChip icon="trash-outline" label="Delete" tint={colors.error} onPress={() => onDelete(p)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <PatientFormModal visible={modalOpen} patient={editing} onClose={() => setModalOpen(false)} onSaved={() => load(query)} />
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
