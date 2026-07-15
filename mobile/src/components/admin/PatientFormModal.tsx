import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Field, Button, ErrorBanner } from '../ui';
import { colors } from '../../theme';
import { savePatient } from '../../services/api';
import { Patient } from '../../types';

const GENDERS = ['Male', 'Female', 'Other'];

// Stable id generator (matches AppData's uid convention).
const uid = () => `pat-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Add / edit a patient via the public POST /patients upsert. When `patient` is
 * provided it edits (keeps the id); otherwise it creates a new record.
 */
export function PatientFormModal({
  visible,
  patient,
  onClose,
  onSaved,
}: {
  visible: boolean;
  patient?: Patient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const editing = !!patient;

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(patient?.name || '');
    setAge(patient?.age ? String(patient.age) : '');
    setGender(patient?.gender || 'Male');
    setPhone(patient?.phone || '');
    setError(null);
  }, [visible, patient]);

  const submit = async () => {
    if (!name.trim()) {
      setError('Patient name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const record: Patient = {
      id: patient?.id || uid(),
      name: name.trim(),
      age: age.trim() ? Number(age) : 0,
      gender,
      phone: phone.trim() || undefined,
    };
    try {
      await savePatient(record);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save the patient.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <TouchableOpacity className="absolute inset-0 bg-black/40" activeOpacity={1} onPress={onClose} />
        <View className="bg-white rounded-t-3xl px-5" style={{ paddingBottom: insets.bottom + 16, maxHeight: '85%' }}>
          <View className="items-center pt-2.5 pb-1"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
          <View className="flex-row items-center gap-2 pt-1 pb-4">
            <View className="w-8 h-8 rounded-xl bg-brand-50 items-center justify-center">
              <Ionicons name={editing ? 'create-outline' : 'person-add-outline'} size={17} color={colors.brand} />
            </View>
            <Text className="text-lg font-bold text-slate-900 flex-1">{editing ? 'Edit Patient' : 'Add Patient'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.slate400} /></TouchableOpacity>
          </View>

          <View className="gap-3">
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            <Field label="Full name *" value={name} onChangeText={setName} placeholder="Jane Doe" />
            <View className="flex-row gap-3">
              <View className="flex-1"><Field label="Age" value={age} onChangeText={setAge} placeholder="34" keyboardType="number-pad" /></View>
              <View className="flex-1 gap-1.5">
                <Text className="text-xs font-semibold text-slate-500">Gender</Text>
                <View className="flex-row gap-1.5">
                  {GENDERS.map((g) => {
                    const on = gender === g;
                    return (
                      <TouchableOpacity key={g} onPress={() => setGender(g)} activeOpacity={0.8} className={`flex-1 py-3 rounded-xl border items-center ${on ? 'bg-brand-500 border-brand-500' : 'bg-white border-slate-200'}`}>
                        <Text className={`text-[12px] font-semibold ${on ? 'text-white' : 'text-slate-600'}`}>{g}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />
            <View className="mt-1">
              <Button label={editing ? 'Save Changes' : 'Create Patient'} icon="checkmark" onPress={submit} loading={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
