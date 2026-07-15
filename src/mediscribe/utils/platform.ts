// True only when the web app is running INSIDE the phone app's WebView shell
// (the RN WebView injects `window.ReactNativeWebView`). The native-style mobile
// UI is gated on this, so the desktop web and the mobile *browser* keep their
// existing look untouched — the redesign shows ONLY in the installed phone app.
export const isMobileApp = (): boolean =>
  typeof window !== 'undefined' &&
  !!(window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
