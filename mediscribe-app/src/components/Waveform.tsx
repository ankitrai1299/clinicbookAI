import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { colors } from '../theme';

// Lightweight animated waveform for the recording screen. Bars pulse while
// `active` and freeze when paused/stopped. Purely visual feedback (expo-audio
// metering is unreliable across devices, so we drive an aesthetic animation).
const BARS = 28;

export default function Waveform({
  active,
  paused,
  color,
  idleColor,
  height = 56,
}: {
  active: boolean;
  paused?: boolean;
  color?: string;
  idleColor?: string;
  height?: number;
}) {
  const values = useRef([...Array(BARS)].map(() => new Animated.Value(0.2))).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (active && !paused) {
      loops.current = values.map((v, i) => {
        const animate = (): Animated.CompositeAnimation =>
          Animated.sequence([
            Animated.timing(v, {
              toValue: 0.3 + Math.abs(Math.sin(i * 1.7)) * 0.7,
              duration: 280 + (i % 5) * 60,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(v, {
              toValue: 0.18 + (i % 3) * 0.06,
              duration: 280 + (i % 4) * 70,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]);
        const loop = Animated.loop(animate());
        loop.start();
        return loop;
      });
    } else {
      loops.current.forEach((l) => l.stop());
      loops.current = [];
      // Settle to a calm baseline.
      values.forEach((v) => Animated.timing(v, { toValue: 0.2, duration: 200, useNativeDriver: true }).start());
    }
    return () => {
      loops.current.forEach((l) => l.stop());
      loops.current = [];
    };
  }, [active, paused, values]);

  const activeColor = color || colors.brand;
  const restColor = idleColor || colors.slate300;
  return (
    <View className="flex-row items-center justify-center gap-1" style={{ height: height + 8 }}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height,
            borderRadius: 2,
            backgroundColor: active && !paused ? activeColor : restColor,
            transform: [{ scaleY: v }],
          }}
        />
      ))}
    </View>
  );
}
