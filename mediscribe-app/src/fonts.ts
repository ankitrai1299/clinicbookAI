// ─────────────────────────────────────────────────────────────────────────────
// Global Inter typography.
//
// React Native doesn't synthesise weights for custom fonts — each weight is a
// separate file with its own family name. Rather than rewrite every <Text> in
// the app, we patch the default render of Text/TextInput ONCE so that any style
// carrying a `fontWeight` (which is exactly what NativeWind's font-medium/
// semibold/bold utilities emit) is mapped to the matching Inter file. Regular
// text falls back to Inter_400Regular. The result: the whole app renders in
// Inter, at the correct weight, with no per-component changes.
// ─────────────────────────────────────────────────────────────────────────────
import { cloneElement, isValidElement } from 'react';
import { Text, TextInput, StyleSheet } from 'react-native';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// Plus Jakarta Sans — a modern, premium humanist sans used across contemporary
// health / SaaS products. Replaces Inter for a more deliberate, less generic
// feel. Font FAMILY names (below) are what React Native loads per weight; the
// `interFonts` name is kept as a stable export so app/_layout.tsx doesn't change.
export const interFonts = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

export const useInterFonts = () => useFonts(interFonts);

// Family used for the app's bold headings — exported so components that set a
// fontFamily directly (e.g. Avatar) stay in sync with the patch below.
export const FONT_BOLD = 'PlusJakartaSans_700Bold';
export const FONT_SEMIBOLD = 'PlusJakartaSans_600SemiBold';

const familyForWeight = (weight?: string | number): string => {
  switch (String(weight)) {
    case '900':
    case '800':
      return 'PlusJakartaSans_800ExtraBold';
    case '700':
    case 'bold':
      return 'PlusJakartaSans_700Bold';
    case '600':
      return 'PlusJakartaSans_600SemiBold';
    case '500':
      return 'PlusJakartaSans_500Medium';
    default:
      return 'PlusJakartaSans_400Regular';
  }
};

let patched = false;

/** Idempotently override Text/TextInput defaults to render in Inter. */
export function patchDefaultFont() {
  if (patched) return;
  patched = true;

  for (const Component of [Text, TextInput] as any[]) {
    const original = Component.render;
    if (typeof original !== 'function') continue;
    Component.render = function patchedRender(...args: any[]) {
      const element = original.apply(this, args);
      if (!isValidElement(element)) return element;
      const style = (element.props as any)?.style;
      const flat = StyleSheet.flatten(style) || {};
      // Respect an explicit fontFamily; otherwise derive from the weight.
      const fontFamily = (flat as any).fontFamily || familyForWeight((flat as any).fontWeight);
      return cloneElement(element as any, { style: [style, { fontFamily }] });
    };
  }
}
