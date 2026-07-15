import React, { ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TextInputProps,
  ViewProps,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, gradientProps, statusBadge, avatarGradient, shadow } from '../theme';

type Ion = keyof typeof Ionicons.glyphMap;

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces
// ─────────────────────────────────────────────────────────────────────────────

/** White rounded card with a soft premium shadow. `glass` = translucent + hairline. */
export function Card({
  children,
  className = '',
  style,
  glass,
  elevation = 'md',
  ...rest
}: ViewProps & { className?: string; glass?: boolean; elevation?: keyof typeof shadow }) {
  return (
    <View
      className={`rounded-3xl border ${glass ? 'bg-white/70 border-white/60' : 'bg-white border-slate-100'} ${className}`}
      style={[shadow[elevation], style]}
      {...rest}
    >
      {children}
    </View>
  );
}

/** Full-bleed gradient surface (hero cards, CTAs). */
export function GradientCard({
  children,
  className = '',
  style,
  colors: gc = gradients.brand as unknown as string[],
  direction = 'diagonal',
  glow,
  ...rest
}: ViewProps & {
  className?: string;
  colors?: string[];
  direction?: keyof typeof gradientProps;
  glow?: boolean;
}) {
  return (
    <View style={[glow ? shadow.brand : shadow.md, style]} className="rounded-3xl">
      <LinearGradient
        colors={gc as any}
        {...gradientProps[direction]}
        style={StyleSheet.absoluteFill}
        className="rounded-3xl"
      />
      <View className={`rounded-3xl overflow-hidden ${className}`} {...rest}>
        {children}
      </View>
    </View>
  );
}

/** Hairline divider. */
export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-slate-100 ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges & pills
// ─────────────────────────────────────────────────────────────────────────────

/** Session status pill (Draft / Recording / Processing / Completed). */
export function StatusBadge({ status, small }: { status?: string; small?: boolean }) {
  const s = statusBadge(status);
  const completed = status === 'Completed';
  return (
    <View className={`flex-row items-center ${small ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full ${s.bg}`}>
      {completed ? (
        <Ionicons name="checkmark-circle" size={small ? 10 : 12} color={s.icon} style={{ marginRight: 3 }} />
      ) : (
        <View className="rounded-full mr-1.5" style={{ width: small ? 5 : 6, height: small ? 5 : 6, backgroundColor: s.dot }} />
      )}
      <Text className={`${small ? 'text-[10px]' : 'text-xs'} font-semibold ${s.text}`}>{status || 'Draft'}</Text>
    </View>
  );
}

const CHIP_TONES = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-700', icon: colors.brand },
  accent: { bg: 'bg-accent-50', text: 'text-accent-700', icon: colors.accent },
  success: { bg: 'bg-success-50', text: 'text-success-700', icon: colors.successDark },
  warning: { bg: 'bg-warning-50', text: 'text-warning-700', icon: colors.warningDark },
  error: { bg: 'bg-error-50', text: 'text-error-600', icon: colors.errorDark },
  neutral: { bg: 'bg-slate-100', text: 'text-slate-600', icon: colors.slate500 },
} as const;

/** Small rounded tag — medical conditions, flags, statuses. */
export function Chip({
  label,
  tone = 'neutral',
  icon,
  filled,
}: {
  label: string;
  tone?: keyof typeof CHIP_TONES;
  icon?: Ion;
  filled?: boolean;
}) {
  const t = CHIP_TONES[tone];
  return (
    <View className={`flex-row items-center gap-1 px-2.5 py-1 rounded-full ${t.bg}`}>
      {icon ? <Ionicons name={icon} size={11} color={t.icon} /> : null}
      <Text className={`text-[11px] font-semibold ${t.text}`}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: Ion;
  iconRight?: Ion;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Button({
  label,
  onPress,
  icon,
  iconRight,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  className = '',
}: ButtonProps) {
  const gradient =
    variant === 'primary' ? (gradients.brand as any) : variant === 'danger' ? ['#F87171', '#EF4444'] : variant === 'accent' ? (gradients.violet as any) : null;
  const solidBg = { secondary: 'bg-white border border-slate-200', ghost: 'bg-slate-100' }[variant as 'secondary' | 'ghost'] || '';
  const onColor = variant === 'secondary' || variant === 'ghost' ? colors.slate700 : colors.white;
  const textStyle = variant === 'secondary' || variant === 'ghost' ? 'text-slate-700' : 'text-white';
  const pad = size === 'lg' ? 'py-4 px-5' : size === 'sm' ? 'py-2 px-3.5' : 'py-3.5 px-4';
  const textSize = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[13px]' : 'text-sm';
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 15 : 18;
  const isGradient = !!gradient;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.9}
      style={isGradient && !(disabled || loading) ? shadow.brand : undefined}
      className={`rounded-2xl overflow-hidden ${disabled || loading ? 'opacity-40' : ''} ${className}`}
    >
      {isGradient ? (
        <LinearGradient colors={gradient} {...gradientProps.horizontal} style={StyleSheet.absoluteFill} />
      ) : null}
      <View className={`flex-row items-center justify-center gap-2 ${pad} ${solidBg} rounded-2xl`}>
        {loading ? (
          <ActivityIndicator size="small" color={onColor} />
        ) : (
          icon && <Ionicons name={icon} size={iconSize} color={onColor} />
        )}
        <Text className={`font-semibold ${textStyle} ${textSize}`}>{label}</Text>
        {iconRight && !loading ? <Ionicons name={iconRight} size={iconSize} color={onColor} /> : null}
      </View>
    </TouchableOpacity>
  );
}

