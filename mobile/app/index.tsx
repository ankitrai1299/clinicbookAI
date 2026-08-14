import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { WEB_APP_URL, APP_LABEL } from '../src/config';
import { colors } from '../src/theme';

// ─────────────────────────────────────────────────────────────
// The whole phone app: one full-screen WebView loading the deployed web
// NovaScribe (same login, same functions, always in sync). A tiny JS bridge
// carries the report/transcript PDF (rendered on the server) out to the native
// share sheet, and the microphone permission is requested at runtime so live
// recording and audio upload work exactly like the browser.
// ─────────────────────────────────────────────────────────────

// Turn a `data:application/pdf;base64,XXXX` URL into a shareable file and open the
// native share/print sheet. Falls back silently if sharing isn't available.
async function sharePdf(filename: string, dataUrl: string): Promise<void> {
  try {
    const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
    const safe = (filename || 'report.pdf').replace(/[^a-z0-9._-]/gi, '_') || 'report.pdf';
    const uri = `${FileSystem.cacheDirectory}${safe}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: safe,
        UTI: 'com.adobe.pdf',
      });
    }
  } catch (err) {
    console.error('[webview] share pdf failed', err);
  }
}

// Open the NATIVE Android print dialog for the report/transcript HTML. This shows
// any connected printer + "Save as PDF" and has its own Cancel/Back — unlike a
// WebView popup, which can't print and traps the user with no working Back.
async function printDoc(html: string): Promise<void> {
  try {
    await Print.printAsync({ html });
  } catch (err) {
    console.error('[webview] print failed', err);
  }
}

export default function App() {
  const webRef = useRef<WebView>(null);

  // Android runtime microphone permission.
  //
  // Declaring RECORD_AUDIO in app.json only puts it in the manifest. Until the
  // APP is granted it at runtime, getUserMedia inside the WebView is refused —
  // which is exactly why recording did nothing in the app while working in a
  // browser. Asked once on launch, before the doctor is mid-consultation with a
  // patient in front of them.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'MediScribe records the consultation to write the note. Audio never leaves your clinic account.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    }).catch(() => {
      // Denied or unavailable: the web layer already surfaces its own
      // "microphone access is required" message when a recording is attempted.
    });
  }, []);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Cache-bust the initial document each launch (and on Retry) so the app always
  // loads the LATEST deployed web — never a stale WebView-cached page. Hashed JS
  // bundles still cache normally (a new deploy = new hashes = fetched fresh).
  const url = useMemo(() => `${WEB_APP_URL}&_ts=${Date.now()}`, [reloadKey]);

  // Android hardware back navigates the WebView history instead of closing the app.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.type === 'pdf' && typeof msg.dataUrl === 'string') {
        void sharePdf(msg.filename, msg.dataUrl);
      } else if (msg?.type === 'print' && typeof msg.html === 'string') {
        void printDoc(msg.html);
      } else if (msg?.type === 'openExternal' && typeof msg.url === 'string') {
        // The WhatsApp/Meta sign-in can't run inside a WebView, so the page asks
        // us to open it in the system browser instead.
        void Linking.openURL(msg.url).catch((err) => console.error('[webview] openExternal failed', err));
      }
    } catch {
      // non-JSON messages from the page are ignored
    }
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Only the TOP edge is inset natively.
  //
  // 'bottom' padded the area BELOW the WebView with the device's bottom inset —
  // a band of canvas the web page cannot reach or paint, sitting under the app's
  // own tab bar. That was the empty strip at the foot of every screen. The web
  // handles its own bottom spacing (the tab bar reserves
  // env(safe-area-inset-bottom), capped), so the WebView now runs to the real
  // bottom of the screen.
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.title}>Can’t reach {APP_LABEL}</Text>
          <Text style={styles.subtitle}>
            Check your internet connection and try again.
          </Text>
          <TouchableOpacity style={styles.button} onPress={retry} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <WebView
            key={reloadKey}
            ref={webRef}
            source={{ uri: url }}
            originWhitelist={['*']}
            // Always revalidate the document against the network so a new web
            // deploy shows up on next launch without reinstalling the app.
            cacheMode="LOAD_NO_CACHE"
            // Core web features the scribe relies on.
            javaScriptEnabled
            domStorageEnabled
            // Live recording + audio upload: play/capture without a user gesture.
            // Android grants the WebView's getUserMedia only once the APP itself
            // holds RECORD_AUDIO, which is what the effect above requests.
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="prompt"
            // Keep target=_blank navigations inside this WebView (no orphan popups).
            setSupportMultipleWindows={false}
            allowFileAccess
            // Native pull-to-refresh (iOS) + Android GPU rendering for smoothness.
            pullToRefreshEnabled
            androidLayerType="hardware"
            onNavigationStateChange={(nav) => {
              canGoBack.current = nav.canGoBack;
            }}
            onMessage={onMessage}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={() => setLoading(false)}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            )}
          />
          {loading && (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.slate900, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: colors.slate500, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: colors.brand, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 999 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
