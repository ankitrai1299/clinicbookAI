import '../global.css';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AppDataProvider } from '../src/context/AppData';
import { DateFilterProvider } from '../src/context/DateFilter';
import { AuthProvider, useAuth } from '../src/context/Auth';
import { ThemeProvider, useTheme } from '../src/context/Theme';
import { LanguageProvider, useLanguage } from '../src/context/Language';
import { AuthScreen } from '../src/components/AuthScreen';
import AskFab from '../src/components/AskFab';
import { useInterFonts, patchDefaultFont } from '../src/fonts';

// Render Inter in the correct weight everywhere (must run before first render).
patchDefaultFont();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useInterFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Keep the splash up until Inter is ready so the app never flashes a system
  // font first. `fontError` still unblocks so a font-load failure isn't fatal.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* LanguageProvider and ThemeProvider both wrap AuthProvider: the sign-in
            and registration screens render while signed OUT and still have to be
            drawn in the saved language and theme. Language is outermost so every
            screen below it, including those two, is translated. */}
        <LanguageProvider>
          <ThemeProvider>
            <AuthProvider>
              <Themed />
            </AuthProvider>
          </ThemeProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Applies theme-dependent chrome (status bar, stack background) around the gate. */
function Themed() {
  const { isDark, colors, loading } = useTheme();
  const { loading: langLoading } = useLanguage();

  // Hold the first paint until BOTH the theme and the language have loaded.
  // Each is a single AsyncStorage read; without the theme guard a doctor who
  // chose dark gets a white flash, and without the language guard a Hindi user
  // sees a frame of English before the catalogue applies.
  if (loading || langLoading) return null;

  return (
    <>
      {/* Light content (white icons) belongs on a dark bar, and vice versa. */}
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <AuthGate />
      </View>
    </>
  );
}

/**
 * Gates the entire app behind a valid session.
 *
 * Every screen — dashboard, patients, sessions, reports — sits inside
 * this, so there is no route that renders clinical data while signed out. The
 * server enforces the same rule (every /api/doctor route is 401 without a
 * token); this is the UI half, so a signed-out app shows a login screen rather
 * than a stack of failed requests.
 *
 * AppDataProvider is deliberately mounted INSIDE the gate: it is per-doctor
 * state, so it should not exist at all until we know which doctor it belongs
 * to, and it unmounts (dropping every cached record) on sign-out.
 */
function AuthGate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  // Restoring a stored session. Blank-but-branded beats flashing the login
  // screen at a doctor who is in fact already signed in.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <AppDataProvider>
      {/* The dashboard's date filter is shared with the drill-down screens, so
          opening a card carries the selected range into it. Inside the gate
          alongside AppDataProvider — it is per-session state, and a signed-out
          app has nothing to filter. */}
      <DateFilterProvider>
      <View style={{ flex: 1 }}>
        {/* Routes are auto-discovered from the file system (app/(tabs),
            app/consultation/[id], app/patient/[id]). We
            intentionally do NOT hand-enumerate <Stack.Screen> children —
            doing so produces "No route named … exists" warnings whenever the
            list drifts from the files. Each detail screen sets its own
            options inline. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
        {/* Floating "Ask" button — the assistant's only entry point, on top of
            every screen. */}
        <AskFab />
      </View>
      </DateFilterProvider>
    </AppDataProvider>
  );
}
