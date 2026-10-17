import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  Check, X, Zap, Users, School as SchoolIcon, Trophy, Target, Timer, Smartphone, Keyboard, ChevronRight, Swords,
} from '../components/icons';
import useStore from '../contexts/store';
import { useFocusMode } from '../hooks/useFocusMode';
import { useArenaAnswer, useArenaPlay, useFocusLossCounter, usePlayableArena } from '../hooks/useArenaPlay';
import ArenaRegisterForm from '../components/arena/ArenaRegisterForm';
import { renderWithKatex } from '../utils/shared';
import { ARENA_WEB_PLAY } from '../../shared/arena/webPlay';
import {
  arenaScreen,
  classifyAnswerResult,
  effectiveShownAt,
  formatCountdown,
  keyToChoice,
  tierRing,
  type AnswerReceiptStatus,
  type ArenaIndividualStanding,
  type ArenaSchoolCounts,
  type ArenaSchoolStanding,
  type ArenaStandings,
  type QualificationState,
} from '../utils/arenaPlay';
import {
  AnswerReceipt,
  ConnectionPill,
  ReportProblem,
  ResultStatus,
  RulesButton,
  answerReceiptView,
  formatClock,
  useOnline,
  ARENA_RULES,
  type ConnectionState,
} from '../components/arena/trust';
import './Arena.css';
import './ArenaPlay.css';

type T = (fr: string, ht: string) => string;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * /arena/jouer[/:tid] — the Arena play room, on the web.
 *
 * Ted, 2026-10-10: "for now let people play on laptops as well — I just want
 * to be able to test everything, then we'll put the barriers after." Gated by
 * the one switch `ARENA_WEB_PLAY` (shared/arena/webPlay.ts); off, the room
 * shows the "play in the app" message and registration still works.
 *
 * One route walks the whole night, driven by the tournament document's state:
 * sign up → wait for the doors → the room filling → the questions → the
 * scores settling → the provisional result. A student who keeps this tab open
 * is carried from one to the next without clicking anything.
 *
 * Integrity is the server's, unchanged: the answer endpoint says only whether
 * a tap was RECORDED, never whether it was right; the key appears on
 * `live/{index}` for everyone at once when the question closes; this page
 * cannot read a player row, so no running score moves before that moment.
 * What the browser adds is evidence only — a per-browser device id and a count
 * of how often the tab was left during a question — and nothing blocks on it.
 */
export default function ArenaPlay() {
  const { tid } = useParams<{ tid?: string }>();
  if (tid) return <ArenaRoom tid={tid} />;
  return <ArenaResolve />;
}

/** No id in the URL: open whichever edition is playing, or say none is. */
function ArenaResolve() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: T = (fr, ht) => (isCreole ? ht : fr);
  const playable = usePlayableArena();
  if (playable === undefined) return <Shell><Loading t={t} /></Shell>;
  if (playable) return <Navigate to={`/arena/jouer/${encodeURIComponent(playable.id)}`} replace />;
  return (
    <Shell>
      <Notice
        title={t('Aucune édition en cours', 'Pa gen edisyon k ap fèt kounye a')}
        body={t(
          'Le championnat n’est pas en cours en ce moment. Les inscriptions et la prochaine date sont sur la page de l’Arène.',
          'Chanpyona a pa ap fèt kounye a. Enskripsyon ak pwochen dat la sou paj Arèn nan.',
        )}
        action={<Link to="/arena" className="button button--primary">{t('Voir l’Arène', 'Wè Arèn nan')}</Link>}
      />
    </Shell>
  );
}

