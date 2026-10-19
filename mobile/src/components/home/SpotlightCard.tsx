/**
 * SpotlightCard — the first content card on Accueil while something
 * time-sensitive is happening that the student can act on now: the Arène
 * championship (sign-up open, doors open, live) or a tournament they joined
 * that is starting or running (useHomeSpotlight decides which, one at a time).
 *
 * Owner feedback (build 61): the event was "a small plain row" — it "should be
 * the main thing on the page … more colors and animations". Within the no-hero
 * rule it is a CONTENT card, not a band: the Arène's night (same in light and
 * dark mode, like every competition surface), the championship stage art,
 * coral for the one action, and calm motion — a breathing glow, a live pulse,
 * a sheen across the button, the countdown ticking. With Reduce Motion on,
 * every loop stops and the card is a complete still frame; the countdown
 * still updates (it is information, not decoration).
 *
 * No coloured edge stripes: state is a pill, emphasis is the night itself.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import PressableScale from '../ui/PressableScale';
import ArenaWorld from '../arena/art/environment/ArenaWorld';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';
import { useReduceMotion } from '../../utils/motion';
import { haitiDateTime, spotlightCountdown } from '../../../../shared/homeSpotlight';
import type { HomeSpotlight } from './useHomeSpotlight';

type T = (fr: string, ht: string) => string;

export type SpotlightTarget =
  | { screen: 'ArenaLobby' | 'ArenaLive'; params: { tournamentId: string } }
  | { screen: 'ArenaWatch'; params: { tournamentId?: string } }
  | { screen: 'Tournois'; params: { tournamentId: string } };

export interface SpotlightCopy {
  eyebrow: string;
  pill: string;
  live: boolean;
  /** Under the countdown / in place of it. */
  line: string | null;
  countdownLabel: string | null;
  cta: string;
  target: SpotlightTarget;
}

/** Pure copy + destination for an item (exported for tests). */
export function spotlightCopy(item: HomeSpotlight, t: T): SpotlightCopy {
  if (item.kind === 'tournoi') {
    const live = item.urgency === 'live';
    return {
      eyebrow: t('Ton tournoi', 'Tounwa ou'),
      pill: live ? t('En direct', 'An dirèk') : t('Bientôt', 'Talè konsa'),
      live,
      line: live ? t('Ton tournoi a commencé. Les autres joueurs t’attendent.', 'Tounwa ou a kòmanse. Lòt jwè yo ap tann ou.') : null,
      countdownLabel: live ? null : t('Début dans', 'Li kòmanse nan'),
      cta: live ? t('Rejoindre maintenant', 'Antre kounye a') : t('Ouvrir le tournoi', 'Louvri tounwa a'),
      target: { screen: 'Tournois', params: { tournamentId: item.id } },
    };
  }
  const eyebrow = t('Championnat des écoles', 'Chanpyona lekòl yo');
  const countdownLabel = item.countdownKind === 'doors'
    ? t('Fin des inscriptions dans', 'Enskripsyon fèmen nan')
    : item.countdownKind === 'start' ? t('Coup d’envoi dans', 'Li kòmanse nan') : null;
  const lobby: SpotlightTarget = { screen: 'ArenaLobby', params: { tournamentId: item.id } };
  switch (item.phase) {
    case 'live-play':
      return {
        eyebrow, pill: t('En direct', 'An dirèk'), live: true, countdownLabel: null,
        line: t('La partie est en cours. Ton école compte sur toi.', 'Pati a ap jwe. Lekòl ou konte sou ou.'),
        cta: t('Rejoindre maintenant', 'Antre kounye a'),
        target: { screen: 'ArenaLive', params: { tournamentId: item.id } },
      };
    case 'live-watch':
      return {
        eyebrow, pill: t('En direct', 'An dirèk'), live: true, countdownLabel: null,
        line: t('Le championnat est en cours. Suis ton école en direct.', 'Chanpyona a ap jwe. Swiv lekòl ou an dirèk.'),
        cta: t('Regarder en direct', 'Gade an dirèk'),
        target: { screen: 'ArenaWatch', params: { tournamentId: item.id } },
      };
    case 'doors':
      return {
        eyebrow, pill: t('Portes ouvertes', 'Pòt yo louvri'), live: true, countdownLabel,
        line: t('Entre maintenant pour compter parmi les présents.', 'Antre kounye a pou yo konte w prezan.'),
        cta: t('Entrer dans l’Arène', 'Antre nan Arèn nan'), target: lobby,
      };
    case 'registered':
      return {
        eyebrow, pill: t('Tu es inscrit', 'Ou enskri'), live: false, countdownLabel,
        line: (item.tournament?.minPlayers ?? 0) > 0
          ? t(`Invite ta classe : il faut ${item.tournament.minPlayers} joueurs par école.`, `Envite klas ou : fòk gen ${item.tournament.minPlayers} jwè pou chak lekòl.`)
          : t('Invite ta classe pour qualifier ton école.', 'Envite klas ou pou lekòl ou kalifye.'),
        cta: t('Voir mon équipe', 'Wè ekip mwen'), target: lobby,
      };
    case 'register':
    default:
      return {
        eyebrow, pill: t('Inscriptions ouvertes', 'Enskripsyon louvri'), live: false, countdownLabel,
        line: null,
        cta: t('Inscris ton école', 'Enskri lekòl ou'), target: lobby,
      };
  }
}

