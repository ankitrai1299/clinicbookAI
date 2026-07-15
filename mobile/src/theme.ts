// ─────────────────────────────────────────────────────────────────────────────
// NovaScribe AI — premium design tokens.
//
// Single source of truth for the redesign: brand indigo (#3D5AFE), a violet
// secondary accent (#6C63FF), and semantic success/warning/error hues. Raw hex
// values are consumed where React Native needs them directly (icon `color`
// props, ActivityIndicator, gradients, status bars). Layout/typography use the
// matching NativeWind class names defined in `tailwind.config.js`.
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  // Primary brand — electric indigo.
  brand: '#3D5AFE',
  brandDark: '#2E45D6',
  brandDarker: '#1E32B0',
  brandLight: '#EEF1FF',
  brandTint: '#E0E6FF',

  // Secondary accent — soft violet (used in gradients + highlights).
  accent: '#6C63FF',
  accentDark: '#5A50E8',
  accentLight: '#F0EFFF',

  // Semantic.
  success: '#22C55E',
  successDark: '#16A34A',
  successLight: '#E7F9EE',
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FEF5E6',
  error: '#EF4444',
  errorDark: '#DC2626',
  errorLight: '#FEECEC',

  // Neutrals (slate scale) — surfaces, text, borders.
  ink: '#0B1220', // near-black headings
  slate900: '#0F172A',
  slate800: '#1E293B',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate150: '#EAEEF3',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  canvas: '#F6F8FD', // app background — a hair cooler than pure white
  white: '#FFFFFF',

  // ── Legacy aliases (kept so existing screens compile unchanged) ──
  emerald600: '#16A34A',
  emerald700: '#15803D',
  amber600: '#D97706',
  red500: '#EF4444',
  red600: '#DC2626',
} as const;

// Gradient stop presets (pass straight into <LinearGradient colors={...} />).
export const gradients = {
  brand: ['#4C6BFF', '#3D5AFE', '#5A50E8'], // hero / primary CTA
  brandSoft: ['#5B72FF', '#6C63FF'],
  night: ['#111A3D', '#1B2559', '#2E1D63'], // recording screen
  violet: ['#6C63FF', '#8B7BFF'],
  success: ['#22C55E', '#16A34A'],
  aurora: ['#3D5AFE', '#6C63FF', '#22D3EE'],
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

// Deterministic avatar gradient per name — gives every patient a distinct,
// premium two-tone avatar instead of a flat tint.
const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#4C6BFF', '#6C63FF'],
  ['#6C63FF', '#A855F7'],
  ['#0EA5E9', '#3D5AFE'],
  ['#22C55E', '#14B8A6'],
  ['#F59E0B', '#F97316'],
  ['#EC4899', '#8B5CF6'],
  ['#14B8A6', '#3D5AFE'],
  ['#F43F5E', '#EC4899'],
];

export const avatarGradient = (name?: string): [string, string] => {
  const key = (name || '?').toUpperCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

// Reusable soft-elevation shadow presets (spread into a `style` prop).
export const shadow = {
  sm: { shadowColor: '#1E293B', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  md: { shadowColor: '#1E293B', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  lg: { shadowColor: '#1E293B', shadowOpacity: 0.1, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  brand: { shadowColor: '#3D5AFE', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
} as const;
