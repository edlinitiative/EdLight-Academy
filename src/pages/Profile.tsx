/**
 * Profile — the learner's account page (the bottom-nav "Profil" destination).
 * The layout and what it deliberately leaves out are described above the
 * default export; the exported pieces (achievement shelf, course card,
 * rankWindow) are pure enough to test on their own.
 */

import React from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell, Info, Moon, Languages, ChevronRight, ChevronDown, Check, Loader2, ShieldCheck, AlertTriangle,
  TrendingUp, Trophy, Smartphone, Shield, Flag, Settings,
} from '../components/icons';
import * as AppIcons from '../components/icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { logoutUser } from '../services/authService';
import { getWebRelease } from '../utils/telemetry';
import { STREAK_MILESTONES } from '../services/streakService';
import { setLeaderboardOptIn as saveBoardIdentity } from '../services/triviaService';
import { isValidAlias } from '../services/leaderboardService';
import { readMasteryResult } from '../services/masteryService';
import ReadinessCard from '../components/ReadinessCard';
import { Skeleton } from '../components/Skeleton';
import SchoolField from '../components/arena/SchoolField';
import { GRADES, TRACK_BY_CODE } from '../config/trackConfig';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf, findCity } from '../data/haitiGeo';
import UserAvatar from '../components/UserAvatar';
import Avatar from '../arena-art/avatars/Avatar';
import { useMyAvatar } from '../hooks/useMyAvatar';
import './profile/avatarEntry.css';
import MySchoolCard from '../components/MySchoolCard';
import { schoolKey } from '../../shared/schools';
import { normalizeName } from '../../shared/leaderboardAgg';
import type { ProgressMap } from '../../shared/mastery';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import '../styles/pf.css';
import './Profile.css';
import { AccountBlock, GoalRhythm, Regularity, SettingsRow, SkillSpots, Schoolmates, Toggle } from './profile/ProfileSections';
import { courseEvidence, evidenceLine, loadCourseLessonCounts, loadCourseLessonIds } from './profile/profileData';
import { buildProfilePreview, type ProfilePreview } from './profile/profilePreview';
import { EVIDENCE, trackJourney } from '../utils/learningJourney';



/** Lazy TrackSelector, same wrapper the navbar dropdown uses. */
function TrackSelectorModal({ currentTrack, onClose }: { currentTrack: string | null; onClose: () => void }) {
  const TrackSelector = React.lazy(() => import('../components/TrackSelector'));
  return (
    <React.Suspense fallback={null}>
      <TrackSelector mode="modal" currentTrack={currentTrack} onClose={onClose} onSelect={onClose} />
    </React.Suspense>
  );
}

