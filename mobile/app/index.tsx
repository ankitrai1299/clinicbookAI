import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { WEB_APP_URL } from '../src/config';
import { colors } from '../src/theme';

// ─────────────────────────────────────────────────────────────
// The whole phone app: one full-screen WebView loading the deployed web
// NovaScribe (same login, same functions, always in sync). A tiny JS bridge
// carries the report/transcript PDF (rendered on the server) out to the native
// share sheet, and the microphone permission is pre-granted so live recording
// and audio upload work exactly like the browser.
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

export default function App() {
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Cache-bust the initial document each launch (and on Retry) so the app always
  // loads the LATEST deployed web — never a stale WebView-cached page. Hashed JS
  // bundles still cache normally (a new deploy = new hashes = fetched fresh).
  const url = useMemo(() => `${WEB_APP_URL}&_ts=${Date.now()}`, [reloadKey]);

  // Pre-grant the OS microphone permission so the WebView can auto-grant the
  // site's getUserMedia() request (mediaCapturePermissionGrantType="grant").
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => {});
    }
  }, []);

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

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.title}>Can’t reach NovaScribe</Text>
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
            // Live recording + audio upload: play/capture without a user gesture,
            // and auto-grant mic capture (OS permission is requested above).
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
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
