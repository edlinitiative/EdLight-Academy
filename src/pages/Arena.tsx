import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Swords, GraduationCap, Check, Smartphone, School as SchoolIcon, Trophy, Globe, Sparkles, Flame,
  ChevronRight, Users, Plus, Gamepad2,
} from '../components/icons';
import useStore from '../contexts/store';
import { useOpenArena } from '../hooks/useOpenArena';
import { registerForTournament, registerErrorMessage } from '../services/arenaWebService';
import SchoolField from '../components/arena/SchoolField';
import MySchoolCard from '../components/MySchoolCard';
import SchoolRanking from '../components/SchoolRanking';
import PixelAvatar from '../components/PixelAvatar';
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
 * and installs the app to actually play. That order matters: registering is
 * cheap and can happen the moment interest strikes, on a school computer or a
 * borrowed laptop; installing is the expensive step and it has days to happen.
 *
 * WHAT THIS PAGE MAY NEVER IMPLY: that registering is enough. Qualification is
 * measured at doors close on players PRESENT, so a student who registers and
 * never opens the app is a no-show who contributes nothing to their school's
 * five. The app requirement is stated before the button and again after it.
 *
 * Layout (Ted's sixth mockup, 2026-09-23), wired to real data only: identity
 * bar (the student's school, département, class), a stats ribbon (rank inside
 * the school and the school's national rank, both from the all-time school
 * board; the student's XP and streak), two tabs — "Mon école" with the school's
 * own board and the Cinq Majeur line (a school scores on its best five, the
 * rule `rankTeams` applies) and "Entre écoles" with best-five standings — then
 * the national panel for the real open edition, or an honest wait. The
 * mockup's live rooms, class pools, opponents, captains, prizes, tickets and
 * multipliers do not exist and are not drawn.
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

  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const [grade, setGrade] = useState<string>(storedGrade && storedGrade !== 'POSTBAC' ? storedGrade : '');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { school: string }>(null);
  const [tab, setTab] = useState<'school' | 'inter'>('school');

  const signedIn = !!user?.uid;
  const canSubmit = !!open && signedIn && !!picked && !!grade && attested && !busy;

  const submit = async () => {
    if (!canSubmit || !open || !picked) return;
    setBusy(true);
    setError(null);
    const res = await registerForTournament({
      tournamentId: open.id,
      schoolKey: picked.key,
      grade,
    });
    setBusy(false);
    if (res.ok) setDone({ school: picked.label });
    else setError(registerErrorMessage(res.error || 'unknown', isCreole));
  };

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

  /* The registration block — unchanged behaviour. Only while an edition is
     open; after a successful registration it becomes the "done" card. */
  const registration = done ? (
    <div className="arena-page__done" role="status">
      <span className="arena-page__done-icon"><Check size={20} aria-hidden="true" /></span>
      <h2>{t('Vous êtes inscrit', 'Ou enskri')}</h2>
      <p>
        {t(
          `${done.school} — votre place est enregistrée. Installez l’application et connectez-vous avec le même compte : le jour J, votre école ne compte que les élèves réellement présents.`,
          `${done.school} — plas ou anrejistre. Enstale aplikasyon an epi konekte ak menm kont lan : jou a, lekòl ou konte sèlman elèv ki reyèlman prezan.`,
        )}
      </p>
      <Link to="/download?from=arena" className="button button--primary">
        {t('Installer l’application', 'Enstale aplikasyon an')}
      </Link>
    </div>
  ) : open ? (
    <div className="arena-page__form" id="arena-inscription">
      {/* Said BEFORE the button, not after it. A student who registers here
          and never installs the app is a no-show who counts for nothing. */}
      <div className="arena-page__note">
        <Smartphone size={17} aria-hidden="true" />
        <p>
          {t(
            'Inscrivez-vous ici. Le jour du championnat, les questions se jouent dans l’application mobile — votre école ne compte que les élèves présents.',
            'Enskri isit la. Jou chanpyona a, kesyon yo jwe nan aplikasyon mobil la — lekòl ou konte sèlman elèv ki prezan.',
          )}
        </p>
      </div>

      <SchoolField picked={picked} onPick={setPicked} isCreole={isCreole} signedIn={signedIn} />

      <label className="arena-field">
        <span className="arena-field__label">
          <GraduationCap size={15} aria-hidden="true" /> {t('Votre classe', 'Klas ou')}
        </span>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} className="arena-field__select">
          <option value="">{t('Choisissez votre classe…', 'Chwazi klas ou…')}</option>
          {GRADES.filter((g) => g.code !== 'POSTBAC').map((g) => (
            <option key={g.code} value={g.code}>{isCreole ? g.labelHt : g.label}</option>
          ))}
        </select>
        <span className="arena-field__hint">
          {t('Réservé au primaire et au secondaire.', 'Se pou primè ak segondè sèlman.')}
        </span>
      </label>

      <button
        type="button"
        className="arena-attest"
        aria-pressed={attested}
        onClick={() => setAttested((a) => !a)}
      >
        <span className={`arena-attest__box${attested ? ' is-on' : ''}`} aria-hidden="true">
          {attested && <Check size={13} />}
        </span>
        <span>
          {t(
            'Je confirme que ces informations sont exactes. Si je gagne, je devrai prouver mon identité.',
            'Mwen konfime enfòmasyon sa yo kòrèk. Si m genyen, m ap gen pou pwouve ki moun mwen ye.',
          )}
        </span>
      </button>

      {error && <p className="arena-page__error" role="alert">{error}</p>}

      {signedIn ? (
        <button
          type="button"
          className="button button--primary arena-page__submit"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? t('Inscription…', 'Ap enskri…') : t('Inscrire mon école', 'Enskri lekòl mwen')}
        </button>
      ) : (
        <div className="arena-page__signin">
          <p>
            {t(
              'Connectez-vous pour inscrire votre école — votre place est liée à votre compte.',
              'Konekte pou w enskri lekòl ou — plas ou mare ak kont ou.',
            )}
          </p>
          <button type="button" className="button button--primary" onClick={toggleAuthModal}>
            {t('Se connecter', 'Konekte')}
          </button>
        </div>
      )}
    </div>
  ) : null;

  const fiveLine = !signedIn
    ? t('Connecte-toi et choisis ton école pour voir son équipe.', 'Konekte epi chwazi lekòl ou pou wè ekip li.')
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

  return (
    <section className="section arena-page">
      <div className="container arena-page__container">
        {/* ── Identity bar ─────────────────────────────────────────────── */}
        <header className="arena-id">
          <span className="arena-id__icon" aria-hidden="true"><SchoolIcon size={26} /></span>
          <div className="arena-id__body">
            <div className="arena-id__pills">
              <span className="arena-pill arena-pill--eyebrow">
                <Swords size={13} aria-hidden="true" /> {t('Championnat interscolaire', 'Chanpyona ant lekòl yo')}
              </span>
              {mySchool && myDept && <span className="arena-pill">{myDept}</span>}
              {mySchool && gradeRow && (
                <span className="arena-pill arena-pill--azure">{isCreole ? gradeRow.labelHt : gradeRow.label}</span>
              )}
            </div>
            <h1 className="arena-id__title">{mySchool || editionTitle || t('L’Arène', 'Arèn nan')}</h1>
            <p className="arena-id__sub">
              {open
                ? (dateLabel
                  ? t(`${editionTitle} — le ${dateLabel}.`, `${editionTitle} — ${dateLabel}.`)
                  : open.state === 'doors'
                    ? t(`${editionTitle} — les portes sont ouvertes.`, `${editionTitle} — pòt yo louvri.`)
                    : t(`${editionTitle} — les inscriptions sont ouvertes.`, `${editionTitle} — enskripsyon yo ouvè.`))
                : t(
                  'Ton école contre les autres, tous les jours. Chaque partie, quiz et examen compte ; une fois par mois, la finale se joue en direct.',
                  'Lekòl ou kont lòt yo, chak jou. Chak pati, quiz ak egzamen konte ; yon fwa pa mwa, final la jwe an dirèk.',
                )}
            </p>
          </div>
          <div className="arena-id__actions">
            {!signedIn ? (
              <button type="button" className="button button--primary" onClick={toggleAuthModal}>
                {t('Se connecter', 'Konekte')}
              </button>
            ) : !mySchool ? (
              <button type="button" className="button button--primary" onClick={() => setSchoolChosen(false)}>
                <Plus size={16} aria-hidden="true" /> {t('Ajouter mon école', 'Ajoute lekòl mwen')}
              </button>
            ) : open && !done ? (
              <a href="#arena-inscription" className="button button--primary">
                {t('Inscrire mon école', 'Enskri lekòl mwen')}
              </a>
            ) : (
              <Link to="/jeux" className="button button--primary">
                <Gamepad2 size={16} aria-hidden="true" /> {t('Gagner des points', 'Genyen pwen')}
              </Link>
            )}
            <Link to="/classement" className="button button--ghost">
              {t('Classement complet', 'Tout klasman an')}
            </Link>
          </div>
        </header>

        {/* ── Stats ribbon — only what the board and profile hold ─────── */}
        {signedIn && (
          <dl className="arena-stats">
            <div className="arena-stat">
              <span className="arena-stat__icon arena-stat__icon--amber" aria-hidden="true"><Trophy size={20} /></span>
              <div>
                <dt>{t('Rang dans ton école', 'Plas ou nan lekòl ou')}</dt>
                <dd>
                  {myIndex >= 0 ? `#${myIndex + 1}` : '—'}
                  {mine && <small> / {mine.members} {mine.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv')}</small>}
                </dd>
              </div>
            </div>
            <div className="arena-stat">
              <span className="arena-stat__icon arena-stat__icon--azure" aria-hidden="true"><Globe size={20} /></span>
              <div>
                <dt>{t('Rang national de l’école', 'Plas lekòl la nan peyi a')}</dt>
                <dd>
                  {mine ? `#${mine.rank}` : '—'}
                  {groups.length > 0 && <small> / {groups.length} {t('écoles', 'lekòl')}</small>}
                </dd>
              </div>
            </div>
            <div className="arena-stat">
              <span className="arena-stat__icon arena-stat__icon--violet" aria-hidden="true"><Sparkles size={20} /></span>
              <div>
                <dt>{t('Tes points', 'Pwen ou')}</dt>
                <dd>{nf(profile?.xp || 0)} XP <small>· {t('niv.', 'niv.')} {level?.level || 1}</small></dd>
              </div>
            </div>
            <div className="arena-stat">
              <span className="arena-stat__icon arena-stat__icon--orange" aria-hidden="true"><Flame size={20} /></span>
              <div>
                <dt>{t('Série', 'Seri')}</dt>
                <dd>{days} <small>{t(days === 1 ? 'jour' : 'jours', 'jou')}</small></dd>
              </div>
            </div>
          </dl>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="arena-tabs" role="tablist" aria-label={t('Vue', 'Vi')}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'school'}
            className={`arena-tab${tab === 'school' ? ' is-on' : ''}`}
            onClick={() => setTab('school')}
          >
            <span className="arena-tab__title"><Trophy size={18} aria-hidden="true" /> {t('Mon école', 'Lekòl mwen')}</span>
            <span className="arena-tab__sub">
              {t(`Les ${TEAM_SIZE} meilleurs de ton école forment son équipe.`, `${TEAM_SIZE} pi bon elèv lekòl ou fòme ekip li.`)}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'inter'}
            className={`arena-tab${tab === 'inter' ? ' is-on' : ''}`}
            onClick={() => setTab('inter')}
          >
            <span className="arena-tab__title"><Globe size={18} aria-hidden="true" /> {t('Entre écoles', 'Ant lekòl yo')}</span>
            <span className="arena-tab__sub">
              {t(`Chaque école est classée sur ses ${TEAM_SIZE} meilleurs.`, `Chak lekòl klase sou ${TEAM_SIZE} pi bon li yo.`)}
            </span>
          </button>
        </div>

        <div className="arena-grid">
          <div className="arena-main">
            {tab === 'school' ? (
              <>
                {/* The Cinq Majeur: a school scores on its best five, so the
                    number worth chasing is how many players are missing. */}
                <div className="arena-five">
                  <span className="arena-five__badge" aria-hidden="true">{TEAM_SIZE}</span>
                  <div>
                    <h2>{t('Le « Cinq Majeur » de ton école', '« Senk Majè » lekòl ou')}</h2>
                    <p>{fiveLine}</p>
                  </div>
                </div>

                {mySchool && mine && members.length > 0 && (
                  <section className="arena-card" aria-labelledby="arena-mine-title">
                    <div className="arena-card__head">
                      <h2 id="arena-mine-title">{t('Top de ton école', 'Tèt lekòl ou')}</h2>
                      <span className="arena-pill">
                        {mine.members} {mine.members === 1 ? t('élève', 'elèv') : t('élèves', 'elèv')}
                      </span>
                    </div>
                    <ol className="arena-board">
                      {members.slice(0, Math.max(TEAM_SIZE + 3, myIndex + 1)).map((m, i) => (
                        <React.Fragment key={m.uid || `${m.displayName}-${i}`}>
                          {i === TEAM_SIZE && (
                            <li className="arena-board__line" aria-hidden="true">
                              {t('— Seuil du Cinq Majeur —', '— Limit Senk Majè a —')}
                            </li>
                          )}
                          <li className={`arena-board__row${i < TEAM_SIZE ? ' is-five' : ''}${m.uid && m.uid === user?.uid ? ' is-me' : ''}`}>
                            <span className="arena-board__pos">{i + 1}</span>
                            <PixelAvatar seed={m.uid || m.displayName} size={30} className="arena-board__avatar" />
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
                      <p className="arena-card__foot">
                        {t(
                          `Encore ${nf(gapToFive)} XP pour entrer dans le Cinq Majeur.`,
                          `Ou bezwen ${nf(gapToFive)} XP ankò pou antre nan Senk Majè a.`,
                        )}
                      </p>
                    )}
                    {myIndex < 0 && (
                      <p className="arena-card__foot">
                        {t(
                          'Tu n’apparais pas encore ici : choisis un pseudo et joue une partie.',
                          'Ou poko parèt isit la : chwazi yon ti non epi jwe yon pati.',
                        )}{' '}
                        <Link to="/profile#reglages">{t('Choisir un pseudo', 'Chwazi yon ti non')}</Link>
                      </p>
                    )}
                  </section>
                )}
                {signedIn && <MySchoolCard where="arena" />}
              </>
            ) : (
              <section className="arena-card" aria-labelledby="arena-teams-title">
                <div className="arena-card__head">
                  <h2 id="arena-teams-title">{t('Classement des équipes', 'Klasman ekip yo')}</h2>
                  <span className="arena-pill">{t(`Score = ${TEAM_SIZE} meilleurs`, `Nòt = ${TEAM_SIZE} pi bon`)}</span>
                </div>
                {boardLoading ? (
                  <p className="arena-card__foot">{t('Chargement…', 'N ap chaje…')}</p>
                ) : standings.length === 0 ? (
                  <p className="arena-card__foot">
                    {t('Aucune école classée pour l’instant — la première place est libre.', 'Poko gen lekòl nan klasman an — premye plas la lib.')}
                  </p>
                ) : (
                  <ol className="arena-teams">
                    {standings.slice(0, 12).map((s) => (
                      <li
                        key={s.key}
                        className={`arena-teams__row${myTeam?.key === s.key ? ' is-me' : ''}${s.qualified ? '' : ' is-short'}`}
                      >
                        <span className="arena-board__pos">{s.qualified ? s.rank : '—'}</span>
                        <span className="arena-teams__name">
                          {s.label}
                          <small>
                            {s.qualified
                              ? t(`${s.members} élèves · équipe complète`, `${s.members} elèv · ekip konplè`)
                              : t(`${s.members}/${TEAM_SIZE} · il manque ${s.needed}`, `${s.members}/${TEAM_SIZE} · manke ${s.needed}`)}
                          </small>
                        </span>
                        <span className="arena-board__xp">{nf(s.teamXp)} XP</span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="arena-card__foot">
                  <Users size={15} aria-hidden="true" />{' '}
                  {t(
                    `Une école n’est classée qu’avec ${TEAM_SIZE} joueurs : c’est pour ça qu’inviter sa classe compte.`,
                    `Yon lekòl klase sèlman ak ${TEAM_SIZE} jwè : se pou sa envite klas ou enpòtan.`,
                  )}
                </p>
              </section>
            )}

            {/* ── The national panel: the real edition, or the honest wait ── */}
            <section className="arena-national" aria-labelledby="arena-national-title">
              <span className="arena-national__tag">
                {open
                  ? (open.state === 'doors' ? t('Portes ouvertes', 'Pòt yo louvri') : t('Inscriptions ouvertes', 'Enskripsyon ouvè'))
                  : t('Rendez-vous national', 'Randevou nasyonal')}
              </span>
              <h2 id="arena-national-title">
                {open ? editionTitle : t('Prochaine finale en direct : annoncée ici.', 'Pwochen final an dirèk : n ap anonse l isit la.')}
              </h2>
              <p>
                {open
                  ? (dateLabel
                    ? t(
                      `Le ${dateLabel}. Les questions se jouent dans l’application ; ton école ne compte que les élèves présents.`,
                      `${dateLabel}. Kesyon yo jwe nan aplikasyon an ; lekòl ou konte sèlman elèv ki prezan.`,
                    )
                    : t(
                      'Les questions se jouent dans l’application ; ton école ne compte que les élèves présents.',
                      'Kesyon yo jwe nan aplikasyon an ; lekòl ou konte sèlman elèv ki prezan.',
                    ))
                  : t(
                    'Une fois par mois, les écoles s’affrontent en direct dans l’application. En attendant, chaque partie compte au classement.',
                    'Yon fwa pa mwa, lekòl yo afwonte an dirèk nan aplikasyon an. Pandan n ap tann, chak pati konte nan klasman an.',
                  )}
              </p>
              <div className="arena-national__actions">
                {open && !done ? (
                  <a href="#arena-inscription" className="arena-national__cta">
                    {t('S’inscrire', 'Enskri')} <ChevronRight size={16} aria-hidden="true" />
                  </a>
                ) : (
                  <Link to="/jeux" className="arena-national__cta">
                    {t('Jouer maintenant', 'Jwe kounye a')} <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                )}
                <Link to="/download?from=arena" className="arena-national__ghost">
                  <Smartphone size={16} aria-hidden="true" /> {t('L’application', 'Aplikasyon an')}
                </Link>
              </div>
            </section>

            {open === undefined && (
              // Not "nothing is open" — not known yet.
              <div className="arena-page__loading" role="status" aria-live="polite">
                <span className="arena-page__spinner" aria-hidden="true" />
                <p>{t('Chargement du championnat…', 'N ap chaje chanpyona a…')}</p>
              </div>
            )}
            {registration}
          </div>

          {/* ── Side column ──────────────────────────────────────────────── */}
          <aside className="arena-side">
            <SchoolRanking max={8} />
            {signedIn && (
              <section className="arena-card arena-bilan" aria-labelledby="arena-bilan-title">
                <div className="arena-card__head">
                  <h2 id="arena-bilan-title">{t('Mon bilan', 'Bilan mwen')}</h2>
                </div>
                <div className="arena-bilan__grid">
                  <div><span>{t('Parties', 'Pati')}</span><strong>{nf(gamesPlayed)}</strong></div>
                  <div><span>XP</span><strong>{nf(profile?.xp || 0)}</strong></div>
                  <div><span>{t('Niveau', 'Nivo')}</span><strong>{level?.level || 1}</strong></div>
                </div>
                {GAMES.some((g) => highScores[g.id]) && (
                  <ul className="arena-bilan__records">
                    {GAMES.filter((g) => highScores[g.id]).map((g) => (
                      <li key={g.id}>
                        <span>{isCreole ? g.nameHt : g.name}</span>
                        <strong>{nf(highScores[g.id])}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/jeux" className="arena-card__link">
                  {t('Faire monter mon école', 'Fè lekòl mwen monte')} <ChevronRight size={14} aria-hidden="true" />
                </Link>
              </section>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