function ArenaRoom({ tid }: { tid: string }) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t: T = useCallback((fr, ht) => (isCreole ? ht : fr), [isCreole]);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const signedIn = !!user?.uid;

  const [regVersion, setRegVersion] = useState(0);
  const view = useArenaPlay(tid, ARENA_WEB_PLAY, regVersion);
  const { tournament, registration } = view;

  const screen = arenaScreen({
    loading: tournament === undefined,
    tournament: tournament ?? null,
    signedIn,
    registered: registration === undefined ? undefined : !!registration,
    webPlay: ARENA_WEB_PLAY,
  });

  // The room takes the whole screen while the night is on: a student who
  // wanders into Cours mid-round loses their place.
  useFocusMode(screen === 'doors' || screen === 'live' || screen === 'grading');

  const title = tournament ? (isCreole && tournament.titleHt ? tournament.titleHt : tournament.title) : '';

  let body: React.ReactNode;
  switch (screen) {
    case 'loading':
      body = <Loading t={t} />;
      break;
    case 'absent':
      body = (
        <Notice
          title={t('Championnat introuvable', 'Nou pa jwenn chanpyona sa a')}
          body={t('Ce lien ne mène à aucune édition de l’Arène.', 'Lyen sa a pa mennen nan okenn edisyon Arèn nan.')}
          action={<Link to="/arena" className="button button--primary">{t('Voir l’Arène', 'Wè Arèn nan')}</Link>}
        />
      );
      break;
    case 'notOpen':
      body = (
        <Notice
          title={t('Pas encore ouvert', 'Poko louvri')}
          body={t(
            'Cette édition est en préparation. Les inscriptions ouvriront bientôt.',
            'Edisyon sa a ap prepare. Enskripsyon yo ap louvri byento.',
          )}
          action={<Link to="/arena" className="button button--primary">{t('Voir l’Arène', 'Wè Arèn nan')}</Link>}
        />
      );
      break;
    case 'void':
      body = (
        <Notice
          title={t('Édition annulée', 'Edisyon anile')}
          body={t(
            'Cette édition a été annulée. Aucun résultat ne compte.',
            'Edisyon sa a anile. Okenn rezilta pa konte.',
          )}
          action={<Link to="/arena" className="button button--primary">{t('Voir l’Arène', 'Wè Arèn nan')}</Link>}
        />
      );
      break;
    case 'signin':
      body = (
        <Notice
          title={t('Connecte-toi pour jouer', 'Konekte pou w jwe')}
          body={t(
            'Ta place dans l’Arène est liée à ton compte. Connecte-toi avec le compte que tu as utilisé pour t’inscrire.',
            'Plas ou nan Arèn nan mare ak kont ou. Konekte ak kont ou te sèvi pou w enskri a.',
          )}
          action={(
            <button type="button" className="button button--primary" onClick={toggleAuthModal}>
              {t('Se connecter', 'Konekte')}
            </button>
          )}
        />
      );
      break;
    case 'register':
      body = (
        <div className="arena-play__narrow">
          <p className="arena-play__lead">
            {tournament?.state === 'doors'
              ? t(
                'La salle est ouverte et il est encore temps : inscris-toi, puis entre directement.',
                'Sal la louvri e gen tan toujou : enskri, epi antre dirèkteman.',
              )
              : t(
                'Inscris-toi pour cette édition. Cette page te fera entrer dans la salle le jour J.',
                'Enskri pou edisyon sa a. Paj sa a ap fè w antre nan sal la jou a.',
              )}
          </p>
          <ArenaRegisterForm
            tournamentId={tid}
            isCreole={isCreole}
            onRegistered={() => setRegVersion((v) => v + 1)}
          />
        </div>
      );
      break;
    case 'closed':
      body = (
        <Notice
          title={t('Inscriptions fermées', 'Enskripsyon fèmen')}
          body={t(
            'Le tournoi a commencé et ce compte n’y est pas inscrit. Tu peux suivre la soirée en direct.',
            'Tounwa a kòmanse e kont sa a pa enskri ladan l. Ou ka swiv sware a an dirèk.',
          )}
          action={<Link to="/direct" className="button button--primary">{t('Regarder en direct', 'Gade an dirèk')}</Link>}
        />
      );
      break;
    case 'appOnly':
      body = (
        <Notice
          title={t('On joue dans l’application', 'Se nan aplikasyon an n ap jwe')}
          body={t(
            'Tu es inscrit. Les questions se jouent dans l’application mobile : ouvre-la avec le même compte.',
            'Ou enskri. Kesyon yo jwe nan aplikasyon mobil la : louvri l ak menm kont lan.',
          )}
          action={(
            <Link to="/download?from=arena" className="button button--primary">
              <Smartphone size={16} aria-hidden="true" /> {t('Ouvrir l’application', 'Louvri aplikasyon an')}
            </Link>
          )}
        />
      );
      break;
    case 'lobby':
      body = <Lobby view={view} t={t} />;
      break;
    case 'doors':
      body = <Doors view={view} t={t} />;
      break;
    case 'live':
      body = <Live tid={tid} view={view} t={t} isCreole={isCreole} />;
      break;
    case 'grading':
      body = (
        <Notice
          title={t('Calcul des scores…', 'N ap kalkile nòt yo…')}
          body={t('Reste ici, les résultats arrivent sur cette page.', 'Rete la, rezilta yo ap parèt sou paj sa a.')}
          spinner
        />
      );
      break;
    case 'result':
    default:
      body = <Result tid={tid} view={view} t={t} isCreole={isCreole} />;
      break;
  }

  return (
    <Shell>
      <TrustBar
        connection={view.connection}
        liveWord={screen === 'doors' || screen === 'live' ? 'live' : 'connected'}
        tid={tid}
        uid={user?.uid ?? null}
        questionIndex={screen === 'live' ? tournament?.currentQuestion?.index ?? null : null}
        teamSize={tournament?.teamSize}
        minPlayers={tournament?.minPlayers}
        t={t}
        isCreole={isCreole}
      />
      {title && screen !== 'live' ? (
        <header className="arena-play__head">
          <span className="arena-pill arena-pill--eyebrow">
            <Swords size={13} aria-hidden="true" /> {t('L’Arène', 'Arèn nan')}
          </span>
          <h1 className="arena-play__title">{title}</h1>
        </header>
      ) : null}
      {body}
    </Shell>
  );
}

// ── Frame and small parts ───────────────────────────────────────────────────

/**
 * The trust bar, on every screen of the room: is the connection up, what are
 * the rules, where to report a problem. The pill is derived in useArenaPlay
 * from navigator.onLine, the tournament listener and the presence heartbeat —
 * it never says "En direct" on the strength of a cached document alone.
 */
