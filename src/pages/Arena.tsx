import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Smartphone, ChevronRight, Plus, Laptop, Trophy, Play, Swords, LogIn } from '../components/icons';
import { PLAY_TO, PLAY_STATE, DUEL_STATE } from '../components/arena/lobby/LobbyStrip';
import useStore from '../contexts/store';
import { useOpenArena } from '../hooks/useOpenArena';
import { usePlayableArena } from '../hooks/useArenaPlay';
import ArenaRegisterForm from '../components/arena/ArenaRegisterForm';
import ArenaPageHead from '../components/arena/ArenaPageHead';
import { ARENA_WEB_PLAY } from '../../shared/arena/webPlay';
import MySchoolCard from '../components/MySchoolCard';
import SchoolRanking from '../components/SchoolRanking';
import Avatar from '../arena-art/avatars/Avatar';
import SchoolCrest, { schoolColors } from '../arena-art/crest/SchoolCrest';
import SchoolBuilding from '../components/arena/SchoolBuilding';
import { splitPodium } from '../components/arena/lobby/podium';
import { GRADES } from '../../shared/trackConfig';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useCollectives } from '../hooks/useLeaderboard';
import { normalizeName, rankTeams, teamStandingFor, TEAM_SIZE } from '../../shared/leaderboardAgg';
import { GAMES } from '../data/games';
import './Arena.css';
import './ArenaLeague.css';

/**
 * /arena — the championship's permanent home on the web.
 *
 * This route used to be `<Navigate to="/download" />`: every link about the
 * championship threw a visitor at a QR code. Reported twice — "there's no
 * clear message and all", then "arène does not let me register my school".
 *
 * Ted's rule, 2026-09-21: "only the play is now allowed on website, everything
 * else is." So a student registers here, sees their school's progress here,
 * and installs the app to actually play. AMENDED 2026-10-10 ("for now let
 * people play on laptops as well"): with `ARENA_WEB_PLAY` on, the play room is
 * /arena/jouer and this page sends students there once an edition is in
 * doors or live; the app stays the secondary option. Flip the flag off and
 * every play link below falls back to the app. That order matters: registering is
 * cheap and can happen the moment interest strikes, on a school computer or a
 * borrowed laptop; installing is the expensive step and it has days to happen.
 *
 * WHAT THIS PAGE MAY NEVER IMPLY: that registering is enough. Qualification is
 * measured at doors close on players PRESENT, so a student who registers and
 * never opens the app is a no-show who contributes nothing to their school's
 * five. The app requirement is stated before the button and again after it.
 *
 * Layout (premium pass, 2026-10-17), wired to real data only: the shared
 * ArenaPageHead title row (no boxed header, no stat strip above the content),
 * a two-way switch — "Mon école" with the school's own board and the Cinq
 * Majeur line (a school scores on its best five, the rule `rankTeams`
 * applies) and "Entre écoles" with best-five standings — then the national
 * finale card for the real open edition, or an honest wait that leads to the
 * demo. The side column holds the school race and the student's own record
 * (ranks from the all-time school board, XP, streak). Content sits on the
 * night; the finale is the one card, because it is the thing you act on. The
 * old mockup's live rooms, class pools, opponents, captains, prizes, tickets
 * and multipliers do not exist and are not drawn.
 */
