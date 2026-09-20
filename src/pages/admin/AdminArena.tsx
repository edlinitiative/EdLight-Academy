import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Swords, ChevronLeft, RefreshCw, ListChecks, ShieldAlert, Plus, MapPin,
} from 'lucide-react';
import useStore from '../../contexts/store';
import {
  ArenaAdminError,
  CONTROL_ENDPOINT,
  authoringProgress,
  controlPermission,
  createTournament,
  fetchConsentUrl,
  blockerLines,
  decideReview,
  fetchEvidence,
  fetchReviewQueue,
  freezeRoster,
  listQuestions,
  listSchoolsForLocation,
  listTournaments,
  nextBeat,
  postAdvance,
  postAggregate,
  requestTransition,
  reviewClaim,
  setSchoolCommune,
  validateTournamentDraft,
  watchClaims,
  watchLiveQuestion,
  watchStandings,
  watchTournament,
  type AdminClaim,
  type AdminSchoolRow,
  type ArenaControl,
  type ArenaLiveQuestion,
  type ArenaStandingsSummary,
  type ArenaTournament,
  type ControlContext,
  type ControlReason,
  type Evidence,
  type NewTournamentInput,
  type ReviewRow,
} from '../../services/arenaAdminService';
import type { FinalBlocker } from '../../../shared/arena/review';
import { type ArenaState } from '../../../shared/arena/state';
import { HAITI_DEPARTMENTS } from '../../data/haitiGeo';

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
 * · **The host paces the show; the scheduler is the floor under them.**
 *   CORRECTION, from an external audit (E3). This used to say the round clock
 *   "runs itself" and that the manual controls were a safety override — while
 *   `vercel.json` scheduled no runner for `api/arena/advance` at all, so the
 *   clock moved only when somebody pressed a button. It is scheduled now, but
 *   Vercel's one-minute floor paces a question at about two minutes against a
 *   designed cadence of 20s + 10s, so the cron is what guarantees a tournament
 *   cannot STALL unattended, not what gives it its rhythm. Under a sub-minute
 *   runner the original wording becomes true again and should come back with
 *   it — see the note on `api/arena/advance.ts`. Until then a console that
 *   tells the host their presses are an emergency measure is a console lying
 *   to the one person who has to keep the show moving.
 *
 * · **A disabled control is refused, not broken.** Every state-changing
 *   control runs through `canTransition` before it is offered, and one that is
 *   wrong for this moment is greyed WITH ITS REASON UNDERNEATH rather than
 *   hidden — a host needs to know a control exists before the minute they need
 *   it. The server re-checks the same rule inside the transaction that writes,
 *   so this page can never be the thing that invented an illegal move.
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

/** Accent- and case-insensitive search fold, so "leogane" finds Léogâne. */
function fold(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, ' ').trim();
}

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

/**
 * Create a tournament.
 *
 * Collapsed by default: this is a once-a-month action sitting above a list
 * somebody opens every week, and a form that is always expanded trains people
 * to scroll past the thing they came for.
 *
 * Two fields carry the decisions worth defending, so the form explains them
 * rather than leaving them as numbers: the counting five (why `minPlayers`
 * cannot be under `teamSize`) and the prizes, typed in dollars and stored in
 * cents so nobody ever types 10000 meaning a hundred.
 */
