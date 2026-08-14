// Three dots that rise and fade in sequence — the "assistant is typing" cue,
// the way a modern chat app shows it. Pure RN Animated, no dependency.
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { colors } from '../../theme';

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 320, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        // Pad so the full cycle is the same length regardless of this dot's delay.
        Animated.delay(640 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  return (
    <Animated.View
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.slate400,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
      }}
    />
  );
}

export default function TypingDots() {
  return (
    <View className="flex-row items-center gap-1">
      <Dot delay={0} />
      <Dot delay={160} />
      <Dot delay={320} />
    </View>
  );
}