export default function Arena() {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const storedGrade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const open = useOpenArena();
  /* An edition whose room is open or whose questions are running — the
     moment this page's job changes from "sign up" to "come in and play". */
  const playable = usePlayableArena(ARENA_WEB_PLAY);
  const playNow = ARENA_WEB_PLAY && playable && (playable.state === 'doors' || playable.state === 'live')
    ? playable
    : null;
  const playHref = (id: string) => `/arena/jouer/${encodeURIComponent(id)}`;

  const [done, setDone] = useState<null | { school: string }>(null);
  const [tab, setTab] = useState<'school' | 'inter'>('school');

  const signedIn = !!user?.uid;

  /**
   * The date, only while it is still ahead.
   *
   * A tournament sits in `registration` until an admin advances it, so a start
   * time can slip into the past while sign-up is still open — and the page was
   * then announcing "Prochaine édition : vendredi 18 septembre" on the 21st.
   * A date that has gone is worse than no date: it reads as a dead event.
   */
  const dateLabel = open?.startsAt && open.startsAt > Date.now()
    ? new Date(open.startsAt).toLocaleDateString(isCreole ? 'fr-HT' : 'fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    : null;

  // ── The league, from the same all-time school board the ranking uses ──
  // Every number below is read from it or from the student's own profile.
  const { profile, level } = useTrivia();
  const { streak } = useStreak();
  const { groups, isLoading: boardLoading } = useCollectives('school', 'all');
  const mySchool: string | null = signedIn ? profile?.leaderboard?.school || null : null;
  const myDept: string | null = signedIn ? profile?.leaderboard?.department || null : null;
  const mine = mySchool ? groups.find((g) => g.key === normalizeName(mySchool)) || null : null;
  const standings = useMemo(() => rankTeams(groups), [groups]);
  const myTeam = mySchool ? teamStandingFor(standings, mySchool) : null;
  // Steps and numbers are for qualified schools only (audit W4).
  const board = useMemo(() => splitPodium(standings, { maxRanked: 12, maxForming: 12 }), [standings]);
  const members = mine?.topMembers || [];
  const myIndex = signedIn ? members.findIndex((m) => m.uid === user?.uid) : -1;
  const fifthXp = members.length >= TEAM_SIZE ? members[TEAM_SIZE - 1].xp : null;
  const gapToFive = myIndex >= TEAM_SIZE && fifthXp !== null
    ? Math.max(1, fifthXp - members[myIndex].xp + 1)
    : null;
  const gradeRow = GRADES.find((g) => g.code === storedGrade);
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
  const highScores = (profile?.games?.highScores || {}) as Record<string, number>;
  const gamesPlayed = profile?.games?.gamesPlayed || 0;
  const days = streak?.currentStreak || 0;
  const editionTitle = open ? (isCreole && open.titleHt ? open.titleHt : open.title) : null;

  /* The registration block. Only while an edition is open; after a
     successful registration it becomes the "done" card, which points at the
     play room when web play is on and at the app otherwise. */
  const registration = done && open ? (
    <div className="arena-page__done" role="status">
      <span className="arena-page__done-icon"><Check size={20} aria-hidden="true" /></span>
      <h2>{t('Vous êtes inscrit', 'Ou enskri')}</h2>
      {ARENA_WEB_PLAY ? (
        <>
          <p>
            {t(
              `${done.school} — votre place est enregistrée. Le jour J, revenez ici et entrez dans la salle (ou jouez dans l’application, avec le même compte) : votre école ne compte que les élèves réellement présents.`,
              `${done.school} — plas ou anrejistre. Jou a, tounen isit la epi antre nan sal la (oswa jwe nan aplikasyon an, ak menm kont lan) : lekòl ou konte sèlman elèv ki reyèlman prezan.`,
            )}
          </p>
          <div className="arena-page__done-actions">
            <Link to={playHref(open.id)} className="button button--primary">
              <Laptop size={16} aria-hidden="true" /> {t('Entrer dans la salle', 'Antre nan sal la')}
            </Link>
            <Link to="/download?from=arena" className="button button--ghost">
              <Smartphone size={16} aria-hidden="true" /> {t('Jouer dans l’application', 'Jwe nan aplikasyon an')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p>
            {t(
              `${done.school} — votre place est enregistrée. Installez l’application et connectez-vous avec le même compte : le jour J, votre école ne compte que les élèves réellement présents.`,
              `${done.school} — plas ou anrejistre. Enstale aplikasyon an epi konekte ak menm kont lan : jou a, lekòl ou konte sèlman elèv ki reyèlman prezan.`,
            )}
          </p>
          <Link to="/download?from=arena" className="button button--primary">
            {t('Installer l’application', 'Enstale aplikasyon an')}
          </Link>
        </>
      )}
    </div>
  ) : open ? (
    <ArenaRegisterForm
      tournamentId={open.id}
      isCreole={isCreole}
      onRegistered={(school) => setDone({ school })}
    />
  ) : null;


  const fiveLine = !signedIn
    // The sign-in ask lives once, in the title row; this line only explains.
    ? t(`Une école est classée sur ses ${TEAM_SIZE} meilleurs élèves. Une fois connecté, l’équipe de la tienne s’affiche ici.`, `Yon lekòl klase sou ${TEAM_SIZE} pi bon elèv li yo. Lè w konekte, ekip lekòl ou ap parèt isit la.`)
    : !mySchool
      ? t('Ajoute ton école pour voir son équipe.', 'Ajoute lekòl ou pou wè ekip li.')
      : !myTeam
        ? t('Ton école n’a pas encore de points au classement. Joue une partie pour l’y faire entrer.', 'Lekòl ou poko gen pwen nan klasman an. Jwe yon pati pou fè l antre.')
        : myTeam.qualified
          ? t(
            `Équipe complète : ${nf(myTeam.teamXp)} XP sur ses ${TEAM_SIZE} meilleurs — #${myTeam.rank} des écoles qualifiées.`,
            `Ekip la konplè : ${nf(myTeam.teamXp)} XP sou ${TEAM_SIZE} pi bon li yo — #${myTeam.rank} pami lekòl ki kalifye yo.`,
          )
          : t(
            `Il manque ${myTeam.needed} joueur${myTeam.needed > 1 ? 's' : ''} pour que ton école soit classée. Invite ta classe.`,
            `Li manke ${myTeam.needed} jwè pou lekòl ou ka klase. Envite klas ou.`,
          );

  /* No finale scheduled (and none loading): the page leads with what can be
     done today (audit W5). The big trophy stage waits for a real event. */
  const idle = open === null && !playNow;

  /* The page's one main action, in the shared title row. */
  const headAction = playNow ? (
    <Link to={playHref(playNow.id)} className="an-go">
      <Laptop size={18} aria-hidden="true" />
      {playNow.state === 'live' ? t('Jouer maintenant', 'Jwe kounye a') : t('Entrer dans la salle', 'Antre nan sal la')}
    </Link>
  ) : !signedIn && idle ? (
    // Playing needs no account; signing in is offered once, in the card below.
    <Link to={PLAY_TO} state={PLAY_STATE} className="an-go">
      <Play size={18} aria-hidden="true" /> {t('Jouer une partie', 'Jwe yon pati')}
    </Link>
  ) : !signedIn ? (
    <button type="button" className="an-go" onClick={toggleAuthModal}>
      {t('Se connecter', 'Konekte')}
    </button>
  ) : !mySchool ? (
    <button type="button" className="an-go" onClick={() => setSchoolChosen(false)}>
      <Plus size={18} aria-hidden="true" /> {t('Ajouter mon école', 'Ajoute lekòl mwen')}
    </button>
  ) : open && !done ? (
    <a href="#arena-inscription" className="an-go">
      {t('Inscrire mon école', 'Enskri lekòl mwen')}
    </a>
  ) : (
    <Link to="/jeux" className="an-go">
      {t('Gagner des points', 'Genyen pwen')}
    </Link>
  );

  /* One sentence under the title: the open edition when there is one,
     otherwise what the championship is. */
  const headSub = open
    ? (dateLabel
      ? t(`${editionTitle} — le ${dateLabel}.`, `${editionTitle} — ${dateLabel}.`)
      : open.state === 'doors'
        ? t(`${editionTitle} — les portes sont ouvertes.`, `${editionTitle} — pòt yo louvri.`)
        : t(`${editionTitle} — les inscriptions sont ouvertes.`, `${editionTitle} — enskripsyon yo ouvè.`))
    : t(
      'Ton école contre les autres, tous les jours : chaque partie, quiz et examen compte.',
      'Lekòl ou kont lòt yo, chak jou : chak pati, quiz ak egzamen konte.',
    );

  const schoolMeta = mySchool
    ? [myDept, gradeRow ? (isCreole ? gradeRow.labelHt : gradeRow.label) : null].filter(Boolean).join(' · ')
    : '';

  return (
    <section className="section arena-page arena-champ">
      <div className="container arena-page__container">
        <ArenaPageHead
          title={t('Championnat', 'Chanpyona')}
          sub={headSub}
          actions={(
            <>
              {headAction}
              <Link to="/classement" className="an-ghost">
                {t('Classement complet', 'Tout klasman an')}
              </Link>
            </>
          )}
        />

        {/* ── The national finale: the real edition, or the honest wait ── */}
        <section className={`arena-national${playNow ? ` is-${playNow.state}` : ''}${idle ? ' is-idle' : ''}`} aria-labelledby="arena-national-title">
          {/* The stage: spotlights on the trophy, the crowd in the dark — the
              Arène's own art, so the one prize event on the site looks like an
              occasion rather than a paragraph. Decorative only. */}
          {!idle && (
          <div className="arena-stage" aria-hidden="true">
            <span className="arena-stage__beam arena-stage__beam--l" />
            <span className="arena-stage__beam arena-stage__beam--r" />
            <span className="arena-stage__trophy"><Trophy size={64} weight="fill" /></span>
            <span className="arena-stage__crowd" />
          </div>
          )}
          <div className="arena-national__body">
          {idle ? (
            <>
              {/* Nothing scheduled: say so plainly, then the three things a
                  student can do right now — everyday play (the title row),
                  a friend challenge, and the finale as a labelled demo. */}
              <p className="arena-national__tag">
                <span className="arena-national__medal" aria-hidden="true"><Trophy size={18} weight="fill" /></span>
                {t('Finale nationale · pas encore programmée', 'Final nasyonal · poko pwograme')}
              </p>
              <h2 id="arena-national-title">{t('La prochaine finale en direct sera annoncée ici.', 'N ap anonse pwochen final an dirèk la isit la.')}</h2>
              <div className="arena-national__actions arena-national__actions--lead">
                <Link to={PLAY_TO} state={DUEL_STATE} className="arena-national__ghost an-ghost">
                  <Swords size={18} aria-hidden="true" /> {t('Défier un ami', 'Defye yon zanmi')}
                </Link>
                <Link to="/arena/demo" className="arena-national__ghost an-ghost">
                  <span className="arena-national__badge">{t('Démo', 'Demo')}</span>
                  {t('Voir une finale simulée', 'Gade yon final simile')} <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </div>
              <p>
                {ARENA_WEB_PLAY
                  ? t(
                    'Une fois par mois, les écoles s’affrontent en direct, sur ordinateur ou dans l’application. En attendant, chaque partie compte au classement.',
                    'Yon fwa pa mwa, lekòl yo afwonte an dirèk, sou òdinatè oswa nan aplikasyon an. Pandan n ap tann, chak pati konte nan klasman an.',
                  )
                  : t(
                    'Une fois par mois, les écoles s’affrontent en direct dans l’application. En attendant, chaque partie compte au classement.',
                    'Yon fwa pa mwa, lekòl yo afwonte an dirèk nan aplikasyon an. Pandan n ap tann, chak pati konte nan klasman an.',
                  )}
              </p>
              {!signedIn && (
                <button type="button" className="arena-national__signin" onClick={toggleAuthModal}>
                  <LogIn size={18} aria-hidden="true" /> {t('Connecte-toi pour que tes points comptent pour ton école', 'Konekte pou pwen ou konte pou lekòl ou')}
                </button>
              )}
            </>
          ) : playNow ? (
            <>
              {/* The room is open or the questions are running: this card's
                  one job is now to get the student into the play room. */}
              <p className="arena-national__tag">
                {playNow.state === 'live' ? t('En direct', 'An dirèk') : t('Portes ouvertes', 'Pòt yo louvri')}
              </p>
              <h2 id="arena-national-title">
                {isCreole && playNow.titleHt ? playNow.titleHt : playNow.title}
              </h2>
              <p>
                {playNow.state === 'live'
                  ? t(
                    'Les questions sont en cours. Entre dans la salle depuis cet ordinateur, ou ouvre l’application avec le même compte.',
                    'Kesyon yo ap pase kounye a. Antre nan sal la sou òdinatè sa a, oswa louvri aplikasyon an ak menm kont lan.',
                  )
                  : t(
                    'La salle est ouverte. Entre maintenant — ton école ne compte que les élèves présents avant le départ.',
                    'Sal la louvri. Antre kounye a — lekòl ou konte sèlman elèv ki prezan anvan kòmansman an.',
                  )}
              </p>
              <div className="arena-national__actions">
                <Link to={playHref(playNow.id)} className="arena-national__cta">
                  {t('Entrer dans la salle', 'Antre nan sal la')} <ChevronRight size={18} aria-hidden="true" />
                </Link>
                <Link to="/download?from=arena" className="arena-national__ghost an-ghost">
                  <Smartphone size={18} aria-hidden="true" /> {t('L’application', 'Aplikasyon an')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="arena-national__tag">
                {open
                  ? (open.state === 'doors' ? t('Portes ouvertes', 'Pòt yo louvri') : t('Inscriptions ouvertes', 'Enskripsyon ouvè'))
                  : t('Finale nationale', 'Final nasyonal')}
              </p>
              <h2 id="arena-national-title">
                {open ? editionTitle : t('La prochaine finale en direct sera annoncée ici.', 'N ap anonse pwochen final an dirèk la isit la.')}
              </h2>
              <p>
                {open
                  ? `${dateLabel ? t(`Le ${dateLabel}. `, `${dateLabel}. `) : ''}${ARENA_WEB_PLAY
                    ? t(
                      'Les questions se jouent ici, sur ordinateur, ou dans l’application ; ton école ne compte que les élèves présents.',
                      'Kesyon yo jwe isit la, sou òdinatè, oswa nan aplikasyon an ; lekòl ou konte sèlman elèv ki prezan.',
                    )
                    : t(
                      'Les questions se jouent dans l’application ; ton école ne compte que les élèves présents.',
                      'Kesyon yo jwe nan aplikasyon an ; lekòl ou konte sèlman elèv ki prezan.',
                    )}`
                  : ARENA_WEB_PLAY
                    ? t(
                      'Une fois par mois, les écoles s’affrontent en direct, sur ordinateur ou dans l’application. En attendant, chaque partie compte au classement.',
                      'Yon fwa pa mwa, lekòl yo afwonte an dirèk, sou òdinatè oswa nan aplikasyon an. Pandan n ap tann, chak pati konte nan klasman an.',
                    )
                    : t(
                      'Une fois par mois, les écoles s’affrontent en direct dans l’application. En attendant, chaque partie compte au classement.',
                      'Yon fwa pa mwa, lekòl yo afwonte an dirèk nan aplikasyon an. Pandan n ap tann, chak pati konte nan klasman an.',
                    )}
              </p>
              <div className="arena-national__actions">
                {open && !done ? (
                  <a href="#arena-inscription" className="arena-national__cta">
                    {t('S’inscrire', 'Enskri')} <ChevronRight size={18} aria-hidden="true" />
                  </a>
                ) : open && done && ARENA_WEB_PLAY ? (
                  <Link to={playHref(open.id)} className="arena-national__cta">
                    {t('Entrer dans la salle', 'Antre nan sal la')} <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                ) : open ? (
                  <Link to="/jeux" className="arena-national__cta">
                    {t('Jouer maintenant', 'Jwe kounye a')} <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                ) : (
                  /* No finale scheduled: the one thing worth doing here is
                     to try the evening itself — the full simulated finale,
                     on the real broadcast, at /arena/demo. Practice games
                     stay one step away. */
                  <>
                    {/* Secondary: the title row already carries the page's one
                        coral action. */}
                    <Link to="/arena/demo" className="arena-national__ghost an-ghost">
                      {t('Essayer la finale en démo', 'Eseye final la an demo')} <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                    <Link to="/jeux" className="arena-national__ghost an-ghost">
                      {t('Jouer maintenant', 'Jwe kounye a')}
                    </Link>
                  </>
                )}
                {open && (
                  <Link to="/download?from=arena" className="arena-national__ghost an-ghost">
                    <Smartphone size={18} aria-hidden="true" /> {t('L’application', 'Aplikasyon an')}
                  </Link>
                )}
              </div>
            </>
          )}
          </div>
        </section>

        {/* How the championship works — the real rules, three lines. */}
        <ol className="arena-how" aria-label={t('Comment ça marche', 'Kijan sa mache')}>
          <li>
            <strong>{t('Ton école joue toute l’année', 'Lekòl ou jwe tout ane a')}</strong>
            <span>{t('Chaque partie, quiz et examen de ses élèves compte au classement.', 'Chak pati, quiz ak egzamen elèv li yo konte nan klasman an.')}</span>
          </li>
          <li>
            <strong>{t(`${TEAM_SIZE} joueurs pour être classée`, `${TEAM_SIZE} jwè pou l kalifye`)}</strong>
            <span>{t(`L’école compte ses ${TEAM_SIZE} meilleurs : invite ta classe.`, `Lekòl la konte ${TEAM_SIZE} pi bon yo : envite klas ou.`)}</span>
          </li>
          <li>
            <strong>{t('Une finale en direct par mois', 'Yon final an dirèk chak mwa')}</strong>
            <span>{t('Les écoles s’affrontent sur les mêmes questions, au même moment.', 'Lekòl yo afwonte sou menm kesyon yo, an menm tan.')}</span>
          </li>
        </ol>

        {/* ── Two views: the student's school, or every school ─────────── */}
        <div className="arena-switch" role="tablist" aria-label={t('Vue', 'Vi')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'school'}
            className={`arena-switch__tab${tab === 'school' ? ' is-on' : ''}`}
            onClick={() => setTab('school')}
          >
            {t('Mon école', 'Lekòl mwen')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inter'}
            className={`arena-switch__tab${tab === 'inter' ? ' is-on' : ''}`}
            onClick={() => setTab('inter')}
          >
            {t('Entre écoles', 'Ant lekòl yo')}
          </button>
        </div>

        <div className="arena-grid">
          <div className="arena-main">
            {tab === 'school' ? (
              <>
                {/* The Cinq Majeur: a school scores on its best five, so the
                    number worth chasing is how many players are missing. */}
                <section className="arena-block" aria-labelledby="arena-five-title">
                  <h2 id="arena-five-title" className="arena-block__title">
                    {mySchool
                      ? t(`Le Cinq Majeur de ${mySchool}`, `Senk Majè ${mySchool}`)
                      : t('Le Cinq Majeur de ton école', 'Senk Majè lekòl ou')}
                  </h2>
                  {schoolMeta && <p className="arena-block__meta">{schoolMeta}</p>}
                  <p className="arena-block__text">{fiveLine}</p>

                  {/* Until there is a team to show, show the shape of one: five
                      seats — what "a school counts its best five" means. */}
                  {!(mySchool && mine && members.length > 0) && (
                    <ol className="arena-seats" aria-label={t(`${TEAM_SIZE} places dans l’équipe`, `${TEAM_SIZE} plas nan ekip la`)}>
                      {Array.from({ length: TEAM_SIZE }, (_, i) => (
                        <li key={i}><span className="arena-seats__seat" aria-hidden="true"><Plus size={18} /></span><span>{i + 1}</span></li>
                      ))}
                    </ol>
                  )}

                  {mySchool && mine && members.length > 0 && (
                    <>
                      <div className="arena-block__row">
                        <h3 className="arena-block__sub">{t('Top de ton école', 'Tèt lekòl ou')}</h3>
                        <span className="arena-block__meta">
                          {mine.members} {mine.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv')}
                        </span>
                      </div>
                      <ol className="arena-board">
                        {members.slice(0, Math.max(TEAM_SIZE + 3, myIndex + 1)).map((m, i) => (
                          <React.Fragment key={m.uid || `${m.displayName}-${i}`}>
                            {i === TEAM_SIZE && (
                              <li className="arena-board__line" aria-hidden="true">
                                {t('Seuil du Cinq Majeur', 'Limit Senk Majè a')}
                              </li>
                            )}
                            <li className={`arena-board__row${i < TEAM_SIZE ? ' is-five' : ''}${m.uid && m.uid === user?.uid ? ' is-me' : ''}`}>
                              <span className="arena-board__pos">{i + 1}</span>
                              <span className="arena-board__avatar" aria-hidden="true"><Avatar seed={m.uid || m.displayName || 'eleve'} config={m.avatar} size={36} still colors={mySchool ? schoolColors(mySchool) : undefined} /></span>
                              <span className="arena-board__name">
                                {m.displayName}
                                {m.uid && m.uid === user?.uid && <em>{t('toi', 'ou')}</em>}
                              </span>
                              <span className="arena-board__xp">{nf(m.xp)} XP</span>
                            </li>
                          </React.Fragment>
                        ))}
                      </ol>
                      {gapToFive !== null && (
                        <p className="arena-block__foot">
                          {t(
                            `Encore ${nf(gapToFive)} XP pour entrer dans le Cinq Majeur.`,
                            `Ou bezwen ${nf(gapToFive)} XP ankò pou antre nan Senk Majè a.`,
                          )}
                        </p>
                      )}
                      {myIndex < 0 && (
                        <p className="arena-block__foot">
                          {t(
                            'Tu n’apparais pas encore ici : choisis un pseudo et joue une partie.',
                            'Ou poko parèt isit la : chwazi yon ti non epi jwe yon pati.',
                          )}{' '}
                          <Link to="/profile#reglages">{t('Choisir un pseudo', 'Chwazi yon ti non')}</Link>
                        </p>
                      )}
                    </>
                  )}
                </section>
                {signedIn && <MySchoolCard where="arena" />}
              </>
            ) : (
              <section className="arena-block" aria-labelledby="arena-teams-title">
                <h2 id="arena-teams-title" className="arena-block__title">{t('Classement des équipes', 'Klasman ekip yo')}</h2>
                <p className="arena-block__text">
                  {t(
                    `Chaque école est classée sur ses ${TEAM_SIZE} meilleurs joueurs : c’est pour ça qu’inviter sa classe compte.`,
                    `Chak lekòl klase sou ${TEAM_SIZE} pi bon jwè li yo : se pou sa envite klas ou enpòtan.`,
                  )}
                </p>
                {boardLoading ? (
                  <p className="arena-block__foot">{t('Chargement…', 'N ap chaje…')}</p>
                ) : standings.length === 0 ? (
                  <div className="arena-block__empty">
                    <p className="arena-block__text">
                      {t('Aucune école classée pour l’instant — la première place est libre.', 'Poko gen lekòl nan klasman an — premye plas la lib.')}
                    </p>
                    <Link to="/jeux" className="an-go">{t('Jouer une partie', 'Jwe yon pati')}</Link>
                  </div>
                ) : (
                  <>
                  {/* The podium: the three leading QUALIFIED schools. Fewer than
                      three qualified → no ceremonial steps, just their rows. */}
                  {board.podium.length === 3 && (
                  <ol className="arena-podium" aria-label={t('Les trois premières écoles qualifiées', 'Twa premye lekòl ki kalifye yo')}>
                    {[board.podium[1], board.podium[0], board.podium[2]].map((s, col) => (
                      <li key={s.key} className={`arena-podium__step arena-podium__step--${col === 1 ? 1 : col === 0 ? 2 : 3}`}>
                        <SchoolBuilding name={s.label} night cell={col === 1 ? 6 : 5} />
                        <span className="arena-podium__place">{s.rank}</span>
                        <span className="arena-podium__name">{s.label}</span>
                        <span className="arena-podium__xp">{nf(s.teamXp)} XP</span>
                      </li>
                    ))}
                  </ol>
                  )}
                  {board.ranked.length > 0 && (
                  <ol className="arena-teams" aria-label={t('Écoles qualifiées', 'Lekòl ki kalifye')}>
                    {board.ranked.map((s) => (
                      <li key={s.key} className={`arena-teams__row${myTeam?.key === s.key ? ' is-me' : ''}`}>
                        <span className="arena-board__pos">{s.rank}</span>
                        <span className="arena-teams__crest"><SchoolCrest name={s.label} size={32} /></span>
                        <span className="arena-teams__name">
                          {s.label}
                          <small>{t(`${s.members} élèves · équipe complète`, `${s.members} elèv · ekip konplè`)}</small>
                        </span>
                        <span className="arena-board__xp">{nf(s.teamXp)} XP</span>
                      </li>
                    ))}
                  </ol>
                  )}
                  {/* Still recruiting: listed, never numbered as a placement. */}
                  {board.forming.length > 0 && (
                    <div className="arena-forming">
                      <h3 className="arena-block__sub">{t('En formation', 'Ap fòme')}</h3>
                      <p className="arena-block__meta">{t(`Pas encore classées : il faut ${TEAM_SIZE} joueurs.`, `Poko klase : fòk gen ${TEAM_SIZE} jwè.`)}</p>
                      <ul className="arena-teams arena-teams--forming">
                        {board.forming.map((s) => (
                          <li key={s.key} className={`arena-teams__row is-short${myTeam?.key === s.key ? ' is-me' : ''}`}>
                            <span className="arena-teams__crest"><SchoolCrest name={s.label} size={32} /></span>
                            <span className="arena-teams__name">
                              {s.label}
                              <small>{t(`il manque ${s.needed}`, `manke ${s.needed}`)}</small>
                            </span>
                            <span className="arena-board__xp">{`${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </>
                )}
              </section>
            )}


            {open === undefined && (
              // Not "nothing is open" — not known yet.
              <div className="arena-page__loading" role="status" aria-live="polite">
                <span className="arena-page__spinner" aria-hidden="true" />
                <p>{t('Chargement du championnat…', 'N ap chaje chanpyona a…')}</p>
              </div>
            )}
            {registration}
          </div>

          {/* ── Side column: the school race, then the student's own record ── */}
          <aside className="arena-side">
            <SchoolRanking max={8} />
            {signedIn && (
              <section className="arena-block arena-bilan" aria-labelledby="arena-bilan-title">
                <h2 id="arena-bilan-title" className="arena-block__title">{t('Mon bilan', 'Bilan mwen')}</h2>
                <dl className="arena-bilan__list">
                  <div>
                    <dt>{t('Rang dans ton école', 'Plas ou nan lekòl ou')}</dt>
                    <dd>{myIndex >= 0 ? `#${myIndex + 1}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('Rang national de l’école', 'Plas lekòl la nan peyi a')}</dt>
                    <dd>{mine ? `#${mine.rank}` : '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('Tes points', 'Pwen ou')}</dt>
                    <dd>{nf(profile?.xp || 0)} XP · {t('niv.', 'niv.')} {level?.level || 1}</dd>
                  </div>
                  <div>
                    <dt>{t('Parties jouées', 'Pati ou jwe')}</dt>
                    <dd>{nf(gamesPlayed)}</dd>
                  </div>
                  <div>
                    <dt>{t('Série', 'Seri')}</dt>
                    <dd>{days} {t(days === 1 ? 'jour' : 'jours', 'jou')}</dd>
                  </div>
                  {GAMES.filter((g) => highScores[g.id]).map((g) => (
                    <div key={g.id}>
                      <dt>{t(`Record · ${g.name}`, `Rekò · ${g.nameHt}`)}</dt>
                      <dd>{nf(highScores[g.id])}</dd>
                    </div>
                  ))}
                </dl>
                <Link to="/jeux" className="arena-block__link">
                  {t('Faire monter mon école', 'Fè lekòl mwen monte')} <ChevronRight size={16} aria-hidden="true" />
                </Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
