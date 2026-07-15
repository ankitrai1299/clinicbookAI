import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../../src/theme';

type Ion = keyof typeof Ionicons.glyphMap;

// Bottom-tab navigation. Transcripts / reports / prescriptions are reached via
// patient profiles and sessions, so there is no separate "Records" tab.
const TABS: { name: string; title: string; icon: Ion; iconActive: Ion }[] = [
  { name: 'index', title: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'patients', title: 'Patients', icon: 'people-outline', iconActive: 'people' },
  { name: 'sessions', title: 'Sessions', icon: 'pulse-outline', iconActive: 'pulse' },
  { name: 'admin', title: 'Admin', icon: 'shield-outline', iconActive: 'shield' },
  { name: 'settings', title: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
];

export default function TabsLayout() {
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
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? t.iconActive : t.icon} size={size - 1} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
