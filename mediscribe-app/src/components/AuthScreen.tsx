import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Field, Button, ErrorBanner } from './ui';
import { colors } from '../theme';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/Auth';
import { forgotPassword } from '../services/api';

// Mirrors the server's rule (routes/auth.ts MIN_PASSWORD). Checked here purely
// so the doctor gets instant feedback — the server is what actually enforces it.
const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'login' | 'signup' | 'forgot';

/**
 * The app's sign-in / sign-up screen.
 *
 * Shown by the auth gate in app/_layout.tsx whenever there is no valid session,
 * so it is the only thing reachable while signed out. On success the provider
 * publishes the token and the gate re-renders straight into the app — there is
 * no navigation to perform here.
 */
export function AuthScreen() {
  const { t } = useTranslation();
  const { login, register, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  // Forgot-password is a two-step flow: request a code by email, then exchange
  // the emailed code for a new password.
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [phone, setPhone] = useState('');

  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A positive confirmation (e.g. "code sent"), shown in green, not as an error.
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  /** Swap between modes, clearing anything mode-specific. */
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setConfirm('');
    setCode('');
    setForgotStep('email');
    if (next !== 'signup') {
      setName('');
      setSpecialization('');
      setPhone('');
    }
  };

  /** Step 1: email a reset code. */
  const sendCode = async () => {
    if (!email.trim()) return setError(t('auth.validation.emailRequired'));
    if (!EMAIL_RE.test(email.trim())) return setError(t('auth.validation.emailInvalid'));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await forgotPassword(email.trim());
      setForgotStep('code');
      setNotice(t('auth.codeSentNote'));
    } catch (e: any) {
      setError(e?.message || t('auth.loginFailed'));
    } finally {
      setBusy(false);
    }
  };

  /** Step 2: exchange the code for a new password (signs in on success). */
  const doReset = async () => {
    if (!code.trim()) return setError(t('auth.validation.codeRequired'));
    if (password.length < MIN_PASSWORD) return setError(t('auth.validation.passwordTooShort'));
    if (password !== confirm) return setError(t('auth.validation.passwordMismatch'));
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      // On success the gate re-renders straight into the app.
    } catch (e: any) {
      setError(e?.message || t('auth.loginFailed'));
    } finally {
      setBusy(false);
    }
  };

  /** Client-side pre-flight. Returns an error message, or null when valid. */
  const validate = (): string | null => {
    if (!email.trim()) return t('auth.validation.emailRequired');
    if (!EMAIL_RE.test(email.trim())) return t('auth.validation.emailInvalid');
    if (!password) return t('auth.validation.passwordRequired');
    if (!isSignup) return null;
    if (!name.trim()) return t('auth.validation.nameRequired');
    if (password.length < MIN_PASSWORD) return t('auth.validation.passwordTooShort');
    if (password !== confirm) return t('auth.validation.passwordMismatch');
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        await register(name.trim(), email.trim(), password, {
          specialization: specialization.trim(),
          phone: phone.trim(),
        });
      } else {
        await login(email.trim(), password);
      }
      // No navigation here: the gate re-renders once the session lands.
    } catch (e: any) {
      setError(e?.message || (isSignup ? t('auth.signupFailed') : t('auth.loginFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="px-5 py-6 gap-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand mark + heading on the plain canvas — no coloured banner. */}
          <View className="items-center pt-6 pb-2">
            <View className="w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-4">
              <Ionicons name="medkit-outline" size={26} color={colors.brand} />
            </View>
            <Text className="text-[24px] font-bold text-slate-900 tracking-tight">
              {isForgot ? t('auth.resetPassword') : isSignup ? t('auth.createAccount') : t('auth.welcomeBack')}
            </Text>
            <Text className="text-[13.5px] text-slate-500 mt-1.5 text-center leading-5 px-6">
              {isForgot
                ? forgotStep === 'email'
                  ? t('auth.resetSubtitle')
                  : t('auth.resetCodeSubtitle')
                : isSignup
                  ? t('auth.signUpSubtitle')
                  : t('auth.signInSubtitle')}
            </Text>
          </View>

          {/* Mode switch — hidden during the reset flow, which has its own path. */}
          {!isForgot ? (
          <View className="flex-row bg-slate-100 rounded-2xl p-1">
            {(['login', 'signup'] as Mode[]).map((m) => {
              const active = mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => switchMode(m)}
                  activeOpacity={0.8}
                  className={`flex-1 py-2.5 rounded-xl items-center ${active ? 'bg-surface' : ''}`}
                  style={active ? { elevation: 1 } : undefined}
                >
                  <Text
                    className={`text-[13px] font-semibold ${
                      active ? 'text-slate-900' : 'text-slate-500'
                    }`}
                  >
                    {m === 'login' ? t('auth.signIn') : t('auth.signUp')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          ) : null}

          <Card className="p-5 gap-4" elevation="md">
            {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}
            {notice ? (
              <View className="bg-success-50 border border-success-100 rounded-2xl px-4 py-3 flex-row gap-2.5">
                <Ionicons name="mail-outline" size={16} color={colors.successDark} />
                <Text className="text-[12.5px] text-success-700 leading-4 flex-1">{notice}</Text>
              </View>
            ) : null}

            {isSignup ? (
              <Field
                label={t('auth.fullName')}
                value={name}
                onChangeText={setName}
                placeholder={t('auth.fullNamePlaceholder')}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : null}

            <Field
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />

            {/* Reset flow: request a code, then set a new password. */}
            {isForgot ? (
              forgotStep === 'email' ? (
                <>
                  <Button label={t('auth.sendCode')} icon="mail-outline" onPress={sendCode} loading={busy} />
                  <TouchableOpacity onPress={() => switchMode('login')} activeOpacity={0.7} className="items-center mt-1">
                    <Text className="text-[12.5px] font-semibold text-brand-600">{t('auth.backToSignIn')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Field
                    label={t('auth.resetCode')}
                    value={code}
                    onChangeText={setCode}
                    placeholder={t('auth.resetCodePlaceholder')}
                    keyboardType="number-pad"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <View className="gap-1.5">
                    <Text className="text-xs font-semibold text-slate-500">{t('auth.newPassword')}</Text>
                    <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4">
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder={t('auth.passwordMinPlaceholder', { count: MIN_PASSWORD })}
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
                  <Field
                    label={t('auth.confirmPassword')}
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Button label={t('auth.resetPassword')} icon="lock-closed-outline" onPress={doReset} loading={busy} />
                  <TouchableOpacity onPress={sendCode} activeOpacity={0.7} className="items-center">
                    <Text className="text-[12.5px] text-slate-500">{t('auth.resendCode')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => switchMode('login')} activeOpacity={0.7} className="items-center">
                    <Text className="text-[12.5px] font-semibold text-brand-600">{t('auth.backToSignIn')}</Text>
                  </TouchableOpacity>
                </>
              )
            ) : (
              <>
                <View className="gap-1.5">
                  <Text className="text-xs font-semibold text-slate-500">{t('auth.password')}</Text>
                  <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-4">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder={isSignup ? t('auth.passwordMinPlaceholder', { count: MIN_PASSWORD }) : t('auth.passwordPlaceholder')}
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
                  {!isSignup ? (
                    <TouchableOpacity onPress={() => switchMode('forgot')} activeOpacity={0.7} className="self-end mt-1">
                      <Text className="text-[12px] font-semibold text-brand-600">{t('auth.forgotPassword')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {isSignup ? (
                  <>
                    <Field
                      label={t('auth.confirmPassword')}
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      secureTextEntry={!showPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <Field
                      label={t('auth.specializationOptional')}
                      value={specialization}
                      onChangeText={setSpecialization}
                      placeholder={t('auth.specializationPlaceholder')}
                      autoCapitalize="words"
                    />
                    <Field
                      label={t('auth.phoneOptional')}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder={t('auth.phonePlaceholder')}
                      keyboardType="phone-pad"
                    />
                  </>
                ) : null}

                <Button
                  label={isSignup ? t('auth.createAccountCta') : t('auth.signIn')}
                  icon={isSignup ? 'person-add-outline' : 'log-in-outline'}
                  onPress={submit}
                  loading={busy}
                />

                <TouchableOpacity
                  onPress={() => switchMode(isSignup ? 'login' : 'signup')}
                  activeOpacity={0.7}
                  className="items-center mt-1"
                >
                  <Text className="text-[12.5px] text-slate-500">
                    {isSignup ? t('auth.haveAccount') + ' ' : t('auth.noAccount') + ' '}
                    <Text className="font-semibold text-brand-600">
                      {isSignup ? t('auth.signInLink') : t('auth.signUpLink')}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Card>

          {isSignup ? (
            <View className="bg-slate-100 rounded-2xl px-4 py-3 flex-row gap-2.5">
              <Ionicons name="lock-closed-outline" size={15} color={colors.slate500} />
              <Text className="text-[11.5px] text-slate-500 leading-4 flex-1">
                {t('auth.privacyNote')}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
