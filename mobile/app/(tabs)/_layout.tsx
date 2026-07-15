import { Tabs } from 'expo-router';
import { Platform, View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../../src/theme';
import { useAuth } from '../../src/context/Auth';
import { LoginForm } from '../../src/components/admin/LoginForm';
import type { Permission } from '../../src/contracts';

type Ion = keyof typeof Ionicons.glyphMap;

// Bottom-tab navigation. Transcripts / reports / prescriptions are reached via
// patient profiles and sessions, so there is no separate "Records" tab. Each tab
// is gated by a permission (RBAC) — hidden for roles that can't access it.
const TABS: { name: string; title: string; icon: Ion; iconActive: Ion; permission: Permission }[] = [
  { name: 'index', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid', permission: 'dashboard.view' },
  { name: 'patients', title: 'Patients', icon: 'people-outline', iconActive: 'people', permission: 'patients.view' },
  { name: 'sessions', title: 'Sessions', icon: 'pulse-outline', iconActive: 'pulse', permission: 'consultations.view' },
  { name: 'admin', title: 'Admin', icon: 'shield-outline', iconActive: 'shield', permission: 'analytics.view' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconActive: 'settings', permission: 'settings.view' },
];

export default function TabsLayout() {
  const { user, loading, hasPermission } = useAuth();

  // USER-BASED login (same as web): the whole app sits behind sign-in. No role
  // picker — the account's role (from the backend) decides which tabs show.
  if (loading) return null; // splash covers the hydrate
  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center gap-1.5 mb-4">
            <Ionicons name="medkit" size={13} color={colors.brand} />
            <Text className="text-[13px] font-bold text-brand-500 tracking-tight">MediScribe AI</Text>
          </View>
          <LoginForm />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Permissive until the user loads so tabs don't flash empty.
  const canView = (p: Permission) => !user || hasPermission(p);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.slate400,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.slate100,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          ...shadow.lg,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            // Hide the tab entirely for roles without the permission.
            href: canView(t.permission) ? undefined : null,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? t.iconActive : t.icon} size={size - 1} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
