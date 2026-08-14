import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { Card, Field, SectionLabel, Avatar } from '../../src/components/ui';
import { LANGUAGES } from '../../src/constants';
import {
  loadSettings,
  saveSettings,
  profileFromUser,
  profileToPatch,
  Settings,
} from '../../src/services/storage';
import { updateMyProfile } from '../../src/services/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/context/Auth';
import { useTheme } from '../../src/context/Theme';
import { useLanguage } from '../../src/context/Language';
import { SUPPORTED_LANGUAGES } from '../../src/i18n';
import { ROLE_LABELS } from '../../src/contracts';
import { colors } from '../../src/theme';

// Theme options carry an icon and an i18n key; the label is resolved at render.
const THEMES: { key: Settings['theme']; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', labelKey: 'settings.light', icon: 'sunny-outline' },
  { key: 'dark', labelKey: 'settings.dark', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const { language, setLanguage } = useLanguage();

  // Profile fields that live on the ACCOUNT rather than the device. Editing one
  // has to reach the server; editing anything else (language, theme, signature)
  // stays local.
  const PROFILE_KEYS: (keyof Settings)[] = [
    'doctorName',
    'qualification',
    'registrationNumber',
    'clinicName',
  ];

  const profileSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The most recent edit that has not yet reached the server. Held in a ref so
  // it can be flushed from the unmount cleanup, which cannot read state.
  const pendingProfile = useRef<Settings | null>(null);

  /**
   * Send any outstanding profile edit now.
   *
   * This MUST run on unmount rather than simply clearing the timer. Switching
   * tabs within the debounce window unmounts this screen, and cancelling there
   * silently dropped the write: the local cache still showed the new values, so
   * it looked saved, and the loss only surfaced at the next login when the
   * server's untouched record was loaded back.
   */
  const flushProfile = useCallback(() => {
    if (profileSaveTimer.current) {
      clearTimeout(profileSaveTimer.current);
      profileSaveTimer.current = null;
    }
    const pending = pendingProfile.current;
    if (!pending) return;
    pendingProfile.current = null;
    updateMyProfile(profileToPatch(pending)).catch((err) => {
      console.warn('[settings] could not save profile to the server:', err?.message || err);
    });
  }, []);

  useEffect(() => () => flushProfile(), [flushProfile]);

  // Reconcile the device copy with the account record.
  //
  // The account is authoritative wherever it HAS a value. Where it does not,
  // a local value is treated as an edit that never reached the server and is
  // pushed up rather than discarded — blindly spreading the server record over
  // the local one wiped exactly the fields this screen is meant to persist,
  // because a field the server has never been told about comes back as ''.
  useEffect(() => {
    let active = true;
    loadSettings().then((local) => {
      if (!active) return;
      if (!user) {
        setSettings(local);
        return;
      }

      const server = profileFromUser(user);
      const merged: Settings = { ...local };
      let localFilledAGap = false;

      (Object.keys(server) as (keyof typeof server)[]).forEach((key) => {
        const remote = server[key];
        if (remote) {
          merged[key] = remote;
        } else if (local[key]) {
          // The server has nothing here but the device does — keep it and sync.
          localFilledAGap = true;
        }
      });

      setSettings(merged);
      void saveSettings(merged);
      if (localFilledAGap) {
        updateMyProfile(profileToPatch(merged)).catch((err) => {
          console.warn('[settings] could not back-fill profile:', err?.message || err);
        });
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  // Confirm before signing out: the session is the only thing standing between
  // whoever holds the phone and this doctor's patient records, so an accidental
  // tap shouldn't drop it — nor should it be hard to do deliberately.
  const confirmSignOut = () => {
    Alert.alert(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const update = (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    saveSettings(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });

    // A profile edit also has to reach the database, or it is lost the moment
    // the app is reinstalled. Debounced because `update` runs on every
    // keystroke and this is a network call.
    if (PROFILE_KEYS.some((k) => k in patch)) {
      pendingProfile.current = next;
      if (profileSaveTimer.current) clearTimeout(profileSaveTimer.current);
      // Debounced because `update` runs on every keystroke and this is a
      // network call. Whatever is still pending is flushed on unmount.
      profileSaveTimer.current = setTimeout(flushProfile, 800);
    }
  };

  const pickSignature = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('settings.permissionNeededTitle'), t('settings.permissionNeededBody'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 1],
    });
    if (!res.canceled && res.assets?.[0]) update({ signatureUri: res.assets[0].uri });
  };

  const version = Constants.expoConfig?.version || '1.0.0';

  if (!settings) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <View className="px-5 pt-4">
          <Text className="text-[26px] font-extrabold text-slate-900" style={{ letterSpacing: -0.6 }}>{t('settings.title')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  const Row = ({
    icon,
    label,
    value,
    onPress,
    last,
    tint = colors.slate500,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress?: () => void;
    last?: boolean;
    tint?: string;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      className={`flex-row items-center gap-3 py-3.5 ${last ? '' : 'border-b border-slate-100'}`}
    >
      <View className="w-8 h-8 rounded-xl bg-slate-50 items-center justify-center">
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text className="flex-1 text-[15px] text-slate-800 font-medium">{label}</Text>
      {value ? <Text className="text-sm text-slate-400">{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.slate300} /> : null}
    </TouchableOpacity>
  );

  const doctorLabel = settings.doctorName?.trim() || t('settings.addYourName');
  const langLabel = LANGUAGES.find((l) => l.code === settings.defaultLanguage)?.label || 'Auto';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-[26px] font-extrabold text-slate-900" style={{ letterSpacing: -0.6 }}>{t('settings.title')}</Text>
        {saved && (
          <View className="flex-row items-center gap-1.5 bg-success-50 px-2.5 py-1 rounded-full">
            <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
            <Text className="text-xs font-semibold text-success-700">{t('common.saved')}</Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Profile — a clean white card, not a coloured banner. */}
        <Card className="p-4 mt-1 flex-row items-center gap-4" elevation="sm">
          <Avatar name={settings.doctorName || 'Dr'} size={56} />
          <View className="flex-1">
            <Text className="text-[17px] font-bold text-slate-900" numberOfLines={1}>{doctorLabel}</Text>
            <Text className="text-[13px] text-slate-500 mt-0.5" numberOfLines={1}>
              {settings.qualification?.trim() || 'MBBS, MD'}
            </Text>
            {settings.registrationNumber?.trim() ? (
              <Text className="text-[12px] text-slate-400 mt-0.5">{t('settings.regNo', { number: settings.registrationNumber })}</Text>
            ) : null}
            {settings.clinicName?.trim() ? (
              <View className="flex-row items-center gap-1 mt-1.5">
                <Ionicons name="business-outline" size={12} color={colors.slate400} />
                <Text className="text-[12px] text-slate-500">{settings.clinicName}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {/* Signed-in account.
            This is the app's ONLY sign-out control. It used to live in the
            Admin tab (since removed), which ordinary doctors could not open —
            so before this they had no way to leave their session on a shared
            device. */}
        <View className="gap-2">
          <SectionLabel className="px-1">{t('settings.account')}</SectionLabel>
          <Card className="p-4 gap-3" elevation="sm">
            <View className="flex-row items-center gap-3">
              <Avatar name={user?.name || user?.email || 'Dr'} size={42} />
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-slate-900" numberOfLines={1}>
                  {user?.name || t('settings.signedIn')}
                </Text>
                <Text className="text-[12.5px] text-slate-500" numberOfLines={1}>
                  {user?.email}
                </Text>
              </View>
              {user?.role ? (
                <View className="bg-brand-50 rounded-full px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-brand-600">
                    {ROLE_LABELS[user.role]}
                  </Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={confirmSignOut}
              activeOpacity={0.8}
              className="flex-row items-center justify-center gap-2 bg-error-50 rounded-2xl py-3"
            >
              <Ionicons name="log-out-outline" size={17} color={colors.errorDark} />
              <Text className="text-[13.5px] font-semibold" style={{ color: colors.errorDark }}>
                {t('settings.signOut')}
              </Text>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Doctor profile form */}
        <View className="gap-2">
          <SectionLabel className="px-1">{t('settings.doctorProfile')}</SectionLabel>
          <Card className="p-4 gap-3.5" elevation="sm">
            <Field label={t('settings.doctorName')} value={settings.doctorName} onChangeText={(v) => update({ doctorName: v })} placeholder={t('settings.doctorNamePlaceholder')} />
            <Field label={t('settings.qualification')} value={settings.qualification} onChangeText={(v) => update({ qualification: v })} placeholder="MBBS, MD" />
            <Field label={t('settings.registrationNumber')} value={settings.registrationNumber} onChangeText={(v) => update({ registrationNumber: v })} placeholder={t('settings.registrationNumberPlaceholder')} />
            <Field label={t('settings.clinicName')} value={settings.clinicName} onChangeText={(v) => update({ clinicName: v })} placeholder={t('settings.clinicNamePlaceholder')} />

            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-500">{t('settings.signature')}</Text>
              {settings.signatureUri ? (
                <View className="border border-slate-200 rounded-2xl p-3 items-center bg-slate-50">
                  <Image source={{ uri: settings.signatureUri }} style={{ width: 180, height: 60, resizeMode: 'contain' }} />
                  <View className="flex-row gap-4 mt-2">
                    <TouchableOpacity onPress={pickSignature}><Text className="text-sm font-semibold text-brand-600">{t('common.replace')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => update({ signatureUri: '' })}><Text className="text-sm font-semibold text-error-500">{t('common.remove')}</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={pickSignature} activeOpacity={0.7} className="border border-dashed border-slate-300 rounded-2xl py-6 items-center bg-slate-50">
                  <Ionicons name="cloud-upload-outline" size={24} color={colors.brand} />
                  <Text className="text-sm font-medium text-slate-500 mt-1.5">{t('settings.uploadSignature')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        </View>

        {/* Preferences */}
        <View className="gap-2">
          <SectionLabel className="px-1">{t('settings.preferences')}</SectionLabel>
          <Card className="p-4 gap-4" elevation="sm">
            {/* App interface language. Separate from the transcription language
                below: this is what the UI is drawn in, that is what the speech
                model listens for. Changing it applies immediately. */}
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-slate-500">{t('settings.appLanguage')}</Text>
                <Text className="text-[10px] text-slate-400">{t('settings.appLanguageHint')}</Text>
              </View>
              <View className="flex-row gap-2">
                {SUPPORTED_LANGUAGES.map((l) => {
                  const active = language === l.code;
                  return (
                    <TouchableOpacity
                      key={l.code}
                      onPress={() => setLanguage(l.code)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-2xl border ${active ? 'bg-brand-50 border-brand-300' : 'bg-surface border-slate-200'}`}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={active ? colors.brand : colors.slate400}
                      />
                      <Text className={`text-[13.5px] font-semibold ${active ? 'text-brand-700' : 'text-slate-600'}`}>
                        {l.endonym}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-slate-500">{t('settings.defaultTranscriptionLanguage')}</Text>
                <Text className="text-xs font-semibold text-brand-600">{langLabel}</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {LANGUAGES.map((l) => {
                  const active = settings.defaultLanguage === l.code;
                  return (
                    <TouchableOpacity
                      key={l.code}
                      onPress={() => update({ defaultLanguage: l.code })}
                      activeOpacity={0.8}
                      className={`px-3.5 py-2 rounded-full border ${active ? 'bg-brand-500 border-brand-500' : 'bg-surface border-slate-200'}`}
                    >
                      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{l.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-xs font-semibold text-slate-500">{t('settings.appearance')}</Text>
              <View className="flex-row gap-2">
                {THEMES.map((themeOpt) => {
                  // Read from and write to the ThemeProvider, not this screen's
                  // local settings copy. Writing only to storage (what this did
                  // before) changed a saved string and nothing else, which is
                  // why the toggle appeared to do nothing. The provider both
                  // applies the scheme and persists it.
                  const active = preference === themeOpt.key;
                  return (
                    <TouchableOpacity
                      key={themeOpt.key}
                      onPress={() => setPreference(themeOpt.key)}
                      activeOpacity={0.8}
                      className={`flex-1 items-center gap-1.5 py-3 rounded-2xl border ${active ? 'bg-brand-50 border-brand-300' : 'bg-surface border-slate-200'}`}
                    >
                      <Ionicons name={themeOpt.icon} size={18} color={active ? colors.brand : colors.slate400} />
                      <Text className={`text-[13px] font-semibold ${active ? 'text-brand-700' : 'text-slate-500'}`}>{t(themeOpt.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Card>
        </View>

        {/* About */}
        <View className="gap-2">
          <SectionLabel className="px-1">{t('settings.about')}</SectionLabel>
          <Card className="px-4" elevation="sm">
            <Row icon="information-circle-outline" label={t('settings.appVersion')} value={version} tint={colors.brand} />
            <Row icon="shield-checkmark-outline" label={t('settings.privacyPolicy')} onPress={() => openLink('https://novascribe.ai/privacy')} tint={colors.success} />
            <Row icon="document-text-outline" label={t('settings.termsOfService')} onPress={() => openLink('https://novascribe.ai/terms')} tint={colors.accent} />
            <Row icon="help-buoy-outline" label={t('settings.support')} onPress={() => openLink('mailto:apps@nextdot.co.in')} tint={colors.warning} last />
          </Card>
        </View>

        <Text className="text-center text-xs text-slate-400 mt-1">NovaScribe · v{version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
