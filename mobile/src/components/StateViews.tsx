import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { AlertCircle, Inbox } from 'lucide-react-native';
import useStore from '../contexts/store';
import { useColors } from '../theme/theme';
import LoadingSpinner from './ui/LoadingSpinner';

/** A single pulsing placeholder block for skeleton screens. */
export function Skeleton({
  width,
  height = 14,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: object;
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        { width: (width as any) ?? '100%', height, borderRadius: radius, backgroundColor: colors.border, opacity: pulse },
        style,
      ]}
    />
  );
}

/**
 * A list-of-cards skeleton for browse/detail screens on slow connections.
 * Mirrors the standard icon-tile + two-line card row so the layout doesn't jump
 * when real content arrives. Optionally renders a title/subtitle block on top.
 */
export function ListSkeleton({
  rows = 5,
  showHeader = true,
}: {
  rows?: number;
  showHeader?: boolean;
}) {
  const colors = useColors();
  return (
    <View className="flex-1 px-5 pt-5" style={{ backgroundColor: colors.bg }}>
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
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
            }}
          >
            <Skeleton width={44} height={44} radius={12} />
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

export function LoadingState({ message }: { message?: string }) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16" style={{ backgroundColor: colors.bg }}>
      <LoadingSpinner color={colors.azure} />
      <Text style={{ color: colors.muted, fontSize: 16 }}>{message ?? t('Chargement…', 'Ap chaje…')}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-4 py-16 px-6" style={{ backgroundColor: colors.bg }}>
      <AlertCircle color={colors.danger} size={40} />
      <Text style={{ color: colors.ink, fontSize: 16, textAlign: 'center' }}>{message ?? t('Une erreur est survenue.', 'Gen yon erè ki rive.')}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} className="mt-2 px-5 py-2.5 rounded-xl" style={{ backgroundColor: colors.azure }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{t('Réessayer', 'Eseye ankò')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EmptyState({
  message,
  icon,
  ctaLabel,
  onCta,
}: {
  message?: string;
  icon?: React.ReactNode;
  /** Optional action so an empty screen isn't a dead end. */
  ctaLabel?: string;
  onCta?: () => void;
}) {
  const { language } = useStore();
  const colors = useColors();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <View className="flex-1 items-center justify-center gap-3 py-16 px-6" style={{ backgroundColor: colors.bg }}>
      {icon ?? <Inbox color={colors.faint} size={40} />}
      <Text style={{ color: colors.muted, fontSize: 16, textAlign: 'center' }}>{message ?? t('Rien ici pour l\'instant.', 'Pa gen anyen la pou kounye a.')}</Text>
      {ctaLabel && onCta ? (
        <TouchableOpacity onPress={onCta} className="mt-2 px-5 py-2.5 rounded-full" style={{ backgroundColor: colors.azure }} accessibilityRole="button" accessibilityLabel={ctaLabel}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
