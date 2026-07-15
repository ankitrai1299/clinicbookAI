import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Field, Button, ErrorBanner } from '../ui';
import { colors } from '../../theme';
import { useAuth } from '../../context/Auth';
import { createDoctor, updateDoctor, DoctorInput } from '../../services/api';
import { AuthUser } from '../../contracts';

/**
 * Add / edit a doctor. When `doctor` is provided the modal edits it (password
 * optional); otherwise it creates a new one. Calls onSaved(saved) on success.
 */
export function DoctorFormModal({
  visible,
  doctor,
  onClose,
  onSaved,
}: {
  visible: boolean;
  doctor?: AuthUser | null;
  onClose: () => void;
  onSaved: (saved: AuthUser) => void;
}) {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const editing = !!doctor;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [hospital, setHospital] = useState('');
  const [experience, setExperience] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(doctor?.name || '');
    setEmail(doctor?.email || '');
    setPassword('');
    setSpecialization(doctor?.specialization || '');
    setLicenseNumber(doctor?.licenseNumber || '');
    setHospital(doctor?.hospital || '');
    setExperience(doctor?.experience != null ? String(doctor.experience) : '');
    setPhone(doctor?.phone || '');
    setError(null);
  }, [visible, doctor]);

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (!editing && !password) {
      setError('Set an initial password for the new doctor.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload: DoctorInput = {
      name: name.trim(),
      email: email.trim(),
      specialization: specialization.trim() || undefined,
      licenseNumber: licenseNumber.trim() || undefined,
      hospital: hospital.trim() || undefined,
      experience: experience.trim() ? Number(experience) : undefined,
      phone: phone.trim() || undefined,
    };
    if (password) payload.password = password;
    try {
      const saved = editing
        ? await updateDoctor(doctor!.id, payload, token)
        : await createDoctor(payload, token);
      onSaved(saved);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save the doctor.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <TouchableOpacity className="absolute inset-0 bg-black/40" activeOpacity={1} onPress={onClose} />
        <View className="bg-white rounded-t-3xl" style={{ paddingBottom: insets.bottom + 12, maxHeight: '90%' }}>
          <View className="items-center pt-2.5 pb-1"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
          <View className="flex-row items-center gap-2 px-5 pt-1 pb-3">
            <View className="w-8 h-8 rounded-xl bg-brand-50 items-center justify-center">
              <Ionicons name={editing ? 'create-outline' : 'person-add-outline'} size={17} color={colors.brand} />
            </View>
            <Text className="text-lg font-bold text-slate-900 flex-1">{editing ? 'Edit Doctor' : 'Add Doctor'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={colors.slate400} /></TouchableOpacity>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            <Field label="Full name *" value={name} onChangeText={setName} placeholder="Dr. Jane Doe" />
            <Field label="Email *" value={email} onChangeText={setEmail} placeholder="jane@hospital.com" autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            <Field
              label={editing ? 'Reset password (optional)' : 'Initial password *'}
              value={password}
              onChangeText={setPassword}
              placeholder={editing ? 'Leave blank to keep current' : 'Set a password'}
              secureTextEntry
              autoCapitalize="none"
            />
            <Field label="Specialization" value={specialization} onChangeText={setSpecialization} placeholder="Cardiology" />
            <Field label="License number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="MCI-123456" autoCapitalize="characters" />
            <Field label="Hospital / clinic" value={hospital} onChangeText={setHospital} placeholder="City General Hospital" />
            <Field label="Experience (years)" value={experience} onChangeText={setExperience} placeholder="8" keyboardType="number-pad" />
            <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" />
            <View className="mt-1">
              <Button label={editing ? 'Save Changes' : 'Create Doctor'} icon="checkmark" onPress={submit} loading={busy} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
