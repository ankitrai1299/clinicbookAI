import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, gradientProps, shadow } from '../theme';

type Ion = keyof typeof Ionicons.glyphMap;

/**
 * Pulsing microphone orb — concentric rings breathe outward while `active`, a
 * gradient core sits on top. Used small on the dashboard hero and large on the
 * live recording screen. Purely presentational; wire `onPress` for the CTA.
 */
export default function MicOrb({
  size = 96,
  active = false,
  paused = false,
  onPress,
  icon = 'mic',
  ringColor = 'rgba(255,255,255,0.35)',
  coreColors = gradients.brand as unknown as string[],
  glow = true,
}: {
  size?: number;
  active?: boolean;
  paused?: boolean;
  onPress?: () => void;
  icon?: Ion;
  ringColor?: string;
  coreColors?: string[];
  glow?: boolean;
}) {
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = rings.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    if (active && !paused) {
      rings.forEach((v) => v.setValue(0));
      anims.forEach((a) => a.start());
    } else {
      rings.forEach((v) => v.stopAnimation());
    }
    return () => anims.forEach((a) => a.stop());
  }, [active, paused, rings]);

  const core = (
    <LinearGradient
      colors={coreColors as any}
      {...gradientProps.diagonal}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, glow ? shadow.brand : null]}
    >
      <Ionicons name={icon} size={size * 0.42} color={colors.white} />
    </LinearGradient>
  );

  const container = size * 2.1;

  return (
    <View style={{ width: container, height: container, alignItems: 'center', justifyContent: 'center' }}>
      {active
        ? rings.map((v, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }],
                },
              ]}
            >
              <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: ringColor }} />
            </Animated.View>
          ))
        : null}
      {onPress ? (
        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
          {core}
        </TouchableOpacity>
      ) : (
        core
      )}
    </View>
  );
}
