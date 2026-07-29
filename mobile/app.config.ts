import type { ConfigContext, ExpoConfig } from 'expo/config';

// Flavor-aware Expo config. ONE codebase → TWO store apps:
//
//   (default)                    → NovaScribe    — returns app.json UNCHANGED
//   EXPO_PUBLIC_APP=clinicbook   → ClinicBook AI — own name, id, scheme, no mic
//
// The flavor is set per EAS build profile (see eas.json). Because the default
// path returns app.json verbatim, every existing NovaScribe build is byte-for-byte
// unchanged — this file only adds the ClinicBook variant.
//
// ClinicBook is its OWN app in the stores (distinct bundle id + EAS project). Run
// `eas init` once for it and set EAS_PROJECT_ID_CLINICBOOK so its builds never
// collide with the NovaScribe project.

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EXPO_PUBLIC_APP !== 'clinicbook') {
    return config as ExpoConfig; // NovaScribe — exactly what app.json defines.
  }

  const bundleId = 'com.nextdot.clinicbookai';
  const splashPlugin = (config.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === 'expo-splash-screen'
  );

  return {
    ...(config as ExpoConfig),
    name: 'ClinicBook AI',
    slug: 'clinicbook-app',
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
        // Set after `eas init` for the ClinicBook app (its own project id).
        projectId: process.env.EAS_PROJECT_ID_CLINICBOOK || undefined,
      },
    },
    // TODO: add ClinicBook-branded icons under assets/images/clinicbook/ and point
    // `icon` / `android.adaptiveIcon` here. Until then it reuses the NovaScribe
    // artwork so the build still succeeds.
  };
};
