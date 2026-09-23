/**
 * Profile — the learner's account page (the bottom-nav "Profil" destination).
 * The layout and what it deliberately leaves out are described above the
 * default export; the exported pieces (achievement shelf, course card,
 * rankWindow) are pure enough to test on their own.
 */

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Flame, Trophy, Zap, Bell, Info, Moon, Sun, Languages, GraduationCap, ChevronRight, Check, BookOpen,
  Loader2, ShieldCheck, MapPin, RefreshCw, AlertTriangle,
} from '../components/icons';
import * as AppIcons from '../components/icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { logoutUser } from '../services/authService';
import { STREAK_MILESTONES } from '../services/streakService';
import { setLeaderboardOptIn as saveBoardIdentity } from '../services/triviaService';
import { isValidAlias } from '../services/leaderboardService';
import ReadinessCard from '../components/ReadinessCard';
import { Skeleton } from '../components/Skeleton';
import SchoolField from '../components/arena/SchoolField';
import { GRADES, TRACK_BY_CODE } from '../config/trackConfig';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf, findCity } from '../data/haitiGeo';
import PixelAvatar from '../components/PixelAvatar';
import MySchoolCard from '../components/MySchoolCard';
import { schoolKey } from '../../shared/schools';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import '../styles/pf.css';
import './Profile.css';
import { AccountBlock, GoalRhythm, SectionHead, SkillSpots, Schoolmates, Toggle } from './profile/ProfileSections';



/** Lazy TrackSelector, same wrapper the navbar dropdown uses. */
function TrackSelectorModal({ currentTrack, onClose }: { currentTrack: string | null; onClose: () => void }) {
  const TrackSelector = React.lazy(() => import('../components/TrackSelector'));
  return (
    <React.Suspense fallback={null}>
      <TrackSelector mode="modal" currentTrack={currentTrack} onClose={onClose} onSelect={onClose} />
    </React.Suspense>
  );
}

/**
 * IdentityFields — school, residence and public alias, asked ONCE here.
 *
 * All three already live in the one place the rest of the product reads them
 * from: `users/{uid}/gamification/profile.leaderboard` (school / city /
 * department / displayName). Nothing new is collected and no second copy is
 * written — the leaderboard form and this section edit the same fields through
 * the same service, so a student who fills it here is not asked again there.
 *
 * Two rules from the owner are visible in the layout:
 *
 *  1. The school is picked with the SAME picker /arena uses (SchoolField), so
 *     the accent/abbreviation-forgiving matcher and the "my school isn't in the
 *     list" submission both apply. A second matcher, or free text, is how one
 *     school ends up as two entries with half the points each.
 *  2. Residence is NOT the school's location. They are separate fields with
 *     separate labels, because a student in Delmas can attend school in
 *     Pétion-Ville and the board groups the two differently.
 */
export type IdentityState = { dirty: boolean; aliasOk: boolean; status: 'idle' | 'saving' | 'saved' | 'failed' };

