import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Crown, Star, ChevronRight, Lock, Sparkles } from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives, useLeaderboard } from '../../hooks/useLeaderboard';
import { useSchoolRace } from '../../hooks/useSchoolRace';
import { useOpenArena } from '../../hooks/useOpenArena';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { normalizeName, rankTeams, teamStandingFor, TEAM_SIZE, type TeamStanding } from '../../../shared/leaderboardAgg';
import { STORY_CHAPTERS, MAX_STARS, nextStage, totalStars, chapterCleared, isUnlocked } from '../../../shared/arenaStory';
import { DEMO_SCHOOLS } from '../../../shared/arena/demo';
import { departmentPath, departmentCentroid, MAPPED_DEPARTMENTS, MAP_WIDTH, MAP_HEIGHT } from '../../data/haitiMapGeometry';
import SchoolBuilding from '../../components/arena/SchoolBuilding';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import ArenaJoin from '../../components/arena/ArenaJoin';
import ArenaWorld from '../../arena-art/environment/ArenaWorld';
import LobbyStrip, { DUEL_STATE, SCHOOL_TO, type LobbySchool } from '../../components/arena/lobby/LobbyStrip';
import LobbyLanes from '../../components/arena/lobby/LobbyLanes';
import { splitPodium } from '../../components/arena/lobby/podium';
import { pickRival, schoolLadder, type WeeklyEntry } from '../../components/arena/lobby/rival';
import '../../components/arena/lobby/lobby.css';
import './ArenaArcade.css';
import './ArenaHome.css';

/**
 * /arena — the Arène as a night arcade (Ted, 2026-10-10: "it should almost
 * feel like an arcade game"; 2026-10-11: "5 times more beautiful, 10 times
 * more premium").
 *
 * One continuous night, top to bottom — the page never drops back into a
 * light dashboard:
 *
 *   lobby     (2026-10-17, roadmap #1/#6/#8/#10) the student's strip leads
 *             the city: player card, real weekly place, the school's place in
 *             the race, ONE "Jouer une partie" (a real round, no account
 *             needed) and the rival (lobby/rival.ts — never invented)
 *   city      a deep sky, a far skyline, the mornes, and the real schools of
 *             the all-time board as lit pixel buildings on a street; a
 *             scoreboard ticker of the real standings runs under it
 *   lanes     Défier un ami · Dans mon école · Représenter mon école — keys 1–3
 *   select    the supporting modes: Histoire, Tournoi privé, Mini-jeux — 4–6
 *   podium    the top three schools on podium blocks, the rest as a list
 *
 * Every number is read from the board or the student's own progress.
 * `?demo=1` fills the city with the fictional demo schools, for previewing a
 * board that has no data (local dev); it is labelled as a demo on screen.
 */

function floorsFor(teamXp: number, maxXp: number) {
  if (!maxXp) return 2;
  return 2 + Math.round((teamXp / maxXp) * 4); // 2–6 floors
}

// A far skyline, deterministic so it never reshuffles between renders.
function farSkyline(seed = 7) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const blocks: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
  let x = 0;
  while (x < 1600) {
    const w = 26 + Math.round(rnd() * 50);
    const h = 40 + Math.round(rnd() * 120);
    const lit: { x: number; y: number }[] = [];
    for (let wy = 8; wy < h - 8; wy += 12) {
      for (let wx = 6; wx < w - 6; wx += 10) if (rnd() < 0.16) lit.push({ x: x + wx, y: 220 - h + wy });
    }
    blocks.push({ x, w, h, lit });
    x += w + Math.round(rnd() * 6);
  }
  return blocks;
}
const FAR = farSkyline();
/** Weekly entries the lobby reads (the rival rule needs to know the page size). */
const BOARD_PAGE = 50;
const ISLAND = MAPPED_DEPARTMENTS.map((d) => departmentPath(d) || '').join('');
const CHAPTER_AT = STORY_CHAPTERS.map((c) => departmentCentroid(c.dept) || { x: 0, y: 0 });

