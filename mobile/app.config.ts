import type { ConfigContext, ExpoConfig } from 'expo/config';

// Flavor-aware Expo config. The phone app is ClinicBook by DEFAULT now:
//
//   (default)                    → ClinicBook AI — own name, id, scheme, no mic
//   EXPO_PUBLIC_APP=novascribe   → NovaScribe    — returns app.json UNCHANGED
//
// NovaScribe is kept only as an opt-in path so a fresh NovaScribe app can be built
// later; a plain `eas build` now produces ClinicBook.

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EXPO_PUBLIC_APP === 'novascribe') {
    return config as ExpoConfig; // NovaScribe (opt-in) — exactly what app.json defines.
  }

  // ClinicBook — the default build.
  const bundleId = 'com.nextdot.clinicbookai';
  const splashPlugin = (config.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === 'expo-splash-screen'
  );

  return {
    ...(config as ExpoConfig),
    name: 'ClinicBook AI',
    // NOTE: slug is intentionally left as the base ('mediscribe-app') so this
    // flavor builds under the existing EAS project for now. The app is still a
    // SEPARATE install/store app via its own bundle id below. For a dedicated
    // ClinicBook EAS project + Play Store listing, run `eas init` for it and set
    // EAS_PROJECT_ID_CLINICBOOK; then this can become slug: 'clinicbook-app'.
    scheme: 'clinicbookapp',
    ios: {
      ...config.ios,
      bundleIdentifier: bundleId,
      // The clinic-admin app is a booking desk — no microphone / speech usage.
      infoPlist: undefined,
    },
    android: {
      ...config.android,
      package: bundleId,
      // Drop the mic permissions NovaScribe needs; ClinicBook never records.
      permissions: [],
    },
    // Keep only the router + splash; drop expo-audio / expo-speech-recognition,
    // which exist purely for the scribe's live recording.
    plugins: ['expo-router', ...(splashPlugin ? [splashPlugin] : [])],
    extra: {
      ...config.extra,
      eas: {
        // Works out of the box: ClinicBook builds under the SAME EAS project for
        // tracking (the apps are still separate — different bundle id + store
        // listing). To give ClinicBook its OWN EAS project later, run `eas init`
        // for it and set EAS_PROJECT_ID_CLINICBOOK.
        projectId: process.env.EAS_PROJECT_ID_CLINICBOOK || config.extra?.eas?.projectId,
      },
    },
    // TODO: add ClinicBook-branded icons under assets/images/clinicbook/ and point
    // `icon` / `android.adaptiveIcon` here. Until then it reuses the NovaScribe
    // artwork so the build still succeeds.
  };
};
