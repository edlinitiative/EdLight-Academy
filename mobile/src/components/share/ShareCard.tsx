import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { ArrowRight, Trophy } from 'lucide-react-native';
import { fonts } from '../../theme/theme';
import { arenaColors as N } from '../../theme/arenaTheme';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { displayLevel } from '../../utils/courseName';
import Avatar from '../arena/art/avatars/Avatar';
import { useMyAvatar } from '../../hooks/useMyAvatar';
import SchoolCrest from '../arena/art/crest/SchoolCrest';

/**
 * ShareCard — the story card a student posts (Stitch 09b, DIRECTION §9), on
 * the Arène's night. ONE component draws both:
 *   • the 1080×1920 PNG captured off-screen by ShareCardCapture, and
 *   • the "Aperçu du partage" preview on the trivia result (`width` prop),
 * so what the student sees is exactly what gets posted.
 *
 * Anatomy: wordmark + level/subject pills · the student's generated face with
 * their school crest · name and school · the result in a gold pill (it is
 * earned) · "Défie-moi sur EdLight" → and the referral code. Opaque tonal
 * surfaces, no divider (space separates), no emoji, sentence case.
 *
 * Modes:
 *   • 'score'    — after a round ("8/10 en Trivia · Sciences")
 *   • 'rank'     — the community record holder of a game
 *   • 'champion' — a won title (weekly N°1, tournament champion; a school
 *                  champion shows the crest instead of a face)
 */

const LOGO = require('../../../assets/logo.png');

/** Brand handles printed on every card — the post has to lead somewhere. */
const SITE = 'academy.edlight.org';
const IG_HANDLE = '@edlightacademy';

export type ShareCardData =
  | { mode: 'score'; subject: string; score: number; total: number }
  | { mode: 'rank'; subject: string; scoreLabel?: string; holder: string }
  /**
   * A win worth posting: tournament champion, weekly №1, or the school that
   * topped the board. `name` is whoever won (a pseudo or a school), `scope`
   * says what they won ("École championne"), `period` when. `isSchool` puts
   * the crest, not a face, at the centre.
   */
  | {
      mode: 'champion';
      name: string;
      scope?: string;
      scoreLabel?: string;
      period?: string;
      isSchool?: boolean;
    };

export interface ShareCardProps {
  data: ShareCardData;
  lang: 'fr' | 'ht';
  /** Referral code baked into the footer (every share is an invite). */
  code?: string | null;
  /** Fired once the card (incl. logo) is laid out and ready to capture. */
  onReady?: () => void;
  /** Rendered width; height is always 16:9 portrait. Default 1080 (capture). */
  width?: number;
}

function verdict(pct: number, lang: 'fr' | 'ht'): string {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  if (pct >= 100) return t('Score parfait', 'Nòt pafè');
  if (pct >= 80) return t('Excellent', 'Ekselan');
  if (pct >= 60) return t('Bien joué', 'Byen jwe');
  if (pct >= 40) return t('En progrès', 'W ap pwogrese');
  return t('À ton tour', 'Se tou pa w');
}

/** Card design units: a 360 × 640 frame, scaled to the rendered width. */
const UNIT_W = 360;

