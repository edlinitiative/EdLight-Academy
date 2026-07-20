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
