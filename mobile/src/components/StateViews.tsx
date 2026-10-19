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
import { AlertCircle, Inbox, WifiOff } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors, useColorScheme, radius, typeScale, cardSurfaceFor } from '../theme/theme';
import { useReduceMotion } from '../utils/motion';
import LoadingSpinner from './ui/LoadingSpinner';
import Button from './ui/Button';
import { useOnline } from './journey/practice/useOnline';

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
  radius: blockRadius = 14,
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
          backgroundColor: colors.surfaceAlt,
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
  const scheme = useColorScheme();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View
      className="flex-1 px-5 pt-5"
      style={{ backgroundColor: colors.bg }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('Chargement…', 'Ap chaje…')}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
    >
      {showHeader && (
        <View className="mb-5" style={{ gap: 8 }}>
          <Skeleton width={200} height={26} radius={8} />
          <Skeleton width={150} height={14} />
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
              ...cardSurfaceFor(scheme),
              padding: 16,
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
 * The disc behind a state icon: one OPAQUE grey circle, the icon carries the
 * tint. (Was a translucent tint ring around a translucent gradient: tint on
 * tint, the look the founder rejected.) Decorative, hidden from assistive tech.
 */
function Medallion({ children }: { tint?: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {children}
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
    <View
      className="flex-1 items-center justify-center gap-4 py-16"
      style={{ backgroundColor: colors.bg }}
      // One announcement for the whole state ("Chargement…, occupé") instead of
      // an unlabeled spinner followed by a separate text node.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <LoadingSpinner color={colors.azure} />
      </View>
      <Text style={[typeScale.status, { color: colors.muted, textAlign: 'center' }]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The one error state. Always offers a way forward: `onRetry` (keeps the
 * student's place and refetches) and/or a secondary "way back"
 * (`secondaryLabel` + `onSecondary`, e.g. "Retour aux cours"). When the device
 * is offline it says so plainly (WifiOff + "Tu es hors ligne") instead of a
 * generic failure, because the fix is different: reconnect, not retry.
 */
export function ErrorState({
  message,
  onRetry,
  title,
  description,
  secondaryLabel,
  onSecondary,
  offline: offlineProp,
  offlineTitle,
  offlineDescription,
}: {
  message?: string;
  onRetry?: () => void;
  /** Optional heading; falls back to `message` then a localized default. */
  title?: string;
  /** Optional supportive line under the title. */
  description?: string;
  /** A way back / out ("Retour", "Voir les cours"). Ghost button under Retry. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Force the offline variant; by default it follows NetInfo. */
  offline?: boolean;
  /** Screen-specific offline copy (e.g. what stays available offline). */
  offlineTitle?: string;
  offlineDescription?: string;
}) {
  const { language } = useStore();
  const colors = useColors();
  const online = useOnline();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const offline = offlineProp ?? online === false;
  const heading = offline
    ? offlineTitle ?? t('Tu es hors ligne', 'Ou pa sou entènèt')
    : title ?? message ?? t('Une erreur est survenue.', 'Gen yon erè ki rive.');
  const sub = offline
    ? offlineDescription ?? t('Reconnecte-toi, puis réessaie.', 'Rekonekte, epi eseye ankò.')
    : description ?? t('Vérifie ta connexion et réessaie.', 'Tcheke koneksyon ou epi eseye ankò.');
  return (
    <View className="flex-1 items-center justify-center py-16 px-8" style={{ backgroundColor: colors.bg }}>
      <Medallion tint={colors.danger}>
        {offline
          ? <WifiOff color={colors.muted} size={34} strokeWidth={1.75} />
          : <AlertCircle color={colors.danger} size={34} strokeWidth={1.75} />}
      </Medallion>
      {/* The message is announced as it appears (an error replaces content the
          student was waiting for), heading + explanation read as one alert. */}
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        accessibilityLabel={sub ? `${heading}. ${sub}` : heading}
        style={{ alignItems: 'center' }}
      >
        <Text style={[typeScale.section, { color: colors.ink, textAlign: 'center', marginTop: 20 }]}>
          {heading}
        </Text>
        {sub ? (
          <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center', marginTop: 8, maxWidth: 320 }]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {onRetry || (secondaryLabel && onSecondary) ? (
        <View style={{ marginTop: 20, gap: 10, alignItems: 'center' }}>
          {onRetry ? (
            <Button
              label={t('Réessayer', 'Eseye ankò')}
              onPress={onRetry}
              accessibilityLabel={t('Réessayer', 'Eseye ankò')}
            />
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Button
              label={secondaryLabel}
              onPress={onSecondary}
              variant={onRetry ? 'ghost' : 'primary'}
              accessibilityLabel={secondaryLabel}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Error for ONE section inside a screen (a card, a board, a rail) — the rest
 * of the screen stays usable, so this must not take over the page the way
 * `ErrorState` does. Same contract: says what failed, offers Retry, switches
 * to an offline line when NetInfo reports no connection.
 */
export function InlineError({
  message,
  onRetry,
  offline: offlineProp,
}: {
  message?: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  const { language } = useStore();
  const colors = useColors();
  const online = useOnline();
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);
  const offline = offlineProp ?? online === false;
  const text = offline
    ? t('Hors ligne : reconnecte-toi pour charger cette section.', 'Ou pa sou entènèt : rekonekte pou chaje pati sa a.')
    : message ?? t('Cette section n’a pas pu être chargée.', 'Pati sa a pa t ka chaje.');
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={text}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 }}
      >
        {offline
          ? <WifiOff color={colors.muted} size={18} />
          : <AlertCircle color={colors.danger} size={18} />}
        <Text style={[typeScale.status, { color: colors.muted, flexShrink: 1, textAlign: 'center' }]}>{text}</Text>
      </View>
      {onRetry ? (
        <Button
          label={t('Réessayer', 'Eseye ankò')}
          onPress={onRetry}
          variant="secondary"
          size="sm"
          accessibilityLabel={t('Réessayer', 'Eseye ankò')}
        />
      ) : null}
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
      <Text accessibilityRole="header" style={[typeScale.section, { color: colors.ink, textAlign: 'center', marginTop: 20 }]}>
        {heading}
      </Text>
      {description ? (
        <Text style={[typeScale.instruction, { color: colors.muted, textAlign: 'center', marginTop: 8, maxWidth: 320 }]}>
          {description}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} accessibilityLabel={ctaLabel} style={{ marginTop: 20 }} />
      ) : null}
    </View>
  );
}
