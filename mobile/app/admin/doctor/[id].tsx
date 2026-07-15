import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Avatar, Chip, Button, StatusBadge, EmptyState } from '../../../src/components/ui';
import { AdminScreen, InfoRow } from '../../../src/components/admin/shared';
import { DoctorFormModal } from '../../../src/components/admin/DoctorFormModal';
import { useAuth } from '../../../src/context/Auth';
import { getDoctors, deleteDoctor, suspendDoctor, activateDoctor } from '../../../src/services/api';
import { AuthUser } from '../../../src/contracts';
import { colors } from '../../../src/theme';

export default function DoctorProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('doctors.manage');

  const [doctor, setDoctor] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await getDoctors('', token);
      setDoctor(list.find((d) => d.id === id) || null);
    } catch {
      setDoctor(null);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = async () => {
    if (!doctor) return;
    try {
      if (doctor.status === 'suspended') await activateDoctor(doctor.id, token);
      else await suspendDoctor(doctor.id, token);
      load();
    } catch (e: any) {
      Alert.alert('Action failed', e?.message || 'Try again.');
    }
  };

  const onDelete = () => {
    if (!doctor) return;
    Alert.alert('Delete doctor', `Remove ${doctor.name}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoctor(doctor.id, token);
            router.back();
          } catch (e: any) {
            Alert.alert('Delete failed', e?.message || 'Try again.');
          }
        },
      },
    ]);
  };

  const suspended = doctor?.status === 'suspended';

  return (
    <AdminScreen title="Doctor Profile" subtitle={doctor?.name} permission="doctors.view">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : !doctor ? (
          <EmptyState icon="person-outline" title="Doctor not found" />
        ) : (
          <>
            <Card className="p-5" elevation="sm">
              <View className="flex-row items-center gap-4">
                <Avatar name={doctor.name} size={64} />
                <View className="flex-1">
                  <Text className="text-xl font-bold text-slate-900">{doctor.name}</Text>
                  <Text className="text-sm text-slate-500 mt-0.5" numberOfLines={1}>{doctor.email}</Text>
                  <View className="flex-row items-center gap-1.5 mt-2">
                    <StatusBadge status={suspended ? 'Draft' : 'Completed'} small />
                    {doctor.specialization ? <Chip label={doctor.specialization} tone="brand" /> : null}
                  </View>
                </View>
              </View>
            </Card>

            <Card className="p-5" elevation="sm">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Profile</Text>
              <InfoRow icon="briefcase-outline" label="Specialization" value={doctor.specialization || '—'} />
              <InfoRow icon="ribbon-outline" label="License number" value={doctor.licenseNumber || '—'} />
              <InfoRow icon="business-outline" label="Hospital" value={doctor.hospital || '—'} />
              <InfoRow icon="time-outline" label="Experience" value={doctor.experience != null ? `${doctor.experience} yrs` : '—'} />
              <InfoRow icon="call-outline" label="Phone" value={doctor.phone || '—'} />
              <InfoRow icon="shield-outline" label="Role" value={doctor.role} />
              <InfoRow icon="pulse-outline" label="Status" value={suspended ? 'Suspended' : 'Active'} tint={suspended ? colors.warningDark : colors.successDark} />
              {doctor.lastLoginAt ? <InfoRow icon="log-in-outline" label="Last login" value={new Date(doctor.lastLoginAt).toLocaleString()} /> : null}
              {doctor.createdAt ? <InfoRow icon="calendar-outline" label="Joined" value={new Date(doctor.createdAt).toLocaleDateString()} /> : null}
            </Card>

            {canManage ? (
              <View className="gap-2.5">
                <Button label="Edit Doctor" icon="create-outline" onPress={() => setModalOpen(true)} />
                <Button
                  label={suspended ? 'Activate Account' : 'Suspend Account'}
                  icon={suspended ? 'play-outline' : 'pause-outline'}
                  variant="secondary"
                  onPress={onToggle}
                />
                <Button label="Delete Doctor" icon="trash-outline" variant="danger" onPress={onDelete} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <DoctorFormModal visible={modalOpen} doctor={doctor} onClose={() => setModalOpen(false)} onSaved={() => load()} />
    </AdminScreen>
  );
}
