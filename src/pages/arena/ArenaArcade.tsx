import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Swords, Zap, Users, Trophy, Crown, Star, ChevronRight, Lock, Sparkles, Plus,
} from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives } from '../../hooks/useLeaderboard';
import { useOpenArena } from '../../hooks/useOpenArena';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { normalizeName, rankTeams, teamStandingFor, TEAM_SIZE } from '../../../shared/leaderboardAgg';
import { STORY_CHAPTERS, MAX_STARS, nextStage, totalStars } from '../../../shared/arenaStory';
import SchoolBuilding from '../../components/arena/SchoolBuilding';
import PixelAvatar from '../../components/PixelAvatar';
import './ArenaArcade.css';

/**
 * /arena — the Arène as an arcade (Ted, 2026-10-10: "it should almost feel
 * like an arcade game — with mockups of the schools — and even a story mode").
 *
 * ONE door for everything competitive, which used to be spread across /jeux,
 * /arena, /tournois, /classement and an app-only duel:
 *
 *   stage     a night skyline where every building is a real school from the
 *             all-time board, its height its team score; yours glows
 *   player    your school's building + its five-seat team (the real top five)
 *   cabinets  Mode Histoire · Partie rapide · Défi d'un ami · Tournoi privé ·
 *             Championnat national — each one sentence and one button
 *
 * Every number is read from the board or the student's own progress. School
 * buildings are generated drawings (utils/schoolBuilding), never likenesses.
 */

function floorsFor(teamXp: number, maxXp: number) {
  if (!maxXp) return 2;
  return 2 + Math.round((teamXp / maxXp) * 6); // 2–8 floors
}

