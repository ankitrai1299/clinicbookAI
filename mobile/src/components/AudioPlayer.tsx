import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '../theme';

// Plays the uploaded audio attached to a session (replaces the web
// UploadedAudioPlayer). `src` is a fully-resolved URL (resolveMediaUrl).
export default function AudioPlayer({ src, onRemove }: { src: string; onRemove?: () => void }) {
  const player = useAudioPlayer({ uri: src });
  const status = useAudioPlayerStatus(player);

  const fmt = (seconds: number) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  const toggle = () => {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish || status.currentTime >= (status.duration || 0)) {
        player.seekTo(0);
      }
      player.play();
    }
  };

  return (
    <View className="flex-row items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
      <TouchableOpacity
        onPress={toggle}
        className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center"
        activeOpacity={0.85}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={colors.white} />
      </TouchableOpacity>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-slate-800">Session audio</Text>
        <Text className="text-xs text-slate-500 mt-0.5">
          {fmt(status.currentTime)} / {fmt(status.duration || 0)}
        </Text>
      </View>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.slate400} />
        </TouchableOpacity>
      )}
    </View>
  );
}
