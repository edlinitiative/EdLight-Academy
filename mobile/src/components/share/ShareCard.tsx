import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts } from '../../theme/theme';

/**
 * ShareCard — the premium 1080×1920 "Lumière" story card, rendered off-screen
 * and captured to a PNG for Instagram / WhatsApp status sharing (see
 * ShareCardCapture). Two modes:
 *   • 'score' — after a trivia round (category + score ring + verdict)
 *   • 'rank'  — when the student is N°1 of a category (gold medal + "détrône-moi")
 *
 * Everything is sized in the card's own 1080-wide coordinate space, so the
 * capture exports crisply at exactly 1080×1920 regardless of device. Bilingual
 * (FR / HT). Uses the real EdLight logo asset — no placeholder.
 */

const LOGO = require('../../../assets/logo.png');

// Lumière palette (light premium)
const C = {
  bgTop: '#F5F8FE',
  bgBottom: '#E9F0FB',
  glow: 'rgba(120,190,255,0.30)',
  ink: '#0F2038',
  muted: '#6B86B3',
  azure: '#2E86F0',
  azureLite: '#5BB8FF',
  azureDeep: '#0857A6',
  ringTrack: '#DBE6F6',
  card: '#FFFFFF',
  cardBorder: '#DBE6F6',
  gold: '#F5A623',
  goldLite: '#FFE29A',
  goldInk: '#7A4B00',
  goldMuted: '#8A5A00',
};

/**
 * Champion cards invert the palette. A winner's post should not look like the
 * same light card everyone else posts after a quiz — the night-azure ground is
 * what makes it read as an event rather than a score, and it is what "surreal"
 * buys us: glow reads on dark, and not on near-white.
 */
const CH = {
  night: '#04112B',
  deep: '#0A2A63',
  mid: '#0E3E8F',
  ray: 'rgba(122,196,255,0.30)',
  halo: 'rgba(91,184,255,0.55)',
  gold: '#FFC65C',
  goldDeep: '#F5A623',
  ink: '#FFFFFF',
  muted: 'rgba(226,240,255,0.76)',
  chip: 'rgba(255,255,255,0.10)',
  chipBorder: 'rgba(255,255,255,0.22)',
};

/** Brand handles printed on every card — the post has to lead somewhere. */
const SITE = 'academy.edlight.org';
const IG_HANDLE = '@edlightacademy';

export type ShareCardData =
  | { mode: 'score'; subject: string; score: number; total: number }
  | { mode: 'rank'; subject: string; scoreLabel?: string; holder: string }
  /**
   * A win worth posting: tournament champion, weekly №1, or the school that
   * topped the board. `name` is whoever won (a pseudo or a school), `scope`
   * says what they won ("École championne"), `period` when.
   */
  | {
      mode: 'champion';
      name: string;
      scope?: string;
      scoreLabel?: string;
      period?: string;
    };

export interface ShareCardProps {
  data: ShareCardData;
  lang: 'fr' | 'ht';
  /** Referral code baked into the CTA chip (every share is an invite). */
  code?: string | null;
  /** Fired once the card (incl. logo) is laid out and ready to capture. */
  onReady?: () => void;
}

function verdict(pct: number, lang: 'fr' | 'ht'): string {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  if (pct >= 100) return t('Score parfait 🏆', 'Nòt pafè 🏆');
  if (pct >= 80) return t('Excellent 🔥', 'Ekselan 🔥');
  if (pct >= 60) return t('Bien joué 💪', 'Byen jwe 💪');
  if (pct >= 40) return t('En progrès 📈', 'W ap pwogrese 📈');
  return t('Continue 🎯', 'Kontinye 🎯');
}


/**
 * Radiating rays, echoing the EdLight mark itself — the logo is a bulb throwing
 * light, so the champion card blows that motif up to full bleed rather than
 * inventing unrelated decoration.
 */
function Rays({ size }: { size: number }) {
  const c = size / 2;
  const spokes = 24;
  const paths: string[] = [];
  for (let i = 0; i < spokes; i += 1) {
    const a = (i / spokes) * Math.PI * 2;
    const w = 0.018 * Math.PI * 2;
    const inner = size * 0.12;
    const outer = size * 0.58;
    const x1 = c + Math.cos(a - w) * inner, y1 = c + Math.sin(a - w) * inner;
    const x2 = c + Math.cos(a) * outer, y2 = c + Math.sin(a) * outer;
    const x3 = c + Math.cos(a + w) * inner, y3 = c + Math.sin(a + w) * inner;
    paths.push(`M${x1},${y1} L${x2},${y2} L${x3},${y3} Z`);
  }
  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Defs>
        <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={CH.ray} stopOpacity="0.95" />
          <Stop offset="70%" stopColor={CH.ray} stopOpacity="0.25" />
          <Stop offset="100%" stopColor={CH.ray} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={CH.halo} stopOpacity="0.85" />
          <Stop offset="100%" stopColor={CH.halo} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={size * 0.42} fill="url(#halo)" />
      <G>
        {paths.map((d, i) => (
          <Path key={i} d={d} fill="url(#rayFade)" />
        ))}
      </G>
    </Svg>
  );
}

