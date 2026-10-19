/**
 * ArenaKit — the shared pieces every competition screen is built from, in the
 * Arène's night (theme/arenaTheme.ts).
 *
 *  - ArenaScreen      night background with the world art faded behind it
 *  - ArenaPanel       a card. No coloured edge stripes, ever: emphasis is a
 *                     wash, a badge or weight.
 *  - ArenaButton      flat coral primary (marine label) / quiet secondary
 *  - StatusPill       live · delayed · reconnecting · provisional · final ·
 *                     stale — the explicit labels the brief asks for
 *  - ArenaStateView   one full-screen state per failure (loading, unavailable,
 *                     denied, reconnecting) with its retry / return action
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { Check, CircleSlash, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react-native';
import PressableScale from '../ui/PressableScale';
import { arenaColors as C, arenaType, arenaRadius, ARENA_TOUCH } from '../../theme/arenaTheme';
import ArenaWorld from './art/environment/ArenaWorld';
import type { Occasion } from './art/environment/ArenaWorld';
import type { EventStatus, LivePhase } from '../../utils/arenaViewState';
import useNightStatusBar from './useNightStatusBar';
import { statusLabelText, type StatusLabel } from '../../utils/arenaStatus';

type T = (fr: string, ht: string) => string;

// ── Screen ──────────────────────────────────────────────────────────────────

export function ArenaScreen({
  children, occasion = 'everyday', world = true, edges = ['top'], style,
}: {
  children: React.ReactNode;
  occasion?: Occasion;
  /** Draw the venue art behind the content (faded so text stays readable). */
  world?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  // Night in both OS themes → light-content status bar while focused.
  useNightStatusBar();
  return (
    <View style={[{ flex: 1, backgroundColor: C.bg }, style]}>
      {world ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.38 }]}>
          <ArenaWorld occasion={occasion} still />
          {/* A scrim from the top third down, so cards always sit on night. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4, 10, 28, 0.35)' }]} />
        </View>
      ) : null}
      <SafeAreaView style={{ flex: 1 }} edges={edges}>{children}</SafeAreaView>
    </View>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function ArenaPanel({
  children, style, tone = 'plain', accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `earned` = gold wash, only for a confirmed achievement. */
  tone?: 'plain' | 'raised' | 'earned' | 'signal' | 'warn';
  accessibilityLabel?: string;
}) {
  const bg = tone === 'earned' ? C.goldSoft
    : tone === 'signal' ? C.signalSoft
      : tone === 'warn' ? C.warnSoft
        : tone === 'raised' ? C.surfaceRaised : C.surface;
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={[{
        padding: 16, gap: 10, borderRadius: arenaRadius.card,
        backgroundColor: bg,
      }, style]}
    >
      {children}
    </View>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export function ArenaButton({
  label, onPress, variant = 'primary', icon, disabled, busy, selected, accessibilityHint, style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  /**
   * A choice in a set (an option, a format, an answer): announced as
   * selected and marked with a check, so the state is never colour alone.
   */
  selected?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  const off = !!disabled || !!busy;
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: off,
        busy: !!busy,
        ...(selected === undefined ? null : { selected }),
      }}
      style={[{
        minHeight: ARENA_TOUCH,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 10, borderRadius: arenaRadius.control,
        // Opaque grounds only — a translucent fill under a hairline read as generic.
        backgroundColor: primary ? (off ? '#76362D' : C.coral) : C.secondary,
      }, style]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? C.onCoral : C.ink} size="small" />
      ) : selected ? (
        <Check color={primary ? C.onCoral : C.ink} size={18} strokeWidth={2.6} />
      ) : icon}
      {/* flexShrink: a long label (a 60-character tournament title, large
          text) wraps inside the pill instead of pushing past its edge. */}
      <Text style={[arenaType.action, { color: primary ? C.onCoral : C.ink, flexShrink: 1, textAlign: 'center' }]}>{label}</Text>
    </PressableScale>
  );
}

// ── Status labels ───────────────────────────────────────────────────────────

// The labels and the state → badge mapping are pure (utils/arenaStatus.ts);
// re-exported here so screens keep importing the kit.
export { statusLabelText, stateStatus, watchStatus } from '../../utils/arenaStatus';
export type { StatusLabel } from '../../utils/arenaStatus';

/** The dot colour for a badge. Gold only for the official result. */
export function statusTone(kind: StatusLabel): string {
  switch (kind) {
    case 'live': return C.live;
    case 'final': return C.gold;
    case 'reconnecting': case 'stale': case 'delayed': return C.warn;
    case 'provisional': case 'grading': case 'doors': return C.signal;
    case 'registration': return C.success;
    default: return C.muted;
  }
}