function TrustBar({ connection, liveWord, tid, uid, questionIndex, teamSize, minPlayers, t, isCreole }: {
  connection: ConnectionState;
  liveWord: 'live' | 'connected';
  tid: string;
  uid: string | null;
  questionIndex: number | null;
  teamSize?: number;
  minPlayers?: number;
  t: T;
  isCreole: boolean;
}) {
  return (
    <div className="trust-bar arena-play__trust">
      <ConnectionPill
        state={connection}
        isCreole={isCreole}
        liveWord={liveWord}
        detail={connection === 'reconnecting' ? t('les données affichées peuvent dater', 'done yo ka an reta') : null}
      />
      <div className="trust-row">
        <RulesButton variant="arena" isCreole={isCreole} teamSize={teamSize} minPlayers={minPlayers} />
        <ReportProblem context={{ kind: 'arena', ref: tid, questionIndex, uid }} isCreole={isCreole} />
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="section arena-play">
      <div className="container arena-play__container">{children}</div>
    </section>
  );
}

function Loading({ t }: { t: T }) {
  return (
    <div className="arena-page__loading" role="status" aria-live="polite">
      <span className="arena-page__spinner" aria-hidden="true" />
      <p>{t('Chargement de l’Arène…', 'N ap chaje Arèn nan…')}</p>
    </div>
  );
}

function Notice({ title, body, action, spinner }: {
  title: string;
  body: string;
  action?: React.ReactNode;
  spinner?: boolean;
}) {
  return (
    <div className="arena-play__card arena-play__notice" role="status">
      {spinner ? <span className="arena-page__spinner" aria-hidden="true" /> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div className="arena-play__actions">{action}</div> : null}
    </div>
  );
}

/**
 * The school's count toward its team, with BOTH numbers once doors are open —
 * a school can be qualified on paper and short in the room, and finding that
 * out at kick-off is a bad surprise.
 */
