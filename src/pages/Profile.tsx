/**
 * Profile — the learner's account hub (the bottom-nav "Profil" destination)
 * ─────────────────────────────────────────────────────────────────────────
 * Consolidates identity, the Exam Readiness Score, progression (XP/level/streak),
 * achievements, the weekly leaderboard, and the secondary "Mon espace" links
 * that used to live in the mobile drawer (Dashboard, Study Plan, Notifications,
 * theme/language, sign-out). Guests get a focused sign-in invitation.
 */

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Flame, Trophy, Zap, Target, LayoutDashboard, CalendarCheck, Bell, Brain,
  Info, LogOut, Moon, Sun, Languages, Award, GraduationCap, Sparkles, ChevronRight, Check, BookOpen,
  Gift, Share2, Copy, MessageCircle, Loader2, Settings, ShieldCheck, MapPin, Trash2,
  FileText, RefreshCw, AlertTriangle,
} from '../components/icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { useAllProgress } from '../hooks/useProgress';
import { logoutUser } from '../services/authService';
import { getReferralCode, inviteMessage, type ReferralCode } from '../services/referralService';
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
function IdentityFields({ isCreole, uid, board }: {
  isCreole: boolean;
  uid: string | null;
  board: { optedIn?: boolean; displayName?: string | null; school?: string | null; city?: string | null; department?: string | null };
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
    setStatus('idle');
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
      qc.setQueryData(['trivia-profile', uid], updated);
      setStatus('saved');
    } else {
      setStatus('failed');
    }
  };

  return (
    <div className="profile-identity">
      <label className="profile-field">
        <span className="profile-field__label">{t('Pseudo affiché', 'Ti non pou afiche')}</span>
        <input
          className="profile-field__input"
          value={alias}
          maxLength={24}
          onChange={(e) => { setAlias(e.target.value); setStatus('idle'); }}
          placeholder={t('Ex. Naïka M.', 'Egz. Naïka M.')}
        />
        <small className="profile-field__why">
          {t(
            'Le seul nom que les autres élèves voient. Votre nom complet n’est jamais affiché.',
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
          'Votre école sert au championnat interscolaire et au classement par école — nous ne la redemanderons pas ailleurs.',
          'Lekòl ou sèvi pou chanpyona ant lekòl yo ak klasman pa lekòl — nou p ap mande w li yon lòt kote.',
        )}
      </p>

      <fieldset className="profile-residence">
        <legend className="profile-field__label">
          <MapPin size={14} aria-hidden="true" /> {t('Où vous habitez', 'Kote ou rete')}
        </legend>
        <p className="profile-field__why">
          {t(
            'Pour le classement par ville et par département. Ce n’est pas l’adresse de votre école : beaucoup d’élèves étudient dans une autre commune.',
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
                  placeholder={t('Nom de votre ville', 'Non vil ou')}
                />
              )}
            </label>
          )}
        </div>
      </fieldset>

      <div className="profile-identity__foot">
        <button
          type="button"
          className="button button--primary button--sm"
          onClick={save}
          disabled={!dirty || !aliasOk || status === 'saving'}
        >
          {status === 'saving'
            ? <><Loader2 size={15} className="profile-spin" aria-hidden="true" /> {t('Enregistrement…', 'Ap anrejistre…')}</>
            : t('Enregistrer', 'Anrejistre')}
        </button>
        {status === 'saved' && !dirty && (
          <span className="profile-identity__ok" role="status">
            <Check size={14} aria-hidden="true" /> {t('Enregistré', 'Anrejistre')}
          </span>
        )}
        {status === 'failed' && (
          <span className="profile-identity__failed" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {t('Non enregistré — vérifiez votre connexion et réessayez.', 'Pa anrejistre — tcheke koneksyon ou epi eseye ankò.')}
          </span>
        )}
      </div>

      <p className="profile-field__why">
        <ShieldCheck size={13} aria-hidden="true" />{' '}
        {board?.optedIn
          ? t(
            'Vous participez au classement : votre pseudo, votre école et votre ville y sont visibles.',
            'Ou nan klasman an : ti non ou, lekòl ou ak vil ou parèt ladan l.',
          )
          : t(
            'Vous ne participez pas encore au classement — rien de ceci n’est public tant que vous ne l’avez pas rejoint.',
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
        title={t('Ce que vous avez débloqué', 'Sa ou debloke')}
        aside={<Pill tone="slate">{won} / {achievements.length}</Pill>}
      />
      <div className="pf-badges">
        {shown.map((a) => (
          <article key={a.id} className={`pf-badge ${a.unlocked ? 'is-unlocked' : ''}`}>
            <header className="pf-badge__top">
              <IconTile tone={a.unlocked ? a.tone : 'slate'}>
                <span className="pf-badge__emoji">{a.emoji}</span>
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
        <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Vos cours', 'Kou ou yo')} />
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
        <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Vos cours', 'Kou ou yo')} />
        <p className="pf-empty">
          {t(
            'Vous n’avez pas encore ouvert de cours. La première leçon terminée apparaîtra ici.',
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
      <CardHead eyebrow={t('Progression', 'Pwogrè')} title={t('Vos cours', 'Kou ou yo')} />
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

const boardInitials = (name: string) =>
  String(name || '?').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/**
 * RankNeighbours — your place on the weekly board, with the people either side.
 *
 * "#42" on its own is a number to feel something about. The learner one place
 * above, with the XP gap spelled out, is something to do this week. Falls back
 * to the plain link whenever the board cannot place the learner — which is the
 * normal state for anyone who hasn't chosen a pseudonym, since entries without
 * one are never shown publicly.
 */
export function RankNeighbours({ entries, myRank, uid, isCreole, onOpen }: {
  entries: any[];
  myRank: number | null;
  uid: string | null;
  isCreole: boolean;
  onOpen: () => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { slice, gap } = rankWindow(entries, uid);

  return (
    <div className="pf-card">
      <CardHead
        eyebrow={t('Cette semaine', 'Semèn sa a')}
        title={t('Classement', 'Klasman')}
        aside={myRank ? <Pill tone="azure">#{myRank}</Pill> : null}
      />

      {slice.length > 0 ? (
        <>
          <ul className="pf-ranks">
            {slice.map((e) => {
              const me = e.id === uid;
              return (
                <li key={e.id} className={`pf-rank ${me ? 'is-me' : ''}`}>
                  <span className="pf-rank__pos num">#{e.rank}</span>
                  <span className="pf-rank__avatar" aria-hidden="true">
                    {me ? boardInitials(e.displayName) : boardInitials(e.displayName)}
                  </span>
                  <span className="pf-rank__body">
                    <span className="pf-rank__name">
                      {me ? t('Vous', 'Ou menm') : e.displayName}
                    </span>
                    {e.school && <span className="pf-rank__school">{e.school}</span>}
                  </span>
                  <span className="pf-rank__xp num">{e.xp} XP</span>
                </li>
              );
            })}
          </ul>
          {gap > 0 && (
            <p className="pf-note">
              {t(
                `${gap} XP vous séparent de la place au-dessus.`,
                `${gap} XP separe ou ak plas ki anwo a.`,
              )}
            </p>
          )}
        </>
      ) : (
        <p className="pf-empty">
          {myRank
            ? t(
                'Votre place de la semaine est enregistrée. Ouvrez le classement pour voir qui vous entoure.',
                'Plas ou pou semèn nan anrejistre. Louvri klasman an pou wè ki moun ki bò kote w.',
              )
            : t(
                'Choisissez un pseudonyme dans les réglages (bas de page) pour apparaître au classement.',
                'Chwazi yon ti non nan reglaj yo (anba paj la) pou w parèt nan klasman an.',
              )}
        </p>
      )}

      <button type="button" className="pf-link" onClick={onOpen}>
        {t('Voir le classement complet', 'Wè tout klasman an')}
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const {
    user, isAuthenticated, language, setLanguage, theme, toggleTheme,
    setShowNotifications, toggleAuthModal, setActiveTab, logout,
    grade, setGrade, setGradeChosen, track,
  } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  // Settings are folded unless the link asked for them (#reglages).
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = React.useState(() => location.hash === '#reglages');
  React.useEffect(() => {
    if (location.hash !== '#reglages') return;
    setSettingsOpen(true);
    const id = window.setTimeout(() => document.getElementById('reglages')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => window.clearTimeout(id);
  }, [location.hash]);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();
  const { entries: boardEntries, myRank } = useLeaderboard(50);
  // Hooks run before the guest early-return, as they must; useAllProgress
  // no-ops without a signed-in user.
  const { progress: allProgress, loading: progressLoading } = useAllProgress();
  const [showTrackSelector, setShowTrackSelector] = React.useState(false);

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
            <h1>{t('Votre profil EdLight', 'Pwofil EdLight ou')}</h1>
            <p className="text-muted">
              {t(
                'Un compte garde ce que vous avez déjà fait : votre progression, votre score de préparation, votre série et votre place au classement vous suivent d’un appareil à l’autre.',
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
  const accuracy = profile.totalQuestions > 0
    ? Math.round((profile.totalCorrect / profile.totalQuestions) * 100)
    : 0;
  const unlockedMilestones = new Set<string>(streak?.milestones || []);

  // Lessons finished across every course the learner has touched. Each course
  // keeps its own progress document, so this is a sum, not a single field.
  const lessonsDone = (allProgress || []).reduce(
    (n, p) => n + (p.completedLessons?.length || 0), 0,
  );
  const courseBadges = new Set<string>((allProgress || []).flatMap((p) => p.badges || []));
  // Point badges are awarded per course, so the relevant figure for "how close
  // am I" is the best single course, not the total across all of them.
  const bestCoursePoints = (allProgress || []).reduce(
    (best, p) => Math.max(best, p.totalPoints || 0), 0,
  );
  const achievements = buildAchievements({
    isCreole, streak, unlockedMilestones, courseBadges, bestCoursePoints,
  });
  // The hero's honours row shows only what has actually been earned, newest
  // thresholds first. Nothing is listed there that isn't on the shelf below.
  const earned = achievements.filter((a) => a.unlocked).slice(0, 4);

  const days = streak?.currentStreak || 0;
  const nextMilestone = STREAK_MILESTONES.find((m) => m.days > days);

  const school = profile?.leaderboard?.school || '';
  const place = profile?.leaderboard?.city || profile?.leaderboard?.department || '';
  const gradeEntry = GRADES.find((g) => g.code === grade);
  const gradeLabel = gradeEntry ? (isCreole ? gradeEntry.labelHt : gradeEntry.label) : '';

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
    logout();
    navigate('/');
  };

  return (
    <section className="section pf">
      <div className="container profile">

        {/* ── Identity ──────────────────────────────────────────────────────
             The mockups' hero: a ringed avatar carrying the level, the name
             and school, three figures with their context, and the ladder to
             the next level in an inset panel.

             The streak is stated here and nowhere else on the page. It used to
             appear three times, and one of the three read the first course's
             streak rather than the learner's, so two of the numbers could
             disagree with each other. */}
        <div className="profile-area profile-area--hero">
          <div className="pf-hero">
            <div className="pf-hero__top">
              <div className="pf-hero__who">
                <div className="pf-avatar">
                  {/* The account's own portrait — the one in the navbar —
                      instead of two initials. */}
                  <PixelAvatar seed={user?.uid || user?.email || user?.name} size={72} className="pf-avatar__art" />
                  <span className="pf-avatar__level">
                    <Zap size={11} aria-hidden="true" />
                    {t('NIV.', 'NIV.')} {level.level}
                  </span>
                </div>
                <div className="pf-hero__id">
                  <h1 className="pf-hero__name">{user.name || getFirstName(user) || t('Élève', 'Elèv')}</h1>
                  {(school || place) && (
                    <p className="pf-hero__place">
                      <GraduationCap size={15} aria-hidden="true" />
                      {[school, place].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <div className="pf-hero__chips">
                    {gradeLabel && <Pill tone="azure">{gradeLabel}</Pill>}
                    {trackInfo && (
                      <button type="button" className="pf-pill pf-pill--slate pf-pill--button" onClick={() => setShowTrackSelector(true)}>
                        {trackInfo.shortLabel || trackInfo.label}
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pf-hero__stats">
                <HeroStat
                  tone="amber"
                  icon={<Flame size={16} />}
                  value={days}
                  label={days === 1 ? t('Jour de suite', 'Jou swit') : t('Jours de suite', 'Jou swit')}
                  sub={nextMilestone
                    ? t(`Prochain palier : ${nextMilestone.days}`, `Pwochen palye : ${nextMilestone.days}`)
                    : t('Tous les paliers atteints', 'Tout palye yo fèt')}
                />
                <HeroStat
                  tone="azure"
                  icon={<Sparkles size={16} />}
                  value={level.xp}
                  label={t('Points d’XP', 'Pwen XP')}
                  sub={t(`Niveau ${level.level}`, `Nivo ${level.level}`)}
                />
                <HeroStat
                  tone="emerald"
                  icon={<Trophy size={16} />}
                  value={myRank ? `#${myRank}` : '—'}
                  label={t('Classement', 'Klasman')}
                  sub={myRank
                    ? t('Cette semaine', 'Semèn sa a')
                    : t('Pseudonyme requis', 'Ou bezwen yon ti non')}
                />
              </div>
            </div>

            {/* The ladder to the next level, in the mockups' inset panel. */}
            <div className="pf-ladder">
              <div className="pf-ladder__top">
                <span className="pf-ladder__title">
                  {t(`Progression vers le niveau ${level.level + 1}`, `Pwogrè pou nivo ${level.level + 1}`)}
                </span>
                <span className="pf-ladder__figures num">
                  {level.xp} XP
                  <small>{t(`reste ${level.xpToNext} XP`, `rete ${level.xpToNext} XP`)}</small>
                </span>
              </div>
              <Meter pct={level.progressPct} tone="azure" />
            </div>

            {earned.length > 0 && (
              <div className="pf-hero__honours">
                <span className="pf-eyebrow">{t('Distinctions', 'Distenksyon')}</span>
                <div className="pf-hero__honour-list">
                  {earned.map((a) => (
                    <span key={a.id} className="pf-honour">
                      <span aria-hidden="true">{a.emoji}</span> {a.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Where you stand — the diagnostic, first ──
             The page's job is to answer "how am I doing and what should I fix",
             so the per-subject readiness breakdown comes before anything the
             learner can only read and admire. Settings now sit at the bottom;
             they used to be the second thing on the page. */}
        <div className="profile-area profile-area--readiness">
          <ReadinessCard />
        </div>

        {/* ── Sidebar column: the two short cards, stacked ──
             Kept in one grid area on purpose. Given their own rows they each
             sat next to a much taller card and left the dead space under it
             that 629aa32 had to go and fix. */}
        <div className="profile-area profile-area--aside">
          <div className="pf-card">
            <CardHead
              eyebrow={t('Bilan', 'Bilan')}
              title={t('Ce que vous avez fait', 'Sa ou fè deja')}
            />
            {/* Four totals, each appearing exactly once on the page and each
                from a different source, so no two can contradict each other. */}
            <div className="pf-totals">
              <div className="pf-total">
                <IconTile tone="azure" size="sm"><BookOpen size={15} /></IconTile>
                <span className="pf-total__value num">{lessonsDone}</span>
                <span className="pf-total__label">{t('Leçons terminées', 'Leson fini')}</span>
              </div>
              <div className="pf-total">
                <IconTile tone="violet" size="sm"><Brain size={15} /></IconTile>
                <span className="pf-total__value num">{profile.totalGames || 0}</span>
                <span className="pf-total__label">{t('Parties de trivia', 'Pati trivia')}</span>
              </div>
              <div className="pf-total">
                <IconTile tone="emerald" size="sm"><Target size={15} /></IconTile>
                <span className="pf-total__value num">{accuracy}%</span>
                <span className="pf-total__label">{t('Précision aux quiz', 'Presizyon nan quiz')}</span>
              </div>
              <div className="pf-total">
                <IconTile tone="amber" size="sm"><Flame size={15} /></IconTile>
                <span className="pf-total__value num">{streak?.longestStreak || 0}</span>
                <span className="pf-total__label">{t('Meilleure série', 'Pi bon seri')}</span>
              </div>
            </div>
            {/* The same four figures, plus mastery per chapter and the exams,
                as one page a student can print or save as PDF for a parent,
                a teacher or a school. It is a record of activity here — not a
                bulletin, and it says so on itself. */}
            <Link to="/releve" className="pf-link">
              <FileText size={16} aria-hidden="true" />
              {t('Relevé de progression à imprimer', 'Relve pwogrè pou enprime')}
            </Link>
          </div>

          {/* ── Leaderboard: your actual neighbours ──
               A bare "#42" says nothing a student can act on. The two learners
               either side of you do: they are reachable this week. Falls back
               to the plain link when the board can't place you. */}
          <RankNeighbours
            entries={boardEntries}
            myRank={myRank}
            uid={user?.uid || null}
            isCreole={isCreole}
            onOpen={() => navigate('/classement')}
          />
        </div>

        {/* ── Courses in progress ── */}
        <div className="profile-area profile-area--courses">
          <CourseProgressCard
            allProgress={allProgress}
            loading={progressLoading}
            isCreole={isCreole}
            onExplore={() => navigate('/courses')}
          />
        </div>

        {/* ── Achievements — one shelf, every tile saying what earns it ── */}
        <div className="profile-area profile-area--achievements">
          <AchievementShelf achievements={achievements} isCreole={isCreole} />
        </div>

        {/* ── Your school, and the invite — one card. The separate "Inviter des
             amis" card offered the same referral code a second way. ── */}
        <div className="profile-area profile-area--invite">
          <MySchoolCard where="profile" />
        </div>

        {/* ── Réglages — five readable groups, each saying why it asks ──
             Learning preferences · identity/school · notifications ·
             appearance/language · account/privacy. Everything a student used
             to be asked for twice is edited here once. */}
        <div className="profile-area profile-area--settings" id="reglages">
          {/* Folded: settings are visited once, not every time the profile is
              opened. /profile#reglages (the "Choisir un pseudo" links) opens
              it and scrolls here. */}
          <details
            className="profile-card profile-settings"
            open={settingsOpen}
            onToggle={(e) => setSettingsOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="profile-settings__summary">
              <h2 className="profile-card__title"><Settings size={18} /> {t('Réglages', 'Reglaj')}</h2>
              <span className="profile-settings__hint">{t('Pseudo, école, notifications, langue, compte', 'Ti non, lekòl, notifikasyon, lang, kont')}</span>
            </summary>
            <p className="profile-set__intro">
              {t(
                'Renseignez ceci une fois : les cours, la pratique et les compétitions réutilisent les mêmes informations.',
                'Ranpli sa yon sèl fwa : kou yo, pratik la ak konpetisyon yo sèvi ak menm enfòmasyon yo.',
              )}
            </p>

            <div className="profile-sets">
              {/* 1 — Learning preferences */}
              <section className="profile-set">
                <h3 className="profile-set__title">
                  <GraduationCap size={16} aria-hidden="true" /> {t('Préférences d’apprentissage', 'Preferans aprantisaj')}
                </h3>

                <div className="profile-field">
                  <span className="profile-field__label">{t('Votre classe', 'Klas ou')}</span>
                  <small className="profile-field__why">
                    {t(
                      'Elle choisit les cours, les quiz et les examens qui vous sont proposés.',
                      'Se li ki chwazi kou, quiz ak egzamen y ap pwopoze w.',
                    )}
                  </small>
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
                </div>

                <div className="profile-field">
                  <span className="profile-field__label">{t('Votre filière', 'Filyè ou')}</span>
                  <small className="profile-field__why">
                    {t(
                      'Elle adapte les épreuves et les coefficients du Baccalauréat.',
                      'Se li ki adapte eprèv ak koyefisyan Bakaloreya yo.',
                    )}
                  </small>
                  <button type="button" className="profile-link" onClick={() => setShowTrackSelector(true)}>
                    {trackInfo
                      ? <><span aria-hidden="true">{trackInfo.icon}</span> {trackInfo.label}</>
                      : <><RefreshCw size={18} /> {t('Choisir ma filière', 'Chwazi filyè mwen')}</>}
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="profile-espace-grid">
                  <Link to="/dashboard" className="profile-espace-tile">
                    <LayoutDashboard size={22} />
                    <span>{t('Tableau', 'Tablodbò')}</span>
                  </Link>
                  <Link to="/study-plan" className="profile-espace-tile">
                    <CalendarCheck size={22} />
                    <span>{t('Plan étude', 'Plan etid')}</span>
                  </Link>
                  <Link to="/practice" className="profile-espace-tile">
                    <Brain size={22} />
                    <span>{t('Pratique', 'Pratik')}</span>
                  </Link>
                </div>
              </section>

              {/* 2 — Identity and school (spans the row: it holds a form) */}
              <section className="profile-set profile-set--wide">
                <h3 className="profile-set__title">
                  <Target size={16} aria-hidden="true" /> {t('Identité et école', 'Idantite ak lekòl')}
                </h3>
                <IdentityFields isCreole={isCreole} uid={user?.uid || null} board={profile?.leaderboard || {}} />
              </section>

              {/* 3 — Notifications */}
              <section className="profile-set">
                <h3 className="profile-set__title">
                  <Bell size={16} aria-hidden="true" /> {t('Notifications', 'Notifikasyon')}
                </h3>
                <button type="button" className="profile-link" onClick={() => setShowNotifications(true)}>
                  <Bell size={18} /> {t('Mes alertes', 'Alèt mwen')}<ChevronRight size={16} />
                </button>
                <small className="profile-field__why">
                  {t(
                    'Rappels de révision et résultats, dans l’application.',
                    'Rapèl revizyon ak rezilta, nan aplikasyon an.',
                  )}
                </small>
              </section>

              {/* 4 — Appearance and language */}
              <section className="profile-set">
                <h3 className="profile-set__title">
                  <Languages size={16} aria-hidden="true" /> {t('Apparence et langue', 'Aparans ak lang')}
                </h3>
                <button type="button" className="profile-link" onClick={() => toggleTheme()}>
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  {theme === 'dark' ? t('Mode clair', 'Mòd klè') : t('Mode nuit', 'Mòd lannwit')}
                  <ChevronRight size={16} />
                </button>
                <button type="button" className="profile-link" onClick={() => setLanguage(isCreole ? 'fr' : 'ht')}>
                  <Languages size={18} /> {isCreole ? 'Français' : 'Kreyòl'}<ChevronRight size={16} />
                </button>
              </section>

              {/* 5 — Account and privacy */}
              <section className="profile-set">
                <h3 className="profile-set__title">
                  <ShieldCheck size={16} aria-hidden="true" /> {t('Compte et confidentialité', 'Kont ak konfidansyalite')}
                </h3>
                <Link to="/about" className="profile-link"><Info size={18} /> {t('À propos', 'Sou nou')}<ChevronRight size={16} /></Link>
                <Link to="/privacy" className="profile-link"><FileText size={18} /> {t('Confidentialité', 'Konfidansyalite')}<ChevronRight size={16} /></Link>
                <Link to="/delete-account" className="profile-link"><Trash2 size={18} /> {t('Supprimer mon compte', 'Efase kont mwen')}<ChevronRight size={16} /></Link>
                <button type="button" className="profile-link profile-link--danger" onClick={handleLogout}>
                  <LogOut size={18} /> {t('Déconnexion', 'Dekonekte')}<ChevronRight size={16} />
                </button>
              </section>
            </div>
          </details>
        </div>

      </div>

      {showTrackSelector && (
        <TrackSelectorModal currentTrack={track} onClose={() => setShowTrackSelector(false)} />
      )}
    </section>
  );
}
