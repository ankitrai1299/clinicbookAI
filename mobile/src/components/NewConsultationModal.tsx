import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Patient } from '../types';
import { useAppData } from '../context/AppData';
import { Avatar, Button, Field, SearchBar } from './ui';
import { colors, gradients, gradientProps, shadow } from '../theme';

type Phase = 'patient' | 'add' | 'action';

const SCREEN_H = Dimensions.get('window').height;

// New-consultation flow. Step 1: pick or add a patient. Step 2: choose Start
// Recording or Upload Audio — both create a fresh Draft session and open the
// consultation workspace in the right mode. Rendered in a Modal (above the tab
// bar) as a tall, scrollable, drag-to-dismiss sheet.
export default function NewConsultationModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
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

  const title = phase === 'add' ? 'Add Patient' : phase === 'action' ? 'Start Consultation' : 'New Consultation';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/50">
        <TouchableOpacity activeOpacity={1} onPress={close} style={{ flex: 1 }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={{ transform: [{ translateY }], maxHeight: SCREEN_H * 0.9 }}
            className="bg-white rounded-t-3xl overflow-hidden"
          >
            {/* Drag handle + header */}
            <View {...panResponder.panHandlers}>
              <View className="items-center pt-3 pb-1">
                <View className="w-10 h-1.5 rounded-full bg-slate-300" />
              </View>
              <View className="flex-row items-center justify-between px-5 py-3 border-b border-slate-100">
                <View className="flex-row items-center gap-2">
                  {phase !== 'patient' && (
                    <TouchableOpacity onPress={() => setPhase('patient')} hitSlop={8}>
                      <Ionicons name="chevron-back" size={22} color={colors.slate600} />
                    </TouchableOpacity>
                  )}
                  <Text className="text-lg font-bold text-slate-900">{title}</Text>
                </View>
                <TouchableOpacity onPress={close} hitSlop={8} className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center">
                  <Ionicons name="close" size={18} color={colors.slate600} />
                </TouchableOpacity>
              </View>
            </View>

            {phase === 'patient' && (
              <View className="px-5 pt-4" style={{ paddingBottom: insets.bottom + 12 }}>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search patients by name..." />
                <TouchableOpacity
                  onPress={() => setPhase('add')}
                  activeOpacity={0.8}
                  className="flex-row items-center gap-3 mt-3 mb-1 py-3 px-3 bg-brand-50 rounded-2xl"
                >
                  <LinearGradient colors={gradients.brand as any} {...gradientProps.diagonal} className="w-10 h-10 rounded-full items-center justify-center">
                    <Ionicons name="person-add" size={20} color={colors.white} />
                  </LinearGradient>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-brand-700">Add New Patient</Text>
                    <Text className="text-xs text-brand-600/70">Register a new patient and start</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.brand} />
                </TouchableOpacity>

                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-3 mb-1 px-1">
                  Select Existing Patient
                </Text>
                <ScrollView style={{ maxHeight: SCREEN_H * 0.42 }} keyboardShouldPersistTaps="handled">
                  {filtered.length === 0 ? (
                    <Text className="text-sm text-slate-400 text-center py-8">
                      {patients.length === 0 ? 'No patients yet. Add one above.' : 'No patients match your search.'}
                    </Text>
                  ) : (
                    filtered.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => {
                          setSelected(p);
                          setPhase('action');
                        }}
                        activeOpacity={0.7}
                        className="flex-row items-center gap-3 py-3 border-b border-slate-50"
                      >
                        <Avatar name={p.name} />
                        <View className="flex-1">
                          <Text className="font-semibold text-slate-900">{p.name}</Text>
                          <Text className="text-xs text-slate-500 mt-0.5">
                            {p.age ? `${p.age} yrs` : 'Age —'} • {p.gender || 'Unknown'}
                            {p.phone ? ` • ${p.phone}` : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.slate300} />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {phase === 'add' && (
              <ScrollView
                className="px-5 pt-4"
                contentContainerStyle={{ gap: 14, paddingBottom: insets.bottom + 20 }}
                keyboardShouldPersistTaps="handled"
              >
                <Field label="Full name *" value={name} onChangeText={setName} placeholder="Patient name" />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Field label="Age" value={age} onChangeText={setAge} placeholder="Age" keyboardType="number-pad" />
                  </View>
                  <View className="flex-1">
                    <Field label="Gender" value={gender} onChangeText={setGender} placeholder="M / F / Other" />
                  </View>
                </View>
                <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Phone (optional)" keyboardType="phone-pad" />
                <Button label="Add & Continue" icon="arrow-forward" onPress={handleAddPatient} disabled={!name.trim()} size="lg" />
              </ScrollView>
            )}

            {phase === 'action' && selected && (
              <View className="px-5 pt-5" style={{ paddingBottom: insets.bottom + 20 }}>
                <View className="flex-row items-center gap-3 mb-5 p-3 bg-slate-50 rounded-2xl">
                  <Avatar name={selected.name} size={48} />
                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-900">{selected.name}</Text>
                    <Text className="text-xs text-slate-500 mt-0.5">
                      {selected.age ? `${selected.age} yrs` : 'Age —'} • {selected.gender || 'Unknown'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => goToConsultation(selected, 'record')}
                  activeOpacity={0.9}
                  style={shadow.brand}
                  className="rounded-2xl overflow-hidden mb-3"
                >
                  <LinearGradient colors={gradients.brand as any} {...gradientProps.horizontal} className="flex-row items-center gap-3 p-4">
                    <View className="w-11 h-11 rounded-full bg-white/20 items-center justify-center">
                      <Ionicons name="mic" size={24} color={colors.white} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-bold text-white">Start Recording</Text>
                      <Text className="text-xs text-white/80">Record the consultation live</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.white} />
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => goToConsultation(selected, 'upload')}
                  activeOpacity={0.85}
                  className="flex-row items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl mb-4"
                >
                  <View className="w-11 h-11 rounded-full bg-brand-50 items-center justify-center">
                    <Ionicons name="cloud-upload-outline" size={24} color={colors.brand} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-bold text-slate-900">Upload Audio</Text>
                    <Text className="text-xs text-slate-500">Transcribe an existing audio file</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.slate300} />
                </TouchableOpacity>

                <Button label="Cancel" variant="ghost" onPress={close} />
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
