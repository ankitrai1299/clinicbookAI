import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Patient } from '../types';
import { useAppData } from '../context/AppData';
import { Avatar, Button, Field, SearchBar } from './ui';
import { colors, shadow } from '../theme';

type Phase = 'patient' | 'add' | 'action';

const SCREEN_H = Dimensions.get('window').height;

// New-consultation flow. Step 1: pick or add a patient. Step 2: choose Start
// Recording or Upload Audio — both create a fresh Draft session and open the
// consultation workspace in the right mode. Rendered in a Modal (above the tab
// bar) as a tall, scrollable, drag-to-dismiss sheet.
//
// Design: flat surfaces on the near-white canvas, one indigo accent, no
// gradients — a calm clinical sheet a doctor reads at a glance, not a colourful
// consumer card.
export default function NewConsultationModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { patients, addPatient, startSessionForPatient } = useAppData();

  const [phase, setPhase] = useState<Phase>('patient');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Patient | null>(null);

  // New-patient form.
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');

  // Drag-to-dismiss.
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120) close();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  const reset = () => {
    setPhase('patient');
    setQuery('');
    setSelected(null);
    setName('');
    setAge('');
    setGender('');
    setPhone('');
    translateY.setValue(0);
  };

  const close = () => {
    reset();
    onClose();
  };

  const goToConsultation = (patient: Patient, mode: 'record' | 'upload') => {
    const con = startSessionForPatient(patient.id, patient.name);
    close();
    router.push(`/consultation/${con.id}?mode=${mode}`);
  };

  const handleAddPatient = () => {
    if (!name.trim()) return;
    const p = addPatient(name.trim(), Number(age) || 0, gender.trim() || 'Unknown', phone.trim());
    setSelected(p);
    setPhase('action');
  };

  const filtered = patients.filter((p) =>
    (p.name || '').toLowerCase().includes(query.trim().toLowerCase()),
  );

  const genders = [
    { key: 'Male', label: t('newConsultation.male') },
    { key: 'Female', label: t('newConsultation.female') },
    { key: 'Other', label: t('newConsultation.other') },
  ];

  const title =
    phase === 'add'
      ? t('newConsultation.addPatientTitle')
      : phase === 'action'
        ? t('newConsultation.startConsultationTitle')
        : t('newConsultation.title');
  const subtitle =
    phase === 'add'
      ? t('newConsultation.addNewPatientSub')
      : phase === 'action'
        ? selected?.name || ''
        : t('newConsultation.selectPatient');

  const patientMeta = (p: Patient): string =>
    [p.age ? `${p.age} ${t('common.years')}` : '', p.gender && p.gender !== 'Unknown' ? p.gender : '', p.phone || '']
      .filter(Boolean)
      .join('  ·  ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/40">
        <TouchableOpacity activeOpacity={1} onPress={close} style={{ flex: 1 }} />
        {/* padding on both platforms lifts the whole sheet above the keyboard so
            the add-patient fields stay visible while typing. The modal covers
            the tab bar, so the sheet lifts with no vertical offset. */}
        <KeyboardAvoidingView behavior="padding">
          <Animated.View
            style={{ transform: [{ translateY }], maxHeight: SCREEN_H * 0.92, ...shadow.lg }}
            className="bg-canvas rounded-t-3xl overflow-hidden"
          >
            {/* Drag handle + header */}
            <View {...panResponder.panHandlers}>
              <View className="items-center pt-2.5 pb-1">
                <View className="w-9 h-1 rounded-full bg-slate-200" />
              </View>
              <View className="flex-row items-center gap-3 px-5 pt-2 pb-4 border-b border-slate-100">
                {phase !== 'patient' && (
                  <TouchableOpacity
                    onPress={() => setPhase('patient')}
                    hitSlop={8}
                    className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center"
                  >
                    <Ionicons name="chevron-back" size={19} color={colors.slate600} />
                  </TouchableOpacity>
                )}
                <View className="flex-1">
                  <Text className="text-[19px] font-bold text-slate-900 tracking-tight">{title}</Text>
                  {subtitle ? <Text className="text-[12.5px] text-slate-400 mt-0.5">{subtitle}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={close}
                  hitSlop={8}
                  className="w-9 h-9 rounded-full bg-white border border-slate-200 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color={colors.slate600} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Step 1: pick a patient ─────────────────────────── */}
            {phase === 'patient' && (
              <View className="px-5 pt-4" style={{ paddingBottom: insets.bottom + 12 }}>
                <SearchBar value={query} onChangeText={setQuery} placeholder={t('newConsultation.searchByName')} />

                <TouchableOpacity
                  onPress={() => setPhase('add')}
                  activeOpacity={0.85}
                  className="flex-row items-center gap-3 mt-3 py-3 px-3.5 bg-white border border-slate-200 rounded-2xl"
                  style={shadow.sm}
                >
                  <View className="w-10 h-10 rounded-full bg-brand-500 items-center justify-center">
                    <Ionicons name="person-add" size={19} color={colors.white} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-bold text-slate-900">{t('newConsultation.addNewPatient')}</Text>
                    <Text className="text-xs text-slate-400 mt-0.5">{t('newConsultation.addNewPatientSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                </TouchableOpacity>

                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-5 mb-1.5 px-1">
                  {t('newConsultation.selectExisting')}
                </Text>
                <ScrollView style={{ maxHeight: SCREEN_H * 0.42 }} keyboardShouldPersistTaps="handled">
                  {filtered.length === 0 ? (
                    <View className="items-center py-10">
                      <View className="w-12 h-12 rounded-full bg-slate-100 items-center justify-center mb-3">
                        <Ionicons name="people-outline" size={22} color={colors.slate400} />
                      </View>
                      <Text className="text-[13px] text-slate-400 text-center">
                        {patients.length === 0 ? t('newConsultation.noPatientsYet') : t('newConsultation.noMatches')}
                      </Text>
                    </View>
                  ) : (
                    filtered.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          setSelected(p);
                          setPhase('action');
                        }}
                        activeOpacity={0.7}
                        className="flex-row items-center gap-3 py-2.5 px-2 rounded-2xl border-b border-slate-100"
                      >
                        <Avatar name={p.name} />
                        <View className="flex-1">
                          <Text className="text-[15px] font-semibold text-slate-900">{p.name}</Text>
                          {patientMeta(p) ? (
                            <Text className="text-xs text-slate-400 mt-0.5">{patientMeta(p)}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* ── Step 2a: add a new patient ─────────────────────── */}
            {phase === 'add' && (
              <ScrollView
                className="px-5 pt-4"
                contentContainerStyle={{ gap: 16, paddingBottom: insets.bottom + 20 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View className="flex-row items-start gap-2 bg-white border border-slate-200 rounded-2xl px-3.5 py-3">
                  <Ionicons name="information-circle-outline" size={17} color={colors.slate400} />
                  <Text className="flex-1 text-[12px] leading-[17px] text-slate-500">
                    {t('newConsultation.detailsHint')}
                  </Text>
                </View>

                <LabeledField label={t('newConsultation.fullName')} tag={t('newConsultation.required')} tagClass="text-brand-600">
                  <Field
                    value={name}
                    onChangeText={setName}
                    placeholder={t('newConsultation.patientNamePlaceholder')}
                    autoFocus
                  />
                </LabeledField>

                <View className="gap-1.5">
                  <Text className="text-xs font-semibold text-slate-500">{t('newConsultation.gender')}</Text>
                  <View className="flex-row gap-2">
                    {genders.map((g) => {
                      const active = gender === g.key;
                      return (
                        <TouchableOpacity
                          key={g.key}
                          onPress={() => setGender(active ? '' : g.key)}
                          activeOpacity={0.8}
                          className={`flex-1 items-center py-3 rounded-2xl border ${
                            active ? 'bg-brand-500 border-brand-500' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <Text className={`text-[13.5px] font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>
                            {g.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <LabeledField label={t('newConsultation.age')} tag={t('newConsultation.optional')} tagClass="text-slate-400">
                      <Field
                        value={age}
                        onChangeText={setAge}
                        placeholder={t('newConsultation.agePlaceholder')}
                        keyboardType="number-pad"
                      />
                    </LabeledField>
                  </View>
                  <View className="flex-1">
                    <LabeledField label={t('newConsultation.phone')} tag={t('newConsultation.optional')} tagClass="text-slate-400">
                      <Field
                        value={phone}
                        onChangeText={setPhone}
                        placeholder={t('newConsultation.phonePlaceholder')}
                        keyboardType="phone-pad"
                      />
                    </LabeledField>
                  </View>
                </View>

                <Button
                  label={t('newConsultation.addContinue')}
                  icon="arrow-forward"
                  onPress={handleAddPatient}
                  disabled={!name.trim()}
                  size="lg"
                  className="mt-1"
                />
              </ScrollView>
            )}

            {/* ── Step 2b: choose how to begin ───────────────────── */}
            {phase === 'action' && selected && (
              <View className="px-5 pt-5" style={{ paddingBottom: insets.bottom + 20 }}>
                <View className="flex-row items-center gap-3 mb-5 p-3 bg-white border border-slate-200 rounded-2xl">
                  <Avatar name={selected.name} size={46} />
                  <View className="flex-1">
                    <Text className="text-[15.5px] font-bold text-slate-900">{selected.name}</Text>
                    {patientMeta(selected) ? (
                      <Text className="text-xs text-slate-400 mt-0.5">{patientMeta(selected)}</Text>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => goToConsultation(selected, 'record')}
                  activeOpacity={0.9}
                  style={shadow.brand}
                  className="flex-row items-center gap-3 p-4 bg-brand-500 rounded-2xl mb-3"
                >
                  <View className="w-11 h-11 rounded-full bg-white/15 items-center justify-center">
                    <Ionicons name="mic" size={23} color={colors.white} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15.5px] font-bold text-white">{t('newConsultation.startRecording')}</Text>
                    <Text className="text-xs text-white/80 mt-0.5">{t('newConsultation.startRecordingSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.white} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => goToConsultation(selected, 'upload')}
                  activeOpacity={0.85}
                  className="flex-row items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl mb-4"
                >
                  <View className="w-11 h-11 rounded-full bg-brand-50 items-center justify-center">
                    <Ionicons name="cloud-upload-outline" size={22} color={colors.brand} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15.5px] font-bold text-slate-900">{t('newConsultation.uploadAudio')}</Text>
                    <Text className="text-xs text-slate-400 mt-0.5">{t('newConsultation.uploadAudioSub')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.slate300} />
                </TouchableOpacity>

                <Button label={t('common.cancel')} variant="ghost" onPress={close} />
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A form label with an optional right-aligned Required/Optional tag, wrapping a
 * Field (whose own label is omitted). Keeps the add-patient form scannable. */
function LabeledField({
  label,
  tag,
  tagClass,
  children,
}: {
  label: string;
  tag?: string;
  tagClass?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-slate-500">{label}</Text>
        {tag ? <Text className={`text-[10px] font-semibold ${tagClass || 'text-slate-400'}`}>{tag}</Text> : null}
      </View>
      {children}
    </View>
  );
}
