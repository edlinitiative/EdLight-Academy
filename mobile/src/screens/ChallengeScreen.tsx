import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Star } from 'lucide-react-native';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../data/triviaData';
import { bankHash } from '../../../shared/duelGrading';
import { QuizPlayer, prepareChallengeQuestions, type PreparedQuestion } from './TriviaScreen';
import ChallengeCard from '../components/games/ChallengeCard';
import { useChallenge } from '../hooks/useChallenges';
import { acceptChallenge, getChallenge, type AcceptOutcome } from '../services/challengeService';
import { recoveredAcceptOutcome } from '../utils/duels';
import useStore from '../contexts/store';
import { arenaColors as C, arenaType } from '../theme/arenaTheme';
import NightResult, { RewardChip } from '../components/games/NightResult';
import { NightIconButton, nightType } from '../components/games/night';
import { ArenaButton } from '../components/arena/ArenaKit';
import useNightStatusBar from '../components/arena/useNightStatusBar';

type Phase = 'card' | 'playing' | 'done';

/**
 * "Défi d'un ami" — the recipient's screen, reached from a duel deep link
 * (edlight://defi/<code> or academy.edlight.org/defi/<code>). Renders the
 * challenge card, replays the challenger's exact question draw through the
 * shared QuizPlayer, then posts the one-and-only attempt and shows the duel
 * outcome. Guests are routed through the auth modal first — the accept
 * endpoint (and the challenge read itself) require a signed-in user.
 */