export function StatusPill({ kind, t, style }: { kind: StatusLabel; t: T; style?: StyleProp<ViewStyle> }) {
  const tone = statusTone(kind);
  const text = statusLabelText(kind, t);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion={kind === 'reconnecting' ? 'polite' : 'none'}
      style={[{
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: arenaRadius.chip,
        backgroundColor: C.surfaceRaised,
      }, style]}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
      <Text style={[arenaType.status, { color: C.inkSoft }]}>{text}</Text>
    </View>
  );
}

// ── Full-screen states ──────────────────────────────────────────────────────

/**
 * The explanation and the action for every state that is not the event
 * itself. Each failure says what happened and offers the one thing that can
 * help — never "nothing scheduled" for a connection that dropped.
 */
export function stateCopy(status: EventStatus | LivePhase, t: T): { title: string; body: string } | null {
  switch (status) {
    case 'unavailable':
      return {
        title: t('Cet événement n’est pas disponible', 'Evènman sa a pa disponib'),
        body: t(
          'Il a été retiré, annulé, ou le lien est incorrect. Les prochains événements sont dans l’Arène.',
          'Yo retire l, yo anile l, oswa lyen an pa bon. Pwochen evènman yo nan Arèn nan.',
        ),
      };
    case 'denied':
      return {
        title: t('Accès refusé', 'Aksè refize'),
        body: t(
          'Nous n’avons pas pu lire cet événement avec ton compte. Reconnecte-toi puis réessaie.',
          'Nou pa t ka li evènman sa a ak kont ou. Rekonekte epi eseye ankò.',
        ),
      };
    case 'reconnecting':
      return {
        title: t('Connexion perdue', 'Koneksyon an koupe'),
        body: t(
          'Nous essayons de nous reconnecter. Rien n’est perdu : les réponses déjà envoyées sont enregistrées par le serveur.',
          'N ap eseye rekonekte. Anyen pa pèdi : repons ou te deja voye yo anrejistre sou sèvè a.',
        ),
      };
    default:
      return null;
  }
}

export function ArenaStateView({
  status, t, onRetry, onReturn, returnLabel,
}: {
  status: EventStatus | LivePhase;
  t: T;
  onRetry?: () => void;
  onReturn?: () => void;
  returnLabel?: string;
}) {
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <ActivityIndicator color={C.coral} />
        <Text style={[arenaType.status, { color: C.muted }]}>{t('Chargement…', 'N ap chaje…')}</Text>
      </View>
    );
  }
  const copy = stateCopy(status, t);
  if (!copy) return null;
  const Icon = status === 'denied' ? ShieldAlert : status === 'reconnecting' ? WifiOff : CircleSlash;
  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}
      accessibilityLiveRegion="polite"
    >
      <Icon color={status === 'reconnecting' ? C.warn : C.muted} size={30} />
      <Text style={[arenaType.title, { color: C.ink, textAlign: 'center' }]}>{copy.title}</Text>
      <Text style={[arenaType.body, { color: C.muted, textAlign: 'center', maxWidth: 360 }]}>{copy.body}</Text>
      {status === 'reconnecting' ? <ActivityIndicator color={C.warn} style={{ marginTop: 4 }} /> : null}
      <View style={{ gap: 10, marginTop: 8, alignSelf: 'stretch', maxWidth: 360, width: '100%' }}>
        {onRetry && status !== 'unavailable' ? (
          <ArenaButton
            label={t('Réessayer', 'Eseye ankò')}
            onPress={onRetry}
            icon={<RefreshCw color={C.onCoral} size={16} />}
          />
        ) : null}
        {onReturn ? (
          <ArenaButton
            label={returnLabel ?? t('Retour à l’Arène', 'Retounen nan Arèn nan')}
            onPress={onReturn}
            variant={status === 'unavailable' || !onRetry ? 'primary' : 'secondary'}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A thin inline banner for "showing last-known data". */
export function StaleBanner({ t, onRetry }: { t: T; onRetry?: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
        borderRadius: arenaRadius.tile, backgroundColor: C.warnSoft,
      }}
    >
      <WifiOff color={C.warn} size={16} />
      <Text style={[arenaType.status, { color: C.inkSoft, flex: 1 }]}>
        {t(
          'Reconnexion… ce que tu vois peut dater de quelques instants.',
          'N ap rekonekte… sa w wè a ka gen kèk segonn reta.',
        )}
      </Text>
      {onRetry ? (
        <PressableScale onPress={onRetry} accessibilityRole="button" hitSlop={10} pressedScale={0.96}>
          <Text style={[arenaType.status, { color: C.coral }]}>{t('Réessayer', 'Eseye ankò')}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export { C as arenaColors };