/** A 1s clock while a countdown is on screen (re-derived from Date.now()). */
function useSecondClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// ── Motion pieces (each renders a still frame under Reduce Motion) ─────────

function Glow({ color, size, style, still, delay = 0 }: {
  color: string; size: number; style: object; still: boolean; delay?: number;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) { cancelAnimation(v); v.value = 0; return undefined; }
    v.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(v);
  }, [still, delay, v]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.42 + v.value * 0.3,
    transform: [{ scale: 1 + v.value * 0.12 }],
  }));
  return (
    <Animated.View
      testID={still ? 'spotlight-glow-still' : 'spotlight-glow'}
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style, still ? { opacity: 0.5 } : anim]}
    />
  );
}

function LiveDot({ still }: { still: boolean }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) { cancelAnimation(v); v.value = 0; return undefined; }
    v.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(v);
  }, [still, v]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - v.value), transform: [{ scale: 1 + v.value * 1.6 }] }));
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      {still ? null : (
        <Animated.View testID="spotlight-live-ring" style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: C.live }, ring]} />
      )}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.live }} />
    </View>
  );
}

function Sheen({ width, still }: { width: number; still: boolean }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    if (still || width <= 0) { cancelAnimation(x); x.value = -1; return undefined; }
    x.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 0 }),
        withDelay(2200, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [still, width, x]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * (width / 2 + 60) }, { rotate: '18deg' }],
  }));
  if (still || width <= 0) return null;
  return (
    <Animated.View
      testID="spotlight-sheen"
      pointerEvents="none"
      style={[{ position: 'absolute', top: -20, bottom: -20, left: width / 2 - 22, width: 44, backgroundColor: 'rgba(255,255,255,0.32)' }, anim]}
    />
  );
}

// ── The card ────────────────────────────────────────────────────────────────

