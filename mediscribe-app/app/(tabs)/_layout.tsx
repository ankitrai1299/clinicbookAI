import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/context/Theme';
import { shadow } from '../../src/theme';

type Ion = keyof typeof Ionicons.glyphMap;

// Bottom-tab navigation. Transcripts / reports / prescriptions are reached via
// patient profiles and sessions, so there is no separate "Records" tab.
// `titleKey` is resolved through i18n at render so the labels follow the app
// language.
// The assistant is intentionally NOT here: it is reached from a floating "Ask"
// button that overlays every screen (see AskFab in app/_layout.tsx), so it has
// no tab of its own. Its route still lives at app/(tabs)/assistant.tsx and is
// registered below with `href: null` to keep it navigable without a tab button.
const TABS: { name: string; titleKey: string; icon: Ion; iconActive: Ion }[] = [
  { name: 'index', titleKey: 'nav.home', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'patients', titleKey: 'nav.patients', icon: 'people-outline', iconActive: 'people' },
  { name: 'sessions', titleKey: 'nav.sessions', icon: 'pulse-outline', iconActive: 'pulse' },
  { name: 'settings', titleKey: 'nav.settings', icon: 'settings-outline', iconActive: 'settings' },
];

// Height of the bar itself, above whatever the device reserves at the bottom.
const BAR_HEIGHT = 60;

export default function TabsLayout() {
  // The real bottom inset: the iPhone home indicator, or an Android gesture
  // pill. 0 on devices with hardware/3-button navigation.
  //
  // This replaces `height: iOS ? 88 : 68` with `paddingBottom: iOS ? 28 : 10`.
  // Those constants were a guess at one specific device: 28 is short of the
  // 34pt home indicator on every modern iPhone, and Android's flat 10 ignored
  // gesture insets entirely, so on gesture-nav Android the labels sat under the
  // system pill. Measuring instead of guessing also means notch-less devices
  // stop paying for padding they don't need.
  const insets = useSafeAreaInsets();

  // Subscribed via the hook rather than the ambient `colors` import: the tab
  // bar is configured through a style object, not Tailwind classes, so nothing
  // would re-render it when the theme flips and it would keep the old palette.
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.slate400,
        tabBarStyle: {
          // `surface`, not `white` — this is a surface and must darken with the
          // theme. `white` stays #FFFFFF by design (it is the colour of content
          // on the brand gradient), so using it here left a white bar in dark.
          backgroundColor: colors.surface,
          borderTopColor: colors.slate100,
          borderTopWidth: 1,
          height: BAR_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          ...shadow.lg,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={size - 1} color={color} />
            ),
          }}
        />
      ))}
      {/* Registered but hidden from the bar — opened via the floating Ask button. */}
      <Tabs.Screen name="assistant" options={{ href: null }} />
    </Tabs>
  );
}