/** Round icon button (headers, toolbars). */
export function IconButton({
  icon,
  onPress,
  color = colors.slate700,
  bg = 'bg-slate-100',
  size = 40,
}: {
  icon: Ion;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`rounded-full items-center justify-center ${bg}`}
      style={{ width: size, height: size }}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export function SearchBar({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3.5" style={shadow.sm}>
      <Ionicons name="search" size={17} color={colors.slate400} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.slate400}
        className="flex-1 py-3 px-2 text-[15px] text-slate-900"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={17} color={colors.slate300} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Field({ label, ...rest }: TextInputProps & { label?: string }) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-xs font-semibold text-slate-500">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.slate400}
        className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-[15px] text-slate-900"
        {...rest}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avatars
// ─────────────────────────────────────────────────────────────────────────────

/** Gradient initial avatar; deterministic hue per name. */
export function Avatar({ name, size = 44, online }: { name?: string; size?: number; online?: boolean }) {
  const g = avatarGradient(name);
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={g}
        {...gradientProps.diagonal}
        style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text className="text-white font-bold" style={{ fontSize: size * 0.4 }}>
          {(name || '?').charAt(0).toUpperCase()}
        </Text>
      </LinearGradient>
      {online ? (
        <View
          className="absolute bg-success-500 rounded-full border-2 border-white"
          style={{ width: size * 0.28, height: size * 0.28, right: -1, bottom: -1 }}
        />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section headers & labels
// ─────────────────────────────────────────────────────────────────────────────

export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Text className={`text-[11px] font-bold uppercase tracking-wider text-slate-400 ${className}`}>{children}</Text>
  );
}

/** Icon + title row with an optional trailing action (e.g. "View all"). */
export function SectionHeader({
  icon,
  title,
  action,
  onAction,
}: {
  icon?: Ion;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center gap-2">
        {icon ? (
          <View className="w-7 h-7 rounded-lg bg-brand-50 items-center justify-center">
            <Ionicons name={icon} size={15} color={colors.brand} />
          </View>
        ) : null}
        <Text className="font-bold text-[17px] text-slate-900 tracking-tight">{title}</Text>
      </View>
      {action ? (
        <TouchableOpacity onPress={onAction} hitSlop={6} className="flex-row items-center gap-0.5">
          <Text className="text-[13px] font-semibold text-brand-500">{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.brand} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  width,
  delta,
  deltaUp,
}: {
  icon: Ion;
  iconBg: string;
  iconColor: string;
  value: number | string;
  label: string;
  width?: string;
  delta?: string;
  deltaUp?: boolean;
}) {
  return (
    <Card className="p-4" elevation="sm" style={width ? { width: width as any } : undefined}>
      <View className="flex-row items-start justify-between">
        <View className={`w-10 h-10 rounded-2xl items-center justify-center ${iconBg}`}>
          <Ionicons name={icon} size={19} color={iconColor} />
        </View>
        {delta ? (
          <View className={`flex-row items-center gap-0.5 px-1.5 py-0.5 rounded-full ${deltaUp ? 'bg-success-50' : 'bg-slate-100'}`}>
            <Ionicons name={deltaUp ? 'trending-up' : 'trending-down'} size={11} color={deltaUp ? colors.successDark : colors.slate400} />
            <Text className={`text-[10px] font-bold ${deltaUp ? 'text-success-700' : 'text-slate-400'}`}>{delta}</Text>
          </View>
        ) : null}
      </View>
      <Text className="text-[26px] font-bold text-slate-900 mt-3 tracking-tight">{value}</Text>
      <Text className="text-xs font-medium text-slate-500 mt-0.5">{label}</Text>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmented tabs
// ─────────────────────────────────────────────────────────────────────────────

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <View className="flex-row bg-slate-100 rounded-2xl p-1">
      {tabs.map((t) => {
        const on = t === active;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => onChange(t)}
            activeOpacity={0.8}
            className={`flex-1 py-2 rounded-xl ${on ? 'bg-white' : ''}`}
            style={on ? shadow.sm : undefined}
          >
            <Text className={`text-center text-[13px] font-semibold ${on ? 'text-brand-600' : 'text-slate-500'}`}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress steps (Recording → Transcript → AI Report → Review)
// ─────────────────────────────────────────────────────────────────────────────

export function ProgressSteps({ steps }: { steps: { label: string; done?: boolean; active?: boolean }[] }) {
  return (
    <View className="flex-row items-start">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={s.label} className="flex-1 items-center">
            <View className="flex-row items-center w-full">
              <View className="flex-1 h-0.5" style={{ backgroundColor: i === 0 ? 'transparent' : steps[i - 1].done || s.done || s.active ? colors.brand : colors.slate200 }} />
              <View
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{
                  backgroundColor: s.done ? colors.brand : s.active ? colors.white : colors.slate100,
                  borderWidth: s.active ? 2 : 0,
                  borderColor: colors.brand,
                }}
              >
                {s.done ? (
                  <Ionicons name="checkmark" size={15} color={colors.white} />
                ) : (
                  <View className="w-2 h-2 rounded-full" style={{ backgroundColor: s.active ? colors.brand : colors.slate300 }} />
                )}
              </View>
              <View className="flex-1 h-0.5" style={{ backgroundColor: last ? 'transparent' : s.done ? colors.brand : colors.slate200 }} />
            </View>
            <Text
              numberOfLines={1}
              className={`text-[11px] mt-1.5 font-semibold ${s.done || s.active ? 'text-slate-700' : 'text-slate-400'}`}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline (session events)
// ─────────────────────────────────────────────────────────────────────────────

export function TimelineItem({
  time,
  title,
  meta,
  done,
  active,
  last,
  tone = 'brand',
}: {
  time?: string;
  title: string;
  meta?: ReactNode;
  done?: boolean;
  active?: boolean;
  last?: boolean;
  tone?: 'brand' | 'success' | 'warning';
}) {
  const dot = done ? colors.success : active ? colors.brand : colors.slate300;
  return (
    <View className="flex-row">
      <View className="items-center mr-3" style={{ width: 20 }}>
        <View
          className="rounded-full items-center justify-center"
          style={{ width: 14, height: 14, backgroundColor: done || active ? dot : colors.white, borderWidth: 2, borderColor: dot }}
        >
          {active && !done ? <View className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
        </View>
        {!last ? <View className="flex-1 w-0.5 my-0.5" style={{ backgroundColor: colors.slate150 }} /> : null}
      </View>
      <View className={`flex-1 ${last ? '' : 'pb-4'}`}>
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] font-semibold text-slate-800">{title}</Text>
          {time ? <Text className="text-[11px] text-slate-400 font-medium">{time}</Text> : null}
        </View>
        {meta ? <View className="mt-1">{meta}</View> : null}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────────────────────

export function EmptyState({
  icon = 'document-text-outline',
  title,
  subtitle,
  action,
}: {
  icon?: Ion;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View className="w-20 h-20 rounded-full bg-brand-50 items-center justify-center mb-4">
        <Ionicons name={icon} size={34} color={colors.brand} />
      </View>
      <Text className="text-base font-bold text-slate-800 text-center">{title}</Text>
      {subtitle ? <Text className="text-sm text-slate-400 mt-1.5 text-center leading-5">{subtitle}</Text> : null}
      {action ? <View className="mt-5 w-full">{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <View className="flex-row items-start gap-3 bg-error-50 border border-error-100 rounded-2xl px-4 py-3">
      <Ionicons name="alert-circle" size={18} color={colors.errorDark} style={{ marginTop: 1 }} />
      <Text className="flex-1 text-sm font-medium text-error-700 leading-5">{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} hitSlop={8}>
          <Text className="text-xs font-bold uppercase text-error-600/70">Dismiss</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: any }) {
  return <View className={`bg-slate-100 rounded-2xl ${className}`} style={style} />;
}