export default function SpotlightCard({
  item, isCreole, onOpen, reduceMotion,
}: {
  item: HomeSpotlight;
  isCreole: boolean;
  onOpen: (target: SpotlightTarget) => void;
  /** Overrides the OS setting (tests, previews). */
  reduceMotion?: boolean;
}) {
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const osReduce = useReduceMotion();
  const still = reduceMotion ?? osReduce;
  const copy = spotlightCopy(item, t);
  const now = useSecondClock(item.countdownTo != null);
  const remaining = item.countdownTo != null ? item.countdownTo - now : null;
  const countdown = remaining != null && remaining > 0 ? spotlightCountdown(remaining) : null;
  const when = haitiDateTime(item.startsAt, isCreole);
  const [ctaWidth, setCtaWidth] = useState(0);

  const tour = item.kind === 'arena' ? item.tournament : null;
  const schools = tour?.counts?.schools ?? 0;
  const players = tour?.counts?.players ?? 0;
  const qualified = Math.min(schools, tour?.counts?.qualifiedSchools ?? 0);
  const tournoiPlayers = item.kind === 'tournoi' ? item.playerCount : null;

  const a11y = [
    copy.eyebrow, copy.pill, item.title, when,
    countdown && copy.countdownLabel ? `${copy.countdownLabel} ${countdown}` : null,
    copy.line,
    schools > 0 ? t(`${schools} écoles inscrites`, `${schools} lekòl enskri`) : null,
    copy.cta,
  ].filter(Boolean).join('. ');

  return (
    <PressableScale
      testID="home-spotlight"
      onPress={() => onOpen(copy.target)}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{ borderRadius: 24, shadowColor: '#050B1A', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}
    >
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: C.bg }}>
        {/* The championship stage — real art, faded so text stays on night. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.62 }]}>
          <ArenaWorld occasion={item.kind === 'arena' ? 'championship' : 'match'} still />
        </View>
        <Glow color={C.coral} size={220} style={{ top: -90, right: -70 }} still={still} />
        <Glow color={C.signal} size={180} style={{ bottom: -80, left: -60 }} still={still} delay={1200} />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(5,11,26,0.45)', 'rgba(5,11,26,0.78)', 'rgba(5,11,26,0.94)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999,
                paddingVertical: 5, paddingHorizontal: 11,
                backgroundColor: copy.live ? 'rgba(255,90,95,0.18)' : 'rgba(255,106,69,0.16)',
              }}
            >
              {copy.live ? <LiveDot still={still} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.coral }} />}
              <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: C.ink }}>{copy.pill}</Text>
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[arenaType.label, { color: C.muted, flexShrink: 1 }]}>{copy.eyebrow}</Text>
          </View>

          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" numberOfLines={2} style={[arenaType.hero, { color: C.ink, fontSize: 28, lineHeight: 33 }]}>{item.title}</Text>
            {when ? <Text style={[arenaType.status, { color: C.inkSoft }]}>{when}</Text> : null}
          </View>

          {countdown && copy.countdownLabel ? (
            <View testID="spotlight-countdown" style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(19,36,63,0.86)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={[arenaType.label, { color: C.muted }]}>{copy.countdownLabel}</Text>
              <Text style={[arenaType.score, { color: C.ink, fontSize: 36, lineHeight: 42, letterSpacing: -0.8 }]}>{countdown}</Text>
            </View>
          ) : null}

          {copy.line ? <Text style={[arenaType.body, { color: C.inkSoft }]}>{copy.line}</Text> : null}

          {schools > 0 ? (
            <View testID="spotlight-progress" style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[arenaType.status, { color: C.ink }]}>
                  {schools === 1 ? t('1 école inscrite', '1 lekòl enskri') : t(`${schools} écoles inscrites`, `${schools} lekòl enskri`)}
                  {players > 0 ? ` · ${t(`${players} joueurs`, `${players} jwè`)}` : ''}
                </Text>
                {qualified > 0 ? (
                  <Text style={[arenaType.status, { color: C.success }]}>
                    {t(`${qualified} qualifiée${qualified > 1 ? 's' : ''}`, `${qualified} kalifye`)}
                  </Text>
                ) : null}
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: C.secondary, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(4, Math.round((qualified / schools) * 100))}%`, height: 8, borderRadius: 4, backgroundColor: C.success }} />
              </View>
            </View>
          ) : tournoiPlayers && tournoiPlayers > 0 ? (
            <Text style={[arenaType.status, { color: C.ink }]}>
              {t(`${tournoiPlayers} joueur${tournoiPlayers > 1 ? 's' : ''} inscrit${tournoiPlayers > 1 ? 's' : ''}`, `${tournoiPlayers} jwè enskri`)}
            </Text>
          ) : null}

          {/* The one action. Flat coral, marine label (arenaTheme), the sheen
              is the only motion on it. */}
          <View
            onLayout={(e: LayoutChangeEvent) => setCtaWidth(e.nativeEvent.layout.width)}
            style={{ minHeight: 52, borderRadius: 999, backgroundColor: C.coral, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 }}
          >
            <Sheen width={ctaWidth} still={still} />
            <Text maxFontSizeMultiplier={1.4} style={[arenaType.action, { color: C.onCoral, fontSize: 17 }]}>{copy.cta}</Text>
            <ChevronRight size={18} color={C.onCoral} strokeWidth={2.6} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}
