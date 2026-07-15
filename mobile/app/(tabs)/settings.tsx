import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { Card, GradientCard, Field, SectionLabel, Avatar } from '../../src/components/ui';
import { LANGUAGES } from '../../src/constants';
import { loadSettings, saveSettings, Settings } from '../../src/services/storage';
import { colors, gradients } from '../../src/theme';

const THEMES: { key: Settings['theme']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaved(false);
    saveSettings(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const pickSignature = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload a signature.');
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
          <Text className="text-[26px] font-bold text-slate-900 tracking-tight">Settings</Text>
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

  const doctorLabel = settings.doctorName?.trim() || 'Add your name';
  const langLabel = LANGUAGES.find((l) => l.code === settings.defaultLanguage)?.label || 'Auto';

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <Text className="text-[26px] font-bold text-slate-900 tracking-tight">Settings</Text>
        {saved && (
          <View className="flex-row items-center gap-1.5 bg-success-50 px-2.5 py-1 rounded-full">
            <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
            <Text className="text-xs font-semibold text-success-700">Saved</Text>
          </View>
        )}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Profile hero */}
        <GradientCard colors={gradients.brand as unknown as string[]} glow className="p-5 mt-1">
          <View className="flex-row items-center gap-4">
            <View className="rounded-3xl bg-white/20 p-0.5">
              <Avatar name={settings.doctorName || 'Dr'} size={56} />
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold" numberOfLines={1}>{doctorLabel}</Text>
              <Text className="text-white/80 text-[13px] mt-0.5" numberOfLines={1}>
                {settings.qualification?.trim() || 'MBBS, MD'}
              </Text>
              {settings.registrationNumber?.trim() ? (
                <Text className="text-white/70 text-xs mt-0.5">Reg. No. {settings.registrationNumber}</Text>
              ) : null}
              {settings.clinicName?.trim() ? (
                <View className="flex-row items-center gap-1 mt-1.5">
                  <Ionicons name="business-outline" size={12} color="rgba(255,255,255,0.85)" />
                  <Text className="text-white/85 text-xs">{settings.clinicName}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </GradientCard>

        {/* Doctor profile form */}
        <View className="gap-2">
          <SectionLabel className="px-1">Doctor Profile</SectionLabel>
          <Card className="p-4 gap-3.5" elevation="sm">
            <Field label="Doctor name" value={settings.doctorName} onChangeText={(t) => update({ doctorName: t })} placeholder="Dr. Full Name" />
            <Field label="Qualification" value={settings.qualification} onChangeText={(t) => update({ qualification: t })} placeholder="MBBS, MD" />
            <Field label="Registration number" value={settings.registrationNumber} onChangeText={(t) => update({ registrationNumber: t })} placeholder="Medical council reg. no." />
            <Field label="Clinic name" value={settings.clinicName} onChangeText={(t) => update({ clinicName: t })} placeholder="Clinic / hospital name" />

            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-slate-500">Signature</Text>
              {settings.signatureUri ? (
                <View className="border border-slate-200 rounded-2xl p-3 items-center bg-slate-50">
                  <Image source={{ uri: settings.signatureUri }} style={{ width: 180, height: 60, resizeMode: 'contain' }} />
                  <View className="flex-row gap-4 mt-2">
                    <TouchableOpacity onPress={pickSignature}><Text className="text-sm font-semibold text-brand-600">Replace</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => update({ signatureUri: '' })}><Text className="text-sm font-semibold text-error-500">Remove</Text></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity onPress={pickSignature} activeOpacity={0.7} className="border border-dashed border-slate-300 rounded-2xl py-6 items-center bg-slate-50">
                  <Ionicons name="cloud-upload-outline" size={24} color={colors.brand} />
                  <Text className="text-sm font-medium text-slate-500 mt-1.5">Upload signature image</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        </View>

        {/* Preferences */}
        <View className="gap-2">
          <SectionLabel className="px-1">Preferences</SectionLabel>
          <Card className="p-4 gap-4" elevation="sm">
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-slate-500">Default transcription language</Text>
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
                      className={`px-3.5 py-2 rounded-full border ${active ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-200'}`}
                    >
                      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{l.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-xs font-semibold text-slate-500">Appearance</Text>
              <View className="flex-row gap-2">
                {THEMES.map((t) => {
                  const active = settings.theme === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => update({ theme: t.key })}
                      activeOpacity={0.8}
                      className={`flex-1 items-center gap-1.5 py-3 rounded-2xl border ${active ? 'bg-brand-50 border-brand-300' : 'bg-white border-slate-200'}`}
                    >
                      <Ionicons name={t.icon} size={18} color={active ? colors.brand : colors.slate400} />
                      <Text className={`text-[13px] font-semibold ${active ? 'text-brand-700' : 'text-slate-500'}`}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Card>
        </View>

        {/* About */}
        <View className="gap-2">
          <SectionLabel className="px-1">About</SectionLabel>
          <Card className="px-4" elevation="sm">
            <Row icon="information-circle-outline" label="App version" value={version} tint={colors.brand} />
            <Row icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openLink('https://novascribe.ai/privacy')} tint={colors.success} />
            <Row icon="document-text-outline" label="Terms of Service" onPress={() => openLink('https://novascribe.ai/terms')} tint={colors.accent} />
            <Row icon="help-buoy-outline" label="Support" onPress={() => openLink('mailto:apps@nextdot.co.in')} tint={colors.warning} last />
          </Card>
        </View>

        <Text className="text-center text-xs text-slate-400 mt-1">NovaScribe AI · v{version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
