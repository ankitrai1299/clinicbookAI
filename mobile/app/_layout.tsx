import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../src/theme';

// The phone app is a thin WebView shell around the deployed web NovaScribe, so it
// carries no native auth/data providers of its own — the web app owns login and
// every screen. We only set up the safe-area + gesture roots and a single route.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useEffect(() => {
    // Hide the splash right away; the WebView shows its own loading state while
    // the site boots, so there's nothing to wait for here.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
