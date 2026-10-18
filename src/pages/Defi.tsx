import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useStore from '../contexts/store';
import CategoryIcon from '../components/CategoryIcon';
import { Swords, Clock, Target, Trophy, LogIn, Smartphone, RefreshCw, ArrowLeft } from '../components/icons';
import Avatar from '../arena-art/avatars/Avatar';
import { useMyAvatar } from '../hooks/useMyAvatar';

/** The two students, face to face — the Arène's generated faces, seeded by
    uid so each student looks the same here as on the board and the broadcast. */
function DuelArt({ left, right, leftName, rightName, leftAvatar = null, rightAvatar = null }: { left: string; right: string; leftName: string; rightName: string; leftAvatar?: string | null; rightAvatar?: string | null }) {
  return (
    <div className="defi__vs" aria-hidden="true">
      <span className="defi__vs-p"><span className="defi__vs-face"><Avatar seed={left} config={leftAvatar} size={80} mood="ready" /></span><span className="defi__vs-name">{leftName}</span></span>
      <span className="defi__vs-bolt">VS</span>
      <span className="defi__vs-p"><span className="defi__vs-face"><Avatar seed={right} config={rightAvatar} size={80} mood="focused" /></span><span className="defi__vs-name">{rightName}</span></span>
    </div>
  );
}
import { TriviaQuiz } from './TriviaGames';
import { DuelScoreboard, DuelShareSheet, categoryLabel } from '../components/games/Duels';
import { useFocusMode } from '../hooks/useFocusMode';
import { loadDuelBank } from '../utils/duelBank';
import { acceptErrorMessage, duelState, isDuelCode, normalizeDuelCode, outcomeFor, questionsAt, shuffleOptions, type DuelQuestion } from '../utils/duels';
import { acceptChallenge, getChallenge, rememberReceived, type AcceptResult, type Challenge } from '../services/challengeWebService';
import { trackEvent } from '../utils/telemetry';
import { DuelSubmitStatus, DuelTrustNote, useDuelSubmission } from '../components/arena/trust';
import { fastestCorrect, formatSeconds, longestStreak, type RoundAnswer } from './trivia/matchStats';
import ResultShare from './trivia/ResultShare';
import DuelIntro from '../components/arena/DuelIntro';
import TrophyCeremony from '../arena-art/motion/TrophyCeremony';
import { useReducedMotion } from '../arena-art/motion/tokens';
import { schoolColors } from '../arena-art/crest/SchoolCrest';
import { useArenaSound } from '../arena-art/sound/useArenaSound';
import { useTrivia } from '../hooks/useTrivia';
import '../components/games/duels.css';
import './TriviaGames.css';

type Phase = 'card' | 'intro' | 'playing' | 'sending' | 'done';

/**
 * /defi/:code — "Défi d'un ami" on the web, end to end.
 *
 * Signed out: what the duel is, and a sign-in button (reading the duel and
 * posting a score both need an account — firestore.rules and the accept
 * endpoint). Signed in: the duel card, then the challenger's exact questions
 * (one attempt, 15 s each — the app's round), then the head-to-head result as
 * the server recorded it. Opening the app is a secondary link only.
 *
 * One attempt is enforced where it can be: the server accepts exactly one
 * score per duel, transactionally. Leaving mid-round and coming back starts
 * the round over, same as in the app — that barrier is deliberately not here
 * yet ("everything playable on laptops first, barriers after").
 */
