import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, SearchBar, Avatar, Chip, EmptyState, IconButton, StatusBadge } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { DoctorFormModal } from '../../src/components/admin/DoctorFormModal';
import { useAuth } from '../../src/context/Auth';
import { getDoctors, deleteDoctor, suspendDoctor, activateDoctor } from '../../src/services/api';
import { AuthUser } from '../../src/contracts';
import { colors } from '../../src/theme';

export default function DoctorsScreen() {
  const router = useRouter();
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('doctors.manage');

  const [query, setQuery] = useState('');
  const [doctors, setDoctors] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);

  const load = useCallback(
    async (search: string) => {
      if (!token) return;
      setLoading(true);
      try {
        setDoctors(await getDoctors(search, token));
      } catch {
        setDoctors([]);
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

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (d: AuthUser) => {
    setEditing(d);
    setModalOpen(true);
  };

  const onToggleStatus = async (d: AuthUser) => {
    if (!canManage) return;
    try {
      if (d.status === 'suspended') await activateDoctor(d.id, token);
      else await suspendDoctor(d.id, token);
      load(query);
    } catch (e: any) {
      Alert.alert('Action failed', e?.message || 'Try again.');
    }
  };

  const onDelete = (d: AuthUser) => {
    if (!canManage) return;
    Alert.alert('Delete doctor', `Remove ${d.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoctor(d.id, token);
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
      title="Doctor Management"
      subtitle={`${doctors.length} doctor${doctors.length === 1 ? '' : 's'}`}
      permission="doctors.view"
      right={canManage ? <IconButton icon="add" onPress={openAdd} bg="bg-white/20" color={colors.white} /> : undefined}
    >
      <View className="px-5 pt-4 pb-2">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search doctors by name or email..." />
      </View>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(query)} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && doctors.length === 0 ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : doctors.length === 0 ? (
          <EmptyState icon="medkit-outline" title="No doctors" subtitle={query ? 'No doctors match your search.' : 'Add your first doctor account.'} />
        ) : (
          <View className="gap-2.5">
            {doctors.map((d) => (
              <Card key={d.id} className="p-4" elevation="sm">
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/admin/doctor/${d.id}`)}>
                  <View className="flex-row items-center">
                    <Avatar name={d.name} size={48} />
                    <View className="flex-1 ml-3">
                      <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>{d.name}</Text>
                      <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{d.email}</Text>
                      <View className="flex-row items-center gap-1.5 mt-1.5">
                        {d.specialization ? <Chip label={d.specialization} tone="brand" /> : null}
                        <StatusBadge status={d.status === 'suspended' ? 'Draft' : 'Completed'} small />
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                  </View>
                </TouchableOpacity>
                {canManage ? (
                  <View className="flex-row gap-2 mt-3 pt-3 border-t border-slate-100">
                    <ActionChip icon="create-outline" label="Edit" onPress={() => openEdit(d)} />
                    {d.status === 'suspended' ? (
                      <ActionChip icon="play-outline" label="Activate" tint={colors.successDark} onPress={() => onToggleStatus(d)} />
                    ) : (
                      <ActionChip icon="pause-outline" label="Suspend" tint={colors.warningDark} onPress={() => onToggleStatus(d)} />
                    )}
                    <ActionChip icon="trash-outline" label="Delete" tint={colors.error} onPress={() => onDelete(d)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <DoctorFormModal visible={modalOpen} doctor={editing} onClose={() => setModalOpen(false)} onSaved={() => load(query)} />
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
