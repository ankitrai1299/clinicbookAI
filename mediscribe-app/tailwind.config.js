/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  // Dark mode is driven by a class on the root, which NativeWind's
  // colorScheme.set() toggles. See src/context/Theme.tsx.
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        // Base is Inter; per-weight classes (font-medium/semibold/bold) resolve
        // to the matching Inter file via the global font patch in src/fonts.ts.
        sans: ['PlusJakartaSans_400Regular'],
        medium: ['PlusJakartaSans_500Medium'],
        semibold: ['PlusJakartaSans_600SemiBold'],
        bold: ['PlusJakartaSans_700Bold'],
      },
      colors: {
        // Primary — a single restrained indigo (#5B5CEB), used only as an accent.
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: '#E0E1FC',
          200: '#C7C8F8',
          300: '#A9AAF4',
          400: '#8687F0',
          500: '#5B5CEB',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: '#3B3CB8',
          800: '#303199',
          900: '#26277A',
        },
        // `accent` is folded into the one indigo so the UI never carries a second
        // competing purple. Kept as an alias so existing accent-* classes resolve.
        accent: {
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: '#E0E1FC',
          200: '#C7C8F8',
          300: '#A9AAF4',
          400: '#8687F0',
          500: '#5B5CEB',
          600: '#4A4BD4',
          700: '#3B3CB8',
        },
        success: {
          50: 'rgb(var(--success-50) / <alpha-value>)',
          100: '#D1F2DE',
          500: '#22C55E',
          600: '#16A34A',
          700: 'rgb(var(--success-700) / <alpha-value>)',
        },
        warning: {
          50: 'rgb(var(--warning-50) / <alpha-value>)',
          100: '#FDECCB',
          500: '#F59E0B',
          600: '#D97706',
          700: 'rgb(var(--warning-700) / <alpha-value>)',
        },
        error: {
          50: 'rgb(var(--error-50) / <alpha-value>)',
          100: '#FCD9D9',
          500: '#EF4444',
          600: '#DC2626',
          700: 'rgb(var(--error-700) / <alpha-value>)',
        },
        // ── Themed tokens (see global.css) ───────────────────────
        // These resolve through CSS variables so light/dark flips without any
        // component knowing which theme is active. The <alpha-value> shim keeps
        // opacity utilities (bg-slate-100/50) working.
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        // Card/sheet background. Replaces literal `bg-white`, which could not be
        // themed because white also means "text on a gradient".
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        // Neutral ramp: 50 = faintest fill … 900 = strongest text. Inverted in
        // dark, so existing text-slate-900 / bg-slate-50 usages stay correct.
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
        },
      },
      borderRadius: {
        '4xl': '28px',
        '5xl': '34px',
      },
    },
  },
  plugins: [],
};
