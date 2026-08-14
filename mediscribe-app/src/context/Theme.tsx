import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { loadSettings, saveSettings, Settings } from '../services/storage';
import { lightColors, darkColors, type Palette } from '../theme';

export type ThemePreference = Settings['theme']; // 'light' | 'dark'
// Kept as a distinct name because call sites read `scheme` to mean "what is
// actually on screen". With the System option gone it is the same set of
// values as the preference, and no longer needs resolving against the OS.
export type ResolvedScheme = ThemePreference;

interface ThemeValue {
  /** What the doctor picked. */
  preference: ThemePreference;
  /** Alias of `preference`, kept so screens can read intent-revealing names. */
  scheme: ResolvedScheme;
  /** Palette for `color=` props (icons, ActivityIndicator, placeholders). */
  colors: Palette;
  isDark: boolean;
  /** Persisted immediately; the UI updates on the same tick. */
  setPreference: (next: ThemePreference) => void;
  /** True until the stored preference has been read. */
  loading: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Theme state for the whole app.
 *
 * Before this existed, `settings.theme` was written to AsyncStorage and then
 * never read by anything except the Settings screen's own highlight — the
 * toggle changed a stored string and nothing else, which is why switching
 * appeared to do nothing.
 *
 * Two things have to move together for a switch to be visible:
 *   1. NativeWind's colour scheme, which toggles the `dark` class that drives
 *      every themed Tailwind class (see global.css / tailwind.config.js).
 *   2. The `colors` object, for props that take a literal colour string and so
 *      can't go through Tailwind at all.
 *
 * Both are derived from the same resolved scheme here, so they cannot drift.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Light is the default for a fresh install, matching DEFAULTS in storage.ts.
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [loading, setLoading] = useState(true);

  // Nothing to resolve any more: the preference IS the scheme. loadSettings()
  // maps any legacy 'system' value on disk to a concrete one.
  const scheme: ResolvedScheme = preference;

  // Restore the saved preference on mount. Applied before the first paint we
  // can control, so a doctor who chose dark doesn't get a flash of light.
  useEffect(() => {
    let active = true;
    loadSettings()
      .then((s) => {
        if (active && s.theme) setPreferenceState(s.theme);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Push the scheme into NativeWind whenever it changes.
  useEffect(() => {
    nativewindColorScheme.set(scheme);
  }, [scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    // Update state first so the UI flips immediately; persistence follows and
    // is not allowed to block or fail the visual change.
    setPreferenceState(next);
    void loadSettings()
      .then((s) => saveSettings({ ...s, theme: next }))
      .catch(() => {
        // Non-critical: the theme is still applied for this session.
      });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      isDark: scheme === 'dark',
      setPreference,
      loading,
    }),
    [preference, scheme, setPreference, loading],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

/**
 * The active palette. Drop-in replacement for `import { colors } from '../theme'`
 * in any component that passes colours as props rather than Tailwind classes.
 */
export function useThemeColors(): Palette {
  return useTheme().colors;
}