export default function ArenaArcade() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const signedIn = !!user?.uid;

  const { profile } = useTrivia();
  const { groups } = useCollectives('school', 'all');
  const standings = useMemo(() => rankTeams(groups), [groups]);
  const mySchool: string | null = signedIn ? profile?.leaderboard?.school || null : null;
  const mine = mySchool ? groups.find((g) => g.key === normalizeName(mySchool)) || null : null;
  const myTeam = mySchool ? teamStandingFor(standings, mySchool) : null;
  const open = useOpenArena();
  const { progress } = useStoryProgress();
  const storyNext = nextStage(progress);
  const storyStars = totalStars(progress);
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

  // The skyline: the top schools by team score, tallest in the middle so the
  // city reads as a podium. Your school joins it even when it is not top 7.
  const skyline = useMemo(() => {
    const top = standings.slice(0, 7);
    if (myTeam && !top.some((s) => s.key === myTeam.key)) top.push(myTeam);
    const maxXp = Math.max(1, ...top.map((s) => s.teamXp || 0));
    const sorted = [...top].sort((a, b) => (b.teamXp || 0) - (a.teamXp || 0));
    const podium: typeof sorted = [];
    sorted.forEach((s, i) => (i % 2 === 0 ? podium.push(s) : podium.unshift(s)));
    return podium.map((s) => ({ ...s, floors: floorsFor(s.teamXp || 0, maxXp) }));
  }, [standings, myTeam]);

  const seats = Array.from({ length: TEAM_SIZE }, (_, i) => mine?.topMembers?.[i] || null);
  const storyChapter = storyNext ? STORY_CHAPTERS[storyNext.chapter] : null;

  const champLine = open
    ? (open.state === 'doors'
      ? t('Les portes sont ouvertes — entre dans la salle.', 'Pòt yo louvri — antre nan sal la.')
      : open.startsAt > Date.now()
        ? t(`Inscriptions ouvertes · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
          `Enskripsyon ouvè · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`)
        : t('Inscriptions ouvertes.', 'Enskripsyon ouvè.'))
    : t('La prochaine finale sera annoncée ici.', 'N ap anonse pwochen final la isit la.');

  return (
    <div className="arc">
      {/* ── The stage ───────────────────────────────────────────────────── */}
      <section className="arc-stage-hero" aria-labelledby="arc-title">
        <div className="arc-stars-bg" aria-hidden="true" />
        <div className="container arc-hero">
          <div className="arc-hero__copy">
            <p className="arc-eyebrow arc-eyebrow--light">{t('Ton école contre le pays', 'Lekòl ou kont tout peyi a')}</p>
            <h1 id="arc-title" className="arc-title">{t('L’Arène', 'Arèn nan')}</h1>
            <p className="arc-hero__lede">
              {t(
                'Chaque partie fait monter ton école dans la ville. Joue seul, défie un ami, monte un tournoi avec ta classe — et une fois par mois, la finale nationale en direct.',
                'Chak pati fè lekòl ou monte nan vil la. Jwe pou kont ou, defye yon zanmi, fè yon tounwa ak klas ou — epi yon fwa pa mwa, gran final nasyonal la an dirèk.',
              )}
            </p>
            <div className="arc-hero__actions">
              <Link to={storyNext ? '/arena/histoire' : '/jeux'} className="arc-btn arc-btn--go arc-btn--lg">
                {t('Appuie sur Start', 'Peze Start')} <ChevronRight size={20} aria-hidden="true" />
              </Link>
              <Link to="/classement" className="arc-btn arc-btn--glass">{t('Classement', 'Klasman')}</Link>
            </div>
          </div>

          {/* Player card: your school and its five seats */}
          <aside className="arc-player" aria-label={t('Ton équipe', 'Ekip ou')}>
            {mySchool ? (
              <>
                <div className="arc-player__school">
                  <SchoolBuilding name={mySchool} cell={5} night />
                  <div>
                    <p className="arc-player__label">{t('Ton école', 'Lekòl ou')}</p>
                    <h2>{mySchool}</h2>
                    <p className="arc-player__rank">
                      {myTeam?.qualified
                        ? t(`#${myTeam.rank} · ${nf(myTeam.teamXp)} XP d’équipe`, `#${myTeam.rank} · ${nf(myTeam.teamXp)} XP ekip`)
                        : myTeam
                          ? t(`Il manque ${myTeam.needed} joueur${myTeam.needed > 1 ? 's' : ''} pour être classée`, `Li manke ${myTeam.needed} jwè pou l klase`)
                          : t('Pas encore au classement — joue une partie', 'Poko nan klasman — jwe yon pati')}
                    </p>
                  </div>
                </div>
                <ol className="arc-seats" aria-label={t(`Les ${TEAM_SIZE} qui comptent`, `${TEAM_SIZE} ki konte yo`)}>
                  {seats.map((m, i) => (
                    <li key={i} className={`arc-seat${m ? '' : ' is-empty'}${m?.uid && m.uid === user?.uid ? ' is-me' : ''}`}>
                      {m ? (
                        <>
                          <PixelAvatar seed={m.uid || m.displayName} size={40} />
                          <span className="arc-seat__name">{m.displayName}</span>
                          <span className="arc-seat__xp">{nf(m.xp)}</span>
                        </>
                      ) : (
                        <>
                          <span className="arc-seat__empty"><Plus size={18} aria-hidden="true" /></span>
                          <span className="arc-seat__name">{t('Place libre', 'Plas lib')}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="arc-player__empty">
                <SchoolBuilding name="EdLight" cell={5} night />
                <h2>{t('Choisis ton école', 'Chwazi lekòl ou')}</h2>
                <p>{t('Chaque point que tu gagnes fait grandir son bâtiment.', 'Chak pwen ou genyen fè batiman li grandi.')}</p>
                {signedIn ? (
                  <button type="button" className="arc-btn arc-btn--go" onClick={() => setSchoolChosen(false)}>
                    {t('Ajouter mon école', 'Ajoute lekòl mwen')}
                  </button>
                ) : (
                  <button type="button" className="arc-btn arc-btn--go" onClick={toggleAuthModal}>
                    {t('Se connecter', 'Konekte')}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>

        {/* The city */}
        <div className="arc-skyline" role="list" aria-label={t('Les écoles en tête', 'Lekòl ki an tèt yo')}>
          {skyline.map((s) => (
            <div key={s.key} role="listitem" className={`arc-tower${myTeam?.key === s.key ? ' is-mine' : ''}`}>
              <span className="arc-tower__tag">
                <strong>{s.qualified ? `#${s.rank}` : '—'}</strong> {s.label}
              </span>
              <SchoolBuilding name={s.label} floors={s.floors} night cell={6} />
            </div>
          ))}
          {skyline.length === 0 && (
            <p className="arc-skyline__empty">{t('La ville se construit : la première école à jouer pose la première pierre.', 'Vil la ap bati : premye lekòl ki jwe a poze premye wòch la.')}</p>
          )}
        </div>
        <div className="arc-ground" aria-hidden="true" />
      </section>

      {/* ── Cabinets ────────────────────────────────────────────────────── */}
      <section className="container arc-cabinets" aria-labelledby="arc-modes">
        <h2 id="arc-modes" className="arc-section-title">{t('Choisis ta borne', 'Chwazi machin ou')}</h2>
        <div className="arc-cab-grid">
          <article className="arc-cab arc-cab--story">
            <div className="arc-cab__screen arc-cab__screen--story" aria-hidden="true">
              <span className="arc-cab__big"><Crown size={34} /></span>
            </div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('Mode Histoire', 'Mòd Istwa')}</p>
              <h3>{t('Le tour d’Ayiti', 'Tou Ayiti a')}</h3>
              <p>
                {storyChapter
                  ? t(`10 départements, un boss dans chacun. Prochain : ${storyChapter.dept}.`, `10 depatman, yon bòs nan chak. Pwochen : ${storyChapter.dept}.`)
                  : t('Campagne terminée — toutes les étoiles sont-elles à toi ?', 'Kanpay la fini — èske tout zetwal yo pou ou ?')}
              </p>
              <p className="arc-cab__meta"><Star size={15} aria-hidden="true" /> {storyStars} / {MAX_STARS}</p>
              <Link to="/arena/histoire" className="arc-btn arc-btn--go">
                {storyStars > 0 ? t('Continuer', 'Kontinye') : t('Commencer', 'Kòmanse')}
              </Link>
            </div>
          </article>

          <article className="arc-cab">
            <div className="arc-cab__screen arc-cab__screen--quick" aria-hidden="true"><span className="arc-cab__big"><Zap size={34} /></span></div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('Solo', 'Solo')}</p>
              <h3>{t('Partie rapide', 'Pati rapid')}</h3>
              <p>{t('10 questions, un thème. Tes points comptent pour ton école.', '10 kesyon, yon tèm. Pwen ou konte pou lekòl ou.')}</p>
              <Link to="/jeux/trivia" className="arc-btn arc-btn--go">{t('Jouer', 'Jwe')}</Link>
            </div>
          </article>

          <article className="arc-cab">
            <div className="arc-cab__screen arc-cab__screen--mini" aria-hidden="true"><span className="arc-cab__big"><Sparkles size={34} /></span></div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('5 jeux', '5 jwèt')}</p>
              <h3>{t('Mini-jeux', 'Mini jwèt')}</h3>
              <p>{t('Vrai ou faux, Mémoire, Mo Kaché, Calcul, Suites — bats ton record.', 'Vre oswa fo, Memwa, Mo Kache, Kalkil, Swit — bat rekò ou.')}</p>
              <Link to="/jeux#arcade" className="arc-btn arc-btn--go">{t('Jouer', 'Jwe')}</Link>
            </div>
          </article>

          <article className="arc-cab">
            <div className="arc-cab__screen arc-cab__screen--duel" aria-hidden="true"><span className="arc-cab__big"><Swords size={34} /></span></div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('1 contre 1', '1 kont 1')}</p>
              <h3>{t('Défi d’un ami', 'Defi yon zanmi')}</h3>
              <p>{t('Joue une partie, envoie les mêmes questions à un ami. Un essai, le meilleur gagne.', 'Jwe yon pati, voye menm kesyon yo bay yon zanmi. Yon sèl chans, pi bon an genyen.')}</p>
              <Link to="/jeux/trivia" className="arc-btn arc-btn--go">{t('Défier', 'Defye')}</Link>
            </div>
          </article>

          <article className="arc-cab">
            <div className="arc-cab__screen arc-cab__screen--room" aria-hidden="true"><span className="arc-cab__big"><Users size={34} /></span></div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('Avec ta classe', 'Ak klas ou')}</p>
              <h3>{t('Tournoi privé', 'Tounwa prive')}</h3>
              <p>{t('Crée une salle, partage le code PIN, jouez ensemble — en direct ou sur plusieurs jours.', 'Kreye yon sal, pataje kòd PIN lan, jwe ansanm — an dirèk oswa sou plizyè jou.')}</p>
              <div className="arc-cab__row">
                <Link to="/tournois/nouveau" className="arc-btn arc-btn--go">{t('Créer', 'Kreye')}</Link>
                <Link to="/tournois/rejoindre" className="arc-btn arc-btn--ghost">{t('Rejoindre', 'Antre')}</Link>
              </div>
            </div>
          </article>

          <article className="arc-cab arc-cab--champ">
            <div className="arc-cab__screen arc-cab__screen--champ" aria-hidden="true"><span className="arc-cab__big"><Trophy size={34} /></span></div>
            <div className="arc-cab__body">
              <p className="arc-eyebrow">{t('En direct · national', 'An dirèk · nasyonal')}</p>
              <h3>{t('Championnat des écoles', 'Chanpyona lekòl yo')}</h3>
              <p>{champLine}</p>
              <div className="arc-cab__row">
                {open?.state === 'doors' ? (
                  <Link to="/arena/jouer" className="arc-btn arc-btn--go">{t('Entrer dans la salle', 'Antre nan sal la')}</Link>
                ) : (
                  <Link to="/arena/championnat" className="arc-btn arc-btn--go">
                    {open ? t('Inscrire mon école', 'Enskri lekòl mwen') : t('Voir le championnat', 'Wè chanpyona a')}
                  </Link>
                )}
              </div>
            </div>
          </article>
        </div>

        {!signedIn && (
          <p className="arc-guest">
            <Lock size={15} aria-hidden="true" />{' '}
            {t('Tu peux jouer sans compte. Connecte-toi pour que tes points comptent pour ton école.', 'Ou ka jwe san kont. Konekte pou pwen ou konte pou lekòl ou.')}{' '}
            <button type="button" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>
          </p>
        )}
        {signedIn && !mySchool && (
          <p className="arc-guest">
            <Sparkles size={15} aria-hidden="true" />{' '}
            {t('Ajoute ton école : son bâtiment apparaîtra dans la ville.', 'Ajoute lekòl ou : batiman l ap parèt nan vil la.')}{' '}
            <button type="button" onClick={() => setSchoolChosen(false)}>{t('Ajouter', 'Ajoute')}</button>
          </p>
        )}
      </section>
    </div>
  );
}
