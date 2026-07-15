import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, GradientCard, Field, Button, ErrorBanner } from '../ui';
import { colors, gradients } from '../../theme';
import { useAuth } from '../../context/Auth';

/**
 * Brand admin login card. Calls useAuth().login(); on success the surrounding
 * gate re-renders to the dashboard. Includes the seeded-credentials hint so the
 * console can be exercised out of the box.
 */
export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || 'Login failed. Check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  const useSeeded = () => {
    setEmail('admin@novascribe.ai');
    setPassword('ChangeMe123!');
    setError(null);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="gap-4">
      <GradientCard colors={gradients.brand as unknown as string[]} glow className="p-6 items-center">
        <View className="w-16 h-16 rounded-3xl bg-white/20 items-center justify-center mb-3">
          <Ionicons name="shield-checkmark" size={30} color={colors.white} />
        </View>
        <Text className="text-white text-[22px] font-bold tracking-tight">Admin Console</Text>
        <Text className="text-white/80 text-[13px] mt-1 text-center">
          Sign in to manage doctors, patients, consultations and analytics.
        </Text>
      </GradientCard>

      <Card className="p-5 gap-4" elevation="md">
        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="admin@novascribe.ai"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <View className="gap-1.5">
          <Text className="text-xs font-semibold text-slate-500">Password</Text>
          <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.slate400}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 py-3.5 text-[15px] text-slate-900"
            />
            <TouchableOpacity onPress={() => setShowPw((s) => !s)} hitSlop={8}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.slate400} />
            </TouchableOpacity>
          </View>
        </View>

        <Button label="Sign In" icon="log-in-outline" onPress={submit} loading={busy} />

        <TouchableOpacity onPress={useSeeded} activeOpacity={0.7} className="flex-row items-center justify-center gap-1.5 mt-1">
          <Ionicons name="sparkles-outline" size={13} color={colors.brand} />
          <Text className="text-[12px] font-semibold text-brand-600">Use seeded admin credentials</Text>
        </TouchableOpacity>
      </Card>

      <View className="bg-slate-100 rounded-2xl px-4 py-3">
        <Text className="text-[11px] text-slate-500 leading-4">
          <Text className="font-bold text-slate-600">Test admin</Text>{'\n'}
          admin@novascribe.ai · ChangeMe123!
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
