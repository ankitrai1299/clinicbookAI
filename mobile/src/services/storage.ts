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
  theme: 'system' | 'light' | 'dark';
}

const KEY = 'novascribe.settings';

const DEFAULTS: Settings = {
  doctorName: '',
  qualification: '',
  registrationNumber: '',
  clinicName: '',
  signatureUri: '',
  defaultLanguage: 'auto',
  theme: 'system',
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Ignore persistence failures — settings are non-critical.
  }
}
