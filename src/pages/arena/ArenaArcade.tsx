import React, { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Swords, Zap, Users, Trophy, Crown, Star, ChevronRight, Lock, Sparkles, Plus, Play,
} from '../../components/icons';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useCollectives } from '../../hooks/useLeaderboard';
import { useOpenArena } from '../../hooks/useOpenArena';
import { useStoryProgress } from '../../hooks/useStoryProgress';
import { normalizeName, rankTeams, teamStandingFor, TEAM_SIZE, type TeamStanding } from '../../../shared/leaderboardAgg';
import { STORY_CHAPTERS, MAX_STARS, nextStage, totalStars, chapterCleared, isUnlocked } from '../../../shared/arenaStory';
import { DEMO_SCHOOLS } from '../../../shared/arena/demo';
import { departmentPath, departmentCentroid, MAPPED_DEPARTMENTS, MAP_WIDTH, MAP_HEIGHT } from '../../data/haitiMapGeometry';
import SchoolBuilding from '../../components/arena/SchoolBuilding';
import UserAvatar from '../../components/UserAvatar';
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
 *   city      a deep sky, a far skyline, the mornes, and the real schools of
 *             the all-time board as lit pixel buildings on a street; a
 *             scoreboard ticker of the real standings runs under it
 *   select    six game cards, each with its own illustration (the real map of
 *             Haiti, a VS face-off, a PIN board, a stadium…) — keys 1–6
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
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const signedIn = !!user?.uid;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';

  const { profile } = useTrivia();
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
  const ranked = standings.filter((s) => s.qualified);
  const board = (ranked.length >= 3 ? ranked : standings).slice(0, 8);

  const champLine = open
    ? (open.state === 'doors'
      ? t('Les portes sont ouvertes — entre dans la salle.', 'Pòt yo louvri — antre nan sal la.')
      : open.startsAt > Date.now()
        ? t(`Inscriptions ouvertes · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`,
          `Enskripsyon ouvè · ${new Date(open.startsAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`)
        : t('Inscriptions ouvertes.', 'Enskripsyon ouvè.'))
    : t('Une soirée par mois, toutes les écoles en direct. La prochaine finale sera annoncée ici.', 'Yon swa chak mwa, tout lekòl yo an dirèk. N ap anonse pwochen final la isit la.');

  // ── Arcade keys: 1–6 pick a game ──
  const modes = useMemo(() => ([
    { key: 'story', to: '/arena/histoire' },
    { key: 'champ', to: open?.state === 'doors' ? '/arena/jouer' : '/arena/championnat' },
    { key: 'quick', to: '/jeux/trivia' },
    { key: 'duel', to: '/jeux/trivia', state: { duelPick: true } },
    { key: 'room', to: '/tournois/nouveau' },
    { key: 'mini', to: '/jeux#arcade' },
  ]), [open]);
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
      {/* ═══ The city ═══════════════════════════════════════════════════════ */}
      <section ref={heroRef} className="ah-hero" aria-labelledby="ah-title">
        <div className="ah-sky" aria-hidden="true">
          <span className="ah-stars ah-stars--a" />
          <span className="ah-stars ah-stars--b" />
          <span className="ah-moon" />
          <span className="ah-horizon" />
        </div>
        <svg className="ah-far" viewBox="0 0 1600 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          {FAR.map((b, i) => <rect key={i} x={b.x} y={220 - b.h} width={b.w} height={b.h} />)}
          {FAR.flatMap((b) => b.lit).map((w, i) => <rect key={`w${i}`} className="ah-far__lit" x={w.x} y={w.y} width="4" height="5" />)}
        </svg>
        <svg className="ah-mornes" viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 200 L0 120 C120 70 210 60 320 104 C420 140 470 64 600 52 C720 40 790 120 900 112 C1010 104 1060 34 1190 40 C1310 46 1370 118 1480 100 C1540 92 1580 80 1600 84 L1600 200 Z" />
        </svg>

        <div className="container ah-hero__inner">
          <div className="ah-hero__copy">
            <p className="ah-chip">
              {open
                ? <><span className="ah-live" aria-hidden="true" />{t('Championnat · inscriptions ouvertes', 'Chanpyona · enskripsyon ouvè')}</>
                : t('Ton école contre tout le pays', 'Lekòl ou kont tout peyi a')}
            </p>
            <h1 id="ah-title" className="ah-title">{t('L’Arène', 'Arèn nan')}</h1>
            <p className="ah-lede">
              {t(
                'Chaque bonne réponse fait monter ton école dans la ville. Joue seul, défie un ami, monte un tournoi avec ta classe — et une fois par mois, la finale nationale en direct.',
                'Chak bon repons fè lekòl ou monte nan vil la. Jwe pou kont ou, defye yon zanmi, fè yon tounwa ak klas ou — epi yon fwa pa mwa, gran final nasyonal la an dirèk.',
              )}
            </p>
            <div className="ah-actions">
              <Link to={storyNext ? '/arena/histoire' : '/jeux/trivia'} className="ah-start">
                <Play size={20} aria-hidden="true" /> {t('Appuie sur Start', 'Peze Start')}
              </Link>
              <a href="#ah-select" className="ah-ghost">{t('Tous les jeux', 'Tout jwèt yo')} <ChevronRight size={18} aria-hidden="true" /></a>
            </div>
          </div>

          <aside className="ah-player" aria-label={t('Ton équipe', 'Ekip ou')}>
            {mySchool ? (
              <>
                <p className="ah-player__label">{t('Ton école', 'Lekòl ou')}</p>
                <div className="ah-player__school">
                  <SchoolBuilding name={mySchool} cell={5} night />
                  <div>
                    <h2>{mySchool}</h2>
                    <p className="ah-player__rank">
                      {myTeam?.qualified
                        ? <><strong>#{myTeam.rank}</strong> · {nf(myTeam.teamXp)} XP {t('d’équipe', 'ekip')}</>
                        : myTeam
                          ? t(`Encore ${myTeam.needed} joueur${myTeam.needed > 1 ? 's' : ''} pour entrer au classement`, `Ankò ${myTeam.needed} jwè pou antre nan klasman`)
                          : t('Joue une partie pour poser ta première pierre', 'Jwe yon pati pou poze premye wòch ou')}
                    </p>
                  </div>
                </div>
                <ol className="ah-seats" aria-label={t(`Les ${TEAM_SIZE} qui comptent`, `${TEAM_SIZE} ki konte yo`)}>
                  {seats.map((m, i) => (
                    <li key={i} className={`ah-seat${m ? '' : ' is-empty'}${m?.uid && m.uid === user?.uid ? ' is-me' : ''}`}>
                      {m ? (
                        <>
                          <UserAvatar seed={m.uid} name={m.displayName} size={40} radius={10} />
                          <span className="ah-seat__name">{m.displayName}</span>
                          <span className="ah-seat__xp">{nf(m.xp)}</span>
                        </>
                      ) : (
                        <>
                          <span className="ah-seat__empty"><Plus size={18} aria-hidden="true" /></span>
                          <span className="ah-seat__name">{t('Libre', 'Lib')}</span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="ah-player__empty">
                <SchoolBuilding name="EdLight" cell={6} night />
                <div>
                  <h2>{t('Mets ton école sur la carte', 'Mete lekòl ou sou kat la')}</h2>
                  <p>{t('Chaque point que tu gagnes ajoute un étage à son bâtiment.', 'Chak pwen ou genyen ajoute yon etaj nan batiman li.')}</p>
                  {signedIn ? (
                    <button type="button" className="ah-start ah-start--sm" onClick={() => setSchoolChosen(false)}>
                      {t('Choisir mon école', 'Chwazi lekòl mwen')}
                    </button>
                  ) : (
                    <button type="button" className="ah-start ah-start--sm" onClick={toggleAuthModal}>
                      {t('Se connecter', 'Konekte')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="ah-street">
          <div className="ah-skyline" role="list" aria-label={t('Les écoles en tête', 'Lekòl ki an tèt yo')}>
            {skyline.map((s, i) => (
              <div key={s.key} role="listitem" className={`ah-tower${myTeam?.key === s.key ? ' is-mine' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                <span className="ah-tower__tag">
                  <strong>{s.qualified ? `#${s.rank}` : `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</strong>
                  <span>{s.label}</span>
                </span>
                <SchoolBuilding name={s.label} floors={s.floors} night cell={6} />
              </div>
            ))}
            {skyline.length === 0 && (
              <p className="ah-skyline__empty">{t('La ville se construit : la première école à jouer pose la première pierre.', 'Vil la ap bati : premye lekòl ki jwe a poze premye wòch la.')}</p>
            )}
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

      {/* ═══ Game select ════════════════════════════════════════════════════ */}
      <section id="ah-select" className="ah-select" aria-labelledby="ah-select-title">
        <div className="container">
          <header className="ah-select__head">
            <div>
              <p className="ah-over">{t('Sélection du jeu', 'Chwazi jwèt la')}</p>
              <h2 id="ah-select-title" className="ah-h2">{t('À quoi on joue ?', 'Ak kisa n ap jwe ?')}</h2>
            </div>
            <p className="ah-keys-hint">{t('Touches', 'Touch')} <kbd className="ah-key">1</kbd>–<kbd className="ah-key">6</kbd></p>
          </header>

          <div className="ah-bento">
            {/* 1 · Mode Histoire — the real map, lit by the student's progress */}
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
                <p className="ah-game__over"><Key n={1} /> {t('Mode Histoire', 'Mòd Istwa')}</p>
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

            {/* 2 · Championnat — stadium lights on the trophy */}
            <div className="ah-game ah-game--champ">
              <div className="ah-game__art ah-art-stadium" aria-hidden="true">
                <span className="ah-beam ah-beam--l" />
                <span className="ah-beam ah-beam--r" />
                <span className="ah-trophy"><Trophy size={64} weight="fill" /></span>
                <span className="ah-crowd" />
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={2} /> {open ? <><span className="ah-live" aria-hidden="true" />{t('En direct · national', 'An dirèk · nasyonal')}</> : t('National · en direct', 'Nasyonal · an dirèk')}</p>
                <h3>{t('Championnat des écoles', 'Chanpyona lekòl yo')}</h3>
                <p>{champLine}</p>
                <div className="ah-game__foot">
                  {open?.state === 'doors' ? (
                    <Link to="/arena/jouer" className="ah-cta ah-cta--btn">{t('Entrer dans la salle', 'Antre nan sal la')} <ChevronRight size={18} aria-hidden="true" /></Link>
                  ) : (
                    <Link to="/arena/championnat" className="ah-cta ah-cta--btn">
                      {open ? t('Inscrire mon école', 'Enskri lekòl mwen') : t('Le championnat', 'Chanpyona a')} <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  )}
                  <Link to="/arena/demo" className="ah-cta ah-cta--quiet"><Play size={16} aria-hidden="true" /> {t('Voir la démo', 'Gade demo a')}</Link>
                </div>
              </div>
            </div>

            {/* 3 · Partie rapide — a question card and its clock */}
            <Link to="/jeux/trivia" className="ah-game ah-game--quick">
              <div className="ah-game__art ah-art-quiz" aria-hidden="true">
                <span className="ah-clock"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle className="ah-clock__arc" cx="18" cy="18" r="15" /></svg><b>15</b></span>
                <span className="ah-qcard"><i /><i /></span>
                <span className="ah-opts"><i /><i className="is-right" /><i /><i /></span>
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={3} /> Solo</p>
                <h3>{t('Partie rapide', 'Pati rapid')}</h3>
                <p>{t('Dix questions, un thème, quinze secondes chacune.', 'Dis kesyon, yon tèm, kenz segonn chak.')}</p>
                <span className="ah-cta">{t('Jouer', 'Jwe')} <Zap size={16} aria-hidden="true" /></span>
              </div>
            </Link>

            {/* 4 · Défi — two players face off */}
            <Link to="/jeux/trivia" state={{ duelPick: true }} className="ah-game ah-game--duel">
              <div className="ah-game__art ah-art-vs" aria-hidden="true">
                <span className="ah-vs__p ah-vs__p--l"><UserAvatar seed={user?.uid || 'toi'} size={64} radius={16} /></span>
                <span className="ah-vs__bolt">VS</span>
                <span className="ah-vs__p ah-vs__p--r"><UserAvatar seed="ton-ami" size={64} radius={16} /></span>
              </div>
              <div className="ah-game__body">
                <p className="ah-game__over"><Key n={4} /> {t('1 contre 1', '1 kont 1')}</p>
                <h3>{t('Défi d’un ami', 'Defi yon zanmi')}</h3>
                <p>{t('Les mêmes questions, un seul essai chacun. Le meilleur gagne.', 'Menm kesyon yo, yon sèl chans chak. Pi bon an genyen.')}</p>
                <span className="ah-cta">{t('Défier', 'Defye')} <Swords size={16} aria-hidden="true" /></span>
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

      {/* ═══ The podium ═════════════════════════════════════════════════════ */}
      {board.length >= 3 && (
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
              <ol className="ah-podium">
                {[board[1], board[0], board[2]].map((s, i) => {
                  const place = [2, 1, 3][i];
                  return (
                    <li key={s.key} className={`ah-step ah-step--${place}`}>
                      <SchoolBuilding name={s.label} floors={[5, 7, 4][i]} night cell={place === 1 ? 8 : 7} />
                      <div className="ah-step__block">
                        <span className="ah-step__place">{place === 1 && <Crown size={22} weight="fill" aria-hidden="true" />}{place}</span>
                        <strong>{s.label}</strong>
                        <span>{s.qualified ? `${nf(s.teamXp)} XP` : `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE} ${t('joueurs', 'jwè')}`}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {board.length > 3 && (
                <ol className="ah-rest" start={4}>
                  {board.slice(3).map((s, i) => (
                    <li key={s.key} className={myTeam?.key === s.key ? 'is-mine' : ''}>
                      <span className="ah-rest__n">{i + 4}</span>
                      <span className="ah-rest__b"><SchoolBuilding name={s.label} floors={3} night cell={3} /></span>
                      <strong>{s.label}</strong>
                      <span>{s.qualified ? `${nf(s.teamXp)} XP` : `${Math.min(s.members, TEAM_SIZE)}/${TEAM_SIZE}`}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="ah-close">
        <div className="container ah-close__inner">
          {!signedIn ? (
            <p><Lock size={18} aria-hidden="true" /> {t('Tu peux jouer sans compte. Connecte-toi pour que tes points comptent pour ton école.', 'Ou ka jwe san kont. Konekte pou pwen ou konte pou lekòl ou.')}</p>
          ) : !mySchool ? (
            <p><Sparkles size={18} aria-hidden="true" /> {t('Ajoute ton école : son bâtiment apparaîtra dans la ville.', 'Ajoute lekòl ou : batiman l ap parèt nan vil la.')}</p>
          ) : (
            <p><Sparkles size={18} aria-hidden="true" /> {t('Chaque partie compte pour ton école. Ramène ta classe.', 'Chak pati konte pou lekòl ou. Mennen klas ou vini.')}</p>
          )}
          {!signedIn && <button type="button" className="ah-start ah-start--sm" onClick={toggleAuthModal}>{t('Se connecter', 'Konekte')}</button>}
          {signedIn && !mySchool && <button type="button" className="ah-start ah-start--sm" onClick={() => setSchoolChosen(false)}>{t('Ajouter mon école', 'Ajoute lekòl mwen')}</button>}
        </div>
      </section>
    </div>
  );
}
