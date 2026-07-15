import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../../src/theme';
import { useAuth } from '../../src/context/Auth';
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
  const { user, hasPermission } = useAuth();
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
