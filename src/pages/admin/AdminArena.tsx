import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Swords, ChevronLeft, AlertTriangle, RefreshCw, ListChecks, ShieldAlert,
} from 'lucide-react';
import useStore from '../../contexts/store';
import {
  ArenaAdminError,
  CONTROL_ENDPOINT,
  authoringProgress,
  controlPermission,
  freezeRoster,
  listQuestions,
  listTournaments,
  nextBeat,
  postAdvance,
  postAggregate,
  requestTransition,
  watchLiveQuestion,
  watchStandings,
  watchTournament,
  type ArenaControl,
  type ArenaLiveQuestion,
  type ArenaStandingsSummary,
  type ArenaTournament,
  type ControlContext,
  type ControlReason,
} from '../../services/arenaAdminService';
import { type ArenaState } from '../../../shared/arena/state';

/**
 * AdminArena — the tournament list, and the run console a human drives on
 * tournament night.
 *
 * The console answers five questions at a glance, because that is the whole
 * job at 18:41 with a host talking over a stream: what state is the tournament
 * in, which question is live, how long is left, how many schools and players
 * are in, and what happens next.
 *
 * TWO THINGS THIS PAGE IS DELIBERATELY HONEST ABOUT.
 *
 * · **The advance is automated.** Per Decision 2 (2026-09-18) the round clock
 *   runs itself and the manual controls are a SAFETY OVERRIDE — styled as
 *   secondary, confirmed before they fire, and labelled as such. A console
 *   whose most prominent button is "next question" is a console someone drives
 *   by hand, and a tournament driven by hand desynchronises from the broadcast.
 *
 * · **Most of these controls have no server route yet.** The roster freeze is
 *   the exception — `/api/arena/doors-close` accepts a signed-in admin, so it
 *   works. `/api/arena/advance`
 *   and `/api/arena/aggregate` authenticate with `CRON_SECRET`, which a browser
 *   must never hold, and the state transitions (`registration`, `doors`,
 *   `live`, `provisional`, `final`, `void`) have no endpoint at all. The
 *   controls are still rendered, still gated by `canTransition`, and still say
 *   why — a host needs to know a control exists before the minute they need
 *   it. What they do not do is pretend to work.
 *
 * Renders inside AdminLayout's <Outlet>. The tournament is selected with a
 * `?tid=` query param so a console can be linked to, opened on a second screen
 * and reloaded without losing its place.
 */

const STATE_COPY: Record<ArenaState, [string, string]> = {
  draft: ['Brouillon', 'Bouyon'],
  registration: ['Inscriptions', 'Enskripsyon'],
  doors: ['Portes ouvertes', 'Pòt ouvè'],
  live: ['En direct', 'An dirèk'],
  grading: ['Calcul des scores', 'Kalkil nòt yo'],
  provisional: ['Provisoire', 'Pwovizwa'],
  final: ['Final', 'Final'],
  void: ['Annulé', 'Anile'],
};

/** The console reads at a glance, so the state has a colour as well as a word. */
const STATE_TONE: Record<ArenaState, string> = {
  draft: 'var(--asb-muted, #6B7A90)',
  registration: 'var(--asb-accent, #1B6FE0)',
  doors: 'var(--asb-accent, #1B6FE0)',
  live: '#0F9D58',
  grading: '#C77700',
  provisional: '#C77700',
  final: '#0F9D58',
  void: 'var(--danger-500, #E23D3D)',
};

const CONTROL_COPY: Record<ArenaControl, [string, string]> = {
  openRegistration: ['Ouvrir les inscriptions', 'Ouvri enskripsyon yo'],
  openDoors: ['Ouvrir les portes', 'Ouvri pòt yo'],
  start: ['Démarrer le tournoi', 'Kòmanse tounwa a'],
  freezeRoster: ['Figer la liste des présents', 'Fikse lis moun ki prezan yo'],
  forceClose: ['Forcer la fermeture', 'Fòse fèmen'],
  forceNext: ['Forcer la question suivante', 'Fòse kesyon kap vini an'],
  publishProvisional: ['Publier les résultats provisoires', 'Pibliye rezilta pwovizwa yo'],
  finalise: ['Finaliser — libérer les prix', 'Finalize — lage pri yo'],
  void: ['Annuler le tournoi', 'Anile tounwa a'],
};

