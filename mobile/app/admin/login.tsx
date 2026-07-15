import React, { useEffect } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AdminHeader } from '../../src/components/admin/shared';
import { LoginForm } from '../../src/components/admin/LoginForm';
import { useAuth } from '../../src/context/Auth';
import { colors } from '../../src/theme';

// Standalone admin login route. The Admin tab gates inline too; this exists so
// deep links / redirects have a dedicated sign-in surface.
export default function AdminLoginRoute() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user) router.replace('/admin');
  }, [user, router]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AdminHeader title="Admin Sign In" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center gap-1.5 mb-4">
          <Ionicons name="sparkles" size={13} color={colors.brand} />
          <Text className="text-[13px] font-bold text-brand-500 tracking-tight">NovaScribe AI · Admin</Text>
        </View>
        <LoginForm onSuccess={() => router.replace('/admin')} />
      </ScrollView>
    </SafeAreaView>
  );
}