export default function Defi() {
  const { code: rawCode } = useParams();
  const code = normalizeDuelCode(rawCode);
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid: string | null = user?.uid || null;
  const { avatar: myAvatar } = useMyAvatar();

  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('card');
  const [questions, setQuestions] = useState<DuelQuestion[] | null>(null);
  const [bankMiss, setBankMiss] = useState(false);
  const [outcome, setOutcome] = useState<AcceptResult | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myAnswers, setMyAnswers] = useState<RoundAnswer[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);
  // The win ceremony plays once, when the server confirms the win (audit X1).
  const [ceremonyDone, setCeremonyDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const { play: playSound } = useArenaSound();
  const { profile } = useTrivia();
  const myName: string = (profile?.leaderboard?.displayName || '').trim() || (isCreole ? 'Ou menm' : 'Toi');
  const mySchool: string = profile?.leaderboard?.school || '';
  useFocusMode(phase === 'playing' || phase === 'intro');

  useEffect(() => { trackEvent('duel_view', { signedIn: !!uid }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Read the duel once signed in.
  useEffect(() => {
    if (!uid || !isDuelCode(code)) { setChallenge(isDuelCode(code) ? undefined : null); return; }
    let live = true;
    setChallenge(undefined);
    setLoadError(null);
    getChallenge(code).then((r) => {
      if (!live) return;
      setChallenge(r.challenge);
      setLoadError(r.error ?? null);
      if (r.challenge && r.challenge.challengerUid !== uid) rememberReceived(uid, r.challenge.code);
    });
    return () => { live = false; };
  }, [uid, code, reloadNonce]);

  // Materialize the challenger's questions from the duel bank.
  useEffect(() => {
    if (!challenge) return;
    let live = true;
    loadDuelBank()
      .then((bank) => {
        if (!live) return;
        const qs = questionsAt(bank[challenge.categoryId], challenge.questionIdxs);
        setBankMiss(!qs);
        setQuestions(qs ? qs.map((q) => shuffleOptions(q)) : null);
      })
      .catch(() => { if (live) setBankMiss(true); });
    return () => { live = false; };
  }, [challenge]);

  // Posts the one attempt; a retry after a lost reply recovers the recorded score.
  const submitDuel = useDuelSubmission(code, uid);
  const finish = useCallback(async (score: number, _total?: number, answers?: RoundAnswer[]) => {
    setMyScore(score);
    setMyAnswers(Array.isArray(answers) ? answers : []);
    setPhase('sending');
    const r = await submitDuel(score);
    setOutcome(r);
    setPhase('done');
    trackEvent('duel_played', { ok: r.ok, result: r.result ?? r.error });
  }, [submitDuel]);

  const label = challenge ? categoryLabel(challenge.categoryId, isCreole) : '';
  const challengerName = challenge?.challengerName || t('Ton ami', 'Zanmi ou');
  const signIn = () => { setActiveTab?.('signin'); toggleAuthModal(); };
  const appLink = (
    <p className="defi__secondary">
      <Smartphone size={14} aria-hidden="true" />{' '}
      {t('Tu as l’application ?', 'Ou gen aplikasyon an ?')}{' '}
      <a href={`edlight://defi/${code}`}>{t('Ouvrir dans l’app', 'Louvri nan app la')}</a>
    </p>
  );
  const facts = challenge ? (
    <ul className="defi__facts">
      <li><CategoryIcon id={challenge.categoryId} size={16} /> {label}</li>
      <li><Target size={15} aria-hidden="true" /> {challenge.total} {t('questions', 'kesyon')}</li>
      <li><Clock size={15} aria-hidden="true" /> {t('15 s par question', '15 s pa kesyon')}</li>
      <li><RefreshCw size={15} aria-hidden="true" /> {t('Un seul essai', 'Yon sèl tantativ')}</li>
    </ul>
  ) : null;

  // ── The opening: both faces, then 3-2-1, then the round ───────────────
  if (phase === 'intro' && challenge && questions) {
    const neutral = { primary: '#1F3456', secondary: '#FFD27A' };
    return (
      <div className="trivia-page defi__play">
        <p className="defi__playhead"><Swords size={18} aria-hidden="true" /> {t('Défi', 'Defi')} · {label}</p>
        <DuelIntro
          me={{ name: myName, school: mySchool || t('Ton école', 'Lekòl ou'), colors: mySchool ? schoolColors(mySchool) : neutral, seed: uid || 'toi' }}
          opponent={{ name: challengerName, school: t(`${challenge.challengerScore}/${challenge.total} à battre`, `${challenge.challengerScore}/${challenge.total} pou bat`), colors: neutral, seed: challenge.challengerUid || challengerName }}
          onGo={() => setPhase('playing')}
        />
      </div>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────
  if (phase === 'playing' && challenge && questions) {
    return (
      <div className="trivia-page defi__play">
        <p className="defi__playhead"><Swords size={18} aria-hidden="true" /> {t('Défi', 'Defi')} · {label}</p>
        <TriviaQuiz
          key={challenge.code}
          timed
          category={challenge.categoryId}
          count={questions.length}
          questions={questions}
          isCreole={isCreole}
          onFinish={(score, total, answers) => finish(score, total, answers)}
          onBack={() => setPhase('card')}
        />
      </div>
    );
  }

  const body = (() => {
    // Signed out — explain, then sign in.
    if (!uid) {
      return (
        <div className="defi__card">
          <DuelArt left="ton-ami" right="toi" leftName={t('Ton ami', 'Zanmi ou')} rightName={t('Toi', 'Ou menm')} />
          <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {t('Défi d’un ami', 'Defi yon zanmi')}</span>
          <h1 className="defi__title">{t('On te défie !', 'Yo defye w !')}</h1>
          <p className="defi__text">
            {t('Un ami a joué une partie de trivia sur EdLight Academy et te lance les mêmes questions. Un seul essai, 15 secondes par question : fais mieux que lui et gagne +20 XP.',
              'Yon zanmi jwe yon pati trivia sou EdLight Academy epi l voye menm kesyon yo ba ou. Yon sèl tantativ, 15 segonn pa kesyon : fè pi byen pase l epi genyen +20 XP.')}
          </p>
          <p className="defi__text">{t('Connecte-toi pour voir son score et relever le défi — c’est gratuit.', 'Konekte pou wè nòt li epi reponn defi a — se gratis.')}</p>
          {isDuelCode(code) && <p className="defi__text">{t('Code du défi', 'Kòd defi a')} : <strong translate="no">{code}</strong></p>}
          <div className="defi__actions">
            <button type="button" className="duel-pill duel-pill--primary" onClick={signIn}>
              <LogIn size={16} /> {t('Se connecter pour jouer', 'Konekte pou jwe')}
            </button>
          </div>
          {appLink}
        </div>
      );
    }

    if (!isDuelCode(code) || challenge === null) {
      return (
        <div className="defi__card">
          <h1 className="defi__title">{t('Défi introuvable', 'Nou pa jwenn defi a')}</h1>
          <p className="defi__text">
            {loadError === 'network'
              ? t('Impossible de charger le défi. Vérifie ta connexion.', 'Nou pa ka chaje defi a. Verifye koneksyon ou.')
              : t('Le lien est peut-être incomplet. Vérifie le code avec ton ami.', 'Petèt lyen an pa konplè. Verifye kòd la ak zanmi ou.')}
          </p>
          <div className="defi__actions">
            {loadError === 'network' && (
              <button type="button" className="duel-pill duel-pill--soft" onClick={() => setReloadNonce((n) => n + 1)}>
                <RefreshCw size={16} /> {t('Réessayer', 'Eseye ankò')}
              </button>
            )}
            <Link to="/jeux" className="duel-pill duel-pill--primary">{t('Aller aux jeux', 'Ale nan jwèt yo')}</Link>
          </div>
        </div>
      );
    }

    if (challenge === undefined) {
      return <div className="defi__card" role="status"><p className="defi__text">{t('Chargement du défi…', 'N ap chaje defi a…')}</p></div>;
    }

    // Just played — the result as the server recorded it (roadmap #17):
    // the verdict, the head-to-head, the moments the answers prove, the XP,
    // then "Revanche" as the one primary action when the student did not win.
    if (phase === 'sending' || phase === 'done') {
      const ok = outcome?.ok;
      const result = ok ? outcome.result : null;
      const title = phase === 'sending'
        ? t('Envoi de ton score…', 'N ap voye nòt ou…')
        : ok
          ? result === 'won'
            ? t('Tu as gagné !', 'Ou genyen !')
            : result === 'tie'
              ? t('Égalité !', 'Egalite !')
              : t('Perdu de peu…', 'Ou pèdi tou piti…')
          : t('Score non enregistré', 'Nòt la pa anrejistre');
      const mine = ok ? outcome.opponentScore : myScore;
      const theirs = ok ? outcome.challengerScore : challenge.challengerScore;
      const streak = longestStreak(myAnswers);
      const fastest = fastestCorrect(myAnswers);
      const facts = [
        streak && streak.length >= 2 ? { k: 'streak', label: t('Plus longue série', 'Pi long seri'), value: t(`${streak.length} de suite`, `${streak.length} youn apre lòt`) } : null,
        fastest ? { k: 'fast', label: t('Réponse juste la plus rapide', 'Bon repons ki pi rapid'), value: formatSeconds(fastest.ms, isCreole) } : null,
      ].filter(Boolean) as { k: string; label: string; value: string }[];
      const revanche = phase === 'done' && !!ok && result !== 'won';
      return (
        <div className="defi__card mx-duelres" aria-live="polite">
          {/* A confirmed win — the server recorded it — gets the trophy, once.
              Never on a loss, a tie, an unsaved score or with reduced motion;
              "Passer" or the end of the sequence hands back to this card. */}
          {phase === 'done' && ok && result === 'won' && !ceremonyDone && !reduceMotion && (
            <div className="defi__ceremony">
              <TrophyCeremony
                event={{ title: t('Défi d’un ami', 'Defi yon zanmi'), subtitle: label }}
                winner={{ name: myName, colors: mySchool ? schoolColors(mySchool) : { primary: '#1F3456', secondary: '#FFD27A' }, roster: [t(`${mine} – ${theirs} contre ${challengerName}`, `${mine} – ${theirs} kont ${challengerName}`)] }}
                status="confirmed"
                labels={{ eyebrow: t('Défi gagné', 'Defi genyen'), tease: t('Le vainqueur du défi est…', 'Moun ki genyen defi a se…'), roster: t('Score final', 'Nòt final') }}
                onStateChange={(st) => {
                  if (st === 'reveal') { try { playSound('victory'); } catch { /* silent */ } }
                  if (st === 'settled') window.setTimeout(() => setCeremonyDone(true), 1600);
                }}
              />
            </div>
          )}
          <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {label}</span>
          <h1 className="defi__title">{title}</h1>
          <DuelScoreboard
            leftName={challengerName}
            leftSeed={challenge.challengerUid || null} leftAvatar={challenge.challengerAvatar}
            leftScore={theirs}
            rightName={t('Toi', 'Ou menm')}
            rightSeed={uid} rightAvatar={myAvatar}
            rightScore={mine}
            total={challenge.total}
            isCreole={isCreole}
          />
          {ok && outcome.xpAwarded > 0 && <span className="defi__xp"><Trophy size={15} /> +{outcome.xpAwarded} XP</span>}
          {phase === 'done' && facts.length > 0 && (
            <ul className="mx-duelres__facts" aria-label={t('Moments forts', 'Moman fò')}>
              {facts.map((f) => <li key={f.k}><span>{f.label}</span> <strong className="mx-num">{f.value}</strong></li>)}
            </ul>
          )}
          <DuelSubmitStatus pending={phase === 'sending'} outcome={outcome} onRetry={() => { if (myScore != null) void finish(myScore, challenge.total, myAnswers); }} challengerName={challengerName} isCreole={isCreole} />
          {phase === 'done' && <DuelTrustNote challenge={challenge} uid={uid} isCreole={isCreole} showFacts={false} />}
          {phase === 'done' && (
            <div className="defi__actions">
              <Link to="/jeux/trivia" state={{ duelCategory: challenge.categoryId }} className="duel-pill duel-pill--primary"
                onClick={() => trackEvent('duel_rematch', { result: result ?? 'unsaved', category: challenge.categoryId })}>
                <Swords size={16} /> {revanche ? t('Revanche', 'Revanj') : t('Défier quelqu’un à mon tour', 'Defye yon moun tou')}
              </Link>
              {ok && mine != null && (
                <ResultShare
                  className="duel-pill duel-pill--soft"
                  where="defi-result"
                  card={{
                    isCreole,
                    eyebrow: `${label} · ${t('Défi d’un ami', 'Defi yon zanmi')}`,
                    score: `${mine} – ${theirs}`,
                    scoreCaption: t('toi – ton adversaire', 'ou menm – advèsè ou'),
                    headline: result === 'won' ? t('Défi gagné !', 'Defi genyen !') : result === 'tie' ? t('Égalité !', 'Egalite !') : t('Revanche à venir', 'Revanj ap vini'),
                    ticks: myAnswers.length ? myAnswers.map((a) => (a.correct ? 'correct' : a.selected === -1 ? 'timeout' : 'wrong')) : undefined,
                    facts: facts.map((f) => `${f.label} : ${f.value}`),
                  }}
                />
              )}
              <Link to="/jeux" className="duel-pill duel-pill--soft">{t('Mes défis', 'Defi mwen yo')}</Link>
            </div>
          )}
          {revanche && (
            <p className="defi__text mx-duelres__hint">
              {t('Revanche : une nouvelle manche de 10 questions sur ce thème, que tu renvoies ensuite.', 'Revanj : yon nouvo pati 10 kesyon sou tèm sa a, epi ou voye l ba li.')}
            </p>
          )}
        </div>
      );
    }

    const state = duelState(challenge, uid);

    // Your own duel — its status, and the link to send again.
    if (challenge.challengerUid === uid) {
      const res = outcomeFor(challenge, uid);
      return (
        <div className="defi__card">
          <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {t('Ton défi', 'Defi ou')}</span>
          <h1 className="defi__title">
            {state === 'played'
              ? res === 'won' ? t('Tu as gagné ce défi', 'Ou genyen defi sa a')
                : res === 'lost' ? t('Ton ami t’a battu', 'Zanmi ou bat ou')
                  : t('Égalité', 'Egalite')
              : state === 'expired'
                ? t('Ce défi a expiré', 'Defi sa a ekspire')
                : t('En attente de ton ami', 'N ap tann zanmi ou')}
          </h1>
          {facts}
          <DuelTrustNote challenge={challenge} uid={uid} isCreole={isCreole} />
          <DuelScoreboard
            leftName={t('Toi', 'Ou menm')}
            leftSeed={uid} leftAvatar={myAvatar}
            leftScore={challenge.challengerScore}
            rightSeed={challenge.opponent?.uid || null} rightAvatar={challenge.opponent?.avatar}
            rightName={challenge.opponent?.name || t('Ton ami', 'Zanmi ou')}
            rightScore={challenge.opponent ? challenge.opponent.score : null}
            total={challenge.total}
            isCreole={isCreole}
          />
          {state === 'waiting' && (
            <>
              <p className="defi__text">{t('Personne n’a encore relevé ce défi. Renvoie-le :', 'Pèsonn poko jwe defi sa a. Voye l ankò :')}</p>
              <DuelShareSheet code={challenge.code} categoryId={challenge.categoryId} score={challenge.challengerScore} total={challenge.total} isCreole={isCreole} where="defi-own" />
            </>
          )}
          <div className="defi__actions">
            {state === 'played' && res !== 'won' ? (
              <Link to="/jeux/trivia" state={{ duelCategory: challenge.categoryId }} className="duel-pill duel-pill--primary">
                <Swords size={16} /> {t('Prendre ma revanche', 'Pran revanj mwen')}
              </Link>
            ) : (
              <Link to="/jeux/trivia" state={{ duelPick: true }} className="duel-pill duel-pill--soft">
                <Swords size={16} /> {t('Nouveau défi', 'Nouvo defi')}
              </Link>
            )}
          </div>
        </div>
      );
    }

    // Someone else's duel that is already played or expired.
    if (state === 'played' || state === 'taken' || state === 'expired') {
      const res = outcomeFor(challenge, uid);
      return (
        <div className="defi__card">
          <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {label}</span>
          <h1 className="defi__title">
            {state === 'played'
              ? res === 'won' ? t('Tu as gagné ce défi', 'Ou genyen defi sa a')
                : res === 'lost' ? t('Tu as perdu ce défi', 'Ou pèdi defi sa a')
                  : t('Égalité', 'Egalite')
              : state === 'expired'
                ? t('Ce défi a expiré', 'Defi sa a ekspire')
                : t('Ce défi a déjà été relevé', 'Yon moun deja jwe defi sa a')}
          </h1>
          {state === 'played' && (
            <DuelScoreboard
              leftName={challengerName}
              leftSeed={challenge.challengerUid || null} leftAvatar={challenge.challengerAvatar}
              leftScore={challenge.challengerScore}
              rightName={t('Toi', 'Ou menm')}
              rightSeed={uid} rightAvatar={myAvatar}
              rightScore={challenge.opponent?.score ?? null}
              total={challenge.total}
              isCreole={isCreole}
            />
          )}
          {state !== 'played' && <p className="defi__text">{t('Un défi ne se joue qu’une fois. Lance le tien !', 'Yon defi jwe yon sèl fwa. Lanse pa w la !')}</p>}
          <div className="defi__actions">
            <Link to="/jeux/trivia" state={{ duelPick: true }} className="duel-pill duel-pill--primary">
              <Swords size={16} /> {t('Lancer mon défi', 'Lanse defi pa m')}
            </Link>
          </div>
        </div>
      );
    }

    // Open and yours to play.
    return (
      <div className="defi__card">
        <DuelArt left={challenge.challengerUid || challengerName} right={uid} leftAvatar={challenge.challengerAvatar} rightAvatar={myAvatar} leftName={challengerName} rightName={t('Toi', 'Ou menm')} />
        <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {t('Défi reçu', 'Defi ou resevwa')}</span>
        <h1 className="defi__title">
          {t(`${challengerName} a fait ${challenge.challengerScore}/${challenge.total}. À toi !`, `${challengerName} fè ${challenge.challengerScore}/${challenge.total}. Se tou pa w !`)}
        </h1>
        {facts}
        <DuelTrustNote challenge={challenge} uid={uid} isCreole={isCreole} />
        <p className="defi__text">
          {t('Les mêmes questions que ton ami. Fais mieux pour gagner +20 XP ; en cas d’égalité, +10 XP chacun.', 'Menm kesyon ak zanmi ou. Fè pi byen pou genyen +20 XP ; si se egalite, +10 XP chak.')}
        </p>
        {bankMiss ? (
          <p className="defi__error" role="alert">
            {t('Ce défi a été créé avec une autre version des questions et ne peut pas être rejoué ici. Ouvre-le dans l’application.', 'Defi sa a te kreye ak yon lòt vèsyon kesyon yo, li pa ka jwe isit la. Louvri l nan aplikasyon an.')}
          </p>
        ) : (
          <div className="defi__actions">
            <button
              type="button"
              className="duel-pill duel-pill--primary"
              disabled={!questions}
              onClick={() => { trackEvent('duel_start', { category: challenge.categoryId }); setPhase('intro'); }}
            >
              <Swords size={16} /> {questions ? t('Relever le défi', 'Reponn defi a') : t('Préparation…', 'N ap prepare…')}
            </button>
          </div>
        )}
        {appLink}
      </div>
    );
  })();

  return (
    <section className="defi">
      <div className="defi__wrap">
        <Link to="/arena" className="aph__back defi__back" aria-label={t('Arène', 'Arèn')} title={t('Arène', 'Arèn')}><ArrowLeft size={18} aria-hidden="true" /></Link>
        {body}
      </div>
    </section>
  );
}

