import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MicOrb from './MicOrb';
import Waveform from './Waveform';
import { colors, gradients, gradientProps } from '../theme';

/**
 * Immersive full-screen recording view (reference screen 4). Dark aurora
 * gradient, a large pulsing mic orb, live waveform, and Pause / Stop / Mark
 * controls. Rendered by the consultation screen while capture is live; all
 * recording logic stays in the parent.
 *
 * This view no longer renders the transcript. Speech recognition is unaffected:
 * it runs in the parent (useLiveTranscription), which keeps accumulating text
 * throughout the session and hands it to the report generator on Stop. This
 * screen simply stopped being one of its readers, so it no longer takes
 * `liveText`/`interim`.
 */
export default function LiveRecordingScreen({
  patientName,
  timer,
  isPaused,
  onPause,
  onResume,
  onStop,
}: {
  patientName?: string;
  timer: string;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const [flash, setFlash] = useState(false);

  // Marking is now feedback-only. The running count lived in the transcript
  // card's header and had no other consumer — nothing persisted or read it —
  // so it disappeared with the card rather than becoming write-only state.
  const mark = () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  return (
    <View className="flex-1">
      <LinearGradient colors={gradients.night as any} {...gradientProps.vertical} style={StyleSheet.absoluteFill} />
      <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-2 pb-1">
          <TouchableOpacity onPress={onStop} hitSlop={10} className="w-10 h-10 rounded-full bg-white/10 items-center justify-center">
            <Ionicons name="chevron-down" size={22} color={colors.white} />
          </TouchableOpacity>
          <View className="items-center">
            <Text className="text-white font-bold text-[15px]">New Consultation</Text>
            {patientName ? <Text className="text-white/50 text-xs mt-0.5">{patientName}</Text> : null}
          </View>
          <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${isPaused ? 'bg-warning-500/20' : 'bg-error-500/20'}`}>
            <View className={`w-2 h-2 rounded-full ${isPaused ? 'bg-warning-500' : 'bg-error-500'}`} />
            <Text className={`text-[11px] font-bold uppercase tracking-wide ${isPaused ? 'text-warning-500' : 'text-error-500'}`}>
              {isPaused ? 'Paused' : 'Live'}
            </Text>
          </View>
        </View>

        {/* Orb + timer + controls.
            The transcript card used to sit between these two groups and, being
            flex-1, it swallowed all the leftover height — which is what pinned
            the controls to the bottom of the screen. With it gone, this wrapper
            takes that flex-1 instead and centres both groups together, so the
            buttons rise to meet the waveform rather than leaving a dead band
            where the card was. */}
        <View className="flex-1 justify-center">
          <View className="items-center">
            <MicOrb size={104} active={!isPaused} paused={isPaused} ringColor="rgba(108,99,255,0.5)" coreColors={gradients.brandSoft as unknown as string[]} />
            <Text className="text-white/60 text-[13px] font-medium mt-3">{isPaused ? 'Paused' : 'Listening…'}</Text>
            <Text className="text-white text-[44px] font-bold tracking-tight tabular-nums mt-1">{timer}</Text>
            <View className="w-full px-10 mt-2">
              <Waveform active={!isPaused} paused={isPaused} color="rgba(255,255,255,0.9)" idleColor="rgba(255,255,255,0.25)" height={34} />
            </View>
          </View>

          {/* Controls */}
          <View className="flex-row items-center justify-center gap-10 mt-12">
            <ControlButton icon={isPaused ? 'play' : 'pause'} label={isPaused ? 'Resume' : 'Pause'} onPress={isPaused ? onResume : onPause} />
            <TouchableOpacity onPress={onStop} activeOpacity={0.9} className="items-center">
              <View style={{ shadowColor: colors.error, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 }}>
                <LinearGradient colors={['#FB7185', '#EF4444']} {...gradientProps.diagonal} className="w-[76px] h-[76px] rounded-full items-center justify-center">
                  <Ionicons name="stop" size={30} color={colors.white} />
                </LinearGradient>
              </View>
              <Text className="text-white/70 text-xs font-semibold mt-2">Stop</Text>
            </TouchableOpacity>
            <ControlButton icon={flash ? 'checkmark' : 'bookmark-outline'} label={flash ? 'Marked' : 'Mark'} onPress={mark} highlight={flash} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ControlButton({ icon, label, onPress, highlight }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; highlight?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="items-center">
      <View className={`w-16 h-16 rounded-full items-center justify-center border ${highlight ? 'bg-success-500/25 border-success-500/40' : 'bg-white/10 border-white/15'}`}>
        <Ionicons name={icon} size={26} color={highlight ? colors.success : colors.white} />
      </View>
      <Text className="text-white/70 text-xs font-semibold mt-2">{label}</Text>
    </TouchableOpacity>
  );
}
