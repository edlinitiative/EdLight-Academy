import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Swords, Trophy } from 'lucide-react-native';
import { TRIVIA_CATEGORIES } from '../data/triviaData';
import { QuizPlayer, prepareChallengeQuestions, type PreparedQuestion } from './TriviaScreen';
import ChallengeCard from '../components/games/ChallengeCard';
import { useChallenge } from '../hooks/useChallenges';
import { acceptChallenge, type AcceptOutcome } from '../services/challengeService';
import QuizResultHero, { HeroButton, glass } from '../components/quiz/QuizResultHero';
import useStore from '../contexts/store';
import { useColors, typeScale } from '../theme/theme';
import { Skeleton } from '../components/StateViews';

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
  const colors = useColors();
  const { user, language, toggleAuthModal } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { challenge, isLoading } = useChallenge(user ? code : null);
  const [phase, setPhase] = useState<Phase>('card');
  const [questions, setQuestions] = useState<PreparedQuestion[]>([]);
  const [outcome, setOutcome] = useState<AcceptOutcome | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const handleFinish = useCallback(
    async (score: number) => {
      setPhase('done');
      setBusy(true);
      try {
        const res = await acceptChallenge({ code, score });
        if (res && 'error' in res) setAcceptError(res.error);
        else if (res) setOutcome(res);
        else setAcceptError('network');
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  // ── Playing: full-bleed quiz, same player as a normal round ────────────────
  if (phase === 'playing' && challenge) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Swords color={colors.azure} size={18} />
          <Text style={[typeScale.title, { color: colors.ink }]} numberOfLines={1}>
            {t('Défi', 'Defi')} · {categoryLabel}
          </Text>
        </View>
        <QuizPlayer
          questions={questions}
          category={category ?? { id: challenge.categoryId, name: categoryLabel, icon: '⚔️' }}
          isCreole={isCreole}
          onFinish={(score) => handleFinish(score)}
        />
      </SafeAreaView>
    );
  }

  // ── Done: duel outcome over the shared victory surface ─────────────────────
  if (phase === 'done' && challenge) {
    const myScore = outcome?.opponentScore ?? 0;
    const title = busy
      ? t('Envoi du résultat…', 'Ap voye rezilta a…')
      : outcome
        ? outcome.result === 'won'
          ? t('Tu as gagné ! 🏆', 'Ou genyen ! 🏆')
          : outcome.result === 'tie'
            ? t('Égalité !', 'Egalite !')
            : t('Perdu de peu…', 'Ou pèdi tou piti…')
        : t('Résultat non enregistré', 'Rezilta a pa anrejistre');
    return (
      <QuizResultHero
        score={myScore}
        total={challenge.total}
        isCreole={isCreole}
        title={title}
        celebrateHaptic={outcome?.result === 'won'}
        showConfetti={outcome?.result === 'won'}
        footer={
          <HeroButton variant="glass" label={t('Retour aux jeux', 'Tounen nan jwèt yo')} onPress={onClose} />
        }
      >
        <View style={{ marginTop: 12, alignItems: 'center', gap: 8 }}>
          <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ fontFamily: typeScale.title.fontFamily, fontSize: 14, color: '#fff' }}>
              {challenge.challengerName ?? t('Ton ami', 'Zanmi ou')} {challenge.challengerScore} — {myScore} {t('toi', 'ou menm')}
            </Text>
          </View>
          {outcome && outcome.xpAwarded > 0 && (
            <View style={{ ...glass, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Trophy color="#fde68a" size={14} />
              <Text style={{ fontFamily: typeScale.label.fontFamily, fontSize: 13, color: '#fde68a' }}>
                +{outcome.xpAwarded} XP
              </Text>
            </View>
          )}
          {acceptError && (
            <Text style={{ fontFamily: typeScale.caption.fontFamily, fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
              {t('Le score n’a pas pu être envoyé — vérifie ta connexion.', 'Nòt la pa t ka voye — verifye koneksyon ou.')}
            </Text>
          )}
        </View>
      </QuizResultHero>
    );
  }

  // ── Card / loading / edge states ────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('Retour', 'Tounen')}
          style={{ padding: 4 }}
        >
          <ChevronLeft color={colors.ink} size={26} />
        </TouchableOpacity>
        <Text style={[typeScale.h1, { color: colors.ink }]}>{t('Défi reçu', 'Defi ou resevwa')} ⚔️</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {!user ? (
          <View style={{ gap: 12 }}>
            <Text style={[typeScale.bodyMd, { color: colors.muted, textAlign: 'center' }]}>
              {t('Connecte-toi pour voir et relever ce défi.', 'Konekte pou wè epi reponn defi sa a.')}
            </Text>
            <TouchableOpacity
              onPress={toggleAuthModal}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={{ alignSelf: 'center', backgroundColor: colors.azure, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12 }}
            >
              <Text style={[typeScale.bodyMd, { color: '#fff' }]}>{t('Se connecter', 'Konekte')}</Text>
            </TouchableOpacity>
          </View>
        ) : isLoading ? (
          <Skeleton height={220} radius={18} />
        ) : !challenge ? (
          <Text style={[typeScale.bodyMd, { color: colors.muted, textAlign: 'center' }]}>
            {t('Défi introuvable ou expiré.', 'Nou pa jwenn defi a, oswa li ekspire.')}
          </Text>
        ) : acceptError === 'version' ? (
          <Text style={[typeScale.bodyMd, { color: colors.muted, textAlign: 'center' }]}>
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
