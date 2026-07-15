import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AppDataProvider } from '../src/context/AppData';
import { AuthProvider } from '../src/context/Auth';
import { useInterFonts, patchDefaultFont } from '../src/fonts';
import { colors } from '../src/theme';

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
        <AuthProvider>
          <AppDataProvider>
            <StatusBar style="dark" />
            {/* Routes are auto-discovered from the file system (app/(tabs),
                app/consultation/[id], app/patient/[id], app/admin/*). We
                intentionally do NOT hand-enumerate <Stack.Screen> children —
                doing so produces "No route named … exists" warnings whenever the
                list drifts from the files. Each detail screen sets its own
                options inline. */}
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
          </AppDataProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
