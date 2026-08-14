// App UI internationalization.
//
// Distinct from the *transcription* language (Settings → Default transcription
// language), which tells the speech model what was spoken. This is the language
// the interface itself is drawn in, and it only ever offers the two the product
// ships translated: English and Hindi.
//
// i18next is the engine. Components never see a raw string — they call t('key'),
// and the key is resolved from en.json / hi.json. A key missing from Hindi falls
// back to English rather than showing the raw key, so a gap in the catalogue
// degrades to untranslated text, never to "settings.title" on screen.
/* eslint-disable import/no-named-as-default-member -- i18n.use()/i18n.changeLanguage() are the documented i18next instance methods, not the same-named standalone exports */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import hi from './hi.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English' },
  { code: 'hi', label: 'Hindi', endonym: 'हिन्दी' },
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

// Device-level, NOT per-account. The login and registration screens render
// before any doctor is known, and they have to be drawn in the chosen language
// too — so the preference cannot hang off an account. It naturally survives
// logout/login and restart because it is global to the install.
const STORAGE_KEY = 'novascribe.appLanguage';

function coerce(value: unknown): AppLanguage {
  return value === 'hi' ? 'hi' : 'en';
}

/** The stored preference, or the default. Never throws. */
export async function loadStoredLanguage(): Promise<AppLanguage> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return coerce(raw);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/** Persist and apply a language. Applying re-renders every translated screen. */
export async function persistLanguage(lang: AppLanguage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // A failed write is not worth blocking on — the change still applies for
    // this session; it simply won't be remembered next launch.
  }
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/**
 * Initialise i18next with the stored language.
 *
 * Called once, before the first translated screen renders, so the app opens in
 * the right language rather than flashing English first.
 */
export async function initI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) return i18n;
  const lng = await loadStoredLanguage();
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, hi: { translation: hi } },
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    // A missing Hindi key shows the English text, not the key itself.
    returnNull: false,
    interpolation: { escapeValue: false }, // React already escapes.
    // React Native has no <Suspense> boundary here; loading synchronously from
    // the bundled JSON means there is nothing to suspend on anyway.
    react: { useSuspense: false },
  });
  return i18n;
}

export default i18n;
