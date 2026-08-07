import type { ConfigContext, ExpoConfig } from 'expo/config';

// ONE Expo project, TWO apps.
//
// The base app.json is the MediScribe identity — mic permission, expo-audio and
// speech-recognition, com.nextdot.novascribeai — because the scribe is the one
// that genuinely needs native capability. ClinicBook is the booking desk: it
// records nothing, so it must NOT ship a microphone permission (Play Store asks
// why, and "we don't use it" is not an answer).
//
// This file used to hardcode the ClinicBook override, which meant the tree could
// only ever build one of the two — and whichever it was, the other silently got
// the wrong identity and the wrong permissions. The flavour is now explicit:
//
//   EXPO_PUBLIC_APP_FLAVOR=clinicbook   → ClinicBook AI  (no mic)
//   EXPO_PUBLIC_APP_FLAVOR=mediscribe   → MediScribe AI  (mic, the base)
//   unset                               → the base, i.e. MediScribe
//
// Both stay separate installs and separate store listings via their own bundle
// ids; only the EAS project is shared, for build tracking.

export type AppFlavor = 'clinicbook' | 'mediscribe';

export const resolveFlavor = (raw?: string): AppFlavor =>
  (raw || '').trim().toLowerCase() === 'clinicbook' ? 'clinicbook' : 'mediscribe';

export default ({ config }: ConfigContext): ExpoConfig => {
  const flavor = resolveFlavor(process.env.EXPO_PUBLIC_APP_FLAVOR);
  const base = config as ExpoConfig;

  // MediScribe is the base app.json as-is — nothing to override.
  if (flavor === 'mediscribe') return base;

  const bundleId = 'com.nextdot.clinicbookai';
  const splashPlugin = (base.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === 'expo-splash-screen'
  );

  return {
    ...base,
    name: 'ClinicBook AI',
    // slug stays the base one so this flavour builds under the existing EAS
    // project. It is still a SEPARATE app on the device and in the store — that
    // is decided by the bundle id below, not the slug.
    scheme: 'clinicbookapp',
    ios: {
      ...base.ios,
      bundleIdentifier: bundleId,
      // The booking desk never records — drop the scribe's mic/speech strings.
      infoPlist: undefined
    },
    android: {
      ...base.android,
      package: bundleId,
      permissions: [],
      adaptiveIcon: {
        ...(base.android?.adaptiveIcon ?? {}),
        backgroundColor: '#047857' // emerald, matches ClinicBook
      }
    },
    // Router + splash only. expo-audio and expo-speech-recognition exist purely
    // for the scribe's live recording and would drag the mic permission back in.
    plugins: ['expo-router', ...(splashPlugin ? [splashPlugin] : [])],
    extra: {
      ...base.extra,
      eas: {
        // Shared EAS project by default. Give ClinicBook its own later with
        // `eas init` and EAS_PROJECT_ID_CLINICBOOK.
        projectId: process.env.EAS_PROJECT_ID_CLINICBOOK || base.extra?.eas?.projectId
      }
    }
    // TODO: ClinicBook-branded icons under assets/images/clinicbook/ — until then
    // it reuses the base artwork, so both apps share an icon on the home screen.
  };
};