/** Order on screen: the night's sequence, then the overrides, then the exit. */
const PRIMARY_CONTROLS: ArenaControl[] = [
  'openRegistration', 'openDoors', 'freezeRoster', 'start', 'publishProvisional', 'finalise',
];
const OVERRIDE_CONTROLS: ArenaControl[] = ['forceClose', 'forceNext'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** mm:ss, because a host reads a clock, not a number of milliseconds. */
function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function formatWhen(ms: number, locale: string): string {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString(locale, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

export default function AdminArena() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);
  const locale = isCreole ? 'fr-HT' : 'fr-FR';

  const [params, setParams] = useSearchParams();
  const tid = params.get('tid') || '';

  const [tournaments, setTournaments] = useState<ArenaTournament[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [tournament, setTournament] = useState<ArenaTournament | null>(null);
  const [live, setLive] = useState<ArenaLiveQuestion | null>(null);
  const [standings, setStandings] = useState<ArenaStandingsSummary | null>(null);
  const [authored, setAuthored] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<ArenaControl | 'aggregate' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // ── Loads and listeners ───────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listTournaments();
        if (alive) setTournaments(rows);
      } catch (err) {
        console.error('[AdminArena] listTournaments failed:', err);
      } finally {
        if (alive) setListLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // A run console that polls tells the host something that stopped being true
  // four seconds ago, on the one night where that difference is the whole job.
  useEffect(() => {
    if (!tid) { setTournament(null); return undefined; }
    return watchTournament(tid, setTournament, (e) => {
      console.error('[AdminArena] tournament listener failed:', e);
    });
  }, [tid]);

  const currentIndex = tournament?.currentQuestion?.index ?? -1;

  useEffect(() => {
    if (!tid || currentIndex < 0) { setLive(null); return undefined; }
    return watchLiveQuestion(tid, currentIndex, setLive, (e) => {
      console.error('[AdminArena] live listener failed:', e);
    });
  }, [tid, currentIndex]);

  useEffect(() => {
    if (!tid) { setStandings(null); return undefined; }
    return watchStandings(tid, setStandings, (e) => {
      console.error('[AdminArena] standings listener failed:', e);
    });
  }, [tid]);

  // The authoring count comes from the questions endpoint, which is the only
  // thing that can see the bank at all — the rules deny every client read.
  useEffect(() => {
    if (!tid) { setAuthored(null); return undefined; }
    let alive = true;
    (async () => {
      try {
        const rows = await listQuestions(tid);
        if (alive) setAuthored(rows.filter((r) => r.authored).length);
      } catch (err) {
        console.error('[AdminArena] listQuestions failed:', err);
        if (alive) setAuthored(null);
      }
    })();
    return () => { alive = false; };
  }, [tid]);

  // The countdown only ticks while there is something to count down to.
  const ticking = tournament?.state === 'live';
  useEffect(() => {
    if (!ticking) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [ticking]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const ctx: ControlContext = useMemo(() => ({
    state: tournament?.state || 'draft',
    index: currentIndex,
    liveState: live ? live.state : null,
    questionCount: tournament?.questionCount || 0,
  }), [tournament, currentIndex, live]);

  const beat = useMemo(
    () => nextBeat(
      { state: ctx.state, index: ctx.index, questionCount: ctx.questionCount },
      live ? { state: live.state, closesAt: live.closesAt, closedAt: live.closedAt } : null,
      tournament?.pauseMs || 0,
      now,
    ),
    [ctx, live, tournament, now],
  );

  const progress = useMemo(
    () => authoringProgress(authored ?? 0, tournament?.questionCount || 0),
    [authored, tournament],
  );

  const reasonCopy = useCallback((control: ArenaControl, reason: ControlReason | null): string => {
    switch (reason) {
      case 'illegal_transition':
        return t(
          `Impossible depuis « ${STATE_COPY[ctx.state][0]} ».`,
          `Pa posib depi « ${STATE_COPY[ctx.state][1]} ».`,
        );
      case 'not_doors':
        return t(
          'Uniquement pendant les portes ouvertes — après le départ, la liste sert déjà au classement.',
          'Sèlman pandan pòt yo ouvè — apre kòmansman an, lis la deja ap sèvi nan klasman an.',
        );
      case 'not_live':
        return t('Le tournoi n’est pas en direct.', 'Tounwa a pa an dirèk.');
      case 'no_open_question':
        return t('Aucune question ouverte.', 'Pa gen kesyon ouvè.');
      case 'question_still_open':
        return t('La question en cours est encore ouverte.', 'Kesyon an toujou ouvè.');
      case 'live_document_missing':
        return t(
          'Document de diffusion introuvable — à corriger à la main avant de continuer.',
          'Dokiman difizyon an pa la — korije l alamen anvan ou kontinye.',
        );
      case 'all_questions_delivered':
        return t('Aucune question à ouvrir.', 'Pa gen kesyon pou ouvri.');
      default:
        if (CONTROL_ENDPOINT[control] === 'advance') {
          return t('Route serveur : CRON_SECRET requis.', 'Wout sèvè : CRON_SECRET obligatwa.');
        }
        return CONTROL_ENDPOINT[control] === 'doorsClose'
          ? t(
            'Écrit la qualification sur les présents, pas sur les inscrits. À faire avant le départ.',
            'Ekri kalifikasyon an sou moun ki prezan, pa sou moun ki enskri. Fè l anvan kòmansman an.',
          )
          : t('Route serveur manquante.', 'Wout sèvè a pa egziste.');
    }
  }, [ctx.state, t]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const report = useCallback((err: unknown) => {
    const e = err as ArenaAdminError;
    if (e?.code === 'not_implemented') {
      setMessage({
        type: 'error',
        text: t(
          `Cette commande n’a pas encore de route serveur. (${e.message})`,
          `Kòmand sa a poko gen yon wout sèvè. (${e.message})`,
        ),
      });
      return;
    }
    // The two refusals a host meets on a real night, each carrying the number
    // they need to act on rather than a generic failure.
    if (e?.code === 'questions_incomplete') {
      setMessage({
        type: 'error',
        text: t(
          `Départ refusé : ${e.message} questions rédigées. Le tournoi ne peut pas démarrer avec une question manquante — la soirée s’arrêterait dessus, en direct.`,
          `Refize kòmanse : ${e.message} kesyon redije. Tounwa a pa ka kòmanse ak yon kesyon ki manke — sware a t ap kanpe sou li, an dirèk.`,
        ),
      });
      return;
    }
    if (e?.code === 'no_standings') {
      setMessage({
        type: 'error',
        text: t(
          'Aucun classement calculé : il n’y a pas encore de podium à publier. Lancez « Recalculer le classement » d’abord.',
          'Pa gen klasman ki kalkile : poko gen podyòm pou pibliye. Peze « Rekalkile klasman an » anvan.',
        ),
      });
      return;
    }
    if (e?.code === 'illegal_transition') {
      setMessage({
        type: 'error',
        text: t(
          `Transition refusée par le serveur (${e.message}) — l’état a changé entre-temps.`,
          `Sèvè a refize tranzisyon an (${e.message}) — eta a chanje nan entèval la.`,
        ),
      });
      return;
    }
    if (e?.code === 'cron_secret_required') {
      setMessage({
        type: 'error',
        text: t(
          'Refusé : cet endpoint n’accepte que CRON_SECRET, jamais un jeton d’administrateur.',
          'Refize : endpoint sa a aksepte sèlman CRON_SECRET, pa yon jeton administratè.',
        ),
      });
      return;
    }
    setMessage({ type: 'error', text: (e?.message || String(err)) });
  }, [t]);

  const runTransition = useCallback(async (control: ArenaControl, to: ArenaState) => {
    if (!tournament) return;
    setBusy(control);
    setMessage(null);
    try {
      await requestTransition(tournament.id, tournament.state, to);
      setMessage({ type: 'success', text: t('Transition appliquée.', 'Tranzisyon aplike.') });
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  }, [tournament, t, report]);

  const runAdvance = useCallback(async (control: ArenaControl) => {
    if (!tournament) return;
    setBusy(control);
    setMessage(null);
    try {
      const res = await postAdvance(tournament.id, true);
      setMessage({
        type: 'success',
        text: t(`Avance forcée : ${res.action}.`, `Avans fòse : ${res.action}.`),
      });
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  }, [tournament, t, report]);

  const runFreeze = useCallback(async () => {
    if (!tournament) return;
    setBusy('freezeRoster');
    setMessage(null);
    try {
      const res = await freezeRoster(tournament.id);
      setMessage({
        type: 'success',
        text: t(
          `Liste ${res.action === 'frozen' ? 'figée' : 'déjà figée'} — ${res.playersPresent}/${res.playersRegistered} présents, ${res.qualifiedSchools}/${res.schools} écoles qualifiées.`,
          `Lis la ${res.action === 'frozen' ? 'fikse' : 'te deja fikse'} — ${res.playersPresent}/${res.playersRegistered} prezan, ${res.qualifiedSchools}/${res.schools} lekòl kalifye.`,
        ),
      });
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  }, [tournament, t, report]);

  const runAggregate = useCallback(async () => {
    if (!tournament) return;
    setBusy('aggregate');
    setMessage(null);
    try {
      const res = await postAggregate(tournament.id);
      setMessage({
        type: 'success',
        text: t(
          `Classement recalculé — ${res.schools ?? 0} écoles, ${res.events ?? 0} événements.`,
          `Klasman rekalkile — ${res.schools ?? 0} lekòl, ${res.events ?? 0} evènman.`,
        ),
      });
    } catch (err) {
      report(err);
    } finally {
      setBusy(null);
    }
  }, [tournament, t, report]);

  /**
   * The confirmations, sized to what the press costs.
   *
   * `void` asks for the slug to be typed because it is the one action that
   * cancels an event students have been told is happening, and it cannot be
   * undone — a `void` tournament is terminal by design. `finalise` releases
   * prize money. The overrides warn about the thing that actually goes wrong:
   * a hand-driven clock drifting away from the broadcast.
   */
  const confirmFor = useCallback((control: ArenaControl): boolean => {
    if (control === 'void') {
      const typed = window.prompt(t(
        `Annuler définitivement ce tournoi ? Tapez « ${tournament?.slug} » pour confirmer. Un tournoi annulé ne peut pas être ré-ouvert.`,
        `Anile tounwa sa a nèt ? Tape « ${tournament?.slug} » pou konfime. Yon tounwa ki anile pa ka re-ouvè.`,
      ));
      return typed === tournament?.slug;
    }
    if (control === 'finalise') {
      return window.confirm(t(
        'Finaliser libère les prix et écrit l’histoire du tournoi. La revue d’intégrité est-elle terminée ?',
        'Finalize lage pri yo epi ekri istwa tounwa a. Eske revi entegrite a fini ?',
      ));
    }
    if (control === 'freezeRoster') {
      return window.confirm(t(
        'Figer la liste enregistre définitivement quelles écoles sont qualifiées, sur les joueurs présents maintenant. Une école non qualifiée joue quand même — ses élèves sont simplement non classés par école.',
        'Fikse lis la anrejistre nèt ki lekòl ki kalifye, sou jwè ki prezan kounye a. Yon lekòl ki pa kalifye jwe kanmenm — elèv li yo senpleman pa klase pa lekòl.',
      ));
    }
    if (control === 'start') {
      return window.confirm(t(
        'Démarrer le tournoi ? La qualification est évaluée sur les joueurs présents, pas sur les inscrits.',
        'Kòmanse tounwa a ? Kalifikasyon an evalye sou jwè ki prezan, pa sou moun ki enskri.',
      ));
    }
    if (control === 'forceClose' || control === 'forceNext') {
      return window.confirm(t(
        'L’avance est automatique. Cette commande est une sécurité : elle désynchronise l’horloge du direct si vous la pressez au mauvais moment. Continuer ?',
        'Avans la otomatik. Kòmand sa a se yon sekirite : li ka dekale revèy la ak dirèk la si w peze l nan move moman. Kontinye ?',
      ));
    }
    return true;
  }, [tournament, t]);

  const press = useCallback((control: ArenaControl, target: ArenaState | null) => {
    if (!confirmFor(control)) return;
    if (target) void runTransition(control, target);
    else if (control === 'freezeRoster') void runFreeze();
    else void runAdvance(control);
  }, [confirmFor, runTransition, runAdvance, runFreeze]);

  // ── The list ──────────────────────────────────────────────────────────────

  if (!tid) {
    return (
      <div>
        <div className="admin-page__head">
          <div className="admin-page__eyebrow">
            <Swords size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
          </div>
          <h1 className="admin-page__title">{t('Arena', 'Arena')}</h1>
          <p className="admin-page__subtitle">
            {listLoading
              ? t('Chargement…', 'Ap chaje…')
              : t(
                `${tournaments.length} tournoi${tournaments.length > 1 ? 's' : ''}`,
                `${tournaments.length} tounwa`,
              )}
          </p>
        </div>

        <div className="admin-card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertTriangle size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13 }}>
              {t(
                'Créer un tournoi depuis la console n’est pas possible : firestore.rules refuse toute écriture client sous tournaments/**, et il n’existe pas de route /api/arena/tournaments. Créez le document côté serveur, puis pilotez-le ici.',
                'Ou pa ka kreye yon tounwa nan konsòl la : firestore.rules refize tout ekriti kliyan anba tournaments/**, epi pa gen wout /api/arena/tournaments. Kreye dokiman an bò sèvè a, apre sa pilote l isit la.',
              )}
            </p>
          </div>
        </div>

        <div className="admin-card">
          {listLoading ? (
            <div className="admin-empty">{t('Chargement des tournois…', 'Ap chaje tounwa yo…')}</div>
          ) : tournaments.length === 0 ? (
            <div className="admin-empty">{t('Aucun tournoi.', 'Pa gen tounwa.')}</div>
          ) : (
            <div className="admin-table__scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('Tournoi', 'Tounwa')}</th>
                    <th>{t('État', 'Eta')}</th>
                    <th>{t('Début', 'Kòmansman')}</th>
                    <th>{t('Questions', 'Kesyon')}</th>
                    <th>{t('Écoles', 'Lekòl')}</th>
                    <th>{t('Joueurs', 'Jwè')}</th>
                    <th aria-label={t('Actions', 'Aksyon')} />
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        <div className="admin-page__subtitle" style={{ fontSize: 12 }}>{row.slug}</div>
                      </td>
                      <td>
                        <span
                          className="admin-role-pill"
                          style={{ color: STATE_TONE[row.state], borderColor: 'currentColor' }}
                        >
                          {STATE_COPY[row.state]?.[isCreole ? 1 : 0] || row.state}
                        </span>
                      </td>
                      <td>{formatWhen(row.startsAt, locale)}</td>
                      <td>{row.questionCount}</td>
                      <td>{row.countsPublic.schools}</td>
                      <td>{row.countsPublic.players}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={() => setParams({ tid: row.id })}
                        >
                          {t('Console', 'Konsòl')}
                        </button>{' '}
                        <Link
                          className="admin-btn admin-btn--ghost"
                          to={`/admin/content/arena/questions?tid=${encodeURIComponent(row.id)}`}
                        >
                          {t('Questions', 'Kesyon')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── The run console ───────────────────────────────────────────────────────

  const state = tournament?.state || 'draft';
  const stateLabel = STATE_COPY[state]?.[isCreole ? 1 : 0] || state;
  const schools = standings?.schools ?? tournament?.countsPublic.schools ?? 0;
  const qualified = standings?.qualifiedSchools ?? tournament?.countsPublic.qualifiedSchools ?? 0;
  const players = standings?.players ?? tournament?.countsPublic.players ?? 0;

  const beatCopy = (() => {
    switch (beat.kind) {
      case 'closes':
        return t(`Fermeture dans ${clock(beat.inMs)}`, `Fèmen nan ${clock(beat.inMs)}`);
      case 'opens':
        return t(`Question suivante dans ${clock(beat.inMs)}`, `Pwochen kesyon nan ${clock(beat.inMs)}`);
      case 'grading':
        return t('Dernière question fermée — passage au calcul des scores.', 'Dènye kesyon an fèmen — n ap pase nan kalkil nòt yo.');
      default:
        return t('Aucune horloge en cours.', 'Pa gen revèy k ap mache.');
    }
  })();

  const renderControl = (control: ArenaControl) => {
    const permission = controlPermission(control, ctx);
    const override = CONTROL_ENDPOINT[control] === 'advance';
    const danger = control === 'void';
    const reason = permission.allowed
      ? reasonCopy(control, null)
      : reasonCopy(control, permission.reason);
    const cls = danger
      ? 'admin-btn admin-btn--danger'
      : override ? 'admin-btn admin-btn--ghost' : 'admin-btn';

    return (
      <div key={control} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <button
          type="button"
          className={cls}
          disabled={!permission.allowed || busy !== null}
          title={reason}
          onClick={() => press(control, permission.target)}
          style={{ width: '100%', opacity: permission.allowed ? 1 : 0.55 }}
        >
          {busy === control
            ? t('En cours…', 'Ap fèt…')
            : CONTROL_COPY[control][isCreole ? 1 : 0]}
        </button>
        <span className="admin-page__subtitle" style={{ fontSize: 11, lineHeight: 1.35 }}>
          {override && (
            <span style={{ color: '#C77700', fontWeight: 600 }}>
              {t('SÉCURITÉ · ', 'SEKIRITE · ')}
            </span>
          )}
          {reason}
        </span>
      </div>
    );
  };

  return (
    <div>
      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        style={{ marginBottom: 16 }}
        onClick={() => setParams({})}
      >
        <ChevronLeft size={14} style={{ verticalAlign: -2 }} /> {t('Tous les tournois', 'Tout tounwa yo')}
      </button>

      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Swords size={13} aria-hidden="true" /> {t('CONSOLE DE DIRECTION', 'KONSÒL DIREKSYON')}
        </div>
        <h1 className="admin-page__title">{tournament?.title || tid}</h1>
        <p className="admin-page__subtitle">
          {tournament
            ? `${tournament.slug} · ${formatWhen(tournament.startsAt, locale)} · ${t('portes', 'pòt')} ${formatWhen(tournament.doorsAt, locale)}`
            : t('Chargement du tournoi…', 'Ap chaje tounwa a…')}
        </p>
      </div>

      {message && (
        <div className={`form-message form-message--${message.type}`} style={{ marginBottom: 16 }}>
          {message.text}
        </div>
      )}

      {/* The five numbers the night is run on. */}
      <section className="admin-tiles" aria-label={t('État du tournoi', 'Eta tounwa a')} style={{ marginBottom: 18 }}>
        <div className="admin-card admin-tile">
          <div className="admin-tile__label">{t('État', 'Eta')}</div>
          <div className="admin-tile__value" style={{ color: STATE_TONE[state], fontSize: 22 }}>
            {stateLabel}
          </div>
          <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>
            {tournament?.currentRound != null
              ? t(`Manche ${tournament.currentRound + 1}`, `Manch ${tournament.currentRound + 1}`)
              : '—'}
          </div>
        </div>

        <div className="admin-card admin-tile">
          <div className="admin-tile__label">{t('Question', 'Kesyon')}</div>
          <div className="admin-tile__value">
            {currentIndex >= 0 ? `${currentIndex + 1} / ${tournament?.questionCount || 0}` : '—'}
          </div>
          <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>
            {live
              ? t(
                live.state === 'open' ? 'ouverte' : live.state === 'closed' ? 'fermée' : 'en attente',
                live.state === 'open' ? 'ouvè' : live.state === 'closed' ? 'fèmen' : 'ap tann',
              )
              : t('rien en diffusion', 'anyen pa difize')}
          </div>
        </div>

        <div className="admin-card admin-tile">
          <div className="admin-tile__label">{t('Temps restant', 'Tan ki rete')}</div>
          <div className="admin-tile__value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {beat.kind === 'idle' || beat.kind === 'grading' ? '—' : clock(beat.inMs)}
          </div>
          <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>{beatCopy}</div>
        </div>

        <div className="admin-card admin-tile">
          <div className="admin-tile__label">{t('Écoles', 'Lekòl')}</div>
          <div className="admin-tile__value">{schools}</div>
          <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>
            {t(`${qualified} qualifiées`, `${qualified} kalifye`)}
          </div>
        </div>

        <div className="admin-card admin-tile">
          <div className="admin-tile__label">{t('Joueurs', 'Jwè')}</div>
          <div className="admin-tile__value">{players}</div>
          <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>
            {standings?.leader
              ? t(`En tête : ${standings.leader}`, `Alatèt : ${standings.leader}`)
              : t('Classement non calculé', 'Klasman pa kalkile')}
          </div>
        </div>
      </section>

      {/* The prompt actually on students' screens right now. */}
      {live && (
        <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="admin-tile__label">{t('EN DIFFUSION', 'K AP DIFIZE')}</div>
          <p style={{ margin: '8px 0 10px', fontSize: 16, fontWeight: 600 }}>
            {(isCreole ? live.promptHt : live.prompt) || live.prompt || '—'}
          </p>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--asb-muted)' }}>
            {(isCreole && live.optionsHt.length === 4 ? live.optionsHt : live.options).map((o, i) => (
              <li key={`${live.seq}-${i}`}>{o}</li>
            ))}
          </ol>
          <p className="admin-page__subtitle" style={{ marginTop: 10, fontSize: 12 }}>
            {t(
              'La bonne réponse n’est jamais servie au client — elle n’apparaît ici qu’après la fermeture.',
              'Bon repons lan pa janm voye bay kliyan an — li parèt isit la sèlman apre fèmti a.',
            )}
          </p>
        </div>
      )}

      {/* The one banner that explains every disabled control below. */}
      <div className="admin-card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldAlert size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: 13 }}>
            {t(
              'Un contrôle grisé est refusé par canTransition, pas cassé : la raison est écrite sous le bouton. Le tournoi ne peut pas démarrer tant que toutes les questions ne sont pas rédigées, et publier le provisoire ouvre les 72 heures de réclamation — ce sont des refus du serveur, pas de cette page.',
              'Yon kontwòl ki gri se canTransition ki refize l, li pa kase : rezon an ekri anba bouton an. Tounwa a pa ka kòmanse toutotan tout kesyon yo poko redije, epi pibliye pwovizwa a louvri 72 èdtan reklamasyon an — se sèvè a ki refize, pa paj sa a.',
            )}
          </p>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="admin-tile__label" style={{ marginBottom: 12 }}>
          {t('DÉROULÉ DE LA SOIRÉE', 'DEWOULMAN SWARE A')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
          }}
        >
          {PRIMARY_CONTROLS.map(renderControl)}
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
        <div className="admin-tile__label" style={{ marginBottom: 6 }}>
          {t('SÉCURITÉ — À N’UTILISER QU’EN CAS DE PROBLÈME', 'SEKIRITE — SÈLMAN SI GEN PWOBLÈM')}
        </div>
        <p className="admin-page__subtitle" style={{ marginBottom: 12, fontSize: 12 }}>
          {t(
            'L’avance des questions est automatique : la fenêtre se ferme toujours sur son minuteur, puis une pause d’environ 10 s laisse arriver les réponses tardives et révèle la bonne réponse. Ces commandes contournent ce minuteur, une étape à la fois.',
            'Avans kesyon yo otomatik : fenèt la toujou fèmen sou revèy li, apre sa yon poz apeprè 10 s kite repons ki an reta yo rive epi montre bon repons lan. Kòmand sa yo kontoune revèy sa a, yon etap alafwa.',
          )}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
          }}
        >
          {OVERRIDE_CONTROLS.map(renderControl)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={busy !== null}
              onClick={() => void runAggregate()}
              style={{ width: '100%' }}
            >
              <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              {busy === 'aggregate'
                ? t('Recalcul…', 'Ap rekalkile…')
                : t('Recalculer le classement', 'Rekalkile klasman an')}
            </button>
            <span className="admin-page__subtitle" style={{ fontSize: 11, lineHeight: 1.35 }}>
              <span style={{ color: '#C77700', fontWeight: 600 }}>{t('SÉCURITÉ · ', 'SEKIRITE · ')}</span>
              {t('Route serveur : CRON_SECRET requis.', 'Wout sèvè : CRON_SECRET obligatwa.')}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="admin-tile__label">{t('BANQUE DE QUESTIONS', 'BANK KESYON')}</div>
            <div className="admin-tile__value" style={{ fontSize: 22 }}>
              {authored === null ? '—' : `${progress.authored} / ${progress.total}`}
            </div>
            <div className="admin-page__subtitle" style={{ margin: 0, fontSize: 12 }}>
              {authored === null
                ? t('Banque illisible depuis ce navigateur.', 'Bank la pa lizib depi navigatè sa a.')
                : progress.complete
                  ? t('Banque complète.', 'Bank la konplè.')
                  : t(`Il reste ${progress.remaining} question${progress.remaining > 1 ? 's' : ''} à écrire.`, `Rete ${progress.remaining} kesyon pou ekri.`)}
            </div>
          </div>
          <Link
            className="admin-btn"
            to={`/admin/content/arena/questions?tid=${encodeURIComponent(tid)}`}
          >
            <ListChecks size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t('Rédiger les questions', 'Ekri kesyon yo')}
          </Link>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 18 }}>
        <div className="admin-tile__label" style={{ marginBottom: 10 }}>
          {t('SORTIE', 'SÒTI')}
        </div>
        <div style={{ maxWidth: 320 }}>{renderControl('void')}</div>
      </div>
    </div>
  );
}