export default function ShareCard({ data, lang, code, onReady, width = 1080 }: ShareCardProps) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  const k = width / UNIT_W;
  const u = (n: number) => Math.round(n * k * 10) / 10;
  const [logoLoaded, setLogoLoaded] = useState(false);

  // Who is posting — real identity only; nothing is invented.
  const user = useStore((s) => s.user);
  const { avatar: myAvatar } = useMyAvatar();
  const grade = useStore((s) => s.grade);
  const { profile } = useTrivia();
  const lb: any = profile?.leaderboard || {};
  const myName: string = lb.displayName || (user as any)?.displayName || t('Élève EdLight', 'Elèv EdLight');
  const mySchool: string | null = lb.school || null;
  const level = grade && /^ns/i.test(grade) ? displayLevel(grade) : null;

  // Fire onReady once the logo has loaded + a frame has painted, so the capture
  // never grabs a blank/half-rendered card. Fallback timer covers a load miss.
  useEffect(() => {
    if (!logoLoaded || !onReady) return;
    const raf = requestAnimationFrame(() => onReady());
    return () => cancelAnimationFrame(raf);
  }, [logoLoaded, onReady]);
  useEffect(() => {
    if (!onReady) return undefined;
    const fallback = setTimeout(() => onReady(), 900);
    return () => clearTimeout(fallback);
  }, [onReady]);

  const schoolChampion = data.mode === 'champion' && !!data.isSchool;
  const name = data.mode === 'champion' ? data.name : data.mode === 'rank' ? data.holder : myName;
  const subtitle = schoolChampion ? (data as any).scope ?? null : mySchool;
  const subject = data.mode === 'champion' ? (data.period ?? null) : data.subject;

  const achievement = data.mode === 'score'
    ? t(`${data.score}/${data.total} en ${data.subject}`, `${data.score}/${data.total} nan ${data.subject}`)
    : data.mode === 'rank'
      ? t(`Record${data.scoreLabel ? ` : ${data.scoreLabel}` : ''} en ${data.subject}`, `Rekò${data.scoreLabel ? ` : ${data.scoreLabel}` : ''} nan ${data.subject}`)
      : [data.scope, data.scoreLabel].filter(Boolean).join(' · ') || t('Champion', 'Chanpyon');

  const line = data.mode === 'score'
    ? verdict(data.total > 0 ? Math.round((data.score / data.total) * 100) : 0, lang)
    : data.mode === 'rank'
      ? t('Meilleur score de la communauté', 'Pi bon nòt kominote a')
      : t('Champion', 'Chanpyon');

  const cta = data.mode === 'champion'
    ? t('À toi de jouer la prochaine fois', 'Pwochèn fwa se tou pa w')
    : data.mode === 'rank'
      ? t('Essaie de me détrôner', 'Eseye detwone m')
      : t('Défie-moi sur EdLight', 'Defye m sou EdLight');

  const pill = (label: string) => (
    <View style={{ paddingHorizontal: u(10), paddingVertical: u(4), borderRadius: u(999), backgroundColor: N.surface }}>
      <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: u(13), color: N.inkSoft }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ width, height: u(640), backgroundColor: N.surfaceRaised, paddingHorizontal: u(24), paddingTop: u(28), paddingBottom: u(26) }}>
      {/* Wordmark + pills */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(8) }}>
        <Image
          source={LOGO}
          onLoad={() => setLogoLoaded(true)}
          onError={() => setLogoLoaded(true)}
          style={{ width: u(28), height: u(28) }}
          resizeMode="contain"
        />
        <Text style={{ fontFamily: fonts.heading, fontSize: u(22), color: N.ink, letterSpacing: -0.4 * k }}>EdLight</Text>
        {level ? pill(level) : null}
        <View style={{ flex: 1 }} />
        {subject ? <View style={{ maxWidth: u(140) }}>{pill(subject)}</View> : null}
      </View>

      {/* The student (or the school), the result */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {schoolChampion ? (
          <SchoolCrest name={name} size={u(132)} />
        ) : (
          <View style={{ width: u(132), height: u(132) }}>
            <View style={{ width: u(132), height: u(132), borderRadius: u(66), backgroundColor: N.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Avatar seed={user?.uid || 'toi'} config={myAvatar} size={u(124)} mood="celebrating" />
            </View>
            {mySchool ? (
              <View style={{ position: 'absolute', right: u(-4), bottom: u(-2) }}>
                <SchoolCrest name={mySchool} size={u(44)} />
              </View>
            ) : null}
          </View>
        )}

        <Text numberOfLines={2} style={{ fontFamily: fonts.heading, fontSize: u(name.length > 22 ? 24 : 30), lineHeight: u(name.length > 22 ? 29 : 35), color: N.ink, textAlign: 'center', marginTop: u(20), letterSpacing: -0.6 * k }}>
          {name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={{ fontFamily: fonts.medium, fontSize: u(16), color: N.muted, textAlign: 'center', marginTop: u(4) }}>
            {subtitle}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(8), marginTop: u(22), paddingHorizontal: u(18), paddingVertical: u(12), borderRadius: u(999), backgroundColor: N.bg }}>
          <Trophy color={N.gold} size={u(18)} />
          <Text numberOfLines={2} style={{ fontFamily: fonts.heading, fontSize: u(17), color: N.gold, flexShrink: 1, textAlign: 'center' }}>{achievement}</Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: u(16), color: N.inkSoft, marginTop: u(14) }}>{line}</Text>
      </View>

      {/* Footer: where the post leads. Space, not a divider, separates it. */}
      <View style={{ gap: u(10) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u(12) }}>
          <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: u(18), color: N.ink }}>{cta}</Text>
          <View style={{ width: u(36), height: u(36), borderRadius: u(18), backgroundColor: N.coral, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight color={N.onCoral} size={u(18)} />
          </View>
        </View>
        <Text style={{ fontFamily: fonts.medium, fontSize: u(14), color: N.muted }}>
          {code ? t(`Code ${code} · un bonus pour vous deux`, `Kòd ${code} · yon bonis pou nou de`) : SITE}
        </Text>
        <Text style={{ fontFamily: fonts.medium, fontSize: u(14), color: N.muted }}>
          {code ? `${SITE} · ${IG_HANDLE}` : IG_HANDLE}
        </Text>
      </View>
    </View>
  );
}
