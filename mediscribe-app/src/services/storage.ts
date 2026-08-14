// Local device settings (replaces the web app's localStorage). Clinical data
// still lives in MongoDB via the backend — this only holds the doctor's profile
// and UI preferences used for reports/signatures and app behaviour.
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Settings {
  // Doctor profile (used on report headers / signatures).
  doctorName: string;
  qualification: string;
  registrationNumber: string;
  clinicName: string;
  signatureUri: string; // local image URI of the uploaded signature
  // Preferences.
  defaultLanguage: string; // 'auto' | 'en' | 'hi' | …
  theme: 'light' | 'dark';
}

// Settings are stored PER ACCOUNT.
//
// They used to live under one global key, which on a shared handset meant the
// next doctor to sign in inherited the previous one's profile — including their
// uploaded signature image, which would then be stamped on someone else's
// reports. The scope is published by AuthProvider on login/logout, mirroring
// how api.ts receives the session token.
const BASE_KEY = 'novascribe.settings';

let scope: string | null = null;

/** Called by AuthProvider whenever the signed-in account changes. */
export function setSettingsScope(userId: string | null): void {
  scope = userId || null;
}

const storageKey = (): string => (scope ? `${BASE_KEY}.${scope}` : BASE_KEY);

const DEFAULTS: Settings = {
  doctorName: '',
  qualification: '',
  registrationNumber: '',
  clinicName: '',
  signatureUri: '',
  defaultLanguage: 'auto',
  theme: 'light',
};

/**
 * Coerce a stored theme to one this build understands.
 *
 * Appearance used to offer a third option, 'system'. Anyone who chose it still
 * has that string on disk, and the spread in loadSettings would carry it
 * straight through as a value nothing now handles. Anything unrecognised falls
 * back to the default rather than being trusted.
 */
function normalizeTheme(value: unknown): Settings['theme'] {
  return value === 'dark' ? 'dark' : 'light';
}

export async function loadSettings(): Promise<Settings> {
  try {
    let raw = await AsyncStorage.getItem(storageKey());
    // One-time adoption of the pre-scoping settings. Whoever signs in first on
    // this device is the doctor those settings belonged to, so they inherit
    // them rather than starting blank; the global key is then left behind and
    // never read again for any other account.
    if (!raw && scope) {
      const legacy = await AsyncStorage.getItem(BASE_KEY);
      if (legacy) {
        await AsyncStorage.setItem(storageKey(), legacy);
        await AsyncStorage.removeItem(BASE_KEY).catch(() => {});
        raw = legacy;
      }
    }
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, theme: normalizeTheme(parsed?.theme) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(), JSON.stringify(settings));
  } catch {
    // Ignore persistence failures — settings are non-critical.
  }
}

/**
 * The doctor's profile as the SERVER stores it, mapped onto the four fields the
 * Settings screen shows. The account record is the source of truth; the local
 * copy is only a cache so reports still render before the network answers.
 *
 * The mapping exists because the two sides were named independently — the app
 * asks for "qualification" and "clinic", the user record has carried
 * `specialization` and `hospital` since the admin console defined it. Renaming
 * either side would break the other, so they are translated in one place.
 */
export function profileFromUser(user: {
  name?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
}): Pick<Settings, 'doctorName' | 'qualification' | 'registrationNumber' | 'clinicName'> {
  return {
    doctorName: user.name || '',
    qualification: user.specialization || '',
    registrationNumber: user.licenseNumber || '',
    clinicName: user.hospital || '',
  };
}

/** The inverse: Settings fields → the PATCH /auth/me body. */
export function profileToPatch(settings: Settings): {
  name: string;
  specialization: string;
  licenseNumber: string;
  hospital: string;
} {
  return {
    name: settings.doctorName,
    specialization: settings.qualification,
    licenseNumber: settings.registrationNumber,
    hospital: settings.clinicName,
  };
}

/**
 * Refresh the cached profile from the account record.
 *
 * Called on login and on session restore, so every screen that reads settings —
 * the dashboard greeting, the consultation header, the report signature — sees
 * the stored profile immediately, without having to open Settings first.
 * Preferences already on the device (language, theme, signature) are untouched.
 */
export async function syncProfileFromUser(user: {
  id: string;
  name?: string;
  specialization?: string;
  licenseNumber?: string;
  hospital?: string;
}): Promise<void> {
  const local = await loadSettings();
  await saveSettings({ ...local, ...profileFromUser(user) });
}
