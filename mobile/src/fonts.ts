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
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export const interFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

export const useInterFonts = () => useFonts(interFonts);

const familyForWeight = (weight?: string | number): string => {
  switch (String(weight)) {
    case '900':
    case '800':
    case '700':
    case 'bold':
      return 'Inter_700Bold';
    case '600':
      return 'Inter_600SemiBold';
    case '500':
      return 'Inter_500Medium';
    default:
      return 'Inter_400Regular';
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
