// ─────────────────────────────────────────────────────────────────────────────
// NovaScribe AI — premium design tokens.
//
// Single source of truth for the redesign: brand indigo (#3D5AFE), a violet
// secondary accent (#6C63FF), and semantic success/warning/error hues. Raw hex
// values are consumed where React Native needs them directly (icon `color`
// props, ActivityIndicator, gradients, status bars). Layout/typography use the
// matching NativeWind class names defined in `tailwind.config.js`.
// ─────────────────────────────────────────────────────────────────────────────

import { colorScheme as nativewindColorScheme } from 'nativewind';

const lightColors = {
  // Primary — a single restrained indigo (#5B5CEB), used only as an accent.
  brand: '#5B5CEB',
  brandDark: '#4A4BD4',
  brandDarker: '#3B3CB8',
  brandLight: '#EEEFFE',
  brandTint: '#E0E1FC',

  // `accent` folds into the one indigo — no second competing purple.
  accent: '#5B5CEB',
  accentDark: '#4A4BD4',
  accentLight: '#EEEFFE',

  // Clinical document accents. The printed report/prescription is its own
  // artefact, not app chrome: its section headings are teal and its prescription
  // heading violet (see DOC_COLORS in utils/report.ts, which the PDF uses). The
  // on-screen preview renders the same document, so it reads the same intent
  // from here — themed, because the preview still sits on an app surface.
  docAccent: '#0D9488',
  docRx: '#7C3AED',

  // Semantic.
  success: '#22C55E',
  successDark: '#16A34A',
  successLight: '#ECFAF1',
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FEF8EB',
  error: '#EF4444',
  errorDark: '#DC2626',
  errorLight: '#FEF2F2',

  // Neutrals — warm grey ramp anchored to the spec (#111827 text, #6B7280
  // secondary, #E8ECF2 hairline border).
  ink: '#111827', // primary heading text
  slate900: '#111827',
  slate800: '#1F2937',
  slate700: '#374151',
  slate600: '#4B5563',
  slate500: '#6B7280',
  slate400: '#9CA3AF',
  slate300: '#D1D5DB',
  slate200: '#E8ECF2', // hairline border
  slate150: '#EEF1F5',
  slate100: '#F3F4F6',
  slate50: '#F9FAFB',
  canvas: '#FAFBFC', // app background — near-white, calm
  // Card/sheet/tab-bar background. Mirrors the `surface` Tailwind token and the
  // --color-surface CSS variable; use this rather than `white` for anything that
  // is a surface, so it darkens with the theme.
  surface: '#FFFFFF',
  // Literal white. Stays white in both themes — it is the colour of text and
  // icons sitting ON the brand gradient, which does not change with the theme.
  white: '#FFFFFF',

  // ── Legacy aliases (kept so existing screens compile unchanged) ──
  emerald600: '#16A34A',
  emerald700: '#15803D',
  amber600: '#D97706',
  red500: '#EF4444',
  red600: '#DC2626',
} as const;

// Keys come from the light palette, but values widen to `string` — `as const`
// above would otherwise pin each entry to its own literal hex, so the dark
// palette below could not supply a different value for the same key.
export type Palette = Record<keyof typeof lightColors, string>;

/**
 * Dark counterpart of `colors`.
 *
 * These are the same values as the CSS variables in global.css — Tailwind
 * classes read those, while `color=` props (icons, ActivityIndicator,
 * placeholderTextColor) read this object, and the two must not drift.
 *
 * Only what actually needs to change is overridden:
 *   • The neutral ramp inverts, so `slate400` still reads as "muted" and
 *     `slate900` still reads as "strongest text" in either theme.
 *   • `white` deliberately stays #FFFFFF — it is used for text and icons ON the
 *     brand gradient, which is the same colour in both themes. Flipping it
 *     would put dark text on a dark-blue gradient.
 *   • `brand` lightens slightly: #3D5AFE is a touch dense against a dark
 *     surface, so icons and accents use the 400-step for legibility.
 */
export const darkColors: Palette = {
  ...lightColors,

  brand: '#6B84FF',
  brandDark: '#3D5AFE',
  brandDarker: '#2E45D6',
  brandLight: '#1E2A5A',
  brandTint: '#243167',

  accent: '#8B7BFF',
  accentDark: '#6C63FF',
  accentLight: '#28245C',

  // Lifted a step so the document accents keep their contrast on a dark surface.
  docAccent: '#2DD4BF',
  docRx: '#A78BFA',

  success: '#4ADE80',
  successDark: '#86DBAA',
  successLight: '#143726',
  warning: '#FBBF24',
  warningDark: '#FAC878',
  warningLight: '#422F0E',
  error: '#F87171',
  errorDark: '#FCA5A5',
  errorLight: '#481B1B',

  // Neutral ramp, inverted (mirrors --slate-* in global.css).
  ink: '#F8FAFC',
  slate900: '#F1F5F9',
  slate800: '#E5EBF5',
  slate700: '#D2DAE9',
  slate600: '#BEC8DC',
  slate500: '#A6B3CD',
  slate400: '#8B9AB8',
  slate300: '#4A5B7C',
  slate200: '#2A3752',
  slate150: '#243048',
  slate100: '#1F2A40',
  slate50: '#1A2337',
  canvas: '#0B1220',
  surface: '#131C2E', // cards/sheets/tab bar sit above the canvas
  white: '#FFFFFF', // intentionally unchanged — see note above

  emerald600: '#86DBAA',
  emerald700: '#4ADE80',
  amber600: '#FAC878',
  red500: '#F87171',
  red600: '#FCA5A5',
};

