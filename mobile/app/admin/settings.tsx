import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Field, Button, SectionLabel, Chip, ErrorBanner, IconButton } from '../../src/components/ui';
import { AdminScreen } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getSettings, updateSettings, triggerBackup } from '../../src/services/api';
import { AdminSettings, SUPPORTED_LANGUAGES } from '../../src/contracts';
import { colors } from '../../src/theme';

type Ion = keyof typeof Ionicons.glyphMap;

export default function AdminSettingsScreen() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('settings.manage');

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setSettings(await getSettings(token));
    } catch (e: any) {
      setError(e?.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (p: Partial<AdminSettings>) => setSettings((s) => (s ? { ...s, ...p } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateSettings(settings, token);
      setSettings(saved);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1600);
    } catch (e: any) {
      setError(e?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const res = await triggerBackup(token);
      if (res?.lastBackupAt) patch({ backup: { ...settings!.backup, lastBackupAt: res.lastBackupAt } });
      Alert.alert('Backup complete', 'A fresh backup was created.');
    } catch (e: any) {
      Alert.alert('Backup failed', e?.message || 'Try again.');
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <AdminScreen
      title="Admin Settings"
      subtitle="Providers, reports, backup & security"
      permission="settings.view"
      right={savedAt ? <IconButton icon="checkmark" onPress={() => {}} bg="bg-white/20" color={colors.white} /> : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        {!settings ? (
          <View className="items-center py-20"><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <>
            {!canManage ? (
              <View className="bg-warning-50 border border-warning-100 rounded-2xl px-4 py-3 flex-row items-center gap-2">
                <Ionicons name="lock-closed-outline" size={16} color={colors.warningDark} />
                <Text className="flex-1 text-xs font-medium text-warning-700">Read-only — your role can view but not change settings.</Text>
              </View>
            ) : null}

            {/* Providers */}
            <SectionLabel>AI & Speech Providers</SectionLabel>
            <Card className="p-4 gap-4" elevation="sm">
              <Segmented
                label="AI Provider"
                options={[{ key: 'sarvam', label: 'Sarvam' }, { key: 'openai', label: 'OpenAI' }]}
                value={settings.aiProvider}
                disabled={!canManage}
                onChange={(v) => patch({ aiProvider: v as AdminSettings['aiProvider'] })}
              />
              <Segmented
                label="STT Provider"
                options={[{ key: 'sarvam', label: 'Sarvam' }, { key: 'whisper', label: 'Whisper' }]}
                value={settings.sttProvider}
                disabled={!canManage}
                onChange={(v) => patch({ sttProvider: v as AdminSettings['sttProvider'] })}
              />
            </Card>

            {/* Sarvam */}
            <ProviderCard
              icon="sparkles-outline"
              title="Sarvam Settings"
              configured={settings.sarvam.apiConfigured}
              model={settings.sarvam.model}
              disabled={!canManage}
              onModel={(model) => patch({ sarvam: { ...settings.sarvam, model } })}
            />

            {/* OpenAI (future-ready) */}
            <ProviderCard
              icon="hardware-chip-outline"
              title="OpenAI Settings"
              configured={settings.openai.apiConfigured}
              model={settings.openai.model}
              disabled
              comingSoon
              onModel={() => {}}
            />

            {/* Whisper */}
            <ProviderCard
              icon="mic-outline"
              title="Whisper Settings"
              configured={settings.whisper.apiConfigured}
              model={settings.whisper.model}
              disabled={!canManage}
              onModel={(model) => patch({ whisper: { ...settings.whisper, model } })}
            />

            {/* Language */}
            <SectionLabel>Language Settings</SectionLabel>
            <Card className="p-4 gap-2" elevation="sm">
              <Text className="text-xs font-semibold text-slate-500">Default language</Text>
              <View className="flex-row flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((l) => {
                  const on = settings.defaultLanguage === l.code;
                  return (
                    <TouchableOpacity
                      key={l.code}
                      disabled={!canManage}
                      onPress={() => patch({ defaultLanguage: l.code })}
                      activeOpacity={0.8}
                      className={`px-3.5 py-2 rounded-full border ${on ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-200'}`}
                    >
                      <Text className={`text-[13px] font-semibold ${on ? 'text-white' : 'text-slate-600'}`}>{l.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

            {/* Report settings */}
            <SectionLabel>Report Settings</SectionLabel>
            <Card className="p-4 gap-1" elevation="sm">
              <ToggleRow icon="save-outline" label="Auto-save reports" value={settings.reportSettings.autoSave} disabled={!canManage} onChange={(v) => patch({ reportSettings: { ...settings.reportSettings, autoSave: v } })} />
              <ToggleRow icon="create-outline" label="Include signature" value={settings.reportSettings.includeSignature} disabled={!canManage} onChange={(v) => patch({ reportSettings: { ...settings.reportSettings, includeSignature: v } })} />
              <View className="pt-2">
                <Field label="Letterhead" value={settings.reportSettings.letterhead} editable={canManage} onChangeText={(t) => patch({ reportSettings: { ...settings.reportSettings, letterhead: t } })} placeholder="Clinic name / letterhead text" />
              </View>
            </Card>

            {/* Backup */}
            <SectionLabel>Backup</SectionLabel>
            <Card className="p-4 gap-1" elevation="sm">
              <ToggleRow icon="cloud-upload-outline" label="Automatic backups" value={settings.backup.autoBackup} disabled={!canManage} onChange={(v) => patch({ backup: { ...settings.backup, autoBackup: v } })} />
              <View className="py-2">
                <Text className="text-xs font-semibold text-slate-500 mb-2">Frequency</Text>
                <Segmented
                  options={[{ key: 'daily', label: 'Daily' }, { key: 'weekly', label: 'Weekly' }, { key: 'monthly', label: 'Monthly' }]}
                  value={settings.backup.frequency}
                  disabled={!canManage}
                  onChange={(v) => patch({ backup: { ...settings.backup, frequency: v as AdminSettings['backup']['frequency'] } })}
                />
              </View>
              <View className="flex-row items-center justify-between py-2 border-t border-slate-100">
                <View>
                  <Text className="text-xs text-slate-400">Last backup</Text>
                  <Text className="text-[13px] font-semibold text-slate-700">
                    {settings.backup.lastBackupAt ? new Date(settings.backup.lastBackupAt).toLocaleString() : 'Never'}
                  </Text>
                </View>
                {canManage ? <Button label="Backup now" icon="cloud-upload-outline" size="sm" variant="secondary" loading={backingUp} onPress={backupNow} /> : null}
              </View>
            </Card>

            {/* Security */}
            <SectionLabel>Security</SectionLabel>
            <Card className="p-4 gap-1" elevation="sm">
              <View className="py-2">
                <Field
                  label="Session timeout (minutes)"
                  value={String(settings.security.sessionTimeoutMin)}
                  editable={canManage}
                  keyboardType="number-pad"
                  onChangeText={(t) => patch({ security: { ...settings.security, sessionTimeoutMin: Number(t) || 0 } })}
                  placeholder="30"
                />
              </View>
              <ToggleRow icon="shield-checkmark-outline" label="Enforce two-factor auth" value={settings.security.enforce2fa} disabled={!canManage} onChange={(v) => patch({ security: { ...settings.security, enforce2fa: v } })} />
            </Card>

            {canManage ? (
              <Button label={savedAt ? 'Saved' : 'Save Settings'} icon={savedAt ? 'checkmark' : 'save-outline'} loading={saving} onPress={save} />
            ) : null}
          </>
        )}
      </ScrollView>
    </AdminScreen>
  );
}

function Segmented({ label, options, value, onChange, disabled }: { label?: string; options: { key: string; label: string }[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-xs font-semibold text-slate-500">{label}</Text> : null}
      <View className={`flex-row bg-slate-100 rounded-2xl p-1 ${disabled ? 'opacity-60' : ''}`}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <TouchableOpacity key={o.key} disabled={disabled} onPress={() => onChange(o.key)} activeOpacity={0.8} className={`flex-1 py-2 rounded-xl ${on ? 'bg-white' : ''}`} style={on ? { elevation: 1 } : undefined}>
              <Text className={`text-center text-[13px] font-semibold ${on ? 'text-brand-600' : 'text-slate-500'}`}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({ icon, label, value, onChange, disabled }: { icon: Ion; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="w-8 h-8 rounded-xl bg-slate-50 items-center justify-center">
        <Ionicons name={icon} size={16} color={colors.slate500} />
      </View>
      <Text className="flex-1 text-[15px] text-slate-800 font-medium">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.slate200 }}
        thumbColor={colors.white}
      />
    </View>
  );
}

function ProviderCard({ icon, title, configured, model, onModel, disabled, comingSoon }: { icon: Ion; title: string; configured: boolean; model: string; onModel: (m: string) => void; disabled?: boolean; comingSoon?: boolean }) {
  return (
    <Card className="p-4 gap-3" elevation="sm">
      <View className="flex-row items-center gap-2">
        <View className="w-8 h-8 rounded-xl bg-brand-50 items-center justify-center">
          <Ionicons name={icon} size={16} color={colors.brand} />
        </View>
        <Text className="flex-1 font-bold text-[15px] text-slate-900">{title}</Text>
        {comingSoon ? <Chip label="Coming soon" tone="neutral" /> : null}
        <Chip label={configured ? 'Configured' : 'Not set'} tone={configured ? 'success' : 'warning'} icon={configured ? 'checkmark-circle' : 'alert-circle'} />
      </View>
      <Field label="Model" value={model} editable={!disabled} onChangeText={onModel} placeholder="model-id" autoCapitalize="none" />
    </Card>
  );
}