function ChampionBody({
  name, scope, scoreLabel, period, lang,
}: { name: string; scope?: string; scoreLabel?: string; period?: string; lang: 'fr' | 'ht' }) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  // Long school names are the norm ("Collège Dominique Savio de Pétion-Ville"),
  // so the name steps down a size rather than being clipped.
  const nameSize = name.length > 34 ? 62 : name.length > 22 ? 78 : 96;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 760, height: 760, alignItems: 'center', justifyContent: 'center' }}>
        <Rays size={760} />

        {/* Medallion */}
        <View
          style={{
            width: 330, height: 330, borderRadius: 165,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderWidth: 3, borderColor: 'rgba(255,214,140,0.55)',
          }}
        >
          <Text style={{ fontSize: 132 }}>👑</Text>
          <Text style={{ fontFamily: fonts.black, fontSize: 30, color: CH.gold, letterSpacing: 5, marginTop: 2 }}>
            {t('CHAMPION', 'CHANPYON')}
          </Text>
        </View>
      </View>

      <Text
        numberOfLines={2}
        style={{
          fontFamily: fonts.black, fontSize: nameSize, color: CH.ink,
          textAlign: 'center', letterSpacing: -1.5, lineHeight: nameSize * 1.06, marginTop: -40,
        }}
      >
        {name}
      </Text>

      {scope ? (
        <Text style={{ fontFamily: fonts.bold, fontSize: 34, color: CH.gold, marginTop: 20, textAlign: 'center' }}>
          {scope}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 30 }}>
        {scoreLabel ? (
          <View style={champChip}>
            <Text style={{ fontFamily: fonts.black, fontSize: 30, color: CH.ink }}>{scoreLabel}</Text>
          </View>
        ) : null}
        {period ? (
          <View style={champChip}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 30, color: CH.muted }}>{period}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const champChip = {
  backgroundColor: CH.chip,
  borderColor: CH.chipBorder,
  borderWidth: 2,
  borderRadius: 999,
  paddingHorizontal: 30,
  paddingVertical: 14,
} as const;

export default function ShareCard({ data, lang, code, onReady }: ShareCardProps) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  const [logoLoaded, setLogoLoaded] = useState(false);
  // Champion cards run on the night palette; everything else keeps Lumière.
  const isChampion = data.mode === 'champion';
  // Tuple-typed: expo-linear-gradient requires at least two colours at the type
  // level, which a plain string[] does not satisfy.
  const bgColors: readonly [string, string, ...string[]] = isChampion
    ? [CH.night, CH.deep, CH.mid, CH.night]
    : [C.bgTop, C.bgBottom];
  const ink = isChampion ? CH.ink : C.ink;
  const muted = isChampion ? CH.muted : C.muted;

  // Fire onReady once the logo has loaded + a frame has painted, so the capture
  // never grabs a blank/half-rendered card. Fallback timer covers a load miss.
  useEffect(() => {
    if (!logoLoaded) return;
    const raf = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(raf);
  }, [logoLoaded, onReady]);
  useEffect(() => {
    const fallback = setTimeout(() => onReady?.(), 900);
    return () => clearTimeout(fallback);
  }, [onReady]);

  return (
    <LinearGradient
      colors={bgColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.35, y: 1 }}
      style={{ width: 1080, height: 1920, paddingHorizontal: 94, paddingTop: 104, paddingBottom: 100 }}
    >
      {/* Corner glow */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -260, right: -220, width: 900, height: 900, borderRadius: 450,
          backgroundColor: isChampion ? CH.halo : C.glow, opacity: isChampion ? 0.28 : 0.6,
        }}
      />

      {/* Brand header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
        <Image
          source={LOGO}
          onLoad={() => setLogoLoaded(true)}
          onError={() => setLogoLoaded(true)}
          style={{ width: 96, height: 96 }}
          resizeMode="contain"
        />
        <View>
          <Text style={{ fontFamily: fonts.black, fontSize: 46, color: ink, letterSpacing: -1 }}>EdLight</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 19, color: muted, letterSpacing: 7, marginTop: 4 }}>ACADEMY</Text>
        </View>
      </View>

      {/* Middle */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {data.mode === 'score' ? (
          <ScoreBody subject={data.subject} score={data.score} total={data.total} lang={lang} />
        ) : data.mode === 'champion' ? (
          <ChampionBody
            name={data.name}
            scope={data.scope}
            scoreLabel={data.scoreLabel}
            period={data.period}
            lang={lang}
          />
        ) : (
          <RankBody subject={data.subject} scoreLabel={data.scoreLabel} holder={data.holder} lang={lang} />
        )}
      </View>

      {/* Footer CTA */}
      <View style={{ alignItems: 'center', gap: 30 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 40, color: ink, textAlign: 'center' }}>
          {data.mode === 'champion'
            ? t('À toi de jouer la semaine prochaine', 'Semèn pwochèn se tou pa w')
            : data.mode === 'rank'
              ? t('Essaie de me détrôner 👑', 'Eseye detwone m 👑')
              : t('Tu peux me battre ?', 'Èske w ka bat mwen ?')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {code ? (
            <View style={isChampion ? champChip : chipStyle}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 27, color: muted }}>
                {t('Code ', 'Kòd ')}
                <Text style={{ fontFamily: fonts.black, color: isChampion ? CH.gold : C.azure }}>{code}</Text>
              </Text>
            </View>
          ) : null}
          <View style={isChampion ? champChip : chipStyle}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 27, color: ink }}>🎁 {t('+ bonus', '+ bonis')}</Text>
          </View>
        </View>

        {/* Where the post leads. A story that shows a win but not a handle
            converts nobody, so both the site and the Instagram account ride on
            every card, champion or not. */}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 29, color: muted, letterSpacing: 0.4 }}>
            academy.<Text style={{ color: ink }}>edlight.org</Text>
          </Text>
          <Text style={{ fontFamily: fonts.black, fontSize: 29, color: isChampion ? CH.gold : C.azure, letterSpacing: 0.4 }}>
            {IG_HANDLE}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const chipStyle = {
  backgroundColor: C.card,
  borderColor: C.cardBorder,
  borderWidth: 1.5,
  borderRadius: 999,
  paddingVertical: 18,
  paddingHorizontal: 30,
} as const;