export { lightColors };

/**
 * The active palette, as a single importable object.
 *
 * `color=` props (icon tints, ActivityIndicator, placeholderTextColor) take a
 * literal string and so cannot go through Tailwind. Rather than thread a hook
 * through ~50 components and 160 call sites — a large, error-prone edit — this
 * proxy resolves each property at ACCESS time against the current scheme.
 * Property access happens during render, so a re-render after a theme change
 * yields the new colour with no call-site changes.
 *
 * NativeWind's colorScheme is the source of truth here (ThemeProvider sets it),
 * which guarantees these values and the Tailwind classes never disagree.
 */
export const colors: Palette = new Proxy(lightColors, {
  get(target, prop: string) {
    // `.get()` can be undefined before the first set() during early module
    // evaluation; light is the correct default until ThemeProvider mounts.
    const isDark = nativewindColorScheme.get?.() === 'dark';
    return (isDark ? darkColors : target)[prop as keyof Palette];
  },
}) as Palette;

// Gradient stop presets (pass straight into <LinearGradient colors={...} />).
//
// The old multi-hue gradients (indigo→violet→cyan) read as flashy and are gone.
// What remains is a restrained single-hue indigo, near-flat, used only where a
// coloured surface genuinely helps (the recording screen). Everything else is
// flat white — the premium look comes from whitespace and typography, not fills.
export const gradients = {
  brand: ['#5B5CEB', '#4A4BD4'], // subtle single-hue, not a rainbow
  brandSoft: ['#6E6FEE', '#5B5CEB'],
  night: ['#0F1730', '#171F3D', '#1E2547'], // recording screen — calm, not neon
  violet: ['#5B5CEB', '#4A4BD4'],
  success: ['#22C55E', '#16A34A'],
  aurora: ['#5B5CEB', '#4A4BD4'],
} as const;

// Consistent gradient direction helpers.
export const gradientProps = {
  diagonal: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  horizontal: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
  vertical: { start: { x: 0, y: 0 }, end: { x: 0, y: 1 } },
} as const;

// Status → badge palette. Recording/Processing get their own hues so the
// session pipeline reads at a glance; Completed = success, everything else
// (Draft) = warning amber, matching the reference's "Draft" pill.
export const statusBadge = (status?: string) => {
  switch (status) {
    case 'Completed':
      return { bg: 'bg-success-50', text: 'text-success-700', dot: colors.success, icon: colors.successDark };
    case 'Recording':
      return { bg: 'bg-error-50', text: 'text-error-600', dot: colors.error, icon: colors.errorDark };
    case 'Processing':
      return { bg: 'bg-brand-50', text: 'text-brand-700', dot: colors.brand, icon: colors.brandDark };
    default: // Draft
      return { bg: 'bg-warning-50', text: 'text-warning-700', dot: colors.warning, icon: colors.warningDark };
  }
};

// Deterministic per-name avatar tint — a soft, low-saturation fill with a
// matching darker foreground for the initials, the way Linear/Notion draw member
// avatars. Calm and flat, not a bright two-tone gradient.
const AVATAR_TINTS: readonly { bg: string; fg: string }[] = [
  { bg: '#EEEFFE', fg: '#4A4BD4' }, // indigo
  { bg: '#E9F6EF', fg: '#15803D' }, // green
  { bg: '#FEF6E8', fg: '#B45309' }, // amber
  { bg: '#FDECEF', fg: '#BE123C' }, // rose
  { bg: '#E8F4FB', fg: '#0369A1' }, // sky
  { bg: '#EDF0F4', fg: '#374151' }, // slate
];

export const avatarTint = (name?: string): { bg: string; fg: string } => {
  const key = (name || '?').toUpperCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
};

/**
 * @deprecated superseded by {@link avatarTint}. Retained so the flat tint can be
 * consumed by the current gradient-based Avatar without a wider refactor: it
 * returns the same soft fill twice, so the "gradient" renders as a calm solid.
 */
export const avatarGradient = (name?: string): [string, string] => {
  const { bg } = avatarTint(name);
  return [bg, bg];
};

// Soft, neutral elevation. Premium surfaces sit on a hairline border with only
// a whisper of shadow — never a heavy or coloured glow. `brand` is kept as an
// alias but is now the same restrained neutral shadow, so CTAs no longer glow.
export const shadow = {
  sm: { shadowColor: '#111827', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: '#111827', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  lg: { shadowColor: '#111827', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  brand: { shadowColor: '#111827', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
} as const;
