import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import useStore from '../contexts/store';
import CategoryIcon from '../components/CategoryIcon';
import { Swords, Clock, Target, Trophy, LogIn, Smartphone, RefreshCw, ArrowLeft } from '../components/icons';
import UserAvatar from '../components/UserAvatar';

/** The two players, face to face — the same robots the app shows. */
function DuelArt({ left, right }: { left: string; right: string }) {
  return (
    <div className="defi__vs" aria-hidden="true">
      <span className="defi__vs-p defi__vs-p--l"><UserAvatar seed={left} size={72} radius={20} /></span>
      <span className="defi__vs-bolt">VS</span>
      <span className="defi__vs-p defi__vs-p--r"><UserAvatar seed={right} size={72} radius={20} /></span>
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
import '../components/games/duels.css';
import './TriviaGames.css';

type Phase = 'card' | 'playing' | 'sending' | 'done';

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

  const [challenge, setChallenge] = useState<Challenge | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('card');
  const [questions, setQuestions] = useState<DuelQuestion[] | null>(null);
  const [bankMiss, setBankMiss] = useState(false);
  const [outcome, setOutcome] = useState<AcceptResult | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  useFocusMode(phase === 'playing');

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

  const finish = useCallback(async (score: number) => {
    setMyScore(score);
    setPhase('sending');
    const r = await acceptChallenge({ code, score });
    setOutcome(r);
    setPhase('done');
    trackEvent('duel_played', { ok: r.ok, result: r.result ?? r.error });
  }, [code]);

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
          onFinish={(score) => finish(score)}
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
          <DuelArt left="ton-ami" right="toi" />
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

    // Just played — the result as the server recorded it.
    if (phase === 'sending' || phase === 'done') {
      const ok = outcome?.ok;
      const title = phase === 'sending'
        ? t('Envoi de ton score…', 'N ap voye nòt ou…')
        : ok
          ? outcome.result === 'won'
            ? t('Tu as gagné !', 'Ou genyen !')
            : outcome.result === 'tie'
              ? t('Égalité !', 'Egalite !')
              : t('Perdu de peu…', 'Ou pèdi tou piti…')
          : t('Score non enregistré', 'Nòt la pa anrejistre');
      return (
        <div className="defi__card" aria-live="polite">
          <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {label}</span>
          <h1 className="defi__title">{title}</h1>
          <DuelScoreboard
            leftName={challengerName}
            leftScore={ok ? outcome.challengerScore : challenge.challengerScore}
            rightName={t('Toi', 'Ou menm')}
            rightScore={ok ? outcome.opponentScore : myScore}
            total={challenge.total}
            isCreole={isCreole}
          />
          {ok && outcome.xpAwarded > 0 && <span className="defi__xp"><Trophy size={15} /> +{outcome.xpAwarded} XP</span>}
          {phase === 'done' && !ok && <p className="defi__error" role="alert">{acceptErrorMessage(outcome?.error, isCreole)}</p>}
          <div className="defi__actions">
            <Link to="/jeux/trivia" state={{ duelPick: true }} className="duel-pill duel-pill--primary">
              <Swords size={16} /> {t('Défier quelqu’un à mon tour', 'Defye yon moun tou')}
            </Link>
            <Link to="/jeux" className="duel-pill duel-pill--soft">{t('Mes défis', 'Defi mwen yo')}</Link>
          </div>
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
          <DuelScoreboard
            leftName={t('Toi', 'Ou menm')}
            leftScore={challenge.challengerScore}
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
            <Link to="/jeux/trivia" state={{ duelPick: true }} className="duel-pill duel-pill--soft">
              <Swords size={16} /> {state === 'played' && res === 'lost' ? t('Prendre ma revanche', 'Pran revanj mwen') : t('Nouveau défi', 'Nouvo defi')}
            </Link>
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
              leftScore={challenge.challengerScore}
              rightName={t('Toi', 'Ou menm')}
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
        <DuelArt left={challenge.challengerUid || challengerName} right={uid} />
        <span className="defi__eyebrow"><Swords size={14} aria-hidden="true" /> {t('Défi reçu', 'Defi ou resevwa')}</span>
        <h1 className="defi__title">
          {t(`${challengerName} a fait ${challenge.challengerScore}/${challenge.total}. À toi !`, `${challengerName} fè ${challenge.challengerScore}/${challenge.total}. Se tou pa w !`)}
        </h1>
        {facts}
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
              onClick={() => { trackEvent('duel_start', { category: challenge.categoryId }); setPhase('playing'); }}
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