function demoStandings(): TeamStanding[] {
  return DEMO_SCHOOLS.map((d, i) => ({
    key: d.key, label: d.label, teamXp: Math.round(d.strength * 4200 - i * 37), counted: Math.min(TEAM_SIZE, d.roster),
    members: d.roster, qualified: d.roster >= TEAM_SIZE, needed: Math.max(0, TEAM_SIZE - d.roster), rank: 0,
  })).sort((a, b) => b.teamXp - a.teamXp).map((s, i) => ({ ...s, rank: i + 1 }));
}

export default function ArenaArcade() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const user = useStore((s) => s.user);
  const toggleAuthModal = useStore((s) => s.toggleAuthModal);
  const signedIn = !!user?.uid;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';

  const { profile, level } = useTrivia();
  const { groups } = useCollectives('school', 'all');
  const standings = useMemo(() => (demo ? demoStandings() : rankTeams(groups)), [groups, demo]);
  const mySchool: string | null = signedIn ? profile?.leaderboard?.school || null : null;
  const mine = mySchool ? groups.find((g) => g.key === normalizeName(mySchool)) || null : null;
  const myTeam = mySchool ? teamStandingFor(standings, mySchool) : null;
  const open = useOpenArena();
  const { progress } = useStoryProgress();
  const storyNext = nextStage(progress);
  const storyStars = totalStars(progress);
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

  // ── The lobby: the student's real week, their school's real place, and
  //    the rival rule of lobby/rival.ts. Nothing here is invented. ──
  const { entries, myEntry, myRank } = useLeaderboard(BOARD_PAGE);
  const { race } = useSchoolRace();
  const weekly = entries as WeeklyEntry[];
  const myRace = mySchool ? race.find((r) => r.key === normalizeName(mySchool)) || null : null;
  const lobbySchool: LobbySchool | null = mySchool ? {
    name: myRace?.label || mySchool,
    place: myRace ? myRace.place : null,
    total: race.length,
    qualified: !!myRace?.qualified,
    needed: myRace ? myRace.needed : TEAM_SIZE,
  } : null;
  const rival = useMemo(() => pickRival({
    entries: weekly, uid: user?.uid || null, myXp: Number(myEntry?.xp) || 0, myRank: myRank ?? null, school: mySchool, pageSize: BOARD_PAGE,
  }), [weekly, user?.uid, myEntry?.xp, myRank, mySchool]);
  const ladder = useMemo(() => schoolLadder(weekly, mySchool), [weekly, mySchool]);
  const raceLeader = race[0] ? { name: race[0].label, qualified: race[0].qualified, teamXp: race[0].teamXp, members: race[0].members } : null;
  const pseudo = (profile?.leaderboard?.displayName || myEntry?.displayName || '').trim() || null;

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

  // The join card stays until the school's team counts on the board.
  const teamIncomplete = !mySchool || !myTeam?.qualified;
  const showJoin = !demo && teamIncomplete;
  const storyChapter = storyNext ? STORY_CHAPTERS[storyNext.chapter] : null;
  // Placements are earned: only qualified schools stand on the podium or get
  // a number; schools still forming their five are listed apart (podium.ts).
  const board = useMemo(() => splitPodium(standings), [standings]);

  const champLine = open
    ? (open.state === 'doors'
      ? t('Les portes sont ouvertes — entre dans la salle.', 'Pòt yo louvri — antre nan sal la.')
      : open.startsAt > Date.now()
        ? t(`Inscriptions ouvertes · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
          `Enskripsyon ouvè · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`)
        : t('Inscriptions ouvertes.', 'Enskripsyon ouvè.'))
    : t('Une soirée par mois, toutes les écoles en direct. La prochaine finale sera annoncée ici.', 'Yon swa chak mwa, tout lekòl yo an dirèk. N ap anonse pwochen final la isit la.');

  // ── Arcade keys: 1–3 the three lanes, 4–6 the supporting modes ──
  const champTo = open?.state === 'doors' ? '/arena/jouer' : '/arena/championnat';
  const modes = useMemo(() => ([
    { key: 'duel', to: '/jeux/trivia', state: DUEL_STATE as Record<string, unknown> },
    { key: 'school', to: SCHOOL_TO },
    { key: 'champ', to: champTo },
    { key: 'story', to: '/arena/histoire' },
    { key: 'room', to: '/tournois/nouveau' },
    { key: 'mini', to: '/jeux#arcade' },
  ] as { key: string; to: string; state?: Record<string, unknown> }[]), [champTo]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < modes.length) navigate(modes[i].to, modes[i].state ? { state: modes[i].state } : undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modes, navigate]);

  // ── Parallax: the far city and the mornes drift with the pointer ──
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', String((e.clientX - r.left) / r.width - 0.5));
        el.style.setProperty('--py', String((e.clientY - r.top) / r.height - 0.5));
      });
    };
    el.addEventListener('pointermove', onMove);
    return () => { el.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  const Key = ({ n }: { n: number }) => <kbd className="ah-key" aria-hidden="true">{n}</kbd>;

  return (
    <div className="ah">
      <nav aria-label={t("Compétitions", "Konpetisyon")} style={{ padding: "12px 24px" }}><Link className="an-ghost" to="/arena/competitions">{t("Mon activité · Équipes et compétitions", "Aktivite mwen · Ekip ak konpetisyon")}</Link></nav>
      {/* ═══ The city ═══════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="ah-hero" aria-labelledby="ah-title">
        <div className="ah-sky" aria-hidden="true">
          <span className="ah-stars ah-stars--a" />
          <span className="ah-stars ah-stars--b" />
          <span className="ah-moon" />
          <span className="ah-horizon" />
        </div>
        {/* The shared Arène world as the setting (everyday; championship dress
            only while an official event is open). It sits behind the strip. */}
        <div className="lb-world" aria-hidden="true">
          <ArenaWorld occasion={open ? 'championship' : 'everyday'} layout="wide" className="lb-world__wide" />
          <ArenaWorld occasion={open ? 'championship' : 'everyday'} layout="tall" className="lb-world__tall" />
        </div>
        <svg className="ah-far" viewBox="0 0 1600 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          {FAR.map((b, i) => <rect key={i} x={b.x} y={220 - b.h} width={b.w} height={b.h} />)}
          {FAR.flatMap((b) => b.lit).map((w, i) => <rect key={`w${i}`} className="ah-far__lit" x={w.x} y={w.y} width="4" height="5" />)}
        </svg>
        <svg className="ah-mornes" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 200 L0 120 C120 70 210 60 320 104 C420 140 470 64 600 52 C720 40 790 120 900 112 C1010 104 1060 34 1190 40 C1310 46 1370 118 1480 100 C1540 92 1580 80 1600 84 L1600 200 Z" />
        </svg>

        <div className="container ah-hero__inner lb-hero">
          <header className="lb-head">
            <div>
              <h1 id="ah-title" className="ah-title lb-title">{t('L’Arène', 'Arèn nan')}</h1>
              <p className="lb-tagline">{t('Ton école. Ton rival. Ta prochaine victoire.', 'Lekòl ou. Rival ou. Pwochen viktwa ou.')}</p>
            </div>
            {open && (
              <Link to={champTo} className="ah-chip lb-chip">
                <span className="ah-live" aria-hidden="true" />
                {open.state === 'doors' ? t('Championnat · portes ouvertes', 'Chanpyona · pòt yo louvri') : t('Championnat · inscriptions ouvertes', 'Chanpyona · enskripsyon ouvè')}
              </Link>
            )}
          </header>
          <LobbyStrip
            isCreole={isCreole}
            signedIn={signedIn}
            uid={user?.uid || null}
            name={pseudo}
            level={level?.level || 1}
            totalXp={level?.xp || 0}
            weeklyRank={signedIn ? myRank ?? null : null}
            weeklyXp={Number(myEntry?.xp) || 0}
            school={lobbySchool}
            rival={rival}
            leader={raceLeader}
            onSignIn={toggleAuthModal}
          />
        </div>

        <div className="ah-street">
          <div className={`ah-skyline${skyline.length === 0 ? ' is-empty' : ''}`} role="list" aria-label={t('Les écoles en tête', 'Lekòl ki an tèt yo')}>
            {skyline.map((s, i) => (
              <div key={s.key} role="listitem" className={`ah-tower${myTeam?.key === s.key ? ' is-mine' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <span className="ah-tower__tag">
                  <strong>{s.qualified ? `#${s.rank}` : `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</strong>
                  <span>{s.label}</span>
                </span>
                <SchoolBuilding name={s.label} floors={s.floors} night cell={6} />
              </div>
            ))}
          </div>
          <div className="ah-road" aria-hidden="true"><span /></div>
        </div>

        {standings.length > 0 && (
          <div className="ah-ticker" aria-hidden="true">
            <div className="ah-ticker__track">
              {[0, 1].map((copy) => (
                <span key={copy} className="ah-ticker__run">
                  {standings.slice(0, 12).map((s) => (
                    <span key={s.key} className="ah-ticker__item">
                      <b>{s.qualified ? `#${s.rank}` : `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</b> {s.label}
                      {s.qualified && <i>{nf(s.teamXp)} XP</i>}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        )}
        {demo && <p className="ah-demo-flag">{t('Aperçu avec des écoles fictives', 'Apèsi ak lekòl fiktif')}</p>}
      </section>

      {/* ═══ The three lanes ═════════════════════════════════════════════════ */}
      <LobbyLanes
        isCreole={isCreole}
        uid={user?.uid || null}
        school={lobbySchool}
        ladder={ladder}
        open={open}
        champLine={champLine}
        targets={{ duel: modes[0], school: modes[1], champ: modes[2] }}
      />

      {/* ═══ Supporting modes ═══════════════════════════════════════════════ */}
      <section id="ah-select" className="ah-select" aria-labelledby="ah-select-title">
        <div className="container">
          <header className="ah-select__head">
            <div>
              <h2 id="ah-select-title" className="ah-h2">{t('Pour t’entraîner', 'Pou antrene')}</h2>
            </div>
            <p className="ah-keys-hint">{t('Touches', 'Touch')} <kbd className="ah-key">1</kbd>–<kbd className="ah-key">6</kbd></p>
          </header>

          <div className="ah-bento lb-bento">
            {/* 4 · Mode Histoire — the real map, lit by the student's progress */}
            <Link to="/arena/histoire" className="ah-game ah-game--story">
              <div className="ah-game__art ah-art-map" aria-hidden="true">
                <svg viewBox={`-20 -20 ${MAP_WIDTH + 40} ${MAP_HEIGHT + 40}`}>
                  <defs>
                    <linearGradient id="ah-land" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#2FD18C" />
                      <stop offset="1" stopColor="#0E7A55" />
                    </linearGradient>
                  </defs>
                  <path d={ISLAND} className="ah-art-map__glow" />
                  {STORY_CHAPTERS.map((c, i) => (
                    <path key={c.id} d={departmentPath(c.dept) || ''}
                      className={`ah-art-map__dept${chapterCleared(progress, i) ? ' is-done' : isUnlocked(progress, i, 0) ? ' is-open' : ''}`} />
                  ))}
                  <polyline className="ah-art-map__route" points={CHAPTER_AT.map((p) => `${p.x},${p.y}`).join(' ')} />
                  {CHAPTER_AT.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={storyNext?.chapter === i ? 16 : 9}
                      className={`ah-art-map__pin${storyNext?.chapter === i ? ' is-next' : chapterCleared(progress, i) ? ' is-done' : ''}`} />
                  ))}
                </svg>
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={4} /> {t('Mode Histoire', 'Mòd Istwa')}</p>
                <h3>{t('Le tour d’Ayiti', 'Tou Ayiti a')}</h3>
                <p>
                  {storyChapter
                    ? t(`Dix départements, un boss dans chacun. Prochaine étape : ${storyChapter.dept}.`, `Dis depatman, yon bòs nan chak. Pwochen etap : ${storyChapter.dept}.`)
                    : t('Campagne terminée — reviens chercher les étoiles qui manquent.', 'Kanpay la fini — retounen chèche zetwal ki manke yo.')}
                </p>
                <div className="ah-game__foot">
                  <span className="ah-stars-count"><Star size={18} aria-hidden="true" /> {storyStars}<small>/{MAX_STARS}</small></span>
                  <span className="ah-cta">{storyStars > 0 ? t('Continuer', 'Kontinye') : t('Commencer', 'Kòmanse')} <ChevronRight size={18} aria-hidden="true" /></span>
                </div>
              </div>
            </Link>

            {/* 5 · Tournoi privé — the PIN board */}
            <div className="ah-game ah-game--room">
              <div className="ah-game__art ah-art-pin" aria-hidden="true">
                <span className="ah-pin__label">PIN</span>
                <span className="ah-pin__cells">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ '--d': `${i * 0.12}s` } as React.CSSProperties} />)}</span>
                <span className="ah-pin__crowd"><Users size={22} /> <Users size={22} /> <Users size={22} /></span>
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={5} /> {t('Avec ta classe', 'Ak klas ou')}</p>
                <h3>{t('Tournoi privé', 'Tounwa prive')}</h3>
                <p>{t('Crée une salle, partage le code, jouez ensemble — en direct ou sur plusieurs jours.', 'Kreye yon sal, pataje kòd la, jwe ansanm — an dirèk oswa sou plizyè jou.')}</p>
                <div className="ah-game__foot">
                  <Link to="/tournois/nouveau" className="ah-cta ah-cta--btn">{t('Créer', 'Kreye')} <ChevronRight size={18} aria-hidden="true" /></Link>
                  <Link to="/tournois/rejoindre" className="ah-cta ah-cta--quiet">{t('Rejoindre avec un code', 'Antre ak yon kòd')}</Link>
                </div>
              </div>
            </div>

            {/* 6 · Mini-jeux — five little screens */}
            <Link to="/jeux#arcade" className="ah-game ah-game--mini">
              <div className="ah-game__art ah-art-mini" aria-hidden="true">
                <span className="ah-mini ah-mini--a">V/F</span>
                <span className="ah-mini ah-mini--b">MO</span>
                <span className="ah-mini ah-mini--c">+ −</span>
                <span className="ah-mini ah-mini--d">1 2 3</span>
                <span className="ah-mini ah-mini--e"><Sparkles size={22} /></span>
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={6} /> {t('5 jeux', '5 jwèt')}</p>
                <h3>{t('Mini-jeux', 'Mini jwèt')}</h3>
                <p>{t('Vrai ou faux, Mémoire, Mo Kaché, Calcul, Suites. Bats ton record.', 'Vre oswa fo, Memwa, Mo Kache, Kalkil, Swit. Bat rekò ou.')}</p>
                <span className="ah-cta">{t('Jouer', 'Jwe')} <ChevronRight size={18} aria-hidden="true" /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ The way in: sign in → school → team of five ════════════════════
          After the games, not before them (spec S12): a guest who came to
          play sees the modes first; the hero card's "Commencer en 3 étapes"
          still jumps here. */}
      {showJoin && (
        <ArenaJoin
          signedIn={signedIn}
          uid={user?.uid || null}
          school={mySchool}
          members={mine?.members || 0}
          isCreole={isCreole}
          onSignIn={toggleAuthModal}
        />
      )}

      {/* ═══ The podium ═════════════════════════════════════════════════════
          Qualified schools only, in their official rank. With fewer than
          three qualified, the ranked ones are a plain numbered list — no
          ceremonial steps — and every school still short of five sits in
          "En formation", with its roster count and no number. */}
      {(board.ranked.length > 0 || board.forming.length > 0) && (
        <section className="ah-podium-sec" aria-labelledby="ah-podium-title">
          <div className="container">
            <header className="ah-select__head">
              <div>
                <p className="ah-over">{t('Toutes saisons', 'Tout sezon')}</p>
                <h2 id="ah-podium-title" className="ah-h2">{t('Les écoles en tête', 'Lekòl ki an tèt yo')}</h2>
              </div>
              <Link to="/classement" className="ah-ghost">{t('Classement complet', 'Tout klasman an')} <ChevronRight size={18} aria-hidden="true" /></Link>
            </header>
            <div className="ah-podium-wrap">
              {board.podium.length === 3 && (
                <ol className="ah-podium" aria-label={t('Les trois premières écoles qualifiées', 'Twa premye lekòl ki kalifye yo')}>
                  {[board.podium[1], board.podium[0], board.podium[2]].map((s, i) => {
                    const place = [2, 1, 3][i];
                    return (
                      <li key={s.key} className={`ah-step ah-step--${place}`}>
                        <SchoolBuilding name={s.label} floors={[5, 7, 4][i]} night cell={place === 1 ? 8 : 7} />
                        <div className="ah-step__block">
                          <span className="ah-step__place">{place === 1 && <Crown size={22} weight="fill" aria-hidden="true" />}{s.rank}</span>
                          <strong>{s.label}</strong>
                          <span>{nf(s.teamXp)} XP</span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {board.rest.length > 0 && (
                <ol className="ah-rest" aria-label={t('Écoles qualifiées', 'Lekòl ki kalifye')}>
                  {board.rest.map((s) => (
                    <li key={s.key} className={myTeam?.key === s.key ? 'is-mine' : ''}>
                      <span className="ah-rest__n">{s.rank}</span>
                      <span className="ah-rest__b"><SchoolBuilding name={s.label} floors={3} night cell={3} /></span>
                      <strong>{s.label}</strong>
                      <span>{nf(s.teamXp)} XP</span>
                    </li>
                  ))}
                </ol>
              )}
              {board.ranked.length === 0 && (
                <p className="ah-forming__none">{t(`Aucune école n’a encore ses ${TEAM_SIZE} joueurs : la première place est à prendre.`, `Poko gen lekòl ki gen ${TEAM_SIZE} jwè li : premye plas la lib.`)}</p>
              )}
              {board.forming.length > 0 && (
                <div className="ah-forming" data-testid="forming">
                  <h3 className="ah-forming__title">{t('En formation', 'Ap fòme')}</h3>
                  <p className="ah-forming__lede">{t(`Pas encore classées : une école compte à partir de ${TEAM_SIZE} joueurs.`, `Poko klase : yon lekòl konte apati ${TEAM_SIZE} jwè.`)}</p>
                  <ul className="ah-forming__list">
                    {board.forming.map((s) => (
                      <li key={s.key} className={myTeam?.key === s.key ? 'is-mine' : ''}>
                        <SchoolCrest name={s.label} size={32} />
                        <strong>{s.label}</strong>
                        <span className="ah-forming__count">
                          {`${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} ${t('joueurs', 'jwè')}`}
                          <small>{t(`il manque ${s.needed}`, `manke ${s.needed}`)}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* The join band already says all of this while it is on the page. */}
      {!showJoin && (
      <section className="ah-close">
        <div className="container ah-close__inner">
          {!signedIn ? (
            <p><Lock size={18} aria-hidden="true" /> {t('Tu peux jouer sans compte. Connecte-toi pour que tes points comptent pour ton école.', 'Ou ka jwe san kont. Konekte pou pwen ou konte pou lekòl ou.')}</p>
          ) : !mySchool ? (
            <p><Sparkles size={18} aria-hidden="true" /> {t('Ajoute ton école : son bâtiment apparaîtra dans la ville.', 'Ajoute lekòl ou : batiman l ap parèt nan vil la.')}</p>
          ) : (
            <p><Sparkles size={18} aria-hidden="true" /> {t('Chaque partie compte pour ton école. Ramène ta classe.', 'Chak pati konte pou lekòl ou. Mennen klas ou vini.')}</p>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
