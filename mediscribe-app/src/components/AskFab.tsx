// Floating "Ask" button — a single brand circle in the bottom-right corner that
// opens the analytics assistant from anywhere in the app.
//
// The assistant has no tab of its own (see app/(tabs)/_layout.tsx); this FAB is
// its only entry point, rendered once at the root so it overlays every screen —
// dashboard, patients, a consultation, a report. It hides itself on the
// assistant screen (nothing to open) and while the keyboard is up (so it never
// sits over what someone is typing).
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../context/Theme';
import { shadow } from '../theme';

export default function AskFab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const colors = useThemeColors();
  const { t } = useTranslation();
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Already on the assistant, or someone is typing — get out of the way.
  if (pathname === '/assistant' || keyboardUp) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push('/assistant')}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={t('nav.assistant')}
      style={{
        position: 'absolute',
        right: 16,
        bottom: insets.bottom + 74,
        alignItems: 'center',
        ...shadow.lg,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="sparkles" size={24} color={colors.white} />
      </View>
      <Text style={{ color: colors.brand, fontSize: 10.5, fontWeight: '700', marginTop: 3 }}>
        {t('assistant.ask')}
      </Text>
    </TouchableOpacity>
  );
}
