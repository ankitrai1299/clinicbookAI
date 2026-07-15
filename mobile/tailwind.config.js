/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        // Base is Inter; per-weight classes (font-medium/semibold/bold) resolve
        // to the matching Inter file via the global font patch in src/fonts.ts.
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      colors: {
        // Primary — electric indigo (#3D5AFE).
        brand: {
          50: '#EEF1FF',
          100: '#E0E6FF',
          200: '#C3CEFF',
          300: '#94A6FF',
          400: '#6B84FF',
          500: '#3D5AFE',
          600: '#2E45D6',
          700: '#1E32B0',
          800: '#182A8F',
          900: '#141F63',
        },
        // Secondary accent — violet (#6C63FF).
        accent: {
          50: '#F0EFFF',
          100: '#E5E3FF',
          200: '#CFCBFF',
          300: '#AEA6FF',
          400: '#8B7BFF',
          500: '#6C63FF',
          600: '#5A50E8',
          700: '#493FC0',
        },
        success: {
          50: '#E7F9EE',
          100: '#D1F2DE',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
        },
        warning: {
          50: '#FEF5E6',
          100: '#FDECCB',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        error: {
          50: '#FEECEC',
          100: '#FCD9D9',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
        },
        canvas: '#F6F8FD',
      },
      borderRadius: {
        '4xl': '28px',
        '5xl': '34px',
      },
    },
  },
  plugins: [],
};