function QualificationCard({ schoolName, q, counts, minPlayers, doorsOpen, t }: {
  schoolName: string;
  q: QualificationState;
  counts: ArenaSchoolCounts | null;
  minPlayers: number;
  doorsOpen: boolean;
  t: T;
}) {
  const pct = Math.min(100, Math.round((q.counted / Math.max(1, minPlayers)) * 100));
  const unit = (n: number, fr: string, frPl: string, ht: string) => t(`${n} ${n > 1 ? frPl : fr}`, `${n} ${ht}`);
  return (
    <div className="arena-play__card arena-play__qual">
      <div className="arena-play__qual-head">
        <span className="arena-play__overline">{t('Ton école', 'Lekòl ou')}</span>
        <strong className="arena-play__qual-school">{schoolName || t('Ton école', 'Lekòl ou')}</strong>
      </div>
      <div
        className={`arena-play__bar${q.qualified ? ' is-full' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={minPlayers}
        aria-valuenow={Math.min(q.counted, minPlayers)}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="arena-play__qual-line">
        {doorsOpen
          ? t(
            `${q.counted} / ${minPlayers} présents${counts ? ` · ${unit(counts.registered, 'inscrit', 'inscrits', 'enskri')}` : ''}`,
            `${q.counted} / ${minPlayers} prezan${counts ? ` · ${counts.registered} enskri` : ''}`,
          )
          : t(`${q.counted} / ${minPlayers} inscrits`, `${q.counted} / ${minPlayers} enskri`)}
      </p>
      <p className={`arena-play__qual-verdict${q.qualified ? ' is-ok' : ''}`}>
        {q.qualified
          ? t('Équipe qualifiée.', 'Ekip la kalifye.')
          : q.shortOnTheNight
            ? t(
              `Assez d’inscrits, mais il manque ${unit(q.needed, 'joueur présent', 'joueurs présents', 'jwè prezan')}. Préviens-les maintenant.`,
              `Gen ase moun enskri, men li manke ${q.needed} jwè prezan. Avèti yo kounye a.`,
            )
            : doorsOpen
              ? t(
                `Il manque ${unit(q.needed, 'joueur présent', 'joueurs présents', 'jwè prezan')} pour que l’école soit classée.`,
                `Li manke ${q.needed} jwè prezan pou lekòl la klase.`,
              )
              : t(
                `Il manque ${unit(q.needed, 'inscrit', 'inscrits', 'moun enskri')} pour que l’école puisse se qualifier.`,
                `Li manke ${q.needed} moun enskri pou lekòl la ka kalifye.`,
              )}
      </p>
      {!q.qualified ? (
        <p className="arena-play__hint">
          {t(
            'Une école non qualifiée joue quand même : tes points comptent pour le classement individuel.',
            'Yon lekòl ki pa kalifye jwe kanmenm : pwen ou yo konte pou klasman endividyèl la.',
          )}
        </p>
      ) : null}
    </div>
  );
}

const schoolLabel = (s: ArenaSchoolStanding | null): string => (s ? (s.shortName || s.label) : '');

// ── Lobby: registered, doors not yet open ───────────────────────────────────

function Lobby({ view, t }: { view: ReturnType<typeof useArenaPlay>; t: T }) {
  const { tournament, now, qualification, mySchool, counts } = view;
  if (!tournament) return null;
  const msToDoors = tournament.doorsAt - now;
  return (
    <div className="arena-play__stack">
      <div className="arena-play__card arena-play__hero">
        <span className="arena-play__check" aria-hidden="true"><Check size={22} /></span>
        <h2>{t('Tu es inscrit', 'Ou enskri')}</h2>
        {msToDoors > 0 ? (
          <>
            <p className="arena-play__overline">{t('La salle ouvre dans', 'Sal la ap louvri nan')}</p>
            <p className="arena-play__countdown">{formatCountdown(msToDoors)}</p>
          </>
        ) : (
          <p className="arena-play__lead">
            {t('La salle va ouvrir d’un instant à l’autre.', 'Sal la ap louvri nenpòt ki lè.')}
          </p>
        )}
        <p className="arena-play__hint">
          {t(
            'Garde cette page ouverte : elle te fait entrer dans la salle toute seule. Ton école ne compte que les élèves présents à l’ouverture.',
            'Kite paj sa a louvri : l ap fè w antre nan sal la pou kont li. Lekòl ou konte sèlman elèv ki prezan lè l louvri.',
          )}
        </p>
      </div>
      {qualification ? (
        <QualificationCard
          schoolName={schoolLabel(mySchool)}
          q={qualification}
          counts={counts}
          minPlayers={tournament.minPlayers}
          doorsOpen={false}
          t={t}
        />
      ) : null}
    </div>
  );
}

// ── Doors: the room filling ─────────────────────────────────────────────────

function Doors({ view, t }: { view: ReturnType<typeof useArenaPlay>; t: T }) {
  const { tournament, now, qualification, mySchool, counts, standings } = view;
  const arrivals = useArrivals(standings);
  if (!tournament) return null;
  const msToStart = tournament.startsAt - now;
  const roomSchools = tournament.counts.schools || standings?.schools.length || 0;
  const roomPlayers = tournament.counts.players;

  return (
    <div className="arena-play__stack">
      <div className="arena-play__card arena-play__hero">
        <p className="arena-play__overline">{t('Tu es dans la salle', 'Ou nan sal la')}</p>
        {msToStart > 0 ? (
          <>
            <h2>{t('Première question dans', 'Premye kesyon an nan')}</h2>
            <p className="arena-play__countdown">{formatCountdown(msToStart)}</p>
          </>
        ) : (
          <h2>{t('Départ imminent', 'Nou prèske kòmanse')}</h2>
        )}
        {roomSchools > 0 || roomPlayers > 0 ? (
          <div className="arena-play__room">
            {roomSchools > 0 ? (
              <span><SchoolIcon size={18} aria-hidden="true" /> {roomSchools} {t('écoles', 'lekòl')}</span>
            ) : null}
            {roomPlayers > 0 ? (
              <span><Users size={18} aria-hidden="true" /> {roomPlayers} {t('joueurs', 'jwè')}</span>
            ) : null}
          </div>
        ) : null}
        <p className="arena-play__hint">
          <Keyboard size={16} aria-hidden="true" />{' '}
          {t(
            'La question s’affiche ici toute seule. Réponds en cliquant, ou avec les touches 1 à 4. Un clic = ta réponse définitive.',
            'Kesyon an ap parèt isit la pou kont li. Reponn ak yon klik, oswa ak touch 1 rive 4. Yon klik = repons final ou.',
          )}
        </p>
      </div>

      {qualification ? (
        <QualificationCard
          schoolName={schoolLabel(mySchool)}
          q={qualification}
          counts={counts}
          minPlayers={tournament.minPlayers}
          doorsOpen
          t={t}
        />
      ) : null}

      <ScoringCard t={t} />

      {arrivals.length > 0 ? (
        <div className="arena-play__card">
          <p className="arena-play__overline">{t('Ils viennent d’entrer', 'Yo fèk antre')}</p>
          <ul className="arena-play__arrivals">
            {arrivals.map((name) => (
              <li key={name}><strong>{name}</strong>{t(' est entré dans l’Arène', ' antre nan Arèn nan')}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** How a question scores — stated before the first one, not explained after. */
function ScoringCard({ t }: { t: T }) {
  const full = ARENA_RULES.fullMs / 1000;
  const half = ARENA_RULES.halfMs / 1000;
  return (
    <div className="arena-play__card">
      <p className="arena-play__overline">{t('Comment on marque', 'Kijan ou fè pwen')}</p>
      <ul className="arena-play__rules">
        <li><strong>{ARENA_RULES.pointsFull}</strong> {t(`bonne réponse en ${full} secondes ou moins`, `bon repons nan ${full} segonn oswa mwens`)}</li>
        <li><strong>{ARENA_RULES.pointsHalf}</strong> {t(`bonne réponse entre ${full} et ${half} secondes`, `bon repons ant ${full} ak ${half} segonn`)}</li>
        <li><strong>0</strong> {t(`après ${half} secondes, ou mauvaise réponse`, `apre ${half} segonn, oswa move repons`)}</li>
      </ul>
    </div>
  );
}

/**
 * Schools seen arriving since this screen mounted, newest first. Diffed from
 * standings already subscribed to; a school already present at mount is never
 * announced, so the student is not told about forty schools at once.
 */
function useArrivals(standings: ArenaStandings | null): string[] {
  const seen = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<string[]>([]);
  useEffect(() => {
    if (!standings) return;
    const names = standings.schools.map((s) => s.shortName || s.label).filter(Boolean);
    if (seen.current === null) {
      seen.current = new Set(names);
      return;
    }
    const fresh = names.filter((n) => !seen.current.has(n));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current.add(n));
    setArrivals((prev) => [...fresh.reverse(), ...prev].slice(0, 8));
  }, [standings]);
  return arrivals;
}

// ── Live ────────────────────────────────────────────────────────────────────

/**
 * A committed tap, kept for this tab session so a reload or a dropped tab
 * comes back to the SAME locked answer instead of offering a second tap the
 * server would ignore (the composite answer id keeps the first). Pending taps
 * are resent; confirmed ones keep their receipt. sessionStorage only: it is
 * a per-tab convenience, never a record — the server's `answers/*` is.
 */
interface StoredTap {
  choice: number;
  shownAt: number;
  focusLosses: number;
  confirmed: boolean;
  ackClock: string | null;
  duplicate: boolean;
  /** The server kept an earlier tap from elsewhere; this one was not graded. */
  foreign?: boolean;
}
const tapKey = (tid: string, index: number) => `edlight.arena.tap.${tid}.${index}`;
function readTap(tid: string, index: number): StoredTap | null {
  try {
    const raw = window.sessionStorage.getItem(tapKey(tid, index));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.choice === 'number' ? (v as StoredTap) : null;
  } catch {
    return null;
  }
}
function writeTap(tid: string, index: number, tap: StoredTap): void {
  try { window.sessionStorage.setItem(tapKey(tid, index), JSON.stringify(tap)); } catch { /* storage blocked */ }
}

function Live({ tid, view, t, isCreole }: {
  tid: string;
  view: ReturnType<typeof useArenaPlay>;
  t: T;
  isCreole: boolean;
}) {
  const { tournament, question, answerable, now, me, mySchool, inFive } = view;
  const answer = useArenaAnswer(tid);
  const online = useOnline();

  const qIndex = question?.index ?? null;
  const opensAt = question?.opensAt ?? 0;
  const [choice, setChoice] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [receipt, setReceipt] = useState<AnswerReceiptStatus | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [ackClock, setAckClock] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  // The choice on screen came from THIS tab's tap (or its stored copy). A
  // duplicate receipt for a choice that did not means the server holds an
  // earlier tap we cannot see — so the verdict must not judge this one.
  const [ownChoice, setOwnChoice] = useState(true);
  // When THIS browser painted the question. The server clamps it; see
  // effectiveShownAt for why the ring reads the clamped value too.
  const shownAt = useRef<number>(Date.now());
  const focusReading = useRef<{ focusLosses: number } | null>(null);
  const currentQ = useRef<number | null>(qIndex);
  // Sends made for the tap on screen; 0 again for a new question or a restored tap.
  const attempts = useRef(0);
  const restored = useRef(false);
  const opensAtRef = useRef(opensAt);
  opensAtRef.current = opensAt;
  const takeFocusReading = useFocusLossCounter(answerable);

  const send = useCallback((i: number) => {
    if (qIndex == null) return;
    const sentFor = qIndex;
    attempts.current += 1;
    const firstFresh = attempts.current === 1 && !restored.current;
    setReceipt('sending');
    setReceiptError(null);
    void answer({
      questionIndex: sentFor,
      choice: i,
      clientShownAt: shownAt.current,
      focusLosses: focusReading.current?.focusLosses ?? 0,
    }).then((res) => {
      // A reply for a question that is no longer on screen says nothing about this one.
      if (currentQ.current !== sentFor) return;
      const status = classifyAnswerResult(res);
      setReceipt(status);
      setReceiptError(res.ok ? null : res.error ?? null);
      if (status === 'accepted') {
        // The clock when the confirmation came BACK: the server received it
        // at or before this moment, so the time shown never flatters.
        const clock = formatClock(Date.now() - effectiveShownAt(shownAt.current, opensAtRef.current));
        setAckClock(clock);
        setDuplicate(!!res.duplicate);
        // A duplicate on the very first send of a fresh tap: the server already
        // held a tap from another device or an earlier visit, and kept it.
        const foreign = !!res.duplicate && firstFresh;
        if (foreign) setOwnChoice(false);
        writeTap(tid, sentFor, {
          foreign: foreign || undefined,
          choice: i,
          shownAt: shownAt.current,
          focusLosses: focusReading.current?.focusLosses ?? 0,
          confirmed: true,
          ackClock: clock,
          duplicate: !!res.duplicate,
        });
      }
    });
  }, [answer, qIndex, tid]);

  useEffect(() => {
    currentQ.current = qIndex;
    if (qIndex == null) return;
    const stored = readTap(tid, qIndex);
    attempts.current = 0;
    restored.current = !!stored;
    setReceiptError(null);
    setDuplicate(false);
    setOwnChoice(true);
    if (stored) {
      // Reconnected to a question already answered here: same lock, same
      // receipt, no second tap. Nothing is replayed.
      setChoice(stored.choice);
      setLocked(true);
      shownAt.current = stored.shownAt;
      focusReading.current = { focusLosses: stored.focusLosses };
      setAckClock(stored.ackClock);
      setDuplicate(stored.duplicate);
      setOwnChoice(!stored.foreign);
      setReceipt(stored.confirmed ? 'accepted' : 'retryable');
      return;
    }
    setChoice(null);
    setLocked(false);
    setReceipt(null);
    setAckClock(null);
    focusReading.current = null;
    shownAt.current = Date.now();
  }, [qIndex, tid]);

  /*
   * One click commits. Local state locks BEFORE the request is in flight — a
   * spinner between the click and the lock is where double answers come from,
   * and the composite answer id makes a duplicate a no-op server-side anyway.
   */
  const pick = useCallback((i: number) => {
    if (locked || !answerable || qIndex == null) return;
    setChoice(i);
    setLocked(true);
    // Captured once per commit — reading resets the counter, so a retry must
    // reuse this reading rather than take a fresh (zeroed) one.
    focusReading.current = takeFocusReading();
    writeTap(tid, qIndex, {
      choice: i, shownAt: shownAt.current, focusLosses: focusReading.current.focusLosses,
      confirmed: false, ackClock: null, duplicate: false,
    });
    send(i);
  }, [locked, answerable, qIndex, takeFocusReading, send, tid]);

  const retry = useCallback(() => {
    if (receipt !== 'retryable' || choice == null || !answerable) return;
    send(choice);
  }, [receipt, choice, answerable, send]);

  // A tap restored after a reload, or held while offline: resend it once the
  // line is back (once per reconnect). Idempotent server-side.
  const resendOnce = useRef<number | null>(null);
  useEffect(() => {
    if (receipt !== 'retryable' || choice == null || !answerable || !online) return;
    if (resendOnce.current === qIndex) return;
    resendOnce.current = qIndex;
    send(choice);
  }, [receipt, choice, answerable, online, qIndex, send]);
  // Each return of the network earns one more automatic resend.
  useEffect(() => { if (!online) resendOnce.current = null; }, [online]);

  const options = question
    ? (isCreole && question.optionsHt.length ? question.optionsHt : question.options)
    : [];

  // Keyboard: 1–4 (or A–D). Ignored while typing in a field or with a modifier.
  useEffect(() => {
    if (!answerable || locked) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const i = keyToChoice(e.key, options.length);
      if (i === null) return;
      e.preventDefault();
      pick(i);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answerable, locked, options.length, pick]);

  if (!tournament) return null;
  const total = tournament.questionCount;
  const revealed = question?.state === 'closed' ? question.answerIndex : null;
  // The tournament has started but the host has not opened question 1 yet.
  if (tournament.currentQuestion == null) {
    return (
      <div className="arena-play__stack">
        <Notice
          title={t('C’est parti', 'Nou kòmanse')}
          body={t(
            'La première question arrive ici dans un instant. Garde cette page ouverte.',
            'Premye kesyon an ap parèt isit la nan yon ti moman. Kite paj sa a louvri.',
          )}
          spinner
        />
      </div>
    );
  }

  // The next question's document is on its way (a fraction of a second).
  if (!question || question.state === 'pending') {
    return <Loading t={t} />;
  }

  const elapsed = now - effectiveShownAt(shownAt.current, question.opensAt);
  const ring = tierRing(elapsed);
  const prompt = isCreole && question.promptHt ? question.promptHt : question.prompt;
  const timeUp = question.state === 'open' && !answerable;
  const receiptKind = answerReceiptView({
    choice,
    status: locked ? receipt : null,
    error: receiptError,
    online,
    questionOpen: answerable,
  });
  const confirmed = receiptKind === 'received';

  return (
    <div className="arena-play__live">
      <div className="arena-play__livebar">
        <div className="arena-play__progress">
          <span className="arena-play__qnum">
            {t('Question', 'Kesyon')} {question.index + 1}
            <small> / {total || '—'}</small>
          </span>
          {question.category ? <span className="arena-pill">{question.category}</span> : null}
        </div>
        {/* The score moves only when a question CLOSES — it comes off the
            public standings, never off a player row. */}
        {me ? (
          <span className="arena-play__score" aria-label={t('Ton score', 'Nòt ou')}>
            <Zap size={16} aria-hidden="true" /> {new Intl.NumberFormat('fr-FR').format(me.score)}
          </span>
        ) : null}
        <TierRing ring={ring} active={answerable && !locked} t={t} />
      </div>

      <div className="arena-play__card arena-play__question">
        <div className="arena-play__prompt" dangerouslySetInnerHTML={renderWithKatex(prompt)} />
      </div>

      <div className="arena-play__options" role="group" aria-label={t('Réponses', 'Repons')}>
        {options.map((opt, i) => {
          const isChoice = choice === i;
          const isKey = revealed === i;
          let cls = 'arena-play__option';
          if (revealed != null) {
            if (isKey) cls += ' is-correct';
            else if (isChoice) cls += ' is-wrong';
            else cls += ' is-dim';
          } else if (isChoice) cls += ' is-locked';
          else if (locked || !answerable) cls += ' is-dim';
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={locked || !answerable}
              aria-pressed={isChoice}
              onClick={() => pick(i)}
            >
              <span className="arena-play__letter" aria-hidden="true">{LETTERS[i] ?? i + 1}</span>
              <span className="arena-play__opt-text" dangerouslySetInnerHTML={renderWithKatex(opt)} />
              <span className="arena-play__kbd" aria-hidden="true">{i + 1}</span>
              {revealed != null && isKey ? <Check size={20} aria-hidden="true" /> : null}
              {revealed != null && isChoice && !isKey ? <X size={20} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className="arena-play__below">
        {revealed != null ? (
          <p className={`arena-play__verdict${confirmed && ownChoice && choice === revealed ? ' is-ok' : choice != null ? ' is-bad' : ''}`} aria-live="polite">
            {choice == null
              ? t('Pas de réponse pour cette question.', 'Pa gen repons pou kesyon sa a.')
              : !ownChoice
                ? t('Ta première réponse reçue est celle qui compte — ton score suivra le classement.', 'Premye repons ou ki rive a se li ki konte — nòt ou ap swiv klasman an.')
                : !confirmed
                  ? (choice === revealed
                    ? t('C’était la bonne réponse — mais elle n’a pas été confirmée.', 'Se te bon repons lan — men li pa t konfime.')
                    : t('Pas cette fois.', 'Pa fwa sa a.'))
                  : choice === revealed
                    ? t('Bonne réponse.', 'Bon repons.')
                    : t('Pas cette fois.', 'Pa fwa sa a.')}
          </p>
        ) : null}
        {revealed == null || (choice != null && !confirmed) ? (
          <AnswerReceipt
            kind={receiptKind}
            choiceLabel={choice != null ? LETTERS[choice] ?? String(choice + 1) : null}
            ackClock={ackClock}
            duplicate={duplicate}
            onRetry={retry}
            isCreole={isCreole}
          />
        ) : null}
      </div>

      {/* Between questions: your school and your five. Nothing else. */}
      {question.state !== 'open' || timeUp ? (
        <SchoolPosition school={mySchool} inFive={inFive} teamSize={tournament.teamSize} t={t} />
      ) : null}
    </div>
  );
}

/**
 * The clock as a tier. The arc burns down over the 20 seconds an answer can
 * still score; the tick sits at the 12-second full/half edge; the number counts
 * down to the NEXT edge, and the label says what a right answer is worth now.
 */
function TierRing({ ring, active, t }: { ring: ReturnType<typeof tierRing>; active: boolean; t: T }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const tone = ring.tier === 'full' ? 'is-full' : ring.tier === 'half' ? 'is-half' : 'is-none';
  const angle = ((1 - ring.boundary) * 360 - 90) * (Math.PI / 180);
  return (
    <div className={`arena-play__ring ${tone}${active ? ' is-active' : ''}`} role="timer" aria-label={t('Palier de points', 'Nivo pwen')}>
      <svg viewBox="0 0 120 120" width="88" height="88" aria-hidden="true">
        <circle cx="60" cy="60" r={R} className="arena-play__ring-track" />
        <circle
          cx="60"
          cy="60"
          r={R}
          className="arena-play__ring-arc"
          strokeDasharray={`${ring.remaining * C} ${C}`}
          transform="rotate(-90 60 60)"
        />
        <line
          x1={60 + 44 * Math.cos(angle)}
          y1={60 + 44 * Math.sin(angle)}
          x2={60 + 60 * Math.cos(angle)}
          y2={60 + 60 * Math.sin(angle)}
          className="arena-play__ring-edge"
        />
      </svg>
      <span className="arena-play__ring-num">{active ? ring.secondsInTier : '—'}</span>
      <span className="arena-play__ring-pts">{ring.points} pts</span>
    </div>
  );
}

function SchoolPosition({ school, inFive, teamSize, t }: {
  school: ArenaSchoolStanding | null;
  inFive: boolean;
  teamSize: number;
  t: T;
}) {
  if (!school) {
    return <p className="arena-play__muted arena-play__center">{t('Question suivante dans un instant…', 'Pwochen kesyon an nan yon ti moman…')}</p>;
  }
  return (
    <div className="arena-play__card arena-play__school">
      <span className="arena-play__overline">{t('Ton école', 'Lekòl ou')}</span>
      <strong className="arena-play__school-name">{schoolLabel(school)}</strong>
      {school.rank > 0 ? (
        <span className="arena-play__school-rank">
          {school.rank}<small>{school.rank === 1 ? t('re', 'yèm') : t('e', 'yèm')}</small>
        </span>
      ) : null}
      <span className={`arena-play__five${inFive ? ' is-in' : ''}`}>
        {inFive
          ? t(`Tu es dans les ${teamSize} qui comptent`, `Ou nan ${teamSize} ki konte yo`)
          : t(`Pas encore dans les ${teamSize} qui comptent`, `Ou poko nan ${teamSize} ki konte yo`)}
      </span>
      {!school.qualified ? (
        <p className="arena-play__hint">
          {t(
            'Ton école n’est pas qualifiée ce soir — tu continues en individuel.',
            'Lekòl ou pa kalifye aswè a — ou kontinye pou kont ou.',
          )}
        </p>
      ) : null}
    </div>
  );
}

// ── Result ──────────────────────────────────────────────────────────────────

function Result({ tid, view, t, isCreole }: { tid: string; view: ReturnType<typeof useArenaPlay>; t: T; isCreole: boolean }) {
  const { tournament, me, mySchool, registration } = view;
  const prizeCents = useMemo(() => {
    if (!me || !tournament) return 0;
    const cents = tournament.prizes[me.rank - 1];
    return typeof cents === 'number' && cents > 0 ? cents : 0;
  }, [me, tournament]);
  if (!tournament) return null;

  const provisional = tournament.state !== 'final';
  const claimOpen = prizeCents > 0 && tournament.state === 'provisional';
  const name = schoolLabel(mySchool);
  const inTheFive = !!(me && mySchool?.top5.includes(me.uid));
  const total = tournament.questionCount;

  return (
    <div className="arena-play__stack">
      <div className="arena-play__card arena-play__hero">
        <p className="arena-play__overline">{name || t('Résultats', 'Rezilta')}</p>
        <h2>
          {me
            ? (inTheFive
              ? t(`Tu étais dans les ${tournament.teamSize}`, `Ou te nan ${tournament.teamSize} yo`)
              : t('Tu as joué pour ton école', 'Ou te jwe pou lekòl ou'))
            : registration
              ? t('Merci d’avoir joué', 'Mèsi paske ou te jwe')
              : t('Cette édition est terminée', 'Edisyon sa a fini')}
        </h2>
        {mySchool ? (
          <p className="arena-play__lead">
            {mySchool.rank > 0
              ? t(`${name} termine #${mySchool.rank}.`, `${name} fini #${mySchool.rank}.`)
              : t(
                `${name} n’avait pas ses ${tournament.teamSize} joueurs — mais tes points comptent pour toi.`,
                `${name} pa t gen ${tournament.teamSize} jwè li yo — men pwen ou yo konte pou ou.`,
              )}
          </p>
        ) : null}
      </div>

      {me ? (
        <ResultNumbers me={me} total={total} t={t} />
      ) : registration ? (
        <p className="arena-play__muted arena-play__center">
          {t('Ton score s’affiche ici quand il figure dans le classement publié.', 'Nòt ou parèt isit la lè l nan klasman ki pibliye a.')}
        </p>
      ) : null}

      {claimOpen ? (
        <div className="arena-play__card arena-play__prize">
          <p className="arena-play__overline">{t('Tu as gagné', 'Ou genyen')}</p>
          <p className="arena-play__prize-amount">
            {`$${(prizeCents / 100).toFixed(prizeCents % 100 === 0 ? 0 : 2)}`}
          </p>
          <p>
            {t(
              'Tu as 72 heures pour réclamer. Passé ce délai, le prix passe au suivant.',
              'Ou gen 72 èdtan pou reklame. Apre delè sa a, pri a pase bay moun ki vin apre a.',
            )}
          </p>
          <Link to={`/arena/reclamation?tid=${encodeURIComponent(tid)}`} className="button button--primary">
            {t('Réclamer mon prix', 'Reklame pri mwen')}
          </Link>
        </div>
      ) : null}

      {/* Straight off the tournament state: provisional until the review
          gate releases it, final after. Disputes are invited only while the
          result can still move. */}
      <ResultStatus final={!provisional} isCreole={isCreole}>
        <RulesButton
          variant="arena"
          isCreole={isCreole}
          teamSize={tournament.teamSize}
          minPlayers={tournament.minPlayers}
          label={t('Comment le classement est calculé', 'Kijan nou kalkile klasman an')}
        />
        {provisional ? (
          <ReportProblem context={{ kind: 'arena', ref: tid, uid: me?.uid ?? registration?.uid ?? null, reason: 'dispute' }} isCreole={isCreole} />
        ) : null}
      </ResultStatus>

      <div className="arena-play__actions arena-play__center">
        <Link to="/arena" className="button button--primary">
          {t('Préparer la prochaine avec mon école', 'Prepare pwochen an ak lekòl mwen')} <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function ResultNumbers({ me, total, t }: { me: ArenaIndividualStanding; total: number; t: T }) {
  const accuracy = total > 0 ? Math.round((me.correct / total) * 100) : null;
  return (
    <>
      <div className="arena-play__card arena-play__scorecard">
        <span className="arena-play__overline">{t('Ton score', 'Nòt ou')}</span>
        <strong className="arena-play__bigscore">{new Intl.NumberFormat('fr-FR').format(me.score)}</strong>
        {me.rank > 0 ? (
          <span className="arena-play__muted">
            {t(`#${me.rank} au classement individuel`, `#${me.rank} nan klasman endividyèl`)}
          </span>
        ) : null}
      </div>
      <dl className="arena-play__stats">
        <div>
          <dt><Target size={16} aria-hidden="true" /> {t('Bonnes réponses', 'Bon repons')}</dt>
          <dd>{accuracy != null ? `${accuracy}%` : '—'}</dd>
        </div>
        <div>
          <dt><Timer size={16} aria-hidden="true" /> {t('Temps moyen', 'Tan mwayèn')}</dt>
          <dd>{me.avgMs ? `${(me.avgMs / 1000).toFixed(1)} s` : '—'}</dd>
        </div>
        <div>
          <dt><Trophy size={16} aria-hidden="true" /> {t('Réponses justes', 'Repons ki bon')}</dt>
          <dd>{me.correct}{total ? <small> / {total}</small> : null}</dd>
        </div>
      </dl>
    </>
  );
}
