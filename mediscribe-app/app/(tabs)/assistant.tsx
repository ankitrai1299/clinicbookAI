// The analytics assistant — ask questions about your own practice data.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Markdown from '../../src/components/chat/Markdown';
import MetricChart from '../../src/components/chat/MetricChart';
import RowCards from '../../src/components/chat/RowCards';
import TypingDots from '../../src/components/chat/TypingDots';
import { askAssistant, type ChatMetric } from '../../src/services/api';
import {
  loadConversation,
  saveConversation,
  clearConversation,
  type StoredMessage,
} from '../../src/services/chatHistory';
import { colors, gradients } from '../../src/theme';
import { LinearGradient } from 'expo-linear-gradient';

const STARTER_KEYS = [
  'assistant.starters.todaySummary',
  'assistant.starters.thisMonth',
  'assistant.starters.language',
  'assistant.starters.diagnoses',
  'assistant.starters.recentPatients',
  'assistant.starters.busiestHour',
];

interface Message extends StoredMessage {
  metrics?: ChatMetric[];
  suggestions?: string[];
  rangeLabel?: string;
  /** Only render charts when the answer was a visualisation request. */
  visualize?: boolean;
  failed?: boolean;
  /** Epoch ms the message was shown, for the timestamp under the bubble. */
  at?: number;
}

