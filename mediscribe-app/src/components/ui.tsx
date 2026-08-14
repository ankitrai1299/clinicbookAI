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
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, gradientProps, statusBadge, avatarTint, shadow } from '../theme';

type Ion = keyof typeof Ionicons.glyphMap;

// ─────────────────────────────────────────────────────────────────────────────
// Surfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * White card: a 16px radius, a single #E8ECF2 hairline border, and only a
 * whisper of shadow. The border does the separating; the shadow just lifts it a
 * hair off the near-white canvas. Default elevation is the softest 'sm'.
 */
export function Card({
  children,
  className = '',
  style,
  glass,
  elevation = 'sm',
  ...rest
}: ViewProps & { className?: string; glass?: boolean; elevation?: keyof typeof shadow }) {
  return (
    <View
      className={`rounded-2xl border ${glass ? 'bg-surface/80 border-slate-200' : 'bg-surface border-slate-200'} ${className}`}
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
  const { t } = useTranslation();
  const s = statusBadge(status);
  const completed = status === 'Completed';
  return (
    <View className={`flex-row items-center ${small ? 'px-2 py-0.5' : 'px-2.5 py-1'} rounded-full ${s.bg}`}>
      {completed ? (
        <Ionicons name="checkmark-circle" size={small ? 10 : 12} color={s.icon} style={{ marginRight: 3 }} />
      ) : (
        <View className="rounded-full mr-1.5" style={{ width: small ? 5 : 6, height: small ? 5 : 6, backgroundColor: s.dot }} />
      )}
      <Text className={`${small ? 'text-[10px]' : 'text-xs'} font-semibold ${s.text}`}>
        {/* The status VALUE stays English for styling/logic; only the label the
            doctor reads is localised. A status the catalogue doesn't know falls
            through to its own text. */}
        {t(`status.${status || 'Draft'}`, { defaultValue: status || 'Draft' })}
      </Text>
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
  // Flat solid fills — no gradient, no glow. Primary is the one indigo; the
  // rest are neutral surfaces. Corners are 14px (rounded-xl), not oversized.
  const fill =
    variant === 'primary'
      ? 'bg-brand-500'
      : variant === 'danger'
        ? 'bg-error-500'
        : variant === 'accent'
          ? 'bg-brand-500'
          : variant === 'secondary'
            ? 'bg-surface border border-slate-200'
            : 'bg-slate-100'; // ghost
  const onLight = variant === 'secondary' || variant === 'ghost';
  const onColor = onLight ? colors.slate700 : colors.white;
  const textStyle = onLight ? 'text-slate-700' : 'text-white';
  const pad = size === 'lg' ? 'py-3.5 px-5' : size === 'sm' ? 'py-2 px-3.5' : 'py-3 px-4';
  const textSize = size === 'lg' ? 'text-[15px]' : size === 'sm' ? 'text-[13px]' : 'text-sm';
  const iconSize = size === 'lg' ? 19 : size === 'sm' ? 15 : 17;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      className={`rounded-xl ${disabled || loading ? 'opacity-40' : ''} ${className}`}
    >
      <View className={`flex-row items-center justify-center gap-2 ${pad} ${fill} rounded-xl`}>
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

/** Round icon button (headers, toolbars). Icon-only, so it takes an
 * accessibilityLabel that names the action for screen readers. */
export function IconButton({
  icon,
  onPress,
  color = colors.slate700,
  bg = 'bg-slate-100',
  size = 40,
  accessibilityLabel,
}: {
  icon: Ion;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
    <View className="flex-row items-center bg-surface border border-slate-200 rounded-2xl px-3.5" style={shadow.sm}>
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
  // A calm, flat soft-tinted circle with a matching darker initial — the way
  // Linear/Notion draw people. No bright gradient. Rounded to ~30% for a squircle
  // feel rather than a hard circle.
  const { bg, fg } = avatarTint(name);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: size * 0.4, color: fg, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
          {(name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
      {online ? (
        <View
          className="absolute bg-success-500 rounded-full border-2 border-surface"
          style={{ width: size * 0.26, height: size * 0.26, right: -1, bottom: -1 }}
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

/**
 * A dashboard metric tile in the style of Stripe / Linear / Apple Health:
 * icon and a small trend chip on top, the figure, its label, a hairline divider
 * and a "View Details →" affordance.
 *
 * `trend` is a REAL period-over-period change ({pct, up}) or 'new' when there was
 * no prior period to compare against; it is simply omitted when unknown, never
 * fabricated. Up is shown in success green, down in a neutral slate so a fall in,
 * say, draft count never reads as an error.
 */
export function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  width,
  trend,
  onPress,
}: {
  icon: Ion;
  iconBg: string;
  iconColor: string;
  value: number | string;
  label: string;
  width?: string;
  trend?: { pct: number; up: boolean } | 'new' | null;
  /** Makes the card a button and shows the "View Details →" link. */
  onPress?: () => void;
}) {
  const { t } = useTranslation();

  const body = (
    <Card className="p-4" elevation="sm" style={width && !onPress ? { width: width as any } : undefined}>
      <View className="flex-row items-start justify-between">
        <View className={`w-9 h-9 rounded-xl items-center justify-center ${iconBg}`}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        {trend === 'new' ? (
          <View className="px-1.5 py-0.5 rounded-md bg-brand-50">
            <Text className="text-[10px] font-bold text-brand-600">{t('common.new')}</Text>
          </View>
        ) : trend ? (
          <View className={`flex-row items-center gap-0.5 px-1.5 py-0.5 rounded-md ${trend.up ? 'bg-success-50' : 'bg-slate-100'}`}>
            <Ionicons name={trend.up ? 'arrow-up' : 'arrow-down'} size={10} color={trend.up ? colors.successDark : colors.slate400} />
            <Text className={`text-[10px] font-bold ${trend.up ? 'text-success-700' : 'text-slate-500'}`}>
              {Math.abs(trend.pct)}%
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="text-[28px] font-bold text-slate-900 mt-3 tracking-tight leading-9">{value}</Text>
      <Text className="text-[12.5px] font-medium text-slate-500 mt-0.5" numberOfLines={1}>{label}</Text>

      {onPress ? (
        <>
          <View className="h-px bg-slate-100 mt-3.5 mb-2.5" />
          <View className="flex-row items-center gap-1">
            <Text className="text-[11.5px] font-semibold text-brand-600">{t('common.viewDetails')}</Text>
            <Ionicons name="arrow-forward" size={12} color={colors.brand} />
          </View>
        </>
      ) : null}
    </Card>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={width ? { width: width as any } : undefined}
    >
      {body}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmented tabs
// ─────────────────────────────────────────────────────────────────────────────

export function Tabs({
  tabs,
  active,
  onChange,
  renderLabel,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
  // The tab VALUES stay stable (they drive logic); renderLabel localises only
  // what is shown, so callers can translate without changing the switch values.
  renderLabel?: (value: string) => string;
}) {
  return (
    <View className="flex-row bg-slate-100 rounded-2xl p-1">
      {tabs.map((tab) => {
        const on = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            activeOpacity={0.8}
            className={`flex-1 py-2 rounded-xl ${on ? 'bg-surface' : ''}`}
            style={on ? shadow.sm : undefined}
          >
            <Text className={`text-center text-[13px] font-semibold ${on ? 'text-brand-600' : 'text-slate-500'}`}>
              {renderLabel ? renderLabel(tab) : tab}
            </Text>
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
  // A premium clinical-workflow indicator: a filled success node with a tick for
  // a completed step, a hollow brand ring for the one in progress, and a quiet
  // hollow node for what's still to come — joined by a thin continuous rail.
  const nodeColor = done ? colors.success : active ? colors.brand : colors.slate300;
  return (
    <View className="flex-row">
      <View className="items-center mr-3" style={{ width: 22 }}>
        <View
          className="rounded-full items-center justify-center"
          style={{
            width: 20,
            height: 20,
            backgroundColor: done ? colors.success : colors.surface,
            borderWidth: done ? 0 : 2,
            borderColor: nodeColor,
          }}
        >
          {done ? (
            <Ionicons name="checkmark" size={12} color={colors.white} />
          ) : active ? (
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.brand }} />
          ) : null}
        </View>
        {!last ? (
          <View className="flex-1 w-0.5 my-1" style={{ backgroundColor: done ? colors.success : colors.slate200 }} />
        ) : null}
      </View>
      <View className={`flex-1 ${last ? '' : 'pb-4'}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`text-[14px] font-semibold ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>
            {title}
          </Text>
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

/**
 * A caution notice that stays put. Deliberately NOT dismissible: it is used to
 * say that part of a clinical report is missing rather than empty, which the
 * doctor has to act on before signing. Amber, not red — the action succeeded,
 * the result is just incomplete.
 */
export function WarningBanner({ title, message }: { title: string; message: string }) {
  return (
    <View
      className="flex-row items-start gap-3 bg-warning-50 border border-warning-100 rounded-2xl px-4 py-3"
      accessibilityRole="alert"
    >
      <Ionicons name="warning" size={18} color={colors.warningDark} style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="text-sm font-bold text-warning-700 leading-5">{title}</Text>
        <Text className="text-sm text-warning-700 leading-5 mt-0.5">{message}</Text>
      </View>
    </View>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: any }) {
  return <View className={`bg-slate-100 rounded-2xl ${className}`} style={style} />;
}
