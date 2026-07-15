import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, RefreshControl, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card, Field, Button, Avatar, Chip, SectionLabel, EmptyState, IconButton, ErrorBanner } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getUsers, createUser, updateUserRole } from '../../src/services/api';
import { AuthUser, Role, ROLES, ROLE_LABELS, PERMISSIONS, ROLE_PERMISSIONS } from '../../src/contracts';
import { colors } from '../../src/theme';

export default function RolesScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [roleFor, setRoleFor] = useState<AuthUser | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setUsers(await getUsers(token));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (u: AuthUser, role: Role) => {
    setRoleFor(null);
    if (u.role === role) return;
    try {
      await updateUserRole(u.id, role, token);
      load();
    } catch (e: any) {
      Alert.alert('Update failed', e?.message || 'Try again.');
    }
  };

  return (
    <AdminScreen
      title="Roles & Users"
      subtitle="Permissions matrix & team"
      permission="users.manage"
      right={<IconButton icon="person-add-outline" onPress={() => setAddOpen(true)} bg="bg-white/20" color={colors.white} />}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission matrix */}
        <SectionLabel>Permission Matrix</SectionLabel>
        <Card className="p-3" elevation="sm">
          {/* Header: role columns */}
          <View className="flex-row items-end pb-2 border-b border-slate-100">
            <View className="flex-1" />
            {ROLES.map((r) => (
              <View key={r} className="w-12 items-center">
                <Text className="text-[9px] font-bold text-slate-500 text-center" numberOfLines={2}>{ROLE_LABELS[r]}</Text>
              </View>
            ))}
          </View>
          {PERMISSIONS.map((perm) => (
            <View key={perm} className="flex-row items-center py-2 border-b border-slate-50">
              <Text className="flex-1 text-[12px] text-slate-700 font-medium" numberOfLines={1}>{perm}</Text>
              {ROLES.map((r) => {
                const has = ROLE_PERMISSIONS[r].includes(perm);
                return (
                  <View key={r} className="w-12 items-center">
                    {has ? (
                      <Ionicons name="checkmark-circle" size={17} color={colors.success} />
                    ) : (
                      <Ionicons name="remove-outline" size={15} color={colors.slate300} />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </Card>

        {/* Users */}
        <SectionLabel>Team Members</SectionLabel>
        {loading && users.length === 0 ? (
          <View className="items-center py-10"><ActivityIndicator color={colors.brand} /></View>
        ) : users.length === 0 ? (
          <EmptyState icon="people-outline" title="No users" subtitle="Add an admin or team member to get started." />
        ) : (
          <View className="gap-2.5">
            {users.map((u) => (
              <Card key={u.id} className="p-4 flex-row items-center" elevation="sm">
                <Avatar name={u.name} size={44} />
                <View className="flex-1 ml-3">
                  <Text className="font-bold text-slate-900 text-[15px]" numberOfLines={1}>{u.name}</Text>
                  <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{u.email}</Text>
                  <View className="mt-1.5"><Chip label={ROLE_LABELS[u.role]} tone="brand" icon="ribbon-outline" /></View>
                </View>
                <TouchableOpacity onPress={() => setRoleFor(u)} activeOpacity={0.7} className="bg-slate-50 rounded-xl px-3 py-2 flex-row items-center gap-1">
                  <Ionicons name="swap-horizontal-outline" size={14} color={colors.brand} />
                  <Text className="text-xs font-semibold text-brand-600">Role</Text>
                </TouchableOpacity>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Role change modal */}
      <Modal visible={!!roleFor} transparent animationType="fade" onRequestClose={() => setRoleFor(null)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-center px-8" activeOpacity={1} onPress={() => setRoleFor(null)}>
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-lg font-bold text-slate-900 mb-1">Change role</Text>
            <Text className="text-xs text-slate-400 mb-3">{roleFor?.name}</Text>
            <View className="gap-2">
              {ROLES.map((r) => {
                const on = roleFor?.role === r;
                return (
                  <TouchableOpacity key={r} onPress={() => roleFor && changeRole(roleFor, r)} activeOpacity={0.8} className={`flex-row items-center justify-between px-4 py-3 rounded-2xl border ${on ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200'}`}>
                    <Text className={`text-[14px] font-semibold ${on ? 'text-brand-700' : 'text-slate-700'}`}>{ROLE_LABELS[r]}</Text>
                    {on ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add user modal */}
      <AddUserModal visible={addOpen} insetsBottom={insets.bottom} onClose={() => setAddOpen(false)} onSaved={load} token={token} />
    </AdminScreen>
  );
}

function AddUserModal({ visible, onClose, onSaved, token, insetsBottom }: { visible: boolean; onClose: () => void; onSaved: () => void; token: string | null; insetsBottom: number }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('doctor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setName('');
      setEmail('');
      setPassword('');
      setRole('doctor');
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createUser({ name: name.trim(), email: email.trim(), password, role }, token);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <TouchableOpacity className="absolute inset-0 bg-black/40" activeOpacity={1} onPress={onClose} />
        <View className="bg-white rounded-t-3xl px-5" style={{ paddingBottom: insetsBottom + 16, maxHeight: '88%' }}>
          <View className="items-center pt-2.5 pb-1"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
          <View className="flex-row items-center gap-2 pt-1 pb-4">
            <View className="w-8 h-8 rounded-xl bg-brand-50 items-center justify-center">
              <Ionicons name="person-add-outline" size={17} color={colors.brand} />
            </View>
            <Text className="text-lg font-bold text-slate-900 flex-1">Add User</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.slate400} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            <Field label="Full name *" value={name} onChangeText={setName} placeholder="Jane Doe" />
            <Field label="Email *" value={email} onChangeText={setEmail} placeholder="jane@hospital.com" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            <Field label="Password *" value={password} onChangeText={setPassword} placeholder="Set a password" secureTextEntry autoCapitalize="none" />
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-500">Role</Text>
              <View className="flex-row flex-wrap gap-2">
                {ROLES.map((r) => {
                  const on = role === r;
                  return (
                    <TouchableOpacity key={r} onPress={() => setRole(r)} activeOpacity={0.8} className={`px-3.5 py-2 rounded-full border ${on ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-200'}`}>
                      <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-600'}`}>{ROLE_LABELS[r]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <View className="mt-1"><Button label="Create User" icon="checkmark" onPress={submit} loading={busy} /></View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