function IdentityFields({ isCreole, uid, board, saveRef, accountName, afterSchool, onState }: {
  isCreole: boolean;
  uid: string | null;
  board: { optedIn?: boolean; displayName?: string | null; school?: string | null; city?: string | null; department?: string | null };
  /** The title bar's "Enregistrer" calls this. Not a <form>: Enter in the
      school search (or its "add a school" box) must not save the profile. */
  saveRef: React.MutableRefObject<(() => void) | null>;
  accountName: string;
  /** The class picker, which sits between the school and the residence. */
  afterSchool?: React.ReactNode;
  onState: (s: IdentityState) => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const qc = useQueryClient();

  const [alias, setAlias] = React.useState('');
  const [picked, setPicked] = React.useState<{ key: string; label: string } | null>(null);
  const [department, setDepartment] = React.useState('');
  const [cityChoice, setCityChoice] = React.useState('');
  const [customCity, setCustomCity] = React.useState('');
  // 'idle' | 'saving' | 'saved' | 'failed' — a save that failed must never read
  // as one that worked, so the three outcomes are three different messages.
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  // Seed the form from what the account already knows. Keyed on the stored
  // values so a later load (or a save elsewhere) refreshes the fields.
  const storedSchool = board?.school || '';
  const storedCity = board?.city || '';
  const storedDept = board?.department || '';
  const storedAlias = board?.displayName || '';
  // A save updates the cached profile, which re-seeds the form below. Without
  // this flag that re-seed would clear the "Enregistré" confirmation in the
  // same commit that earned it.
  const justSavedRef = React.useRef(false);
  React.useEffect(() => {
    setAlias(storedAlias);
    setPicked(storedSchool ? { key: schoolKey(storedSchool), label: storedSchool } : null);
    const known = storedCity ? findCity(storedCity) : null;
    if (known) {
      setDepartment(known.department);
      setCityChoice(known.city);
      setCustomCity('');
    } else {
      setDepartment(storedDept);
      setCityChoice(storedCity ? OTHER_CITY : '');
      setCustomCity(storedCity);
    }
    if (justSavedRef.current) justSavedRef.current = false;
    else setStatus('idle');
  }, [storedAlias, storedSchool, storedCity, storedDept]);

  const deptCities = citiesOf(department);
  const pickDepartment = (name: string) => {
    setDepartment(name);
    setCustomCity('');
    // Diaspora has no commune list — go straight to free text.
    setCityChoice(name && citiesOf(name).length === 0 ? OTHER_CITY : '');
    setStatus('idle');
  };

  const aliasOk = !alias.trim() || isValidAlias(alias);
  const city = cityChoice === OTHER_CITY ? customCity.trim() : cityChoice;
  const dirty = alias.trim() !== storedAlias
    || (picked?.label || '') !== storedSchool
    || city !== storedCity
    || department !== storedDept;

  const save = async () => {
    if (!uid || !aliasOk) return;
    setStatus('saving');
    // The service, not the hook: the hook swallows its result, and this form
    // has to tell a saved value from a failed write. Same document, same rules,
    // same cache key the hook reads (`['trivia-profile', uid]`).
    //
    // `optedIn` is passed through UNCHANGED: editing a school here must never
    // enrol a student in the public board they haven't joined.
    const updated = await saveBoardIdentity(uid, {
      optedIn: !!board?.optedIn,
      displayName: alias.trim() ? alias.trim().slice(0, 24) : undefined,
      school: picked?.label || null,
      city: city || null,
      department: department || null,
    });
    if (updated) {
      justSavedRef.current = true;
      qc.setQueryData(['trivia-profile', uid], updated);
      setStatus('saved');
    } else {
      setStatus('failed');
    }
  };

  React.useEffect(() => { onState({ dirty, aliasOk, status }); }, [dirty, aliasOk, status, onState]);
  saveRef.current = dirty && aliasOk && status !== 'saving' ? save : null;

  return (
    <div className="profile-identity">
      {/* The account name comes from sign-up (Google or e-mail) and is never
          shown to other students — read-only here, the pseudo is what's public. */}
      <div className="profile-field">
        <span className="profile-field__label">{t('Nom du compte', 'Non kont lan')}</span>
        <span className="profile-field__input profile-field__input--readonly">{accountName}</span>
      </div>

      <label className="profile-field">
        <span className="profile-field__label">{t('Pseudo affiché', 'Ti non pou afiche')}</span>
        <input
          id="profile-alias"
          className="profile-field__input"
          value={alias}
          maxLength={24}
          onChange={(e) => { setAlias(e.target.value); setStatus('idle'); }}
          placeholder={t('Ex. Naïka M.', 'Egz. Naïka M.')}
        />
        <small className="profile-field__why">
          {t(
            'Le seul nom que les autres élèves voient. Ton nom complet n’est jamais affiché.',
            'Se sèl non lòt elèv yo wè. Non konplè ou pa janm parèt.',
          )}
        </small>
        {!aliasOk && (
          <small className="profile-field__error">
            {t('Le pseudo doit contenir au moins une lettre.', 'Ti non an dwe gen omwen yon lèt.')}
          </small>
        )}
      </label>

      {/* The /arena picker itself — matcher, duplicate warning and
          missing-school submission included. */}
      <SchoolField picked={picked} onPick={(s) => { setPicked(s); setStatus('idle'); }} isCreole={isCreole} signedIn={!!uid} />
      <p className="profile-field__why">
        {t(
          'Ton école sert au championnat interscolaire et au classement par école — on ne te la redemandera pas ailleurs.',
          'Lekòl ou sèvi pou chanpyona ant lekòl yo ak klasman pa lekòl — nou p ap mande w li yon lòt kote.',
        )}
      </p>

      {afterSchool}

      <fieldset className="profile-residence">
        <legend className="profile-field__label">
          <MapPin size={14} aria-hidden="true" /> {t('Où tu habites', 'Kote ou rete')}
        </legend>
        <p className="profile-field__why">
          {t(
            'Pour le classement par ville et par département. Ce n’est pas l’adresse de ton école : beaucoup d’élèves étudient dans une autre commune.',
            'Pou klasman pa vil ak pa depatman. Se pa adrès lekòl ou : anpil elèv etidye nan yon lòt komin.',
          )}
        </p>
        <div className="profile-residence__row">
          <label className="profile-field">
            <span className="profile-field__label">{t('Département', 'Depatman')}</span>
            <select
              className="profile-field__input"
              value={department}
              onChange={(e) => pickDepartment(e.target.value)}
            >
              <option value="">{t('— Choisir —', '— Chwazi —')}</option>
              {HAITI_DEPARTMENTS.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>

          {department && (
            <label className="profile-field">
              <span className="profile-field__label">{t('Ville', 'Vil')}</span>
              {deptCities.length > 0 && (
                <select
                  className="profile-field__input"
                  value={cityChoice}
                  onChange={(e) => { setCityChoice(e.target.value); setCustomCity(''); setStatus('idle'); }}
                >
                  <option value="">{t('— Choisir —', '— Chwazi —')}</option>
                  {deptCities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value={OTHER_CITY}>{t('Autre ville…', 'Lòt vil…')}</option>
                </select>
              )}
              {cityChoice === OTHER_CITY && (
                <input
                  className="profile-field__input"
                  value={customCity}
                  maxLength={60}
                  onChange={(e) => { setCustomCity(e.target.value); setStatus('idle'); }}
                  placeholder={t('Nom de ta ville', 'Non vil ou')}
                />
              )}
            </label>
          )}
        </div>
      </fieldset>

      <p className="profile-field__why">
        <ShieldCheck size={13} aria-hidden="true" />{' '}
        {board?.optedIn
          ? t(
            'Tu participes au classement : ton pseudo, ton école et ta ville y sont visibles.',
            'Ou nan klasman an : ti non ou, lekòl ou ak vil ou parèt ladan l.',
          )
          : t(
            'Tu ne participes pas encore au classement — rien de ceci n’est public tant que tu ne l’as pas rejoint.',
            'Ou poko nan klasman an — anyen nan sa a pa piblik toutotan ou pa antre ladan l.',
          )}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Visual language
 * ───────────────
 * Taken from the profile mockups: white cards on a tinted canvas, a 44px
 * pastel icon tile opening every row and card, status pills instead of bare
 * ticks, caps micro-labels in the mono face, one gradient feature panel, and
 * hover lifts at 300ms. Plus Jakarta Sans carries the headings; Source Sans 3
 * still carries every word of body copy.
 *
 * `tone` is the one axis of colour. Six named tones map to the semantic tokens
 * the app already has, so nothing here introduces a new hue.
 * ══════════════════════════════════════════════════════════════════════════ */

type Tone = 'azure' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate';

/** The pastel square that opens a row, a card or a stat. */
function IconTile({ tone = 'azure', size = 'md', children }: {
  tone?: Tone; size?: 'sm' | 'md' | 'lg'; children: React.ReactNode;
}) {
  return (
    <span className={`pf-tile pf-tile--${tone} pf-tile--${size}`} aria-hidden="true">
      {children}
    </span>
  );
}

/** A status pill: "✓ Acquis", "3 / 5 en cours", "À débloquer". */
function Pill({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`pf-pill pf-pill--${tone}`}>{children}</span>;
}

/**
 * Meter — a bar that fills once, on mount.
 *
 * The mockups animate their bars; a bar that is already full when it appears
 * reads as a static rule. It grows from zero over 700ms, and holds still for
 * anyone who asked their system not to animate.
 */
function Meter({ pct, tone = 'azure' }: { pct: number; tone?: Tone }) {
  const [grown, setGrown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const width = grown ? Math.max(0, Math.min(100, pct)) : 0;
  return (
    <span className={`pf-meter pf-meter--${tone}`}>
      <span className="pf-meter__fill" style={{ width: `${width}%` }} />
    </span>
  );
}

/**
 * HeroStat — one of the three figures beside the identity block.
 *
 * Big number, caps label, one line of context. The context line is the point:
 * "18" is a fact, "18 · prochain palier 30 jours" is a reason to come back.
 */
function HeroStat({ tone, icon, value, label, sub }: {
  tone: Tone; icon: React.ReactNode; value: React.ReactNode; label: string; sub: string;
}) {
  return (
    <div className="pf-stat">
      <IconTile tone={tone} size="sm">{icon}</IconTile>
      <span className="pf-stat__value num">{value}</span>
      <span className="pf-stat__label">{label}</span>
      <span className="pf-stat__sub">{sub}</span>
    </div>
  );
}

/** Section heading: eyebrow in the mono face, title in the display face. */
function CardHead({ eyebrow, title, aside }: {
  eyebrow?: string; title: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <div className="pf-head">
      <div className="pf-head__text">
        {eyebrow && <span className="pf-eyebrow">{eyebrow}</span>}
        <h2 className="pf-head__title">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

/* ── Achievements ───────────────────────────────────────────────────────────
 * One shelf, built from both sources at once.
 *
 * The page used to show streak milestones in one card and course badges in
 * another, which meant the 7-, 30- and 100-day streaks were listed twice under
 * two different names: `streak_7` (awarded by streakService) and `week_streak`
 * (awarded by progressTracking) are the same achievement earned by the same
 * behaviour. Streaks are taken from STREAK_MILESTONES only — it is the list
 * that knows the day thresholds — and the course badges contribute the four
 * that are genuinely about coursework plus the two point tiers.
 *
 * Every tile says what earns it. A locked tile without its criterion is just a
 * grey square, and the criterion is the only part of a locked badge that can
 * change what a student does next.
 */
interface Achievement {
  id: string;
  emoji: string;
  label: string;
  how: string;
  unlocked: boolean;
  /** 0–1. Only set where the number behind it is one we actually hold. */
  progress?: number;
  progressLabel?: string;
  /** Caps micro-label for the card footer. */
  kind: string;
  tone: Tone;
}

/** Course badges, with the real thresholds from progressTracking.ts. */
const COURSE_BADGES = [
  {
    id: 'first_lesson', emoji: '🎓', tone: 'azure' as Tone,
    fr: 'Première leçon', ht: 'Premye leson',
    kindFr: 'Cours', kindHt: 'Kou',
    howFr: 'Terminer une première leçon dans un cours.',
    howHt: 'Fini yon premye leson nan yon kou.',
  },
  {
    id: 'quiz_enthusiast', emoji: '📝', tone: 'violet' as Tone,
    fr: 'Habitué des quiz', ht: 'Abitye ak quiz',
    kindFr: 'Quiz', kindHt: 'Quiz',
    howFr: '10 quiz passés dans un même cours.',
    howHt: '10 quiz nan yon menm kou.',
  },
  {
    id: 'quiz_master', emoji: '🧠', tone: 'violet' as Tone,
    fr: 'Maître des quiz', ht: 'Mèt quiz',
    kindFr: 'Quiz', kindHt: 'Quiz',
    howFr: '50 quiz passés dans un même cours.',
    howHt: '50 quiz nan yon menm kou.',
  },
  {
    id: 'perfectionist', emoji: '💯', tone: 'emerald' as Tone,
    fr: 'Sans faute', ht: 'San fot',
    kindFr: 'Précision', kindHt: 'Presizyon',
    howFr: '5 quiz réussis sans la moindre erreur.',
    howHt: '5 quiz reyisi san okenn erè.',
  },
  {
    id: 'point_collector', emoji: '💎', tone: 'azure' as Tone,
    fr: 'Collectionneur', ht: 'Ranmasè pwen',
    kindFr: 'Points', kindHt: 'Pwen',
    howFr: '1 000 points dans un même cours.',
    howHt: '1 000 pwen nan yon menm kou.',
    target: 1000,
  },
  {
    id: 'point_master', emoji: '👑', tone: 'amber' as Tone,
    fr: 'Maître des points', ht: 'Mèt pwen',
    kindFr: 'Points', kindHt: 'Pwen',
    howFr: '5 000 points dans un même cours.',
    howHt: '5 000 pwen nan yon menm kou.',
    target: 5000,
  },
];

export function buildAchievements({ isCreole, streak, unlockedMilestones, courseBadges, bestCoursePoints }: {
  isCreole: boolean;
  streak: any;
  unlockedMilestones: Set<string>;
  courseBadges: Set<string>;
  bestCoursePoints: number;
}): Achievement[] {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const days = streak?.currentStreak || 0;
  const best = streak?.longestStreak || 0;

  const streakTiles: Achievement[] = STREAK_MILESTONES.map((m) => {
    const unlocked = unlockedMilestones.has(m.id) || best >= m.days;
    // Progress is measured against the CURRENT streak, not the best one: the
    // question a locked streak badge answers is "how far is today's run".
    const progress = unlocked ? undefined : Math.min(1, days / m.days);
    return {
      id: m.id,
      emoji: m.emoji,
      label: isCreole ? m.labelHt : m.label,
      how: t(`${m.days} jours de révision d’affilée.`, `${m.days} jou revizyon youn dèyè lòt.`),
      unlocked,
      progress,
      progressLabel: progress == null ? undefined : `${days} / ${m.days}`,
      kind: t('Régularité', 'Regilarite'),
      tone: 'amber' as Tone,
    };
  });

  const courseTiles: Achievement[] = COURSE_BADGES.map((b) => {
    const unlocked = courseBadges.has(b.id);
    const progress = unlocked || !b.target
      ? undefined
      : Math.min(1, bestCoursePoints / b.target);
    return {
      id: b.id,
      emoji: b.emoji,
      label: isCreole ? b.ht : b.fr,
      how: isCreole ? b.howHt : b.howFr,
      unlocked,
      progress,
      progressLabel: progress == null ? undefined : `${bestCoursePoints} / ${b.target}`,
      kind: isCreole ? b.kindHt : b.kindFr,
      tone: b.tone,
    };
  });

  // Earned first, then the closest to being earned — so the shelf opens on
  // what you have and continues with what is actually within reach.
  const rank = (a: Achievement) => (a.unlocked ? -1 : 1 - (a.progress || 0));
  return [...courseTiles, ...streakTiles].sort((a, b) => rank(a) - rank(b));
}

/**
 * AchievementShelf — every badge the product can award, in one place.
 *
 * Locked tiles are shown, not hidden, because the criterion is the part that
 * can change what a student does next; a shelf of only what you already have
 * is a trophy case, not a prompt. The meter appears only where a real number
 * backs it (see buildAchievements).
 */
/** Badge art: the app's icon set, not emoji (which render differently per phone). */
const BADGE_ICON: Record<string, AppIcons.AppIcon> = {
  '🔥': AppIcons.Flame, '⚡': AppIcons.Zap, '💪': AppIcons.Dumbbell, '👑': AppIcons.Crown,
  '🏆': AppIcons.Trophy, '💎': AppIcons.Gem, '🎓': AppIcons.GraduationCap, '📝': AppIcons.PenLine,
  '🧠': AppIcons.Brain, '💯': AppIcons.Target,
};
function BadgeArt({ emoji }: { emoji: string }) {
  const I = BADGE_ICON[emoji] || AppIcons.Medal;
  return <I size={22} aria-hidden="true" />;
}

export function AchievementShelf({ achievements, isCreole }: {
  achievements: Achievement[];
  isCreole: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const won = achievements.filter((a) => a.unlocked).length;
  // Thirteen tiles were ~950px of mostly "À débloquer". What is earned, and
  // the three closest to earning, are what a student acts on; the rest are
  // one tap away.
  const [showAll, setShowAll] = React.useState(false);
  const next = achievements
    .filter((a) => !a.unlocked)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, 3);
  const shown = showAll ? achievements : [...achievements.filter((a) => a.unlocked), ...next];

  return (
    <div className="pf-card">
      <CardHead
        eyebrow={t('Réussites', 'Reyalizasyon')}
        title={t('Ce que tu as débloqué', 'Sa ou debloke')}
        aside={<Pill tone="slate">{won} / {achievements.length}</Pill>}
      />
      <div className="pf-badges">
        {shown.map((a) => (
          <article key={a.id} className={`pf-badge ${a.unlocked ? 'is-unlocked' : ''}`}>
            <header className="pf-badge__top">
              <IconTile tone={a.unlocked ? a.tone : 'slate'}>
                <span className="pf-badge__emoji"><BadgeArt emoji={a.emoji} /></span>
              </IconTile>
              {a.unlocked ? (
                <Pill tone="emerald"><Check size={12} /> {t('Acquis', 'Jwenn')}</Pill>
              ) : a.progress != null ? (
                <Pill tone="amber">{a.progressLabel}</Pill>
              ) : (
                <Pill tone="slate">{t('À débloquer', 'Pou debloke')}</Pill>
              )}
            </header>

            <h3 className="pf-badge__label">{a.label}</h3>
            <p className="pf-badge__how">{a.how}</p>

            <footer className="pf-badge__foot">
              <span className="pf-eyebrow">{a.kind}</span>
              {!a.unlocked && a.progress != null
                ? <Meter pct={a.progress * 100} tone="amber" />
                : <span className="pf-badge__foot-value">{a.unlocked ? t('Obtenu', 'Jwenn') : '—'}</span>}
            </footer>
          </article>
        ))}
      </div>
      {shown.length < achievements.length || showAll ? (
        <button type="button" className="pf-link pf-badges__more" onClick={() => setShowAll((v) => !v)}>
          {showAll
            ? t('Voir moins', 'Wè mwens')
            : t(`Voir les ${achievements.length} réussites`, `Wè ${achievements.length} reyalizasyon yo`)}
        </button>
      ) : null}
    </div>
  );
}

/**
 * CourseProgressCard — the courses you have actually opened.
 *
 * Absorbed from the former <ProgressDashboard />, which this page was the only
 * caller of. Its four summary tiles duplicated numbers shown elsewhere (and
 * its "Série de jours" read the first course's streak rather than the
 * learner's, so it could disagree with the streak in the header); only the
 * per-course list said anything the rest of the page did not.
 */
const SUBJECT_TONE: Record<string, Tone> = {
  MATH: 'azure', PHYS: 'violet', CHEM: 'emerald', ECON: 'amber', BIO: 'rose',
};

export function CourseProgressCard({ allProgress, loading, isCreole, onExplore }: {
  allProgress: any[];
  loading: boolean;
  isCreole: boolean;
  onExplore: () => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const SUBJECTS: Record<string, string> = {
    CHEM: t('Chimie', 'Chimi'),
    PHYS: t('Physique', 'Fizik'),
    MATH: t('Mathématiques', 'Matematik'),
    ECON: t('Économie', 'Ekonomi'),
    BIO: t('Biologie', 'Byoloji'),
  };
  const parse = (courseId: string) => {
    const [subj, ...rest] = String(courseId || '').split('-');
    const code = (subj || '').toUpperCase();
    const level = rest.join('-').replace(/^NS([IVX]+)$/i, 'NS $1').toUpperCase();
    return { code, name: SUBJECTS[code] || subj || courseId, level };
  };

  if (loading) {
    return (
      <div className="pf-card" aria-busy="true">
        <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Tes cours', 'Kou ou yo')} />
        <div className="pf-rows">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={64} radius={14} />
          ))}
        </div>
      </div>
    );
  }

  if (!allProgress || allProgress.length === 0) {
    return (
      <div className="pf-card">
        <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Tes cours', 'Kou ou yo')} />
        <p className="pf-empty">
          {t(
            'Tu n’as pas encore ouvert de cours. Ta première leçon terminée apparaîtra ici.',
            'Ou poko louvri okenn kou. Premye leson ou fini an ap parèt isit la.',
          )}
        </p>
        <button type="button" className="pf-btn pf-btn--primary" onClick={onExplore}>
          {t('Explorer les cours', 'Eksplore kou yo')}
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  // Busiest course first: the list is a record of work done, so the course
  // with the most of it belongs at the top.
  const sorted = [...allProgress].sort(
    (a, b) => (b.completedLessons?.length || 0) - (a.completedLessons?.length || 0),
  );

  return (
    <div className="pf-card">
      <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Tes cours', 'Kou ou yo')} />
      <ul className="pf-rows">
        {sorted.map((p) => {
          const done = p.completedLessons?.length || 0;
          const { code, name, level } = parse(p.courseId);
          return (
            <li key={p.courseId}>
              <Link className="pf-row" to={`/courses/${p.courseId}`}>
                <IconTile tone={SUBJECT_TONE[code] || 'azure'}><BookOpen size={20} /></IconTile>
                <span className="pf-row__body">
                  <span className="pf-row__title">{name}{level ? ` · ${level}` : ''}</span>
                  <span className="pf-row__meta">
                    {/* No "x / y": the total lesson count for a course isn't
                        loaded here, and a fraction would imply a denominator we
                        do not have. */}
                    {done} {done === 1 ? t('leçon terminée', 'leson fini') : t('leçons terminées', 'leson fini')}
                    {p.totalPoints ? ` · ${p.totalPoints} ${t('points', 'pwen')}` : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="pf-row__chev" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * rankWindow — the learner and the one entry either side of them.
 *
 * Pure so it can be tested without a board: the interesting cases are the ends
 * of the list (rank 1 has nobody above; the last entry has nobody below) and
 * the learner being absent entirely, which is the normal state for anyone who
 * has not chosen a pseudonym.
 */
export function rankWindow(entries: any[], uid: string | null) {
  const list = entries || [];
  const idx = uid ? list.findIndex((e) => e.id === uid) : -1;
  if (idx < 0) return { slice: [], gap: 0 };
  const slice = list.slice(Math.max(0, idx - 1), idx + 2);
  const ahead = idx > 0 ? list[idx - 1] : null;
  // Never negative: a board that momentarily reports the entry above with
  // fewer XP must not print "-40 XP vous séparent".
  const gap = ahead ? Math.max(0, (ahead.xp || 0) - (list[idx].xp || 0)) : 0;
  return { slice, gap };
}


/**
 * Profile — "Mon profil & paramètres de compte".
 *
 * Ted's mockup, kept to what the account really holds. A compact title bar
 * (portrait, name, @pseudo, class, the one Enregistrer), three real figures,
 * then two columns of numbered sections:
 *
 *   1 Informations  — name, pseudo, school, class, residence, filière
 *   2 Objectifs     — goal + daily rhythm (users/{uid}), weak/strong units
 *   3 Réseau        — your school's standing, schoolmates on the board, invite
 *   4 Préférences   — theme, language, alerts, visibility on the board
 *   5 Compte        — e-mail, password reset, relevé, privacy, delete, logout
 *
 * Saving: the title bar's Enregistrer saves the identity fields of section 1
 * (pseudo, school, residence) — the only fields that write together to the
 * board identity. Everything else applies on tap, as it always has: class,
 * filière, theme, language, goal, rhythm and the board toggle.
 *
 * Left out on purpose, because none of it exists: storage/offline meters,
 * MicroSD backup, SMS recovery, an export key, a "candidat officiel" badge,
 * friends and chat, a data-saver mode.
 */
export default function Profile() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const {
    user, isAuthenticated, language, setLanguage, theme, toggleTheme,
    setShowNotifications, toggleAuthModal, setActiveTab, logout,
    grade, setGrade, setGradeChosen, track,
  } = useStore();
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();
  const { entries: boardEntries, myRank } = useLeaderboard(50);
  // Hooks run before the guest early-return, as they must; useAllProgress
  // no-ops without a signed-in user.
  const { progress: allProgress, loading: progressLoading } = useAllProgress();
  const [showTrackSelector, setShowTrackSelector] = React.useState(false);

  const [identity, setIdentity] = React.useState<IdentityState>({ dirty: false, aliasOk: true, status: 'idle' });
  const onIdentityState = React.useCallback((s: IdentityState) => setIdentity(s), []);
  const saveRef = React.useRef<(() => void) | null>(null);

  const [boardBusy, setBoardBusy] = React.useState(false);
  const [boardFailed, setBoardFailed] = React.useState(false);

  // /profile#reglages — the "Choisir un pseudo" links everywhere — lands on
  // the settings and, when there is no pseudo yet, in the pseudo field.
  const location = useLocation();
  const hasAlias = isValidAlias(profile?.leaderboard?.displayName || '');
  React.useEffect(() => {
    if (location.hash !== '#reglages') return;
    const id = window.setTimeout(() => {
      document.getElementById('reglages')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!hasAlias) (document.getElementById('profile-alias') as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash]);

  const trackInfo = React.useMemo(() => {
    try { return track ? TRACK_BY_CODE[track] : null; } catch { return null; }
  }, [track]);

  // ── Guest view ──────────────────────────────────────────────────────────
  if (!isAuthenticated || !user) {
    return (
      <section className="section">
        <div className="container profile-guest">
          <div className="profile-guest__card">
            <div className="profile-guest__icon"><GraduationCap size={32} /></div>
            <h1>{t('Ton profil EdLight', 'Pwofil EdLight ou')}</h1>
            <p className="text-muted">
              {t(
                'Un compte garde ce que tu as déjà fait : ta progression, ton score de préparation, ta série et ta place au classement te suivent d’un appareil à l’autre.',
                'Yon kont kenbe sa ou deja fè : pwogrè ou, nòt preparasyon ou, seri ou ak plas ou nan klasman an swiv ou sou nenpòt aparèy.',
              )}
            </p>
            <div className="profile-guest__actions">
              <button
                className="button button--primary"
                onClick={() => { setActiveTab('signup'); toggleAuthModal(); }}
              >
                {t('Créer un compte', 'Kreye yon kont')}
              </button>
              <button
                className="button button--ghost"
                onClick={() => { setActiveTab('signin'); toggleAuthModal(); }}
              >
                {t('Se connecter', 'Konekte')}
              </button>
            </div>
            {/* Guest learning stays available — the account is a benefit, not a
                gate, and this page must not read as one. */}
            <p className="profile-guest__free">
              {t(
                'Sans compte, les cours et les vidéos restent accessibles.',
                'San kont, kou yo ak videyo yo rete disponib.',
              )}{' '}
              <Link to="/courses">{t('Voir les cours', 'Gade kou yo')}</Link>
            </p>
          </div>

          <div className="profile-links profile-links--guest">
            <Link to="/about" className="profile-link"><Info size={18} /> {t('À propos', 'Sou nou')}<ChevronRight size={16} /></Link>
            <button className="profile-link" onClick={() => toggleTheme()}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              {theme === 'dark' ? t('Mode clair', 'Mòd klè') : t('Mode nuit', 'Mòd lannwit')}
              <ChevronRight size={16} />
            </button>
            <button className="profile-link" onClick={() => setLanguage(isCreole ? 'fr' : 'ht')}>
              <Languages size={18} /> {isCreole ? 'Français' : 'Kreyòl'}<ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Authenticated view ──────────────────────────────────────────────────
  const uid: string = user.uid;
  const board = profile?.leaderboard || {};
  const unlockedMilestones = new Set<string>(streak?.milestones || []);
  const courseBadges = new Set<string>((allProgress || []).flatMap((p) => p.badges || []));
  // Point badges are awarded per course, so "how close am I" is the best
  // single course, not the total across all of them.
  const bestCoursePoints = (allProgress || []).reduce(
    (best, p) => Math.max(best, p.totalPoints || 0), 0,
  );
  const achievements = buildAchievements({
    isCreole, streak, unlockedMilestones, courseBadges, bestCoursePoints,
  });

  const days = streak?.currentStreak || 0;
  const nextMilestone = STREAK_MILESTONES.find((m) => m.days > days);
  const { gap } = rankWindow(boardEntries, uid);

  const gradeEntry = GRADES.find((g) => g.code === grade);
  const gradeLabel = gradeEntry ? (isCreole ? gradeEntry.labelHt : gradeEntry.label) : '';
  const accountName = user.name || getFirstName(user) || t('Élève', 'Elèv');
  const alias = hasAlias ? String(board.displayName) : '';

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
    logout();
    navigate('/');
  };

  // The board switch writes the same document as the identity form, with
  // everything but `optedIn` passed through unchanged.
  const setOnBoard = async (next: boolean) => {
    setBoardBusy(true);
    setBoardFailed(false);
    const updated = await saveBoardIdentity(uid, { optedIn: next });
    if (updated) qc.setQueryData(['trivia-profile', uid], updated);
    else setBoardFailed(true);
    setBoardBusy(false);
  };

  const saveLabel = identity.status === 'saving'
    ? t('Enregistrement…', 'Ap anrejistre…')
    : t('Enregistrer', 'Anrejistre');

  return (
    <section className="section pf pr">
      <div className="container pr-page">

        {/* ── Title bar — sticky only while there is something to save ── */}
        <header className={`pr-titlebar${identity.dirty ? ' is-dirty' : ''}`}>
          <div className="pr-titlebar__who">
            <span className="pr-titlebar__avatar">
              <PixelAvatar seed={user.uid || user.email || user.name} size={52} />
            </span>
            <div className="pr-titlebar__id">
              <h1 className="pr-titlebar__name">{accountName}</h1>
              <div className="pr-titlebar__meta">
                {alias
                  ? <span className="pr-handle">@{alias}</span>
                  : <a href="#reglages" className="pr-handle pr-handle--missing" onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('profile-alias')?.focus();
                  }}>{t('Choisir un pseudo', 'Chwazi yon ti non')}</a>}
                {gradeLabel && <Pill tone="azure">{gradeLabel}</Pill>}
              </div>
            </div>
          </div>
          <div className="pr-titlebar__save">
            {identity.dirty && identity.status !== 'saving' && (
              <span className="pr-titlebar__hint">{t('Modifications non enregistrées', 'Chanjman pa anrejistre')}</span>
            )}
            {identity.status === 'saved' && !identity.dirty && (
              <span className="pr-ok" role="status"><Check size={14} aria-hidden="true" /> {t('Enregistré', 'Anrejistre')}</span>
            )}
            {identity.status === 'failed' && (
              <span className="pr-failed" role="alert">
                <AlertTriangle size={14} aria-hidden="true" /> {t('Non enregistré — réessayez.', 'Pa anrejistre — eseye ankò.')}
              </span>
            )}
            <button
              type="button"
              className="pr-save"
              disabled={!identity.dirty || !identity.aliasOk || identity.status === 'saving'}
              onClick={() => saveRef.current?.()}
            >
              {identity.status === 'saving' && <Loader2 size={15} className="profile-spin" aria-hidden="true" />}
              {saveLabel}
            </button>
          </div>
        </header>

        {/* ── Three figures, each from its own source ── */}
        <div className="pr-stats">
          <HeroStat
            tone="amber"
            icon={<Flame size={16} />}
            value={days}
            label={days === 1 ? t('Jour de suite', 'Jou swit') : t('Jours de suite', 'Jou swit')}
            sub={nextMilestone
              ? t(`Prochain palier : ${nextMilestone.days}`, `Pwochen palye : ${nextMilestone.days}`)
              : t('Tous les paliers atteints', 'Tout palye yo fèt')}
          />
          <div className="pf-stat">
            <IconTile tone="azure" size="sm"><Zap size={16} /></IconTile>
            <span className="pf-stat__value num">{level.xp}</span>
            <span className="pf-stat__label">{t(`XP · niveau ${level.level}`, `XP · nivo ${level.level}`)}</span>
            <Meter pct={level.progressPct} tone="azure" />
            <span className="pf-stat__sub">{t(`reste ${level.xpToNext} XP`, `rete ${level.xpToNext} XP`)}</span>
          </div>
          <HeroStat
            tone="emerald"
            icon={<Trophy size={16} />}
            value={myRank ? `#${myRank}` : '—'}
            label={t('Classement de la semaine', 'Klasman semèn nan')}
            sub={!myRank
              ? (board.optedIn ? t('Pseudo requis', 'Ou bezwen yon ti non') : t('Pas au classement', 'Pa nan klasman an'))
              : gap > 0
                ? t(`${gap} XP du #${myRank - 1}`, `${gap} XP pou #${myRank - 1}`)
                : t('En tête', 'An tèt')}
          />
        </div>

        <div className="pr-grid" id="reglages">
          <div className="pr-col">
            {/* 1 — Informations */}
            <section className="pr-sec" aria-labelledby="pr-sec-1">
              <SectionHead n={1} title={t('Informations', 'Enfòmasyon')} sub={t('Renseignées une fois, réutilisées partout.', 'Ranpli yon fwa, sèvi toupatou.')} />
              <IdentityFields
                isCreole={isCreole}
                uid={uid}
                board={board}
                saveRef={saveRef}
                accountName={accountName}
                onState={onIdentityState}
                afterSchool={(
                  <div className="profile-field">
                    <span className="profile-field__label">{t('Classe', 'Klas')}</span>
                    <div className="profile-grades">
                      {GRADES.map((g) => (
                        <button
                          key={g.code}
                          type="button"
                          className={`profile-grade${grade === g.code ? ' is-on' : ''}`}
                          aria-pressed={grade === g.code}
                          onClick={() => { setGrade(g.code); setGradeChosen(true); }}
                        >
                          {isCreole ? g.labelHt : g.label}
                        </button>
                      ))}
                    </div>
                    <small className="profile-field__why">
                      {t('Appliquée tout de suite : elle choisit tes cours, quiz et examens.', 'Aplike touswit : se li ki chwazi kou, quiz ak egzamen ou.')}
                    </small>
                  </div>
                )}
              />
              <div className="profile-field">
                <span className="profile-field__label">{t('Filière du Bac', 'Filyè Bak la')}</span>
                <button type="button" className="profile-link" onClick={() => setShowTrackSelector(true)}>
                  {trackInfo
                    ? <><span aria-hidden="true">{trackInfo.icon}</span> {trackInfo.label}</>
                    : <><RefreshCw size={18} /> {t('Choisir ma filière', 'Chwazi filyè mwen')}</>}
                  <ChevronRight size={16} />
                </button>
              </div>
            </section>

            {/* 2 — Objectifs */}
            <section className="pr-sec">
              <SectionHead n={2} title={t('Objectifs', 'Objektif')} sub={t('Ce que tu vises, et où tu en es vraiment.', 'Sa ou vize, ak kote ou ye vre.')} />
              <GoalRhythm uid={uid} t={t} />
              <SkillSpots uid={uid} isCreole={isCreole} t={t} />
            </section>

            {/* 3 — Réseau */}
            <section className="pr-sec">
              <SectionHead n={3} title={t('Réseau', 'Rezo')} sub={t('Ton école, et qui la représente avec toi.', 'Lekòl ou, ak kiyès ki reprezante l avè w.')} />
              <MySchoolCard where="profile" />
              <Schoolmates entries={boardEntries} uid={uid} school={board.school || ''} t={t} />
            </section>
          </div>

          <div className="pr-col">
            {/* 4 — Préférences */}
            <section className="pr-sec">
              <SectionHead n={4} title={t('Préférences', 'Preferans')} />
              <div className="pr-field">
                <span className="pr-label">{t('Langue', 'Lang')}</span>
                <div className="pr-seg" role="group" aria-label={t('Langue', 'Lang')}>
                  <button type="button" className={`pr-seg__opt${!isCreole ? ' is-on' : ''}`} aria-pressed={!isCreole} onClick={() => setLanguage('fr')}>Français</button>
                  <button type="button" className={`pr-seg__opt${isCreole ? ' is-on' : ''}`} aria-pressed={isCreole} onClick={() => setLanguage('ht')}>Kreyòl</button>
                </div>
              </div>
              <Toggle
                on={theme === 'dark'}
                onChange={() => toggleTheme()}
                label={t('Mode nuit', 'Mòd lannwit')}
              />
              <Toggle
                on={!!board.optedIn}
                disabled={boardBusy || (!board.optedIn && !hasAlias)}
                onChange={setOnBoard}
                label={t('Visible au classement', 'Vizib nan klasman an')}
                hint={boardFailed
                  ? <span className="pr-failed" role="alert">{t('Non enregistré — réessayez.', 'Pa anrejistre — eseye ankò.')}</span>
                  : !board.optedIn && !hasAlias
                    ? t('Choisissez d’abord un pseudo (section 1).', 'Chwazi yon ti non anvan (seksyon 1).')
                    : board.optedIn
                      ? t('Ton pseudo, ton école et ta ville apparaissent au classement.', 'Ti non ou, lekòl ou ak vil ou parèt nan klasman an.')
                      : t('Désactivé : tes nouveaux points ne sont pas publiés.', 'Dezaktive : nouvo pwen ou yo pa pibliye.')}
              />
              <button type="button" className="pr-row" onClick={() => setShowNotifications(true)}>
                <Bell size={16} aria-hidden="true" /> {t('Mes alertes', 'Alèt mwen')}
                <ChevronRight size={15} className="pr-row__chev" aria-hidden="true" />
              </button>
            </section>

            {/* 5 — Compte */}
            <section className="pr-sec">
              <SectionHead n={5} title={t('Compte', 'Kont')} />
              <AccountBlock email={user.email || null} t={t} onLogout={handleLogout} />
            </section>

            <ReadinessCard />
          </div>
        </div>

        {/* ── The record: courses and badges, compact ── */}
        <div className="pr-journey">
          <CourseProgressCard
            allProgress={allProgress}
            loading={progressLoading}
            isCreole={isCreole}
            onExplore={() => navigate('/courses')}
          />
          <AchievementShelf achievements={achievements} isCreole={isCreole} />
        </div>
      </div>

      {showTrackSelector && (
        <TrackSelectorModal currentTrack={track} onClose={() => setShowTrackSelector(false)} />
      )}
    </section>
  );
}