/** "09:32" for a message timestamp. */
function clockTime(at?: number): string {
  if (!at) return '';
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Reveal an answer a few characters at a time.
 *
 * Purely presentational — the full text has already arrived. It exists because
 * a wall of text appearing at once reads as a page load, while a paced reveal
 * reads as a reply. Skipped for long answers, where waiting out the animation
 * would be an obstacle rather than an effect.
 */
function useTypewriter(full: string, enabled: boolean): string {
  const [shown, setShown] = useState(enabled ? '' : full);

  useEffect(() => {
    if (!enabled || full.length > 600) {
      setShown(full);
      return;
    }
    let i = 0;
    setShown('');
    const timer = setInterval(() => {
      // Several characters per tick: one-at-a-time is slower than reading.
      i = Math.min(full.length, i + 3);
      setShown(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [full, enabled]);

  return shown;
}

function AssistantBubble({ message, isLatest }: { message: Message; isLatest: boolean }) {
  const text = useTypewriter(message.content, isLatest && !message.failed);
  const done = text.length >= message.content.length;

  // Row data ("last 10 patients") is the answer itself, so it renders as compact
  // cards regardless of the visualise flag. Charts (a series) render ONLY when a
  // visualisation was asked for. A metric with neither adds nothing below the
  // bubble — no empty placeholder card.
  const metrics = message.metrics || [];
  const rowsMetric = metrics.find((m) => m.rows && m.rows.length);
  const chartMetrics = message.visualize ? metrics.filter((m) => m.series && m.series.length >= 2) : [];

  return (
    <View className="mb-5">
      <View className="flex-row items-end gap-2">
        <LinearGradient
          colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
          className="w-7 h-7 rounded-full items-center justify-center mb-0.5"
          style={{ borderRadius: 14 }}
        >
          <Ionicons name="sparkles" size={13} color={colors.white} />
        </LinearGradient>
        <View className="flex-1 items-start">
          {/* The range this answer covers — a small chip, not a shout. */}
          {message.rangeLabel ? (
            <View className="bg-slate-100 rounded-full px-2.5 py-0.5 mb-1.5">
              <Text className="text-[10.5px] font-semibold text-slate-500">{message.rangeLabel}</Text>
            </View>
          ) : null}
          {/* The bubble hugs its text; width comes from content, not a fixed box. */}
          <View className="bg-white rounded-2xl rounded-bl-md px-4 py-3 self-start max-w-[92%]" style={{ elevation: 1 }}>
            <Markdown content={text} />
          </View>
          {done && rowsMetric?.rows ? <RowCards rows={rowsMetric.rows} /> : null}
          {done ? chartMetrics.map((m) => <MetricChart key={m.id} metric={m} />) : null}
          {done && message.at ? (
            <Text className="text-[10px] text-slate-300 mt-1 ml-1">{clockTime(message.at)}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function AssistantScreen() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadConversation().then((saved) => {
      setMessages(saved as Message[]);
      setRestored(true);
    });
  }, []);

  // Persist so the conversation survives leaving the screen.
  useEffect(() => {
    if (restored) void saveConversation(messages);
  }, [messages, restored]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setInput('');
      setBusy(true);

      const outgoing: Message = { role: 'user', content: q, at: Date.now() };
      setMessages((prev) => [...prev, outgoing]);
      scrollToEnd();

      try {
        // Only prior turns are sent as context — not the question just added.
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const res = await askAssistant(q, history);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: res.answer,
            metrics: res.metrics,
            suggestions: res.suggestions,
            // The human range label ("This Week"), not the internal lowercase one.
            rangeLabel: res.range?.displayLabel || res.range?.label,
            visualize: !!res.visualize,
            at: Date.now(),
          },
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              err instanceof Error
                ? err.message
                : t('assistant.genericError'),
            failed: true,
            at: Date.now(),
          },
        ]);
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [busy, messages, scrollToEnd, t],
  );

  const retry = () => {
    // Drop the failed reply and re-send the question above it.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((prev) => prev.filter((m) => !m.failed));
    void send(lastUser.content);
  };

  const reset = () => {
    setMessages([]);
    void clearConversation();
  };

  const showRetry = !busy && !!messages.at(-1)?.failed;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center gap-3 border-b border-slate-100">
        <LinearGradient
          colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ borderRadius: 18 }}
        >
          <Ionicons name="sparkles" size={17} color={colors.white} />
        </LinearGradient>
        <View className="flex-1">
          <Text className="text-[20px] font-bold text-slate-900 tracking-tight">{t('assistant.title')}</Text>
          <Text className="text-[11px] text-slate-400">{t('assistant.subtitle')}</Text>
        </View>
        {messages.length ? (
          <TouchableOpacity
            onPress={reset}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.clearConversation')}
            className="w-9 h-9 rounded-full bg-slate-50 items-center justify-center"
          >
            <Ionicons name="refresh-outline" size={17} color={colors.slate500} />
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior="padding"
        // Zero offset: the avoiding view's bottom already sits at the tab bar,
        // so the keyboard overlap it measures is exactly how far the input must
        // rise. Any positive offset lifts it too far and leaves a gap above the
        // keyboard; the input then floats instead of sitting on the keyboard.
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
        >
          {messages.length === 0 ? (
            <View className="items-center pt-10 pb-6">
              <LinearGradient
                colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
                className="w-16 h-16 items-center justify-center mb-4"
                style={{ borderRadius: 32 }}
              >
                <Ionicons name="sparkles" size={28} color={colors.white} />
              </LinearGradient>
              <Text className="text-[17px] font-bold text-slate-800">{t('assistant.emptyTitle')}</Text>
              <Text className="text-[13px] text-slate-400 mt-1.5 text-center leading-5 px-6">
                {t('assistant.emptyBody')}
              </Text>
              {/* Starter prompts appear ONLY here, on the empty screen — never as
                  a floating row during a conversation. */}
              <View className="w-full mt-6 gap-2">
                {STARTER_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => send(t(k))}
                    activeOpacity={0.8}
                    className="flex-row items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3"
                  >
                    <Text className="text-[13.5px] font-medium text-slate-700">{t(k)}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.slate300} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <View key={i} className="mb-5 items-end">
                <View className="bg-brand-500 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%]">
                  <Text className="text-white text-[14.5px] leading-[21px]">{m.content}</Text>
                </View>
                {m.at ? (
                  <Text className="text-[10px] text-slate-300 mt-1 mr-1">{clockTime(m.at)}</Text>
                ) : null}
              </View>
            ) : (
              <AssistantBubble key={i} message={m} isLatest={i === messages.length - 1} />
            ),
          )}

          {busy ? (
            <View className="flex-row items-end gap-2 mb-5">
              <LinearGradient
                colors={gradients.brand as unknown as readonly [string, string, ...string[]]}
                className="w-7 h-7 items-center justify-center mb-0.5"
                style={{ borderRadius: 14 }}
              >
                <Ionicons name="sparkles" size={13} color={colors.white} />
              </LinearGradient>
              {/* Just the "..." dots while the answer is on its way — no cold-start
                  copy, which read as an error more than a wait. */}
              <View className="bg-white rounded-2xl rounded-bl-md px-4 py-3.5" style={{ elevation: 1 }}>
                <TypingDots />
              </View>
            </View>
          ) : null}

          {showRetry ? (
            <TouchableOpacity
              onPress={retry}
              className="self-start flex-row items-center gap-1.5 bg-brand-50 rounded-xl px-3 py-2 mb-4 ml-9"
            >
              <Ionicons name="refresh" size={14} color={colors.brand} />
              <Text className="text-[13px] font-semibold text-brand-600">{t('common.retry')}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        <View className="px-5 pb-3 pt-2 flex-row items-end gap-2 border-t border-slate-100 bg-canvas">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('assistant.inputPlaceholder')}
            placeholderTextColor={colors.slate400}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-[14.5px] text-slate-900 max-h-28"
          />
          <TouchableOpacity
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel={t('common.send')}
            className={`w-11 h-11 rounded-full items-center justify-center ${
              input.trim() && !busy ? 'bg-brand-500' : 'bg-slate-200'
            }`}
          >
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