function ScoreBody({ subject, score, total, lang }: { subject: string; score: number; total: number; lang: 'fr' | 'ht' }) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const R = 222;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - (total > 0 ? score / total : 0));
  return (
    <>
      <Text style={{ fontFamily: fonts.bold, fontSize: 30, color: C.azure, letterSpacing: 8, textTransform: 'uppercase' }}>
        {t('Mon score', 'Nòt mwen')}
      </Text>
      <Text style={{ fontFamily: fonts.black, fontSize: 70, color: C.ink, letterSpacing: -1.2, marginTop: 16, textAlign: 'center' }}>
        {subject}
      </Text>

      <View style={{ width: 500, height: 500, marginVertical: 42, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={500} height={500} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Defs>
            <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={C.azureLite} />
              <Stop offset="1" stopColor={C.azureDeep} />
            </SvgGradient>
          </Defs>
          <Circle cx={250} cy={250} r={R} stroke={C.ringTrack} strokeWidth={20} fill="none" />
          <Circle cx={250} cy={250} r={R} stroke="url(#ring)" strokeWidth={20} fill="none" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} />
        </Svg>
        <View
          style={{
            width: 388, height: 388, borderRadius: 194, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: '#E3ECF9',
            shadowColor: C.azureDeep, shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.22, shadowRadius: 40,
          }}
        >
          <Text style={{ fontFamily: fonts.black, fontSize: 176, color: C.ink, letterSpacing: -9, lineHeight: 176 }}>
            {score}
            <Text style={{ fontFamily: fonts.bold, fontSize: 84, color: '#8AA3C8' }}>/{total}</Text>
          </Text>
          <Text style={{ fontFamily: fonts.black, fontSize: 30, color: C.azure, marginTop: 8, letterSpacing: 1 }}>{pct} %</Text>
        </View>
      </View>

      <Text style={{ fontFamily: fonts.black, fontSize: 52, color: C.ink, textAlign: 'center' }}>{verdict(pct, lang)}</Text>
    </>
  );
}

function RankBody({ subject, scoreLabel, holder, lang }: { subject: string; scoreLabel?: string; holder: string; lang: 'fr' | 'ht' }) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  return (
    <>
      <Text style={{ fontFamily: fonts.bold, fontSize: 30, color: C.gold, letterSpacing: 6, textTransform: 'uppercase', textAlign: 'center' }}>
        {t('Classement · ', 'Klasman · ')}{subject}
      </Text>

      <View style={{ width: 460, height: 460, marginVertical: 30, alignItems: 'center', justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute', width: 460, height: 460, borderRadius: 230, backgroundColor: 'rgba(245,166,35,0.20)' }} />
        <LinearGradient
          colors={[C.goldLite, C.gold]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 340, height: 340, borderRadius: 170, alignItems: 'center', justifyContent: 'center',
            borderWidth: 10, borderColor: 'rgba(255,255,255,0.5)',
            shadowColor: C.gold, shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.55, shadowRadius: 50,
          }}
        >
          <Text style={{ fontSize: 96, lineHeight: 104 }}>👑</Text>
          <Text style={{ fontFamily: fonts.black, fontSize: 128, color: C.goldInk, letterSpacing: -4, lineHeight: 116 }}>
            N°1
          </Text>
        </LinearGradient>
      </View>

      <Text style={{ fontFamily: fonts.black, fontSize: 66, color: C.ink, letterSpacing: -1.2, textAlign: 'center' }}>
        {holder}
      </Text>
      <Text style={{ fontFamily: fonts.bold, fontSize: 31, color: C.goldMuted, marginTop: 14, textAlign: 'center' }}>
        {scoreLabel
          ? t(`Meilleur score de la communauté · ${scoreLabel}`, `Pi bon nòt kominote a · ${scoreLabel}`)
          : t('En tête de la communauté', 'Nan tèt kominote a')}
      </Text>
    </>
  );
}
