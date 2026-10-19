/**
 * Partie rapide — the Arène's "play now" round, played INSIDE the Arena.
 *
 * Before this the cabinet handed off to the Jeux tab's Trivia screen, so a
 * student who tapped "Jouer" in the night city landed on the daytime category
 * picker (TestFlight, Oct 2026: "it takes me to the trivia page"). The round is
 * the same mixed draw and the same QuizPlayer as Trivia's "Mélange de thèmes",
 * and XP goes through useTrivia.recordResult — so the points still count for
 * the student's school — but it starts at once and ends on an Arena result.
 *
 * play → result. No hero band: the player owns the screen.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { RefreshCw, Swords } from 'lucide-react-native';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import { QuizPlayer, prepareMixedQuestions, type PreparedQuestion } from '../TriviaScreen';
import { ArenaButton, ArenaScreen } from '../../components/arena/ArenaKit';
import arenaHaptics from '../../components/arena/arenaHaptics';
import { arenaColors as C, arenaType } from '../../theme/arenaTheme';
import { fonts } from '../../theme/theme';

type Phase = 'play' | 'result';

/** Questions per quick round — the same size as Trivia's mixed round. */
export const QUICK_ROUND_SIZE = 10;

export default function ArenaQuickScreen() {
  const navigation = useNavigation<any>();
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { recordResult, isAuthed } = useTrivia();
  const { recordActivity } = useStreak();

  const [phase, setPhase] = useState<Phase>('play');
  const [round, setRound] = useState<PreparedQuestion[]>(() => prepareMixedQuestions(QUICK_ROUND_SIZE));
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ score: number; total: number; xp: number | null } | null>(null);

  const back = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ArenaHub'));

  const again = useCallback(() => {
    arenaHaptics.commit();
    setRound(prepareMixedQuestions(QUICK_ROUND_SIZE));
    setResult(null);
    setNonce((n) => n + 1);
    setPhase('play');
  }, []);

  const onFinish = (score: number, total: number) => {
    if (score * 2 >= total) arenaHaptics.correct(); else arenaHaptics.wrong();
    setResult({ score, total, xp: null });
    setPhase('result');
    recordActivity().catch(() => undefined);
    recordResult({ category: 'mixed', score, total, isDaily: false })
      .then((r: any) => {
        const xp = Number(r?.xpEarned);
        if (Number.isFinite(xp)) setResult((prev) => (prev ? { ...prev, xp } : prev));
      })
      .catch(() => undefined);
  };

  if (phase === 'play') {
    return (
      <ArenaScreen world={false} edges={['top']}>
        <QuizPlayer
          key={nonce}
          questions={round}
          category={null}
          isCreole={isCreole}
          title={t('Partie rapide', 'Pati rapid')}
          onQuit={back}
          onFinish={(score, total) => onFinish(score, total)}
        />
      </ArenaScreen>
    );
  }

  const score = result?.score ?? 0;
  const total = result?.total ?? QUICK_ROUND_SIZE;
  const good = score * 2 >= total;
  return (
    <ArenaScreen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 32, paddingBottom: 48, gap: 18, alignItems: 'center' }}>
        <Text style={[arenaType.status, { color: C.muted }]}>{t('Partie rapide', 'Pati rapid')}</Text>
        <Text accessibilityRole="header" style={[arenaType.hero, { color: C.ink, textAlign: 'center' }]}>
          {good ? t('Bien joué !', 'Byen jwe !') : t('Rejoue, les questions changent', 'Rejwe, kesyon yo chanje')}
        </Text>
        <Text style={{ fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, color: C.ink, fontVariant: ['tabular-nums'] }}>
          {score}<Text style={[arenaType.title, { color: C.muted }]}> / {total}</Text>
        </Text>
        {isAuthed ? (
          <>
            {result?.xp ? <Text style={[arenaType.title, { color: C.success }]}>+{result.xp} XP</Text> : null}
            <Text style={[arenaType.body, { color: C.inkSoft, textAlign: 'center' }]}>
              {t('Tes points comptent pour ton école cette semaine.', 'Pwen ou yo konte pou lekòl ou semèn sa a.')}
            </Text>
          </>
        ) : (
          <Text style={[arenaType.status, { color: C.muted, textAlign: 'center' }]}>{t('Connecte-toi pour garder tes XP.', 'Konekte pou w kenbe XP ou.')}</Text>
        )}
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          <ArenaButton label={t('Rejouer', 'Rejwe')} icon={<RefreshCw color={C.onCoral} size={16} />} onPress={again} />
          <ArenaButton
            variant="secondary"
            label={t('Défier un ami', 'Defye yon zanmi')}
            icon={<Swords color={C.ink} size={16} />}
            onPress={() => navigation.navigate('Main', { screen: 'Trivia', params: { intent: 'challenge', nonce: Date.now() } })}
          />
          <ArenaButton variant="secondary" label={t('Retour à l’Arène', 'Retounen nan Arèn nan')} onPress={back} />
        </View>
      </ScrollView>
    </ArenaScreen>
  );
}
