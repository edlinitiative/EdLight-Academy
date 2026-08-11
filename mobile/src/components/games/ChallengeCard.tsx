import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Swords, ChevronRight, Clock } from 'lucide-react-native';
import useStore from '../../contexts/store';
import Avatar from '../ui/Avatar';
import PressableScale from '../ui/PressableScale';
import { radius, useTheme, typeScale } from '../../theme/theme';
import { tapLight } from '../../utils/haptics';
import type { Challenge } from '../../services/challengeService';

/**
 * ChallengeCard — the "défi reçu" presentation for a duel link. Pure
 * presentation: the host screen fetches the challenge (useChallenge) and
 * decides what accepting does (launch the same question draw, then post the
 * score). States: open (Relever CTA) · already played (result recap) ·
 * expired (quiet notice).
 */
export default function ChallengeCard({
  challenge,
  categoryLabel,
  onAccept,
  busy = false,
}: {
  challenge: Challenge;
  /** Localized category display name (the host resolves id → label). */
  categoryLabel: string;
  onAccept: () => void;
  busy?: boolean;
}) {
  const { shadow } = useTheme();
  const language = useStore((s) => s.language);
  const t = (fr: string, ht: string) => (language === 'ht' ? ht : fr);

  const name = challenge.challengerName || t('Un(e) élève', 'Yon elèv');
  const expired = challenge.status === 'open' && challenge.expiresAt > 0 && Date.now() > challenge.expiresAt;
  const played = challenge.status === 'played' && !!challenge.opponent;
  const daysLeft = Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 86_400_000));

  return (
    <View style={{ borderRadius: radius.card, overflow: 'hidden', ...shadow.lg, shadowColor: '#0857A6' }}>
      <LinearGradient colors={['#2E86F0', '#1B6FE0', '#0857A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
        {/* Eyebrow */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 }}>
          <Swords color="#fde68a" size={13} />
          <Text style={[typeScale.overline, { color: 'rgba(255,255,255,0.9)' }]}>
            {t('Défi reçu', 'Defi ou resevwa')}
          </Text>
          {!played && !expired && (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Clock color="rgba(255,255,255,0.7)" size={11} />
              <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.7)' }]}>
                {t(`${daysLeft} j restants`, `${daysLeft} jou ki rete`)}
              </Text>
            </View>
          )}
        </View>

        {/* Challenger + stakes */}
        <View style={{ alignItems: 'center' }}>
          <Avatar name={name} seed={challenge.challengerUid} size={46} />
          <Text style={[typeScale.titleSm, { color: '#ffffff', marginTop: 6 }]} numberOfLines={1}>
            {t(`${name} te défie`, `${name} ap defye w`)}
          </Text>
          <Text style={[typeScale.caption, { color: 'rgba(255,255,255,0.85)', marginTop: 2 }]} numberOfLines={1}>
            {categoryLabel} · {challenge.total} {t('questions', 'kesyon')}
          </Text>

          <View
            accessible
            accessibilityLabel={t(
              `Son score : ${challenge.challengerScore} sur ${challenge.total}`,
              `Nòt li : ${challenge.challengerScore} sou ${challenge.total}`,
            )}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 }}
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '900' }} maxFontSizeMultiplier={1.3}>
                {challenge.challengerScore}/{challenge.total}
              </Text>
              <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.75)' }]}>{t('son score', 'nòt li')}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '900' }}>vs</Text>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#fde68a', fontSize: 22, fontWeight: '900' }} maxFontSizeMultiplier={1.3}>
                {played ? `${challenge.opponent!.score}/${challenge.total}` : '?'}
              </Text>
              <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.75)' }]}>{t('toi', 'ou menm')}</Text>
            </View>
          </View>
        </View>

        {/* State footer */}
        {played ? (
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={[typeScale.bodyMd, { color: '#ffffff' }]}>
              {challenge.opponent!.score > challenge.challengerScore
                ? t('Défi relevé — victoire ! 🏆', 'Defi fèt — viktwa ! 🏆')
                : challenge.opponent!.score === challenge.challengerScore
                  ? t('Égalité !', 'Egalite !')
                  : t('Défi relevé — bien essayé !', 'Defi fèt — bèl efò !')}
            </Text>
          </View>
        ) : expired ? (
          <View style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={[typeScale.caption, { color: 'rgba(255,255,255,0.85)' }]}>
              {t('Ce défi a expiré.', 'Defi sa a ekspire.')}
            </Text>
          </View>
        ) : (
          <>
            <PressableScale
              onPress={() => { tapLight(); onAccept(); }}
              accessibilityRole="button"
              accessibilityLabel={t('Relever le défi', 'Reponn defi a')}
              style={{
                marginTop: 14, alignSelf: 'center',
                flexDirection: 'row', alignItems: 'center', gap: 2,
                backgroundColor: '#ffffff', borderRadius: radius.chip,
                paddingLeft: 18, paddingRight: 12, paddingVertical: 10,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={[typeScale.bodyMd, { color: '#1B6FE0' }]}>
                {busy ? t('Chargement…', 'Ap chaje…') : t('Relever le défi', 'Reponn defi a')}
              </Text>
              {!busy && <ChevronRight color="#1B6FE0" size={16} />}
            </PressableScale>
            <Text style={[typeScale.micro, { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 8 }]}>
              {t('Mêmes questions · une seule tentative · +20 XP au gagnant', 'Menm kesyon yo · yon sèl tantativ · +20 XP pou moun ki genyen')}
            </Text>
          </>
        )}
      </LinearGradient>
    </View>
  );
}
