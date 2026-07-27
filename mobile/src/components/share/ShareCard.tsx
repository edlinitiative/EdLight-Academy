import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
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

export type ShareCardData =
  | { mode: 'score'; subject: string; score: number; total: number }
  | { mode: 'rank'; subject: string; scoreLabel?: string; holder: string };

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

export default function ShareCard({ data, lang, code, onReady }: ShareCardProps) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  const [logoLoaded, setLogoLoaded] = useState(false);

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
      colors={[C.bgTop, C.bgBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ width: 1080, height: 1920, paddingHorizontal: 94, paddingTop: 104, paddingBottom: 100 }}
    >
      {/* Corner glow */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: -260, right: -220, width: 900, height: 900, borderRadius: 450, backgroundColor: C.glow, opacity: 0.6 }}
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
          <Text style={{ fontFamily: fonts.black, fontSize: 46, color: C.ink, letterSpacing: -1 }}>EdLight</Text>
          <Text style={{ fontFamily: fonts.medium, fontSize: 19, color: C.muted, letterSpacing: 7, marginTop: 4 }}>ACADEMY</Text>
        </View>
      </View>

      {/* Middle */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {data.mode === 'score' ? (
          <ScoreBody subject={data.subject} score={data.score} total={data.total} lang={lang} />
        ) : (
          <RankBody subject={data.subject} scoreLabel={data.scoreLabel} holder={data.holder} lang={lang} />
        )}
      </View>

      {/* Footer CTA */}
      <View style={{ alignItems: 'center', gap: 30 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 40, color: C.ink, textAlign: 'center' }}>
          {data.mode === 'rank'
            ? t('Essaie de me détrôner 👑', 'Eseye detwone m 👑')
            : t('Tu peux me battre ?', 'Èske w ka bat mwen ?')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {code ? (
            <View style={chipStyle}>
              <Text style={{ fontFamily: fonts.medium, fontSize: 27, color: C.muted }}>
                {t('Code ', 'Kòd ')}
                <Text style={{ fontFamily: fonts.black, color: C.azure }}>{code}</Text>
              </Text>
            </View>
          ) : null}
          <View style={chipStyle}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 27, color: C.ink }}>🎁 {t('+ bonus', '+ bonis')}</Text>
          </View>
        </View>
        <Text style={{ fontFamily: fonts.bold, fontSize: 29, color: C.muted, letterSpacing: 0.4 }}>
          academy.<Text style={{ color: C.ink }}>edlight.org</Text>
        </Text>
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
