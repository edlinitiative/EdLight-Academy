import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Inbox } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useColorScheme, radius, shadow, typeScale } from '../theme/theme';
import { useReduceMotion } from '../utils/motion';
import LoadingSpinner from './ui/LoadingSpinner';
import Button from './ui/Button';

/**
 * A single placeholder block for skeleton screens. A soft highlight sweeps
 * across it (premium "loading" feel); when the OS asks for reduced motion it
 * falls back to a calm static block. Decorative — hidden from screen readers so
 * the loading announcement lives on the container (see `ListSkeleton`).
 *
 * Signature is backward-compatible: `width` / `height` / `radius` / `style`
 * behave exactly as before; the sweep is automatic.
 */
export function Skeleton({
  width,
  height = 14,
  radius: blockRadius = 8,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const colors = useColors();
  const isDark = useColorScheme() === 'dark';
  const reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-1);

  useEffect(() => {
    if (reduce || w === 0) return;
    x.value = -1;
    x.value = withRepeat(
      withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [reduce, w, x]);

  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));
  const highlight = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.72)';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          width: (width as any) ?? '100%',
          height,
          borderRadius: blockRadius,
          backgroundColor: colors.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {!reduce && w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient
            colors={['transparent', highlight, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A list-of-cards skeleton for browse/detail screens on slow connections.
 * Mirrors the standard icon-tile + two-line card row (real `radius.card` corner
 * + soft shadow) so the layout doesn't jump when real content arrives.
 * Optionally renders a title/subtitle block on top. Announces "Chargement…" to
 * screen readers while the placeholder blocks stay decorative.
 */
export function ListSkeleton({
  rows = 5,
  showHeader = true,
  label,
}: {
  rows?: number;
  showHeader?: boolean;
  /** Custom loading announcement; defaults to the localized "Chargement…". */
  label?: string;
}) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View
      className="flex-1 px-5 pt-5"
      style={{ backgroundColor: colors.bg }}
      accessible
      accessibilityLabel={label ?? t('Chargement…', 'Ap chaje…')}
      accessibilityLiveRegion="polite"
    >
      {showHeader && (
        <View className="mb-5" style={{ gap: 8 }}>
          <Skeleton width={200} height={26} radius={8} />
          <Skeleton width={150} height={13} />
        </View>
      )}
      <View style={{ gap: 12 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.surface,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              ...shadow.sm,
            }}
          >
            <Skeleton width={44} height={44} radius={radius.tile} />
            <View className="flex-1" style={{ gap: 8 }}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="40%" height={11} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Soft tinted medallion behind a state icon — a gradient-filled circle inside a
 * fainter ring. Purely decorative, so it's hidden from assistive tech.
 */
function Medallion({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 104,
        height: 104,
        borderRadius: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint + '12',
      }}
    >
      <LinearGradient
        colors={[tint + '2E', tint + '10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 76,
          height: 76,
          borderRadius: 38,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

export function LoadingState({ message }: { message?: string }) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const label = message ?? t('Chargement…', 'Ap chaje…');
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16" style={{ backgroundColor: colors.bg }}>
      <LoadingSpinner color={colors.azure} />
      <Text
        accessibilityLiveRegion="polite"
        style={[typeScale.bodyMd, { color: colors.muted }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  title,
  description,
}: {
  message?: string;
  onRetry?: () => void;
  /** Optional heading; falls back to `message` then a localized default. */
  title?: string;
  /** Optional supportive line under the title. */
  description?: string;
}) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const heading = title ?? message ?? t('Une erreur est survenue.', 'Gen yon erè ki rive.');
  const sub = description ?? t('Vérifie ta connexion et réessaie.', 'Tcheke koneksyon ou epi eseye ankò.');
  return (
    <View className="flex-1 items-center justify-center py-16 px-8" style={{ backgroundColor: colors.bg }}>
      <Medallion tint={colors.danger}>
        <AlertCircle color={colors.danger} size={34} strokeWidth={1.75} />
      </Medallion>
      <Text style={[typeScale.h2, { color: colors.ink, textAlign: 'center', marginTop: 20 }]}>
        {heading}
      </Text>
      {sub ? (
        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 8, maxWidth: 300, lineHeight: 21 }]}>
          {sub}
        </Text>
      ) : null}
      {onRetry && (
        <Button
          label={t('Réessayer', 'Eseye ankò')}
          onPress={onRetry}
          accessibilityLabel={t('Réessayer', 'Eseye ankò')}
          style={{ marginTop: 20 }}
        />
      )}
    </View>
  );
}

export function EmptyState({
  message,
  icon,
  ctaLabel,
  onCta,
  title,
  description,
  tone,
}: {
  message?: string;
  icon?: React.ReactNode;
  /** Optional action so an empty screen isn't a dead end. */
  ctaLabel?: string;
  onCta?: () => void;
  /** Optional heading; falls back to `message` then a localized default. */
  title?: string;
  /** Optional supportive line under the title (typeScale.body, muted). */
  description?: string;
  /** Accent tint for the medallion + default icon. Defaults to brand azure. */
  tone?: string;
}) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const tint = tone ?? colors.azure;
  const heading = title ?? message ?? t("Rien ici pour l'instant.", 'Pa gen anyen la pou kounye a.');
  return (
    <View className="flex-1 items-center justify-center py-16 px-8" style={{ backgroundColor: colors.bg }}>
      <Medallion tint={tint}>
        {icon ?? <Inbox color={tint} size={34} strokeWidth={1.75} />}
      </Medallion>
      <Text style={[typeScale.h2, { color: colors.ink, textAlign: 'center', marginTop: 20 }]}>
        {heading}
      </Text>
      {description ? (
        <Text style={[typeScale.body, { color: colors.muted, textAlign: 'center', marginTop: 8, maxWidth: 300, lineHeight: 21 }]}>
          {description}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} accessibilityLabel={ctaLabel} style={{ marginTop: 20 }} />
      ) : null}
    </View>
  );
}