function NewTournamentCard({
  t,
  onCreated,
}: {
  t: (fr: string, ht: string) => string;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewTournamentInput>(() => ({
    tournamentId: '',
    title: '',
    titleHt: '',
    startsAt: 0,
    questionCount: 25,
    teamSize: 5,
    minPlayers: 5,
    prizes: [10_000, 5_000, 2_500],
  }));
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [touched, setTouched] = useState(false);

  const isCreole = useStore((s) => s.language) === 'ht';
  const issues = useMemo(() => validateTournamentDraft(draft, isCreole), [draft, isCreole]);
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

  const set = <K extends keyof NewTournamentInput>(key: K, value: NewTournamentInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setPrize = (i: number, dollars: string) => {
    const cents = Math.round((Number(dollars) || 0) * 100);
    setDraft((d) => {
      const prizes = [...(d.prizes || [])];
      prizes[i] = Math.max(0, cents);
      return { ...d, prizes };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (issues.length > 0) return;
    setSaving(true);
    setNote(null);
    try {
      await createTournament(draft);
      setNote({
        type: 'success',
        text: t(
          `« ${draft.title} » créé en brouillon. Rédigez les questions avant d’ouvrir les inscriptions.`,
          `« ${draft.title} » kreye kòm bouyon. Redije kesyon yo anvan ou louvri enskripsyon yo.`,
        ),
      });
      setDraft((d) => ({ ...d, tournamentId: '', title: '', titleHt: '', startsAt: 0 }));
      setStartsAtLocal('');
      setTouched(false);
      await onCreated();
    } catch (err) {
      const e2 = err as ArenaAdminError;
      setNote({
        type: 'error',
        text: e2?.code === 'already_exists'
          ? t(
              'Un tournoi porte déjà cet identifiant.',
              'Gen yon tounwa ki gen idantifyan sa a deja.',
            )
          : (e2?.message || String(err)),
      });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, control: React.ReactNode, error?: string, hint?: string) => (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
      {label}
      <div style={{ marginTop: 4, fontWeight: 400 }}>{control}</div>
      {hint && !error ? (
        <div className="admin-page__subtitle" style={{ fontSize: 11, marginTop: 3, fontWeight: 400 }}>{hint}</div>
      ) : null}
      {touched && error ? (
        <div style={{ fontSize: 11, marginTop: 3, color: '#B42318', fontWeight: 400 }}>{error}</div>
      ) : null}
    </label>
  );

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--admin-border, #d9dde3)', fontSize: 13, background: '#fff',
  };

  return (
    <div className="admin-card" style={{ padding: 16, marginBottom: 20 }}>
      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Plus size={14} aria-hidden="true" /> {t('Nouveau tournoi', 'Nouvo tounwa')}
      </button>

      {note ? (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: note.type === 'error' ? '#B42318' : '#067647' }}>
          {note.text}
        </p>
      ) : null}

      {open ? (
        <form onSubmit={submit} style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            {field(
              t('Identifiant', 'Idantifyan'),
              <input
                style={input}
                value={draft.tournamentId}
                onChange={(e) => set('tournamentId', e.target.value.trim())}
                placeholder="sept-2026"
                autoComplete="off"
              />,
              issueFor('tournamentId'),
              t('Il apparaît dans les liens et ne change jamais.', 'Li parèt nan lyen yo epi li pa janm chanje.'),
            )}
            {field(
              t('Titre (français)', 'Tit (fransè)'),
              <input style={input} value={draft.title} onChange={(e) => set('title', e.target.value)} />,
              issueFor('title'),
            )}
            {field(
              t('Titre (kreyòl)', 'Tit (kreyòl)'),
              <input style={input} value={draft.titleHt || ''} onChange={(e) => set('titleHt', e.target.value)} />,
              undefined,
              t('Vide = le titre français.', 'Vid = tit fransè a.'),
            )}
            {field(
              t('Première question', 'Premye kesyon'),
              <input
                type="datetime-local"
                style={input}
                value={startsAtLocal}
                onChange={(e) => {
                  setStartsAtLocal(e.target.value);
                  const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                  set('startsAt', Number.isFinite(ms) ? ms : 0);
                }}
              />,
              issueFor('startsAt'),
              t('Les portes ouvrent 10 minutes avant.', 'Pòt yo louvri 10 minit anvan.'),
            )}
            {field(
              t('Questions', 'Kesyon'),
              <input
                type="number" min={1} style={input}
                value={draft.questionCount ?? 25}
                onChange={(e) => set('questionCount', Number(e.target.value))}
              />,
              issueFor('questionCount'),
            )}
            {field(
              t('Joueurs qui comptent', 'Jwè ki konte'),
              <input
                type="number" min={1} style={input}
                value={draft.teamSize ?? 5}
                onChange={(e) => set('teamSize', Number(e.target.value))}
              />,
              undefined,
              t('L’école est classée sur la moyenne de ses cinq meilleurs.', 'Lekòl la klase sou mwayèn senk pi bon yo.'),
            )}
            {field(
              t('Présents minimum', 'Prezan minimòm'),
              <input
                type="number" min={1} style={input}
                value={draft.minPlayers ?? 5}
                onChange={(e) => set('minPlayers', Number(e.target.value))}
              />,
              issueFor('minPlayers'),
              t('Mesuré à la fermeture des portes, pas aux inscriptions.', 'Mezire lè pòt yo fèmen, pa sou enskripsyon yo.'),
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {t('Prix individuels (USD)', 'Pri endividyèl (USD)')}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>{i + 1}{i === 0 ? 'er' : 'e'}</span>
                  <input
                    type="number" min={0} step="1"
                    style={{ ...input, width: 100 }}
                    value={((draft.prizes?.[i] ?? 0) / 100).toString()}
                    onChange={(e) => setPrize(i, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="admin-page__subtitle" style={{ fontSize: 11, marginTop: 4 }}>
              {t(
                'Un rang à 0 ne paie pas et n’ouvre aucune réclamation.',
                'Yon ran ki a 0 pa peye epi li pa louvri okenn reklamasyon.',
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="admin-btn" disabled={saving}>
              {saving ? t('Création…', 'Ap kreye…') : t('Créer en brouillon', 'Kreye kòm bouyon')}
            </button>
            <span className="admin-page__subtitle" style={{ fontSize: 11 }}>
              {t(
                'Le tournoi naît en brouillon : rien n’est public tant que vous n’ouvrez pas les inscriptions.',
                'Tounwa a fèt kòm bouyon : anyen pa piblik toutotan ou pa louvri enskripsyon yo.',
              )}
            </span>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/**
 * The claim queue — who has asked for their prize, and what is still missing.
 *
 * Only shown once the podium exists, because before `provisional` there is
 * nothing to claim and a queue of empty rows reads like a broken page.
 *
 * The column that matters most is the one that is easy to leave out: for a
 * minor, whether the signed parental authorisation is actually on file. A
 * claim from a fifteen-year-old with a contact and a guardian name looks
 * complete in every other respect and is not — and the person who notices has
 * to be the admin sitting here, on day two, not the family on day four.
 *
 * The consent document itself is never listed, prefetched or embedded. One
 * click asks `/api/arena/consent` for a fifteen-minute signed URL. A queue that
 * pre-signs every form hands out a page full of live links to documents about
 * children that nobody has opened.
 */
function ClaimQueue({
  tid,
  t,
  locale,
}: {
  tid: string;
  t: (fr: string, ht: string) => string;
  locale: string;
}) {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!tid) return undefined;
    return watchClaims(tid, setClaims, (e) => {
      console.error('[AdminArena] claims listener failed:', e);
    });
  }, [tid]);

  const openConsent = useCallback(async (uid: string) => {
    setBusyUid(uid);
    setNote(null);
    try {
      const url = await fetchConsentUrl(tid, uid);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const e = err as ArenaAdminError;
      setNote({
        type: 'error',
        text: e?.message === 'storage_not_configured'
          ? t(
              'Le stockage des formulaires n’est pas configuré sur ce déploiement.',
              'Depo fòm yo pa konfigire sou deplwaman sa a.',
            )
          : t('Formulaire introuvable.', 'Nou pa jwenn fòm nan.'),
      });
    } finally {
      setBusyUid(null);
    }
  }, [tid, t]);

  const decide = useCallback(async (uid: string, decision: 'verified' | 'rejected') => {
    const claim = claims.find((c) => c.uid === uid);
    const confirmText = decision === 'rejected'
      ? t(
          'Refuser cette réclamation ? Le prix passe immédiatement au concurrent suivant.',
          'Refize reklamasyon sa a ? Pri a pase touswit bay moun ki vin apre a.',
        )
      : claim?.isMinor && !claim.hasConsent
        ? t(
            'Ce gagnant est mineur et l’autorisation parentale signée n’est PAS au dossier. Valider quand même ?',
            'Moun sa a poko gen 18 an epi otorizasyon paran an ki siyen an PA nan dosye a. Ou vle valide kanmenm ?',
          )
        : t('Valider cette réclamation ?', 'Valide reklamasyon sa a ?');
    if (!window.confirm(confirmText)) return;

    setBusyUid(uid);
    setNote(null);
    try {
      await reviewClaim(tid, uid, decision);
      setNote({
        type: 'success',
        text: decision === 'verified'
          ? t('Réclamation validée.', 'Reklamasyon an valide.')
          : t('Réclamation refusée ; le prix a été réattribué.', 'Reklamasyon an refize ; pri a pase bay yon lòt moun.'),
      });
    } catch (err) {
      setNote({ type: 'error', text: (err as Error)?.message || String(err) });
    } finally {
      setBusyUid(null);
    }
  }, [tid, t, claims]);

  if (claims.length === 0) return null;

  const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

  return (
    <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
      <div className="admin-tile__label" style={{ marginBottom: 4 }}>
        {t('RÉCLAMATIONS', 'REKLAMASYON')}
      </div>
      <p className="admin-page__subtitle" style={{ marginTop: 0, fontSize: 12 }}>
        {t(
          'Vérifiez sur un appel. Pour un mineur, l’autorisation parentale signée doit être au dossier avant de valider.',
          'Verifye sou yon apèl. Pou yon minè, otorizasyon paran ki siyen an dwe nan dosye a anvan ou valide.',
        )}
      </p>

      {note ? (
        <p style={{ fontSize: 13, color: note.type === 'error' ? '#B42318' : '#067647' }}>{note.text}</p>
      ) : null}

      <div className="admin-table__scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('Rang', 'Ran')}</th>
              <th>{t('État', 'Eta')}</th>
              <th>{t('Contact', 'Kontak')}</th>
              <th>{t('Mineur', 'Minè')}</th>
              <th>{t('Autorisation', 'Otorizasyon')}</th>
              <th>{t('Échéance', 'Delè')}</th>
              <th aria-label={t('Actions', 'Aksyon')} />
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => {
              const blocked = c.isMinor === true && !c.hasConsent;
              return (
                <tr key={c.uid}>
                  <td>
                    <strong>{c.rank}</strong>
                    <div className="admin-page__subtitle" style={{ fontSize: 12 }}>{money(c.prizeCents)}</div>
                    {c.rolledDownFrom ? (
                      <div className="admin-page__subtitle" style={{ fontSize: 11 }}>
                        {t(`reporté du rang ${c.rolledDownFrom}`, `soti nan ran ${c.rolledDownFrom}`)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className="admin-role-pill">{CLAIM_STATE_COPY[c.state]?.[locale === 'fr-HT' ? 1 : 0] || c.state}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.contact || <span className="admin-page__subtitle">{t('pas encore', 'poko')}</span>}
                    {c.guardian ? (
                      <div className="admin-page__subtitle" style={{ fontSize: 11 }}>
                        {c.guardian.name}{c.guardian.relationship ? ` (${c.guardian.relationship})` : ''} · {c.guardian.contact}
                      </div>
                    ) : null}
                  </td>
                  <td>{c.isMinor === null ? '—' : c.isMinor ? t('oui', 'wi') : t('non', 'non')}</td>
                  <td style={{ fontSize: 12 }}>
                    {c.isMinor !== true ? (
                      <span className="admin-page__subtitle">{t('sans objet', 'pa konsène')}</span>
                    ) : c.hasConsent ? (
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={busyUid === c.uid}
                        onClick={() => { void openConsent(c.uid); }}
                      >
                        {t('Ouvrir', 'Louvri')}
                      </button>
                    ) : (
                      <span style={{ color: '#B54708', fontWeight: 600 }}>
                        {t('manquante', 'li manke')}
                        {c.consentEmailSent === false ? (
                          <div style={{ fontWeight: 400, fontSize: 11 }}>
                            {t('email non parti', 'imel la pa pati')}
                          </div>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{formatWhen(c.expiresAt, locale)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.state === 'claimed' ? (
                      <>
                        <button
                          type="button"
                          className="admin-btn"
                          disabled={busyUid === c.uid}
                          title={blocked
                            ? t('Autorisation parentale manquante.', 'Otorizasyon paran an manke.')
                            : undefined}
                          onClick={() => { void decide(c.uid, 'verified'); }}
                        >
                          {t('Valider', 'Valide')}
                        </button>{' '}
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          disabled={busyUid === c.uid}
                          onClick={() => { void decide(c.uid, 'rejected'); }}
                        >
                          {t('Refuser', 'Refize')}
                        </button>
                      </>
                    ) : (
                      <span className="admin-page__subtitle" style={{ fontSize: 12 }}>
                        {c.reviewNote || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── The integrity review ────────────────────────────────────────────────────

/**
 * IntegrityQueue — who is worth reading, what the evidence says, and the
 * verdict.
 *
 * Nothing in this product could mark a player ineligible before this panel
 * existed, although four server files were already reading the flag. The
 * queue comes from `/api/arena/review` rather than a Firestore listener like
 * `ClaimQueue` above, and that difference is not stylistic: `players/**`,
 * `answers/**` and `reviews/**` are server-only even for an admin's browser,
 * because a player's own score leaks the answer key mid-question.
 *
 * The evidence is fetched ONE PLAYER AT A TIME, on a click. Same reasoning as
 * the consent forms: a panel that pre-loads every child's answer log has read
 * all of it before anyone decided to look.
 *
 * Shown from `grading` onward. Before that there is nothing to review and the
 * endpoint would refuse the evidence anyway.
 */
function IntegrityQueue({
  tid,
  state,
  t,
  onChanged,
}: {
  tid: string;
  state: ArenaState;
  t: (fr: string, ht: string) => string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [blockers, setBlockers] = useState<FinalBlocker[]>([]);
  const [loading, setLoading] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const active = state === 'grading' || state === 'provisional' || state === 'final';

  const load = useCallback(async () => {
    if (!tid || !active) return;
    setLoading(true);
    try {
      const queue = await fetchReviewQueue(tid);
      setRows(queue.rows);
      setBlockers(queue.blockers);
    } catch (err) {
      setNote({ type: 'error', text: (err as Error)?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, [tid, active]);

  useEffect(() => { void load(); }, [load]);

  const openEvidence = useCallback(async (uid: string) => {
    if (openUid === uid) { setOpenUid(null); setEvidence(null); return; }
    setBusyUid(uid);
    setNote(null);
    try {
      const found = await fetchEvidence(tid, uid);
      setEvidence(found);
      setOpenUid(uid);
    } catch (err) {
      setNote({ type: 'error', text: (err as Error)?.message || String(err) });
    } finally {
      setBusyUid(null);
    }
  }, [tid, openUid]);

  const decide = useCallback(async (uid: string, decision: 'cleared' | 'disqualified') => {
    let reason = '';
    if (decision === 'disqualified') {
      // Typed, not picked from a list. This sentence is what a parent is read
      // months later, and a dropdown would make every disqualification say the
      // same four words.
      const typed = window.prompt(t(
        'Pourquoi ? Cette phrase est la justification officielle — elle sera relue si la famille conteste.',
        'Poukisa ? Fraz sa a se jistifikasyon ofisyèl la — y ap li l ankò si fanmi an konteste.',
      ));
      if (typed === null || typed.trim().length < 4) return;
      reason = typed;
    } else if (!window.confirm(t(
      'Lever le signalement et rétablir ce joueur ?',
      'Retire siyal la epi remèt jwè sa a ?',
    ))) return;

    setBusyUid(uid);
    setNote(null);
    try {
      const result = await decideReview(tid, uid, decision, reason);
      setNote({
        type: 'success',
        text: decision === 'disqualified'
          ? (result.board === 'aggregated'
              ? t('Disqualifié ; le classement a été recalculé.', 'Diskalifye ; klasman an rekalkile.')
              : t(
                  'Disqualifié. Le classement annoncé n’est pas réécrit — la correction est appliquée à la finalisation.',
                  'Diskalifye. Klasman ki anonse a pa reekri — koreksyon an ap aplike lè w finalize.',
                ))
          : result.rolledDownAway
            ? t(
                'Rétabli — mais son prix est déjà passé à un autre élève. Cette réattribution ne s’annule pas toute seule.',
                'Remèt — men pri li deja pase bay yon lòt elèv. Rebay sa a pa anile pou kont li.',
              )
            : t('Signalement levé.', 'Siyal la retire.'),
      });
      await load();
      onChanged?.();
    } catch (err) {
      setNote({ type: 'error', text: (err as Error)?.message || String(err) });
    } finally {
      setBusyUid(null);
    }
  }, [tid, t, load, onChanged]);

  if (!active) return null;

  return (
    <div className="admin-card" style={{ padding: 18, marginBottom: 18 }}>
      <div className="admin-tile__label" style={{ marginBottom: 4 }}>
        {t('REVUE D’INTÉGRITÉ', 'REVI ENTEGRITE')}
      </div>
      <p className="admin-page__subtitle" style={{ marginTop: 0, fontSize: 12 }}>
        {t(
          'Un signalement n’est pas une preuve : une notification, un appel et une batterie faible ressemblent tous à une sortie d’application. Lisez les réponses avant de trancher.',
          'Yon siyal pa yon prèv : yon notifikasyon, yon apèl ak yon batri ki fèb sanble tout ak soti nan aplikasyon an. Li repons yo anvan ou tranche.',
        )}
      </p>

      {blockers.length > 0 ? (
        <p style={{ fontSize: 13, color: '#B54708' }}>
          {t('Finalisation bloquée — ', 'Finalizasyon bloke — ')}
          {blockerLines(blockers, 'fr').join(' · ')}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: '#067647' }}>
          {t('Rien ne bloque la finalisation.', 'Anyen pa bloke finalizasyon an.')}
        </p>
      )}

      {note ? (
        <p style={{ fontSize: 13, color: note.type === 'error' ? '#B42318' : '#067647' }}>{note.text}</p>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="admin-empty">{t('Chargement…', 'Ap chaje…')}</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty">{t('Personne à examiner.', 'Pa gen moun pou egzamine.')}</div>
      ) : (
        <div className="admin-table__scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('Rang', 'Ran')}</th>
                <th>{t('Élève', 'Elèv')}</th>
                <th>{t('Signalements', 'Siyal')}</th>
                <th>{t('Statut', 'Estati')}</th>
                <th aria-label={t('Actions', 'Aksyon')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.uid}>
                  <tr>
                    <td><strong>{row.rank ?? '—'}</strong></td>
                    <td>
                      {row.displayName || row.uid}
                      <div className="admin-page__subtitle" style={{ fontSize: 11 }}>
                        {row.schoolShort} · {row.score} pts
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.summary.total === 0 ? (
                        <span className="admin-page__subtitle">{t('aucun', 'okenn')}</span>
                      ) : (
                        <>
                          {row.summary.impossible > 0 ? (
                            <span style={{ color: '#B42318', fontWeight: 600 }}>
                              {t(`${row.summary.impossible} impossible`, `${row.summary.impossible} enposib`)}{' '}
                            </span>
                          ) : null}
                          {row.summary.fast > 0 ? t(`${row.summary.fast} rapide `, `${row.summary.fast} rapid `) : ''}
                          {row.summary.focus > 0
                            ? t(
                                `${row.summary.focus} sortie(s), max ${row.summary.worstFocusLosses}`,
                                `${row.summary.focus} soti, maks ${row.summary.worstFocusLosses}`,
                              )
                            : ''}
                          {/* A dead phone and a borrowed tablet look exactly
                              like two people splitting the questions. Shown
                              plainly, weighted like nothing. */}
                          {row.summary.device > 0 ? (
                            <div style={{ fontSize: 11 }}>
                              {t(
                                `${row.summary.device} changement(s) d’appareil`,
                                `${row.summary.device} chanjman aparèy`,
                              )}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.decision === 'disqualified' ? (
                        <span style={{ color: '#B42318', fontWeight: 600 }}>{t('disqualifié', 'diskalifye')}</span>
                      ) : row.decision === 'cleared' ? (
                        <span style={{ color: '#067647' }}>{t('examiné', 'egzamine')}</span>
                      ) : (
                        <span className="admin-page__subtitle">{t('à examiner', 'pou egzamine')}</span>
                      )}
                      {row.note ? (
                        <div className="admin-page__subtitle" style={{ fontSize: 11 }}>{row.note}</div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        disabled={busyUid === row.uid}
                        onClick={() => { void openEvidence(row.uid); }}
                      >
                        {openUid === row.uid ? t('Fermer', 'Fèmen') : t('Réponses', 'Repons')}
                      </button>{' '}
                      {row.eligible ? (
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          disabled={busyUid === row.uid || state === 'final'}
                          onClick={() => { void decide(row.uid, 'disqualified'); }}
                        >
                          {t('Disqualifier', 'Diskalifye')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn"
                          disabled={busyUid === row.uid || state === 'final'}
                          onClick={() => { void decide(row.uid, 'cleared'); }}
                        >
                          {t('Rétablir', 'Remèt')}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openUid === row.uid && evidence ? (
                    <tr>
                      <td colSpan={5} style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <table className="admin-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Q</th>
                              <th>{t('Réponse', 'Repons')}</th>
                              <th>{t('Temps', 'Tan')}</th>
                              <th>{t('Écart horloge', 'Diferans revèy')}</th>
                              <th>{t('Sorties', 'Soti')}</th>
                              <th>{t('Points', 'Pwen')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evidence.answers.map((a) => (
                              <tr key={a.index}>
                                <td>{a.index + 1}</td>
                                <td>
                                  {String.fromCharCode(65 + Math.max(0, a.choice))}
                                  {a.correct ? ' ✓' : ''}
                                  {a.late ? t(' (tardive)', ' (an reta)') : ''}
                                </td>
                                <td style={{ color: a.impossible ? '#B42318' : undefined, fontWeight: a.impossible ? 600 : undefined }}>
                                  {`${(a.elapsedMs / 1000).toFixed(1)}s`}
                                </td>
                                {/* What the phone claimed against what the server
                                    stamped. The gap IS the finding in most of
                                    these cases. */}
                                <td>
                                  {a.clientShownAt === null
                                    ? '—'
                                    : `${Math.round((a.clampedShownAt - a.clientShownAt) / 1000)}s`}
                                </td>
                                <td>{a.focusLosses || '—'}</td>
                                <td>{a.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {evidence.answers.length === 0 ? (
                          <div className="admin-empty">{t('Aucune réponse enregistrée.', 'Pa gen repons ki anrejistre.')}</div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Where the schools are ───────────────────────────────────────────────────

/**
 * SchoolLocationCard — the one place a human says where a school IS.
 *
 * The broadcast map needs a commune per school and there is no honest way to
 * compute one. `shared/data/schools-seed.json` ships 94 schools with NO
 * location on purpose: the version that had one derived it from applicants'
 * "Addresse de residence", which is where the STUDENT lives, and Saint-Louis
 * de Gonzague came out as two different schools because its applicants live all
 * over Port-au-Prince. Students board, move and cross communes to get to
 * school; the modal ville of forty players is a fact about forty players.
 *
 * So this screen is the entire data path, and its job is to make typing 94
 * communes bearable rather than to be clever. It shows the honest headline
 * ("94 écoles · 0 situées"), the most-attended schools first, and a commune
 * picked from the SAME list students pick their ville from — free text here
 * would produce a spelling the map cannot join and nobody would find out until
 * the school failed to appear on stream.
 *
 * One `<select>` is mounted at a time, for the row being edited. Ninety-four
 * selects of a hundred and forty communes is fourteen thousand DOM nodes on a
 * page an admin opens to change one thing.
 */
function SchoolLocationCard({ t }: { t: (fr: string, ht: string) => string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdminSchoolRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listSchoolsForLocation());
    } catch (err) {
      setNote({ type: 'error', text: (err as Error)?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && rows === null && !loading) void load();
  }, [open, rows, loading, load]);

  const filtered = useMemo(() => {
    const all = rows || [];
    const needle = fold(query);
    if (!needle) return all;
    return all.filter((r) => fold(`${r.name} ${r.shortName || ''} ${r.commune || ''}`).includes(needle));
  }, [rows, query]);

  const located = (rows || []).filter((r) => r.commune).length;

  const save = async (row: AdminSchoolRow, commune: string | null) => {
    setSaving(row.key);
    setNote(null);
    try {
      await setSchoolCommune(row.key, commune, row.name);
      // Only after the server agreed. An optimistic row would show a location
      // that is not stored anywhere, on the one screen whose entire purpose is
      // to be the record of what somebody actually said.
      setRows((prev) => (prev || []).map((r) => (
        r.key === row.key ? { ...r, commune, stored: true } : r
      )));
      setEditing(null);
    } catch (err) {
      const e = err as ArenaAdminError;
      setNote({
        type: 'error',
        text: e?.code === 'unauthorized'
          ? t('Réservé aux administrateurs.', 'Se pou administratè sèlman.')
          : (e?.message || String(err)),
      });
    } finally {
      setSaving(null);
    }
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--admin-border, #d9dde3)', fontSize: 13, background: '#fff',
  };

  return (
    <div className="admin-card" style={{ padding: 16, marginBottom: 20 }}>
      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MapPin size={14} aria-hidden="true" /> {t('Lieu des écoles', 'Kote lekòl yo ye')}
      </button>

      {open ? (
        <>
          <p className="admin-page__subtitle" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            {loading && rows === null
              ? t('Chargement des écoles…', 'Ap chaje lekòl yo…')
              : t(
                `${located} / ${(rows || []).length} écoles situées. Une école sans commune n’apparaît pas sur la carte — et ne doit jamais être devinée d’après le domicile de ses élèves.`,
                `${located} / ${(rows || []).length} lekòl gen kote yo ye. Yon lekòl san komin pa parèt sou kat la — epi nou pa janm devine l ak kote elèv yo rete.`,
              )}
          </p>

          {note ? (
            <p style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: note.type === 'error' ? '#B42318' : '#067647' }}>
              {note.text}
            </p>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <input
              type="search"
              style={input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Chercher une école…', 'Chèche yon lekòl…')}
              aria-label={t('Chercher une école', 'Chèche yon lekòl')}
            />
          </div>

          <div className="admin-table__scroll" style={{ marginTop: 12, maxHeight: 420, overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('École', 'Lekòl')}</th>
                  <th>{t('Commune', 'Komin')}</th>
                  <th aria-label={t('Actions', 'Aksyon')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.shortName ? (
                        <span className="admin-role-pill" style={{ marginLeft: 6 }}>{row.shortName}</span>
                      ) : null}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {editing === row.key ? (
                        <select
                          style={input}
                          defaultValue={row.commune || ''}
                          disabled={saving === row.key}
                          // The row's button was just pressed; focus follows it
                          // into the control that replaced it, so the picker is
                          // keyboard-usable across ninety-four rows.
                          autoFocus
                          onChange={(e) => void save(row, e.target.value || null)}
                          aria-label={t('Commune de l’école', 'Komin lekòl la')}
                        >
                          <option value="">{t('— Lieu inconnu —', '— Nou pa konnen —')}</option>
                          {HAITI_DEPARTMENTS.filter((d) => d.cities.length > 0).map((d) => (
                            <optgroup key={d.name} label={d.name}>
                              {d.cities.map((c) => <option key={c} value={c}>{c}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: row.commune ? 'inherit' : 'var(--asb-muted, #6B7A90)' }}>
                          {row.commune || t('Inconnu', 'Nou pa konnen')}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {saving === row.key ? (
                        <span className="admin-page__subtitle" style={{ fontSize: 12 }}>
                          {t('Enregistrement…', 'Ap anrejistre…')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => setEditing(editing === row.key ? null : row.key)}
                        >
                          {editing === row.key
                            ? t('Annuler', 'Anile')
                            : row.commune ? t('Modifier', 'Chanje') : t('Situer', 'Mete kote')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty">{t('Aucune école.', 'Pa gen lekòl.')}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

const CLAIM_STATE_COPY: Record<string, [string, string]> = {
  open: ['offert', 'ofri'],
  claimed: ['à vérifier', 'pou verifye'],
  verified: ['validé', 'valide'],
  rejected: ['refusé', 'refize'],
  expired: ['expiré', 'depase'],
};

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

  const reloadList = useCallback(async () => {
    try {
      setTournaments(await listTournaments());
    } catch (err) {
      console.error('[AdminArena] listTournaments failed:', err);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void reloadList(); }, [reloadList]);

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
          return t(
            'Override manuel : l’horloge avance toute seule.',
            'Ovèrayd manyèl : revèy la ap avanse pou kont li.',
          );
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

  /*
   * What `final` was refused on, kept only until the next press.
   *
   * The override is deliberately UNREACHABLE until the host has been refused
   * once and has read what they would be overriding. A button that offers to
   * skip the check before anyone knows what the check found is not a gate with
   * an escape hatch; it is two buttons that do the same thing.
   */
  const [refusedBlockers, setRefusedBlockers] = useState<FinalBlocker[] | null>(null);

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
    /*
     * `final` refused. The list IS the message: a host who is told
     * "finalisation refused" has to go looking, and this is the press they
     * make at the end of a long night.
     */
    if (e?.code === 'verification_incomplete') {
      setRefusedBlockers(e.blockers ?? []);
      setMessage({ type: 'error', text: t(
        `Finalisation refusée — ${blockerLines(e.blockers ?? [], 'fr').join(' · ')}`,
        `Refize finalize — ${blockerLines(e.blockers ?? [], 'ht').join(' · ')}`,
      ) });
      return;
    }
    if (e?.code === 'reason_required') {
      setMessage({ type: 'error', text: t(
        'Il faut une raison écrite.',
        'Fòk gen yon rezon ki ekri.',
      ) });
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
          'Refusé : le serveur n’a pas reconnu votre compte administrateur. Déploiement mal configuré.',
          'Refize : sèvè a pa rekonèt kont administratè ou. Deplwaman an mal konfigire.',
        ),
      });
      return;
    }
    setMessage({ type: 'error', text: (e?.message || String(err)) });
  }, [t]);

  const runTransition = useCallback(async (
    control: ArenaControl,
    to: ArenaState,
    opts?: { reason?: string; override?: boolean },
  ) => {
    if (!tournament) return;
    setBusy(control);
    setMessage(null);
    setRefusedBlockers(null);
    try {
      await requestTransition(tournament.id, tournament.state, to, opts?.reason, opts?.override);
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
    // No confirmation on the two pacing controls. They used to be framed as an
    // emergency override of an automatic clock — but that clock does not run at
    // broadcast speed (see the note at the top of this file), so these are what
    // actually moves a tournament through its questions. A modal in front of
    // every press is roughly fifty modals a night, in front of the one person
    // who cannot afford to be slowed down.
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

        <NewTournamentCard t={t} onCreated={reloadList} />

        <SchoolLocationCard t={t} />

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
          {refusedBlockers && refusedBlockers.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className="admin-btn admin-btn--danger"
                disabled={busy === 'finalise'}
                onClick={() => {
                  const typed = window.prompt(t(
                    'Finaliser malgré ces points non résolus ? Écrivez pourquoi — la raison et la liste exacte sont enregistrées sur le tournoi.',
                    'Finalize malgre bagay sa yo ki pa rezoud ? Ekri poukisa — rezon an ak lis la ap anrejistre sou tounwa a.',
                  ));
                  if (typed === null || typed.trim().length < 4) return;
                  void runTransition('finalise', 'final', { reason: typed.trim(), override: true });
                }}
              >
                {t('Finaliser malgré tout', 'Finalize kanmenm')}
              </button>
            </div>
          ) : null}
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
          {t('RYTHME DU DIRECT — C’EST VOUS QUI PILOTEZ', 'RITM DIRÈK LA — SE OU MENM K AP PILOTE')}
        </div>
        <p className="admin-page__subtitle" style={{ marginBottom: 12, fontSize: 12 }}>
          {t(
            'C’est vous qui donnez le rythme : ces commandes ferment la question en cours et ouvrent la suivante, une étape à la fois. La cadence prévue est de 20 s de question puis une pause d’environ 10 s, qui laisse arriver les réponses tardives et révèle la bonne réponse. Une tâche planifiée avance le tournoi une fois par minute : c’est un filet de sécurité pour qu’un tournoi ne se bloque jamais, pas l’horloge du direct — elle est trop lente pour ça.',
            'Se ou menm ki bay ritm lan : kòmand sa yo fèmen kesyon an epi louvri pwochen an, yon etap alafwa. Kadans ki prevwa a se 20 s kesyon apre sa yon poz apeprè 10 s, ki kite repons an reta yo rive epi ki montre bon repons lan. Gen yon travay pwograme ki fè tounwa a avanse yon fwa chak minit : se yon filè sekirite pou tounwa a pa janm bloke, se pa revèy dirèk la — li twò lan pou sa.',
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
              {t(
                'Le classement se recalcule à chaque fermeture de question.',
                'Klasman an rekalkile chak fwa yon kesyon fèmen.',
              )}
            </span>
          </div>
        </div>
      </div>

      <IntegrityQueue tid={tid} state={tournament.state} t={t} />

      <ClaimQueue tid={tid} t={t} locale={locale} />

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
