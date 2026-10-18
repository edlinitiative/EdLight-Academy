import React from 'react';
import { useMyAvatar } from '../../hooks/useMyAvatar';
import { Check, X, Clock, Flame, Zap, Trophy, Crown, Sparkles, RefreshCw } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useReducedMotion, motionVars } from '../../arena-art/motion/tokens';
import RankEmblem, { emblemForLevel } from '../../arena-art/emblems/RankEmblem';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import { DuelPanel } from '../../components/games/Duels';
import {
  answerTicks, celebrationSize, fastestCorrect, formatSeconds, longestStreak, newThemeRecord, type RoundAnswer,
} from './matchStats';
import { publicPseudo, type ResultCardData } from './resultCard';
import ResultShare from './ResultShare';
import { useMatchSound } from './useMatchSound';

export type MatchMode = 'practice' | 'daily' | 'duel';

export interface MatchResultsProps {
  answers: RoundAnswer[];
  score: number;
  total: number;
  category: string;
  categoryName: string;
  mode: MatchMode;
  isAuthed: boolean;
  isCreole: boolean;
  saving: boolean;
  saveError: boolean;
  reward: any;
  /** byCategory[cat] as it stood BEFORE this round was saved. */
  prevTheme?: { games?: number; bestPct?: number } | null;
  headingRef?: React.Ref<HTMLHeadingElement>;
  onReplay: () => void;
  onHome: () => void;
  onReview: () => void;
  onStartDuelRound: (c: string) => void;
  onPickDuel: () => void;
}