/** Phone layout below 720px (Stitch 08). jsdom has no matchMedia → desktop. */
function useIsPhone(): boolean {
  const q = '(max-width: 719px)';
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  const [phone, setPhone] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(q);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

/** "NS III" for the secondary classes, the short label otherwise. */
const ROMAN: Record<string, string> = { NS1: 'NS I', NS2: 'NS II', NS3: 'NS III', NS4: 'NS IV' };
function gradePill(code: string | null | undefined, isCreole: boolean): string {
  if (!code) return '';
  if (ROMAN[code]) return ROMAN[code];
  if (code === 'POSTBAC') return isCreole ? 'Prefak' : 'Préfac';
  const g = GRADES.find((x) => x.code === code);
  return g ? (isCreole ? g.labelHt : g.label) : '';
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
  /** The card footer's "Enregistrer" calls this. Not a <form>: Enter in the
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
    <div className="pr-form">
      {/* The account name comes from sign-up (Google or e-mail) and is never
          shown to other students — read-only here, the pseudo is what's public. */}
      <div className="pr-field">
        <span className="pr-label" id="pr-name-label">{t('Nom complet', 'Non konplè')}</span>
        <span className="pr-input pr-input--readonly" aria-labelledby="pr-name-label">{accountName}</span>
      </div>

      <div className="pr-field">
        <label className="pr-label" htmlFor="profile-alias">{t('Pseudo affiché', 'Ti non pou afiche')}</label>
        <input
          id="profile-alias"
          className="pr-input"
          value={alias}
          maxLength={24}
          aria-describedby="profile-alias-why"
          aria-invalid={!aliasOk || undefined}
          onChange={(e) => { setAlias(e.target.value); setStatus('idle'); }}
          placeholder={t('Ex. Naïka M.', 'Egz. Naïka M.')}
        />
        <small className="pr-why" id="profile-alias-why">
          {t(
            'Le seul nom que les autres élèves voient. Ton nom complet n’est jamais affiché.',
            'Se sèl non lòt elèv yo wè. Non konplè ou pa janm parèt.',
          )}
        </small>
        {!aliasOk && (
          <small className="pr-error">
            {t('Le pseudo doit contenir au moins une lettre.', 'Ti non an dwe gen omwen yon lèt.')}
          </small>
        )}
      </div>

      {afterSchool}

      {/* The /arena picker itself — matcher, duplicate warning and
          missing-school submission included. */}
      <div className="pr-field pr-school">
        <SchoolField picked={picked} onPick={(s) => { setPicked(s); setStatus('idle'); }} isCreole={isCreole} signedIn={!!uid} />
        <small className="pr-why">
          {t(
            'Ton école sert au championnat interscolaire et au classement par école — on ne te la redemandera pas ailleurs.',
            'Lekòl ou sèvi pou chanpyona ant lekòl yo ak klasman pa lekòl — nou p ap mande w li yon lòt kote.',
          )}
        </small>
        {/* The existing board rule, said before saving: an entry carries ONE
            school (api/leaderboard/award.ts stamps it on every game), so this
            week's points move with the student. An Arène registration is its
            own record and does not move. */}
        {storedSchool && picked && normalizeName(picked.label) !== normalizeName(storedSchool) && (
          <small className="pr-why" role="status">
            {t(
              `Tes points de cette semaine passent avec toi à ${picked.label}. Une inscription à l’Arène déjà faite ne change pas.`,
              `Pwen ou fè semèn sa a ale avè w nan ${picked.label}. Yon enskripsyon nan Arèn nan ki deja fèt pa chanje.`,
            )}
          </small>
        )}
      </div>

      <fieldset className="pr-residence">
        <legend className="pr-label">{t('Département / Ville où tu habites', 'Depatman / Vil kote ou rete')}</legend>
        <div className="pr-residence__row">
          <div className="pr-field">
            <label className="pr-sublabel" htmlFor="pr-dept">{t('Département', 'Depatman')}</label>
            <span className="pr-select">
              <select
                id="pr-dept"
                className="pr-input"
                value={department}
                onChange={(e) => pickDepartment(e.target.value)}
              >
                <option value="">{t('Choisir', 'Chwazi')}</option>
                {HAITI_DEPARTMENTS.map((d) => (
                  <option key={d.name} value={d.name}>{d.name}</option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </span>
          </div>

          {department && (
            <div className="pr-field">
              <label className="pr-sublabel" htmlFor={deptCities.length > 0 ? 'pr-city' : 'pr-city-other'}>{t('Ville', 'Vil')}</label>
              {deptCities.length > 0 && (
                <span className="pr-select">
                  <select
                    id="pr-city"
                    className="pr-input"
                    value={cityChoice}
                    onChange={(e) => { setCityChoice(e.target.value); setCustomCity(''); setStatus('idle'); }}
                  >
                    <option value="">{t('Choisir', 'Chwazi')}</option>
                    {deptCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value={OTHER_CITY}>{t('Autre ville…', 'Lòt vil…')}</option>
                  </select>
                  <ChevronDown size={18} aria-hidden="true" />
                </span>
              )}
              {cityChoice === OTHER_CITY && (
                <input
                  id="pr-city-other"
                  className="pr-input"
                  value={customCity}
                  maxLength={60}
                  aria-label={t('Nom de ta ville', 'Non vil ou')}
                  onChange={(e) => { setCustomCity(e.target.value); setStatus('idle'); }}
                  placeholder={t('Nom de ta ville', 'Non vil ou')}
                />
              )}
            </div>
          )}
        </div>
        <small className="pr-why">
          {t(
            'Pour le classement par ville et par département. Ce n’est pas l’adresse de ton école : beaucoup d’élèves étudient dans une autre commune.',
            'Pou klasman pa vil ak pa depatman. Se pa adrès lekòl ou : anpil elèv etidye nan yon lòt komin.',
          )}
        </small>
      </fieldset>

      <p className="pr-why pr-why--icon">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          {board?.optedIn
            ? t(
              'Tu participes au classement : ton pseudo, ton école et ta ville y sont visibles.',
              'Ou nan klasman an : ti non ou, lekòl ou ak vil ou parèt ladan l.',
            )
            : t(
              'Tu ne participes pas encore au classement — rien de ceci n’est public tant que tu ne l’as pas rejoint.',
              'Ou poko nan klasman an — anyen nan sa a pa piblik toutotan ou pa antre ladan l.',
            )}
        </span>
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Shared primitives (achievement shelf)
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
 * EvidenceHelp — "Que veulent dire ces mots ?" (DIRECTION §0.6): the three
 * evidence words with their shared definitions, wherever the triple appears.
 */
export function EvidenceHelp({ isCreole }: { isCreole: boolean }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const words = (['completed', 'practised', 'mastered'] as const).map((e) => ({
    e, word: isCreole ? EVIDENCE[e].ht : EVIDENCE[e].fr, help: isCreole ? EVIDENCE[e].helpHt : EVIDENCE[e].helpFr,
  }));
  return (
    <div className="pr-help">
      <button type="button" className="pr-textbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {isCreole ? 'Kisa mo sa yo vle di ?' : 'Que veulent dire ces mots ?'}
      </button>
      <dl id={id} className="pr-help__list" hidden={!open}>
        {words.map((w) => (
          <div key={w.e} className="pr-help__row">
            <dt>{w.word}</dt>
            <dd>{w.help}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * CourseProgressCard — "Tes cours": the courses you have actually opened,
 * each with its three evidence facts (LJ-10) over the course's real lesson
 * total: "12 terminées sur 30 · 7 pratiquées · 4 maîtrisées". A finished
 * video is "terminée", never mastery; facts that are zero are left out; the
 * denominator appears only when the catalogue snapshot gives it.
 */
const SUBJECT_NAMES: Record<string, [string, string]> = {
  CHEM: ['Chimie', 'Chimi'],
  PHYS: ['Physique', 'Fizik'],
  MATH: ['Mathématiques', 'Matematik'],
  ECON: ['Économie', 'Ekonomi'],
  BIO: ['Biologie', 'Byoloji'],
};
const LEVEL_ROMAN: Record<string, string> = { NS1: 'NS I', NS2: 'NS II', NS3: 'NS III', NS4: 'NS IV' };

export function CourseProgressCard({ allProgress, loading, failed = false, onRetry, isCreole, onExplore, mastery = null }: {
  allProgress: any[];
  loading: boolean;
  /** The progress (or mastery) read failed — an empty list is then NOT "no courses". */
  failed?: boolean;
  onRetry?: () => void;
  isCreole: boolean;
  onExplore: () => void;
  /** The shared mastery map (practised / mastered). Null while unknown. */
  mastery?: ProgressMap | null;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  // Denominators and lesson ids from the catalogue snapshot. Until (or
  // unless) it arrives, a row shows the counts alone — never a guessed total.
  const [totals, setTotals] = React.useState<Record<string, number>>({});
  const [lessonIds, setLessonIds] = React.useState<Record<string, string[]>>({});
  React.useEffect(() => {
    let live = true;
    loadCourseLessonCounts().then((x) => { if (live) setTotals(x); });
    loadCourseLessonIds().then((x) => { if (live) setLessonIds(x); });
    return () => { live = false; };
  }, []);

  // progress_summary_opened: once, when the course list is actually on screen.
  // Technical context only.
  const cardRef = React.useRef<HTMLElement>(null);
  const tracked = React.useRef(false);
  const courseCount = allProgress?.length || 0;
  React.useEffect(() => {
    if (loading || tracked.current || !cardRef.current) return undefined;
    const fire = () => {
      if (tracked.current) return;
      tracked.current = true;
      trackJourney('progress_summary_opened', { surface: 'profile', courses: courseCount });
    };
    if (typeof IntersectionObserver === 'undefined') { fire(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { fire(); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(cardRef.current);
    return () => io.disconnect();
  }, [loading, courseCount]);

  const parse = (courseId: string) => {
    const [subj, ...rest] = String(courseId || '').split('-');
    const code = (subj || '').toUpperCase();
    const lv = rest.join('-').toUpperCase();
    const name = SUBJECT_NAMES[code] ? SUBJECT_NAMES[code][isCreole ? 1 : 0] : subj || courseId;
    return `${name}${lv ? ` ${LEVEL_ROMAN[lv] || lv}` : ''}`;
  };

  const head = <h2 id="pr-courses-title" className="pr-card__title">{t('Tes cours', 'Kou ou yo')}</h2>;

  if (loading) {
    return (
      <section className="pr-card" aria-labelledby="pr-courses-title" aria-busy="true">
        {head}
        <div className="pr-courses">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={56} radius={14} />
          ))}
        </div>
      </section>
    );
  }

  if (failed) {
    return (
      <section className="pr-card" aria-labelledby="pr-courses-title" ref={cardRef}>
        {head}
        <p className="pr-muted" role="alert">
          {t(
            'Tes cours n’ont pas pu se charger. Rien n’est perdu : ta progression est enregistrée sur ton compte.',
            'Kou ou yo pa t ka chaje. Anyen pa pèdi : pwogrè ou anrejistre sou kont ou.',
          )}
        </p>
        <button type="button" className="pr-tonal pr-tonal--start" onClick={onRetry}>
          {t('Réessayer', 'Eseye ankò')}
        </button>
      </section>
    );
  }

  if (!allProgress || allProgress.length === 0) {
    return (
      <section className="pr-card" aria-labelledby="pr-courses-title" ref={cardRef}>
        {head}
        <p className="pr-muted">
          {t(
            'Tu n’as pas encore ouvert de cours. Ta première leçon terminée apparaîtra ici.',
            'Ou poko louvri okenn kou. Premye leson ou fini an ap parèt isit la.',
          )}
        </p>
        <button type="button" className="pr-tonal pr-tonal--start" onClick={onExplore}>
          {t('Explorer les cours', 'Eksplore kou yo')}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>
    );
  }

  const rows = allProgress.map((p) => {
    const id = String(p.courseId || '').toLowerCase();
    const ev = courseEvidence(p.completedLessons, lessonIds[id], mastery, totals[id]);
    return { p, id, ev };
  });
  // Busiest course first: the list is a record of work done.
  rows.sort((a, b) => b.ev.completed - a.ev.completed || b.ev.practised - a.ev.practised);

  return (
    <section className="pr-card" aria-labelledby="pr-courses-title" ref={cardRef}>
      {head}
      <ul className="pr-courses">
        {rows.map(({ p, ev }) => {
          const pct = ev.total ? Math.round((ev.completed / ev.total) * 100) : 0;
          const name = parse(p.courseId);
          return (
            <li key={p.courseId}>
              <Link className="pr-course" to={`/courses/${p.courseId}`}>
                <span className="pr-course__name">{name}</span>
                {ev.total ? (
                  <span
                    className="pr-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={ev.total}
                    aria-valuenow={ev.completed}
                    aria-label={t(`${name} : leçons terminées`, `${name} : leson fini`)}
                  >
                    <span className="pr-bar__fill" style={{ width: `${pct}%` }} />
                  </span>
                ) : null}
                <span className="pr-course__meta">{evidenceLine(ev, isCreole)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <EvidenceHelp isCreole={isCreole} />
    </section>
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
 * The face: the avatar the student built (/profile/avatar) when there is one,
 * else the account photo, else the generated face (seed = uid). The face is
 * also the way into the avatar editor.
 */
function ProfileFace({ uid, photo, name, size }: { uid: string; photo?: string | null; name: string; size: number }) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const { avatar } = useMyAvatar();
  const real = !avatar && typeof photo === 'string' && /^https?:\/\//i.test(photo.trim());
  const label = isCreole ? 'Modifye avatar mwen' : 'Modifier mon avatar';
  return (
    <Link to="/profile/avatar" className="pr-face-edit" aria-label={label} title={label}>
      <span className="pr-face" style={{ width: size, height: size }}>
        {real
          ? <UserAvatar seed={uid} name={name} uri={photo} size={size} />
          : <Avatar seed={uid} config={avatar} size={size} still />}
      </span>
      <span className="pr-face-edit__badge" aria-hidden="true"><AppIcons.Pencil size={14} aria-hidden="true" /></span>
    </Link>
  );
}

/** A Préférences row: label on the left, the control on the right. */
function LanguageSwitch({ isCreole, setLanguage, label }: { isCreole: boolean; setLanguage: (l: 'fr' | 'ht') => void; label: string }) {
  return (
    <div className="pr-seg" role="group" aria-label={label}>
      <button type="button" className={`pr-seg__opt${!isCreole ? ' is-on' : ''}`} aria-pressed={!isCreole} onClick={() => setLanguage('fr')}>Français</button>
      <button type="button" className={`pr-seg__opt${isCreole ? ' is-on' : ''}`} aria-pressed={isCreole} onClick={() => setLanguage('ht')}>Kreyòl</button>
    </div>
  );
}

/**
 * Profile — Stitch web pass (DIRECTION-WEB §3, 2026-10-17).
 *
 * No stat band: the identity row sits on the ground, and the three figures
 * the old strip showed now live where they mean something — the weekly rank
 * in "Ton classement" (MySchoolCard, profile variant) and the streak + level
 * in "Ta régularité".
 *
 *   desktop  main: Tes cours · Informations (with its Enregistrer) · Objectifs
 *                  · Réussites · Préférences · Compte
 *            side: Ton classement · Élèves de ton école · Ta régularité · Bac
 *   phone    Ton classement (its "Voir le classement" is the screen's solid)
 *            · Tes cours · Ta régularité · Réglages (inline accordions, so
 *            /profile#reglages still lands on the pseudo) · Se déconnecter
 *
 * Saving: Informations' Enregistrer saves the identity fields (pseudo, school,
 * residence) — the only fields that write together to the board identity.
 * Everything else applies on tap, as it always has: class, filière, theme,
 * language, goal, rhythm and the board toggle.
 *
 * Left out on purpose, because none of it exists: a weekly lesson target, an
 * e-mail change flow, e-mail reminder settings, friends and chat.
 *
 * Dev-only: /profile?preview=signed-in renders this page from the fixture in
 * profile/profilePreview.ts (fictional, never written); ?preview=school-card
 * renders the full MySchoolCard used on the workspace and /classement.
 */
export default function Profile() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const store = useStore();
  const {
    language, setLanguage, theme, toggleTheme,
    setShowNotifications, toggleAuthModal, setActiveTab, logout,
    setGrade, setGradeChosen, track,
  } = store;
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const isPhone = useIsPhone();

  // Dev-only screenshot harness. Never in a production bundle's code path.
  const [params] = useSearchParams();
  const previewKey = process.env.NODE_ENV !== 'production' ? params.get('preview') : null;
  const preview: ProfilePreview | null = React.useMemo(
    () => (previewKey === 'signed-in' || previewKey === 'school-card' ? buildProfilePreview() : null),
    [previewKey],
  );
  const [previewGrade, setPreviewGrade] = React.useState<string | null>(null);

  const user = preview ? preview.user : store.user;
  const isAuthenticated = preview ? true : store.isAuthenticated;
  const grade = preview ? (previewGrade || preview.grade) : store.grade;

  const trivia = useTrivia();
  const level = preview ? preview.level : trivia.level;
  const profile = preview ? preview.profile : trivia.profile;
  const streakLive = useStreak();
  const streak = preview ? preview.streak : streakLive.streak;
  const board50 = useLeaderboard(50);
  const boardEntries = preview ? preview.entries : board50.entries;
  // Hooks run before the guest early-return, as they must; useAllProgress
  // no-ops without a signed-in user.
  const progressLive = useAllProgress();
  const allProgress = preview ? preview.allProgress : progressLive.progress;
  const progressLoading = preview ? false : progressLive.loading;
  const progressFailed = preview ? false : progressLive.failed;
  const [showTrackSelector, setShowTrackSelector] = React.useState(false);

  // Practised / mastered for "Tes cours": the one shared mastery doc.
  const liveUid = !preview && store.isAuthenticated ? store.user?.uid || null : null;
  const [masteryLive, setMasteryLive] = React.useState<ProgressMap | null>(null);
  const [masteryFailed, setMasteryFailed] = React.useState(false);
  const [masteryTry, setMasteryTry] = React.useState(0);
  React.useEffect(() => {
    if (!liveUid) return undefined;
    let live = true;
    readMasteryResult(liveUid).then((r) => {
      if (!live) return;
      setMasteryLive(r.data || {});
      setMasteryFailed(r.status === 'error');
    }).catch(() => { if (live) { setMasteryLive({}); setMasteryFailed(true); } });
    return () => { live = false; };
  }, [liveUid, masteryTry]);
  const mastery = preview ? preview.mastery : masteryLive;

  const [identity, setIdentity] = React.useState<IdentityState>({ dirty: false, aliasOk: true, status: 'idle' });
  const onIdentityState = React.useCallback((s: IdentityState) => setIdentity(s), []);
  const saveRef = React.useRef<(() => void) | null>(null);

  const [boardBusy, setBoardBusy] = React.useState(false);
  const [boardFailed, setBoardFailed] = React.useState(false);
  const [openRow, setOpenRow] = React.useState<string | null>(null);

  const focusAlias = React.useCallback((delay = 0) => {
    window.setTimeout(() => {
      const target = document.getElementById('pr-info');
      target?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      (document.getElementById('profile-alias') as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, delay);
  }, []);

  // /profile#reglages — the "Choisir un pseudo" links everywhere — lands on
  // the settings and, when there is no pseudo yet, in the pseudo field.
  const location = useLocation();
  const hasAlias = isValidAlias(profile?.leaderboard?.displayName || '');
  React.useEffect(() => {
    if (location.hash !== '#reglages') return;
    if (isPhone) setOpenRow('info');
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

  // ── Guest view (Stitch 09; the same column, 560px, on desktop) ──────────
  if (!isAuthenticated || !user) {
    const keeps = [
      { icon: <TrendingUp size={20} />, text: t('Ta progression : leçons terminées, pratiquées, maîtrisées', 'Pwogrè ou : leson fini, pratike, metrize') },
      { icon: <Trophy size={20} />, text: t('Ta place au classement de ton école', 'Plas ou nan klasman lekòl ou') },
      { icon: <Smartphone size={20} />, text: t('Tes questions à revoir, sur tous tes appareils', 'Kesyon ou pou revize, sou tout aparèy ou yo') },
    ];
    return (
      <section className="section pf prx prx--guest">
        <div className="container prx-guest">
          <h1 className="prx-guest__title">{t('Profil', 'Pwofil')}</h1>

          <section className="pr-card" aria-labelledby="pr-keeps-title">
            <h2 id="pr-keeps-title" className="pr-card__title">{t('Ce qu’un compte garde pour toi', 'Sa yon kont kenbe pou ou')}</h2>
            <ul className="pr-keeps">
              {keeps.map((k) => (
                <li key={k.text} className="pr-keeps__row">
                  <span className="pr-chip-icon" aria-hidden="true">{k.icon}</span>
                  <span>{k.text}</span>
                </li>
              ))}
            </ul>
            <div className="pr-stack">
              <button type="button" className="pr-solid pr-solid--block" onClick={() => { setActiveTab('signup'); toggleAuthModal(); }}>
                {t('Créer un compte gratuit', 'Kreye yon kont gratis')}
              </button>
              <button type="button" className="pr-tonal pr-tonal--block" onClick={() => { setActiveTab('signin'); toggleAuthModal(); }}>
                {t('Se connecter', 'Konekte')}
              </button>
            </div>
            {/* Guest learning stays available — the account is a benefit, not a
                gate, and this page must not read as one. */}
            <p className="pr-muted pr-center">
              {t('Sans compte, les cours et les vidéos restent accessibles.', 'San kont, kou yo ak videyo yo rete disponib.')}{' '}
              <Link to="/courses" className="pr-link">{t('Voir les cours', 'Gade kou yo')}</Link>
            </p>
          </section>

          {/* A shape preview of Ton classement — no numbers, nothing invented. */}
          <section className="pr-card pr-peek" aria-label={t('Aperçu : ton classement', 'Apèsi : klasman ou')}>
            <div className="pr-peek__top">
              <span className="pr-muted">{t('Aperçu', 'Apèsi')}</span>
              <span className="pr-muted">{t('Ton classement', 'Klasman ou')}</span>
            </div>
            <div className="pr-peek__row">
              <span className="pr-peek__shield" aria-hidden="true"><Shield size={26} /></span>
              <span className="pr-peek__text">
                <span className="pr-peek__name">{t('Ton école', 'Lekòl ou')}</span>
                <span className="pr-muted">{t('Choisis ton école à l’inscription', 'Chwazi lekòl ou lè w ap enskri')}</span>
              </span>
            </div>
          </section>

          <section className="pr-card" aria-labelledby="pr-guest-settings">
            <h2 id="pr-guest-settings" className="pr-card__title">{t('Réglages', 'Paramèt')}</h2>
            <div className="pr-list">
              <Toggle on={theme === 'dark'} onChange={() => toggleTheme()} label={t('Mode nuit', 'Mòd lannwit')} />
              <div className="pr-line">
                <span className="pr-line__label" id="pr-lang-guest">{t('Langue', 'Lang')}</span>
                <LanguageSwitch isCreole={isCreole} setLanguage={setLanguage} label={t('Langue', 'Lang')} />
              </div>
              <Link to="/about" className="pr-line pr-line--link">
                <span className="pr-line__label">{t('À propos', 'Sou nou')}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </section>
    );
  }

  // ── Authenticated view ──────────────────────────────────────────────────
  const uid: string = user.uid;
  const board = profile?.leaderboard || {};
  const unlockedMilestones = new Set<string>(streak?.milestones || []);
  const courseBadges = new Set<string>((allProgress || []).flatMap((p: any) => p.badges || []));
  // Point badges are awarded per course, so "how close am I" is the best
  // single course, not the total across all of them.
  const bestCoursePoints = (allProgress || []).reduce(
    (best: number, p: any) => Math.max(best, p.totalPoints || 0), 0,
  );
  const achievements = buildAchievements({
    isCreole, streak, unlockedMilestones, courseBadges, bestCoursePoints,
  });

  const accountName = (user as any).name || getFirstName(user) || t('Élève', 'Elèv');
  const alias = hasAlias ? String(board.displayName) : '';
  const pill = gradePill(grade, isCreole);
  const photo = (user as any).picture || (user as any).photoURL || null;

  const schoolPreview = preview ? {
    uid, profile: preview.profile, race: preview.race, entries: preview.entries,
    myRank: preview.myRank, myEntry: preview.entries.find((e) => e.id === uid) || null,
  } : null;

  // ?preview=school-card — the FULL card (workspace, /classement), for review.
  if (preview && previewKey === 'school-card') {
    return (
      <section className="section pf prx">
        <div className="container prx-page">
          <p className="prx-devnote">{t('Aperçu de développement — données fictives', 'Apèsi devlopman — done fiktif')}</p>
          <h1 className="prx-guest__title">MySchoolCard</h1>
          <div className="prx-cardcheck">
            <div className="prx-cardcheck__narrow"><MySchoolCard where="preview" preview={schoolPreview} /></div>
            <div className="prx-cardcheck__wide"><MySchoolCard where="preview" preview={schoolPreview} /></div>
          </div>
        </div>
      </section>
    );
  }

  const handleLogout = async () => {
    if (preview) return;
    try { await logoutUser(); } catch {}
    logout();
    navigate('/');
  };

  // The board switch writes the same document as the identity form, with
  // everything but `optedIn` passed through unchanged.
  const setOnBoard = async (next: boolean) => {
    if (preview) return;
    setBoardBusy(true);
    setBoardFailed(false);
    const updated = await saveBoardIdentity(uid, { optedIn: next });
    if (updated) qc.setQueryData(['trivia-profile', uid], updated);
    else setBoardFailed(true);
    setBoardBusy(false);
  };

  const pickGrade = (code: string) => {
    if (preview) { setPreviewGrade(code); return; }
    setGrade(code);
    setGradeChosen(true);
  };

  const saveLabel = identity.status === 'saving'
    ? t('Enregistrement…', 'Ap anrejistre…')
    : t('Enregistrer', 'Anrejistre');

  const openInfo = () => {
    if (isPhone) { setOpenRow('info'); focusAlias(60); } else focusAlias(0);
  };
  // "Changer d'école" (MySchoolCard): the same Informations form, landing on
  // the school picker — its own "Changer" button, or the search box.
  const openSchool = () => {
    if (isPhone) setOpenRow('info');
    window.setTimeout(() => {
      const field = document.querySelector('.pr-school');
      field?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      const target = (field?.querySelector('.arena-field__picked button') || document.getElementById('arena-school')) as HTMLElement | null;
      target?.focus({ preventScroll: true });
    }, isPhone ? 60 : 0);
  };

  /* ── Pieces shared by both layouts ── */
  const classPicker = (
    <div className="pr-field">
      <label className="pr-label" htmlFor="pr-grade">{t('Classe', 'Klas')}</label>
      <span className="pr-select">
        <select id="pr-grade" className="pr-input" value={grade || ''} aria-describedby="pr-grade-why" onChange={(e) => pickGrade(e.target.value)}>
          {!grade && <option value="">{t('Choisir', 'Chwazi')}</option>}
          {GRADES.map((g) => (
            <option key={g.code} value={g.code}>{isCreole ? g.labelHt : g.label}</option>
          ))}
        </select>
        <ChevronDown size={18} aria-hidden="true" />
      </span>
      <small className="pr-why" id="pr-grade-why">
        {t('Appliquée tout de suite : elle choisit tes cours, quiz et examens.', 'Aplike touswit : se li ki chwazi kou, quiz ak egzamen ou.')}
      </small>
    </div>
  );

  const informations = (
    <>
      <IdentityFields
        isCreole={isCreole}
        uid={preview ? null : uid}
        board={board}
        saveRef={saveRef}
        accountName={accountName}
        onState={onIdentityState}
        afterSchool={classPicker}
      />
      <div className="pr-field">
        <span className="pr-label" id="pr-track-label">{t('Filière du Bac', 'Filyè Bak la')}</span>
        <button type="button" className="pr-wellbtn" aria-describedby="pr-track-label" onClick={() => setShowTrackSelector(true)}>
          <span>{trackInfo ? trackInfo.label : t('Choisir ma filière', 'Chwazi filyè mwen')}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="pr-savebar">
        <div className="pr-savebar__status">
          {identity.dirty && identity.status !== 'saving' && (
            <span className="pr-muted">{t('Modifications non enregistrées', 'Chanjman pa anrejistre')}</span>
          )}
          {identity.status === 'saved' && !identity.dirty && (
            <span className="pr-ok" role="status"><Check size={16} aria-hidden="true" /> {t('Enregistré', 'Anrejistre')}</span>
          )}
          {identity.status === 'failed' && (
            <span className="pr-failed" role="alert">
              <AlertTriangle size={16} aria-hidden="true" /> {t('Non enregistré — réessayez.', 'Pa anrejistre — eseye ankò.')}
            </span>
          )}
        </div>
        <button
          type="button"
          className="pr-solid"
          disabled={!identity.dirty || !identity.aliasOk || identity.status === 'saving'}
          onClick={() => saveRef.current?.()}
        >
          {identity.status === 'saving' && <Loader2 size={16} className="profile-spin" aria-hidden="true" />}
          {saveLabel}
        </button>
      </div>
    </>
  );

  const objectives = (
    <>
      <GoalRhythm uid={uid} t={t} initial={preview ? preview.studyPrefs : undefined} />
      <SkillSpots uid={uid} isCreole={isCreole} t={t} preview={preview ? { review: preview.review, mastery: preview.mastery } : undefined} />
    </>
  );

  const boardToggle = (
    <Toggle
      on={!!board.optedIn}
      disabled={boardBusy || (!board.optedIn && !hasAlias)}
      onChange={setOnBoard}
      label={t('Visible au classement', 'Vizib nan klasman an')}
      hint={boardFailed
        ? <span className="pr-failed" role="alert">{t('Non enregistré — réessayez.', 'Pa anrejistre — eseye ankò.')}</span>
        : !board.optedIn && !hasAlias
          ? t('Choisis d’abord un pseudo (Informations).', 'Chwazi yon ti non anvan (Enfòmasyon).')
          : board.optedIn
            ? t('Ton pseudo, ton école et ta ville apparaissent au classement.', 'Ti non ou, lekòl ou ak vil ou parèt nan klasman an.')
            : t('Désactivé : tes nouveaux points ne sont pas publiés.', 'Dezaktive : nouvo pwen ou yo pa pibliye.')}
    />
  );
  const alertsRow = (
    <button type="button" className="pr-line pr-line--link" onClick={() => setShowNotifications(true)}>
      <span className="pr-line__label">{t('Mes alertes', 'Alèt mwen')}</span>
      <Bell size={20} aria-hidden="true" />
    </button>
  );

  const identityRow = (
    <header className="pr-id">
      <ProfileFace uid={uid} photo={photo} name={accountName} size={isPhone ? 64 : 72} />
      <div className="pr-id__text">
        <div className="pr-id__nameRow">
          <h1 className="pr-id__name">{accountName}</h1>
          {pill && <span className="pr-pill">{pill}</span>}
        </div>
        <p className="pr-id__meta">
          {alias
            ? <span className="pr-id__handle">@{alias}</span>
            : <a href="#reglages" className="pr-id__handle pr-id__handle--missing" onClick={(e) => { e.preventDefault(); openInfo(); }}>{t('Choisir un pseudo', 'Chwazi yon ti non')}</a>}
          {(board.school || board.city) && <span className="pr-id__sep" aria-hidden="true">·</span>}
          {(board.school || board.city) && (
            <span className="pr-id__where">{[board.school, board.city].filter(Boolean).join(' · ')}</span>
          )}
        </p>
      </div>
      <button type="button" className="pr-tonal pr-id__edit" onClick={openInfo}>
        {isPhone ? t('Modifier', 'Modifye') : t('Modifier le profil', 'Modifye pwofil la')}
      </button>
    </header>
  );

  const devNote = preview ? <p className="prx-devnote">{t('Aperçu de développement — données fictives', 'Apèsi devlopman — done fiktif')}</p> : null;
  const regularity = <Regularity streak={streak} level={level} isCreole={isCreole} t={t} />;
  const courses = (
    <CourseProgressCard
      allProgress={allProgress}
      loading={progressLoading}
      failed={progressFailed || masteryFailed}
      onRetry={() => {
        if (progressFailed) progressLive.retry();
        if (masteryFailed) setMasteryTry((n) => n + 1);
      }}
      isCreole={isCreole}
      onExplore={() => navigate('/courses')}
      mastery={mastery}
    />
  );

  // ── Phone (Stitch 08) ──
  if (isPhone) {
    const toggleRow = (id: string) => setOpenRow((cur) => (cur === id ? null : id));
    return (
      <section className="section pf prx">
        <div className="container prx-page">
          {devNote}
          {identityRow}
          <MySchoolCard where="profile" variant="profile" solid preview={schoolPreview} onChangeSchool={openSchool} />
          {courses}
          {regularity}
          <ReadinessCard />
          <section className="pr-card pr-card--list" id="reglages" aria-labelledby="pr-settings-title">
            <h2 id="pr-settings-title" className="pr-card__title">{t('Réglages', 'Paramèt')}</h2>
            <div className="pr-srows" id="pr-info">
              <SettingsRow id="pr-row-info" icon={<Info size={20} />} label={t('Informations', 'Enfòmasyon')} open={openRow === 'info'} onToggle={() => toggleRow('info')}>
                {informations}
              </SettingsRow>
              <SettingsRow id="pr-row-goals" icon={<Flag size={20} />} label={t('Objectifs', 'Objektif')} open={openRow === 'goals'} onToggle={() => toggleRow('goals')}>
                {objectives}
              </SettingsRow>
              <div className="pr-srow pr-srow--inline">
                <span className="pr-srow__icon" aria-hidden="true"><Moon size={20} /></span>
                <Toggle on={theme === 'dark'} onChange={() => toggleTheme()} label={t('Mode nuit', 'Mòd lannwit')} />
              </div>
              <SettingsRow id="pr-row-lang" icon={<Languages size={20} />} label={t('Langue', 'Lang')} value={isCreole ? 'Kreyòl' : 'Français'} open={openRow === 'lang'} onToggle={() => toggleRow('lang')}>
                <LanguageSwitch isCreole={isCreole} setLanguage={setLanguage} label={t('Langue', 'Lang')} />
              </SettingsRow>
              <SettingsRow id="pr-row-account" icon={<Settings size={20} />} label={t('Compte', 'Kont')} open={openRow === 'account'} onToggle={() => toggleRow('account')}>
                {boardToggle}
                {alertsRow}
                <AccountBlock email={user.email || null} t={t} onLogout={handleLogout} showLogout={false} />
              </SettingsRow>
            </div>
          </section>
          <button type="button" className="pr-textbtn pr-logout" onClick={handleLogout}>{t('Se déconnecter', 'Dekonekte')}</button>
          {/* À propos / version: the deployed commit, quoted in tester reports. */}
          <p className="pr-version" style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted, #5F6B7A)', margin: '0.75rem 0 0', userSelect: 'all' }}>
            {t('Version', 'Vèsyon')} {getWebRelease().slice(0, 7)}
          </p>
        </div>
        {showTrackSelector && (
          <TrackSelectorModal currentTrack={track} onClose={() => setShowTrackSelector(false)} />
        )}
      </section>
    );
  }

  // ── Desktop (Stitch 07) ──
  return (
    <section className="section pf prx">
      <div className="container prx-page">
        {devNote}
        {identityRow}

        <div className="prx-grid" id="reglages">
          <div className="prx-main">
            {courses}

            <section className="pr-card" id="pr-info" aria-labelledby="pr-info-title">
              <h2 id="pr-info-title" className="pr-card__title">{t('Informations', 'Enfòmasyon')}</h2>
              {informations}
            </section>

            <section className="pr-card" aria-labelledby="pr-goals-title">
              <h2 id="pr-goals-title" className="pr-card__title">{t('Objectifs', 'Objektif')}</h2>
              {objectives}
            </section>

            <AchievementShelf achievements={achievements} isCreole={isCreole} />

            <section className="pr-card" aria-labelledby="pr-prefs-title">
              <h2 id="pr-prefs-title" className="pr-card__title">{t('Préférences', 'Preferans')}</h2>
              <div className="pr-list">
                <Toggle on={theme === 'dark'} onChange={() => toggleTheme()} label={t('Mode nuit', 'Mòd lannwit')} />
                <div className="pr-line">
                  <span className="pr-line__label">{t('Langue', 'Lang')}</span>
                  <LanguageSwitch isCreole={isCreole} setLanguage={setLanguage} label={t('Langue', 'Lang')} />
                </div>
                {boardToggle}
                {alertsRow}
              </div>
            </section>

            <section className="pr-card" aria-labelledby="pr-account-title">
              <h2 id="pr-account-title" className="pr-card__title">{t('Compte', 'Kont')}</h2>
              <AccountBlock email={user.email || null} t={t} onLogout={handleLogout} />
            </section>
          </div>

          <aside className="prx-side" aria-label={t('Ton classement et ta régularité', 'Klasman ou ak regilarite ou')}>
            <MySchoolCard where="profile" variant="profile" preview={schoolPreview} onChangeSchool={openSchool} />
            <Schoolmates entries={boardEntries} uid={uid} school={board.school || ''} t={t} />
            {regularity}
            <ReadinessCard />
          </aside>
        </div>
      </div>

      {showTrackSelector && (
        <TrackSelectorModal currentTrack={track} onClose={() => setShowTrackSelector(false)} />
      )}
    </section>
  );
}