export default function ChallengeScreen({ code, onClose }: { code: string; onClose: () => void }) {
  const { user, language, toggleAuthModal } = useStore();
  useNightStatusBar();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { challenge, isLoading, refetch: refetchChallenge } = useChallenge(user ? code : null);
  const [phase, setPhase] = useState<Phase>('card');
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Your own count, shown while the server confirms (or if it never answers).
  const [myLocalScore, setMyLocalScore] = useState(0);

  const category = useMemo(
    () => TRIVIA_CATEGORIES.find((c: any) => c.id === challenge?.categoryId) ?? null,
    [challenge],
  );
  const categoryLabel = category
    ? (isCreole ? (category as any).nameHt ?? (category as any).name : (category as any).name)
    : (challenge?.categoryId ?? '');

  const startDuel = useCallback(() => {
    if (!challenge) return;
    const qs = prepareChallengeQuestions(challenge.categoryId, challenge.questionIdxs);
    if (!qs) {
      // Bank mismatch between app versions — the draw can't be reproduced.
      setAcceptError('version');
      return;
    }
    setQuestions(qs);
    setPhase('playing');
  }, [challenge]);

  // The finished round's picks, kept for a resend after a network failure.
  const picksRef = useRef<Array<string | null> | null>(null);
  const handleFinish = useCallback(
    async (score: number, picks?: Array<string | null>) => {
      setMyLocalScore(score);
      if (picks) picksRef.current = picks;
      setPhase('done');
      setBusy(true);
      setAcceptError(null);
      try {
        // Picks + bank fingerprint: the server grades the attempt (D-8) and
        // refuses it if this build's bank differs from the duel's (D-9).
        let res = await acceptChallenge({
          code,
          score,
          ...(picksRef.current ? { answers: picksRef.current } : {}),
          bankHash: challenge ? bankHash((TRIVIA_QUESTIONS as Record<string, any[]>)[challenge.categoryId]) : null,
        });
        // A retry whose first post landed answers already_played: recover the
        // recorded result instead of reporting a failure (P0 validation).
        if (res && 'error' in res && res.error === 'already_played') {
          const recovered = recoveredAcceptOutcome(await getChallenge(code), user?.uid);
          if (recovered) res = recovered;
        }
        if (res && 'error' in res) setAcceptError(res.error === 'bank_mismatch' ? 'version' : res.error);
        else if (res) setOutcome(res);
        else setAcceptError('network');
        // The cached duel still says "open" for up to a minute otherwise.
        if (res && !('error' in res)) refetchChallenge().catch(() => {});
      } finally {
        setBusy(false);
      }
    },
    [code, user?.uid, refetchChallenge, challenge],
  );

  // ── Playing: full-bleed quiz, same player as a normal round ────────────────
  if (phase === 'playing' && challenge) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <QuizPlayer
          questions={questions}
          category={category ?? { id: challenge.categoryId, name: categoryLabel }}
          isCreole={isCreole}
          onFinish={(score, _total, _mistakes, picks) => handleFinish(score, picks)}
          title={t(`Défi · ${categoryLabel}`, `Defi · ${categoryLabel}`)}
          opponent={{
            seed: challenge.challengerUid || challenge.challengerName || 'ami',
            name: challenge.challengerName ?? t('Ton ami', 'Zanmi ou'),
            score: challenge.challengerScore,
            avatar: challenge.challengerAvatar ?? null,
          }}
          onQuit={() => Alert.alert(
            t('Abandonner le défi ?', 'Abandone defi a ?'),
            t('Tu n’as qu’une seule tentative : quitter maintenant la perd.', 'Ou gen yon sèl chans : si w kite kounye a, ou pèdi l.'),
            [
              { text: t('Continuer', 'Kontinye'), style: 'cancel' },
              { text: t('Quitter', 'Kite'), style: 'destructive', onPress: onClose },
            ],
          )}
          // A scored duel: the challenger's clock did not stop, so this one
          // keeps running in the background (utils/deadlineTimer.ts).
          timerPolicy="run"
        />
      </SafeAreaView>
    );
  }

  // ── Done: the duel result, faces and all ───────────────────────────────────
  if (phase === 'done' && challenge) {
    const myScore = outcome?.opponentScore ?? myLocalScore;
    const rival = challenge.challengerName ?? t('Ton ami', 'Zanmi ou');
    const won = outcome?.result === 'won';
    const tie = outcome?.result === 'tie';
    const line = busy
      ? t('Envoi du résultat…', 'N ap voye rezilta a…')
      : outcome
        ? won
          ? t(`Victoire · ${myScore} à ${challenge.challengerScore} contre ${rival}`, `Viktwa · ${myScore} kont ${challenge.challengerScore} sou ${rival}`)
          : tie
            ? t(`Égalité · ${myScore} partout avec ${rival}`, `Egalite · ${myScore} chak ak ${rival}`)
            : t(`Perdu de peu · ${myScore} à ${challenge.challengerScore} contre ${rival}`, `Pèdi tou piti · ${myScore} kont ${challenge.challengerScore} sou ${rival}`)
        : acceptError === 'expired'
          ? t('Ce défi a expiré avant l’envoi du score.', 'Defi a ekspire anvan nòt la rive.')
          : acceptError === 'self_challenge'
            ? t('Tu ne peux pas relever ton propre défi.', 'Ou pa ka reponn pwòp defi pa w.')
            : acceptError === 'version'
              ? t('Mets à jour l’app pour envoyer ce défi : ses questions ont changé.', 'Mete app la ajou pou voye defi sa a : kesyon yo chanje.')
            : acceptError === 'already_played'
              ? t('Ce défi a déjà été relevé par quelqu’un d’autre.', 'Yon lòt moun deja reponn defi sa a.')
              : t('Le score n’a pas pu être envoyé. Vérifie ta connexion.', 'Nòt la pa t ka voye. Verifye koneksyon ou.');
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <NightResult
          title={t('Résultat du duel', 'Rezilta duèl la')}
          subtitle={`Trivia · ${categoryLabel}`}
          onClose={onClose}
          closeLabel={t('Fermer', 'Fèmen')}
          me={{ seed: user?.uid || 'toi', label: t('Toi', 'Ou') }}
          opponent={{ seed: challenge.challengerUid || rival, label: rival, avatar: challenge.challengerAvatar ?? null }}
          winner={outcome ? (won ? 'me' : tie ? null : 'opponent') : null}
          score={myScore}
          total={challenge.total}
          scoreEarned={!!outcome && myScore > 0}
          scoreLine={line}
          chips={outcome && outcome.xpAwarded > 0 ? (
            <RewardChip earned icon={<Star color={C.gold} size={16} />} label={`+${outcome.xpAwarded} XP`} />
          ) : null}
          // A score that did not reach the server can be sent again (same
          // score — the round is over); the one-shot server makes it safe.
          primary={!outcome && !busy && acceptError === 'network'
            ? { label: t('Réessayer l’envoi', 'Eseye voye ankò'), onPress: () => handleFinish(myLocalScore) }
            : { label: t('Retour aux jeux', 'Tounen nan jwèt yo'), onPress: onClose }}
        />
      </SafeAreaView>
    );
  }

  // ── Card / loading / edge states ────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <NightIconButton onPress={onClose} label={t('Retour', 'Tounen')} icon={<ChevronLeft color={C.ink} size={22} />} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={[nightType.page, { color: C.ink }]}>{t('Défi reçu', 'Defi ou resevwa')}</Text>
        {!user ? (
          <View style={{ padding: 20, gap: 14, borderRadius: 20, backgroundColor: C.surface }}>
            <Text style={[arenaType.body, { color: C.inkSoft }]}>
              {t('Connecte-toi pour voir et relever ce défi.', 'Konekte pou wè epi reponn defi sa a.')}
            </Text>
            <ArenaButton label={t('Se connecter', 'Konekte')} onPress={toggleAuthModal} />
          </View>
        ) : isLoading ? (
          <View style={{ height: 260, borderRadius: 24, backgroundColor: C.surface }} accessibilityLabel={t('Chargement…', 'N ap chaje…')} />
        ) : !challenge ? (
          <Text style={[arenaType.body, { color: C.muted }]}>
            {t('Défi introuvable ou expiré.', 'Nou pa jwenn defi a, oswa li ekspire.')}
          </Text>
        ) : acceptError === 'version' ? (
          <Text style={[arenaType.body, { color: C.muted }]}>
            {t('Mets à jour l’app pour jouer ce défi.', 'Mete app la ajou pou w jwe defi sa a.')}
          </Text>
        ) : (
          <ChallengeCard
            challenge={challenge}
            categoryLabel={categoryLabel}
            busy={busy}
            onAccept={startDuel}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