function excerpt(s: string, n = 70): string {
  const clean = String(s || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1).trimEnd()}…` : clean;
}

/**
 * The end of a round (roadmap #17): what happened, the moment that decided
 * it (only when the answers prove it), what it earned — XP, level, the
 * school's share — and what to do next, with "Rejouer" (or the duel) as the
 * one primary action. The missed-question review comes after, on its own
 * screen. Every number here is read from the round or the saved profile.
 */
export default function MatchResults(p: MatchResultsProps) {
  const { answers, score, total, isAuthed, isCreole, saving, saveError, reward, mode } = p;
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { profile, level } = useTrivia();
  const uid: string | null = useStore((s) => s.user?.uid) || null;
  const { avatar: myAvatar } = useMyAvatar();
  const reduced = useReducedMotion();
  const sound = useMatchSound();
  const played = React.useMemo(() => answers.map((a) => a.question), [answers]);

  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const ticks = answerTicks(answers);
  const wrong = ticks.filter((k) => k === 'wrong').length;
  const timeouts = ticks.filter((k) => k === 'timeout').length;
  const streak = longestStreak(answers);
  const fastest = fastestCorrect(answers);
  const saved = !!reward && !reward.guest && !saving && !saveError;
  const record = saved ? newThemeRecord(p.prevTheme, pct) : null;
  const leveledUp = saved && !!reward.leveledUp;
  const size = celebrationSize({ score, total, record: !!record, leveledUp });
  const perfect = total > 0 && score === total;

  const board = isAuthed ? profile?.leaderboard : null;
  const school: string | null = board?.school || null;
  // XP reaches the school only through the opted-in weekly board
  // (triviaService.recordTriviaResult → addWeeklyXp). Never claim otherwise.
  const schoolGets = saved && !!board?.optedIn && !!school && reward.xpEarned > 0;
  const pseudo = isAuthed ? publicPseudo(board?.displayName) : null;

  const headline = perfect
    ? t('Sans faute !', 'San fòt !')
    : pct >= 70
      ? t('Très bien, continue comme ça !', 'Trè byen, kontinye konsa !')
      : pct >= 50
        ? t('Pas mal ! Tu peux encore progresser.', 'Pa mal ! Ou ka pwogrese plis toujou.')
        : t('Courage ! Chaque partie te fait progresser.', 'Kouraj ! Chak pati fè w pwogrese.');

  // Facts, strongest first. A perfect round's streak IS the round: skip it.
  const facts: { key: string; icon: React.ReactNode; label: string; value: string; detail?: string }[] = [];
  if (record) facts.push({ key: 'record', icon: <Trophy size={18} />, label: t('Nouveau record sur ce thème', 'Nouvo rekò sou tèm sa a'), value: `${pct} %`, detail: t(`avant : ${record.prevPct} %`, `anvan : ${record.prevPct} %`) });
  if (streak && streak.length >= 2 && streak.length < total) facts.push({ key: 'streak', icon: <Flame size={18} />, label: t('Plus longue série', 'Pi long seri'), value: t(`${streak.length} de suite`, `${streak.length} youn apre lòt`), detail: t(`questions ${streak.from} à ${streak.to}`, `kesyon ${streak.from} rive ${streak.to}`) });
  if (fastest) facts.push({ key: 'fast', icon: <Zap size={18} />, label: t('Réponse juste la plus rapide', 'Bon repons ki pi rapid'), value: formatSeconds(fastest.ms, isCreole), detail: excerpt(isCreole ? fastest.question?.qHt || fastest.question?.q : fastest.question?.q) });

  // XP breakdown, re-derived from the same formula the service used
  // (computeXpEarned); shown only when it adds up to what was awarded.
  const xp = reward ? reward.xpEarned || 0 : 0;
  const base = score * 10;
  const perfectBonus = perfect ? 25 : 0;
  const dailyBonus = Math.max(0, xp - base - perfectBonus);
  const breakdownOk = !!reward && base + perfectBonus + dailyBonus === xp && (mode === 'daily' || dailyBonus === 0);
  const breakdown = [
    score > 0 ? t(`${score} × 10 XP`, `${score} × 10 XP`) : null,
    perfectBonus ? t('+25 sans faute', '+25 san fòt') : null,
    dailyBonus ? t(`+${dailyBonus} défi du jour`, `+${dailyBonus} defi jodi a`) : null,
  ].filter(Boolean).join(' ');

  React.useEffect(() => {
    if (size === 'big') sound('victory');
  }, [size, sound]);

  const modeLabel = mode === 'daily' ? t('Défi du jour', 'Defi jodi a') : mode === 'duel' ? t('Manche défi', 'Pati defi') : t('Partie rapide', 'Pati rapid');
  const tickWord = (k: string) => (k === 'correct' ? t('juste', 'bon') : k === 'wrong' ? t('fausse', 'pa bon') : t('temps écoulé', 'tan fini'));
  const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
  const ticksLabel = t(
    `Tes réponses : ${pl(score, 'juste')}, ${pl(wrong, 'fausse')}${timeouts ? `, ${timeouts} sans réponse` : ''}`,
    `Repons ou : ${score} bon, ${wrong} pa bon${timeouts ? `, ${timeouts} san repons` : ''}`,
  );

  const card: ResultCardData = {
    isCreole,
    eyebrow: `${p.categoryName} · ${modeLabel}`,
    score: `${score}/${total}`,
    scoreCaption: t('bonnes réponses', 'bon repons'),
    headline,
    ticks,
    facts: facts.slice(0, 2).map((f) => `${f.label} : ${f.value}`),
    pseudo,
    faceSeed: isAuthed ? uid : null,
    faceAvatar: isAuthed ? myAvatar : null,
    school: isAuthed ? school : null,
    level: isAuthed ? level?.level || null : null,
  };

  const duelPrimary = mode === 'duel';
  const replayLabel = mode === 'duel' ? t('Rejouer une manche défi', 'Rejwe yon pati defi') : mode === 'daily' ? t('Jouer une partie mélangée', 'Jwe yon pati melanje') : t('Rejouer', 'Rejwe');
  const tier = emblemForLevel(level?.level || 1);
  const duelPanel = (
    <DuelPanel
      category={p.category}
      played={played}
      score={score}
      total={total}
      isAuthed={isAuthed}
      isCreole={isCreole}
      onStartDuelRound={p.onStartDuelRound}
      onPickDuel={p.onPickDuel}
      primary={duelPrimary}
    />
  );

  return (
    <section className="mx-res" data-size={size} data-reduced={reduced ? 'true' : undefined} style={motionVars} aria-labelledby="mx-res-title">
      <header className="mx-res__head mx-in">
        <p className="mx-res__eyebrow">{p.categoryName} · {modeLabel}</p>
        <div className="mx-res__scoreline">
          {size === 'big' && <span className="mx-res__medal" aria-hidden="true">{perfect ? <Trophy size={30} /> : leveledUp ? <Crown size={30} /> : <Sparkles size={30} />}</span>}
          <p className="mx-res__score">
            <span className="mx-num">{score}</span><span className="mx-res__of">/{total}</span>
            <span className="mx-res__cap">{t('bonnes réponses', 'bon repons')}</span>
          </p>
        </div>
        <h1 id="mx-res-title" className="mx-res__headline" tabIndex={-1} ref={p.headingRef}>{headline}</h1>
        <ol className="mx-res__ticks" aria-label={ticksLabel}>
          {ticks.map((k, i) => (
            <li key={i} className={`mx-tick is-${k}`} title={`${t('Question', 'Kesyon')} ${i + 1} : ${tickWord(k)}`}>
              {k === 'correct' ? <Check size={14} aria-hidden="true" /> : k === 'wrong' ? <X size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </header>

      {facts.length > 0 && (
        <ul className="mx-res__facts mx-in" aria-label={t('Moments forts', 'Moman fò')}>
          {facts.map((f) => (
            <li key={f.key} className={`mx-fact mx-fact--${f.key}`}>
              <span className="mx-fact__label"><span className="mx-fact__icon" aria-hidden="true">{f.icon}</span>{f.label}</span>
              <strong className="mx-fact__value mx-num">{f.value}</strong>
              {f.detail && <span className="mx-fact__detail">{f.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mx-res__earn mx-in">
        {saving ? (
          <p className="mx-res__note" role="status">{t('Enregistrement de ta progression…', 'N ap anrejistre pwogrè ou…')}</p>
        ) : saveError ? (
          <p className="mx-res__note" role="status">{t('Les XP n’ont pas pu être enregistrés. Ton résultat reste disponible ici.', 'Nou pa t ka anrejistre XP yo. Rezilta ou rete isit la.')}</p>
        ) : reward && reward.guest ? (
          <div className="mx-xp">
            <p className="mx-xp__amount"><Sparkles size={18} aria-hidden="true" /> <span className="mx-num">+{xp} XP</span></p>
            <p className="mx-res__note">{t('Aperçu : cette partie n’est pas sauvegardée.', 'Apèsi : pati sa a pa anrejistre.')}</p>
          </div>
        ) : saved ? (
          <div className="mx-xp">
            <div className="mx-xp__top">
              <p className="mx-xp__amount"><Sparkles size={18} aria-hidden="true" /> <span className="mx-num">+{xp} XP</span></p>
              {breakdownOk && breakdown && <p className="mx-xp__why">{breakdown}</p>}
            </div>
            {level && (
              <div className="mx-level">
                <RankEmblem level={level.level} size={36} />
                <div className="mx-level__body">
                  <p className="mx-level__name">
                    {leveledUp ? t(`Niveau ${level.level} atteint !`, `Ou rive nivo ${level.level} !`) : `${t('Niveau', 'Nivo')} ${level.level}`} · {isCreole ? tier.nameHt : tier.nameFr}
                  </p>
                  <div className="mx-level__bar" role="progressbar" aria-valuemin={0} aria-valuemax={level.xpForNext} aria-valuenow={level.xpIntoLevel}
                    aria-label={t(`Progression vers le niveau ${level.level + 1}`, `Pwogrè pou rive nivo ${level.level + 1}`)}>
                    <span style={{ width: `${level.progressPct}%` }} />
                  </div>
                  <p className="mx-level__next">{t(`${level.xpToNext} XP avant le niveau ${level.level + 1}`, `${level.xpToNext} XP anvan nivo ${level.level + 1}`)}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {schoolGets && (
          <p className="mx-school">
            <SchoolCrest name={school as string} size={32} />
            <span><strong className="mx-num">{t(`+${xp} XP pour ${school}`, `+${xp} XP pou ${school}`)}</strong>
              <span className="mx-school__sub">{t('comptés au classement de la semaine', 'konte nan klasman semèn nan')}</span></span>
          </p>
        )}
      </div>

      {/* On a duel round, sending the duel IS the next action: it comes first. */}
      {duelPrimary && duelPanel}

      <div className="mx-res__actions mx-in">
        <button type="button" className={duelPrimary ? 'an-ghost' : 'an-go'} onClick={p.onReplay}>
          <RefreshCw size={16} aria-hidden="true" /> {replayLabel}
        </button>
        {answers.some((a) => !a.correct) && <button type="button" className="an-ghost" onClick={p.onReview}>{t('Revoir mes erreurs', 'Revize erè mwen yo')}</button>}
        <ResultShare card={card} where="trivia-results" />
        <button type="button" className="an-ghost" onClick={p.onHome}>← {t('Thèmes', 'Tèm yo')}</button>
      </div>

      {!duelPrimary && duelPanel}

      {!isAuthed && (
        <div className="mx-res__save">
          <p>{t('Continue gratuitement. Crée un compte pour sauvegarder la progression de tes prochaines parties.', 'Kontinye gratis. Kreye yon kont pou anrejistre pwogrè pwochen pati ou yo.')}</p>
          <button type="button" className="an-ghost" onClick={() => { useStore.getState().setActiveTab('signup'); useStore.getState().toggleAuthModal(); }}>
            {t('Créer un compte', 'Kreye yon kont')}
          </button>
        </div>
      )}
    </section>
  );
}
