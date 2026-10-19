/**
 * The parts of /profile that read something the page did not already hold:
 * the goal and daily rhythm, the weak/strong units, the schoolmates on the
 * board and the account block. Each one either shows real data or says
 * plainly that there is none yet — no placeholder figures.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Check, ChevronRight, FileText, KeyRound, Loader2, LogOut, Mail, RotateCcw, ShieldCheck, Trash2,
} from '../../components/icons';
import UserAvatar from '../../components/UserAvatar';
import { loadReviewMap } from '../../services/reviewService';
import { readMastery } from '../../services/masteryService';
import { getCurrentUser, getUserProfile, updateUser } from '../../services/firebase';
import { sendPasswordReset } from '../../services/authService';
import { normalizeName } from '../../../shared/leaderboardAgg';
import {
  GOALS, RHYTHMS, courseLabel, loadUnitTitles, practiceHref, readStudyPrefs, strongSpotLabel, strongSpots, weakSpots, weekDots,
  type SkillSpot, type StudyPrefs,
} from './profileData';
import type { ReviewMap } from '../../utils/review';
import type { ProgressMap } from '../../../shared/mastery';
import { STREAK_MILESTONES } from '../../services/streakService';
import { getArenaSound } from '../../arena-art/sound/arenaSound';
import { useArenaSound } from '../../arena-art/sound/useArenaSound';
import { pressSoundToggle, soundToggleView } from '../../arena-art/sound/toggle';

type T = (fr: string, ht: string) => string;

/** "1 · Informations" — the mockup's numbered section title. */
export function SectionHead({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="pr-sec__head">
      <span className="pr-sec__n" aria-hidden="true">{n}</span>
      <div>
        <h2 className="pr-sec__title">{title}</h2>
        {sub && <p className="pr-sec__sub">{sub}</p>}
      </div>
    </div>
  );
}

/** A pill switch. `role="switch"` so it reads as on/off, not as a button. */
export function Toggle({ on, onChange, label, hint, disabled }: {
  on: boolean; onChange: (next: boolean) => void; label: string; hint?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div className="pr-toggle">
      <div className="pr-toggle__text">
        <span className="pr-toggle__label">{label}</span>
        {hint && <small className="pr-toggle__hint">{hint}</small>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className={`pr-switch${on ? ' is-on' : ''}`}
        onClick={() => onChange(!on)}
      >
        <span className="pr-switch__knob" />
      </button>
    </div>
  );
}

/**
 * "Sons" — the device's one sound switch (roadmap P2). Off by default and
 * remembered on this device (arena-art/sound/policy.ts, localStorage). The
 * press runs inside the click, which is the user action browsers require
 * before audio may start. Every cue it allows also shows on screen.
 */
export function SoundSetting({ t }: { t: T }) {
  const snd = useArenaSound();
  const { on } = soundToggleView(snd);
  return (
    <Toggle
      on={on}
      onChange={() => { try { pressSoundToggle(getArenaSound()); } catch { /* silent is fine */ } }}
      label={t('Sons', 'Son')}
      hint={t(
        'Petits sons dans l’Arène : début de question, réponse validée, bonne ou mauvaise réponse, podium.',
        'Ti son nan Arèn nan : kòmansman kesyon, repons valide, bon oswa move repons, podyòm.',
      )}
    />
  );
}

/* ── Goal and rhythm ────────────────────────────────────────────────────── */

/**
 * Main goal and daily minutes, saved on tap to users/{uid} with a merge write.
 * Nothing else reads them yet; they are the student's own statement, kept on
 * the account so it follows them to another device.
 */
export function GoalRhythm({ uid, t, initial }: {
  uid: string; t: T;
  /** Dev preview only: start from these and keep taps local (no write). */
  initial?: StudyPrefs;
}) {
  const [prefs, setPrefs] = React.useState<StudyPrefs | null>(initial || null);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  React.useEffect(() => {
    if (initial) return undefined;
    let live = true;
    getUserProfile(uid).then((doc) => { if (live) setPrefs(readStudyPrefs(doc)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const save = async (patch: Partial<StudyPrefs>) => {
    const prev = prefs;
    setPrefs((p) => ({ ...(p || { studyGoal: null, studyMinutes: null }), ...patch }));
    if (initial) { setStatus('saved'); return; }
    setStatus('saving');
    try {
      await updateUser(uid, patch);
      setStatus('saved');
    } catch {
      setPrefs(prev);
      setStatus('failed');
    }
  };

  return (
    <div className="pr-goals">
      <div className="pr-field">
        <span className="pr-label">{t('Objectif principal', 'Objektif prensipal')}</span>
        <div className="pr-chips" role="group" aria-label={t('Objectif principal', 'Objektif prensipal')}>
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`pr-chip${prefs?.studyGoal === g.id ? ' is-on' : ''}`}
              aria-pressed={prefs?.studyGoal === g.id}
              disabled={!prefs}
              onClick={() => save({ studyGoal: g.id })}
            >
              {t(g.fr, g.ht)}
            </button>
          ))}
        </div>
      </div>
      <div className="pr-field">
        <span className="pr-label">{t('Rythme quotidien', 'Ritm chak jou')}</span>
        <div className="pr-chips" role="group" aria-label={t('Rythme quotidien', 'Ritm chak jou')}>
          {RHYTHMS.map((m) => (
            <button
              key={m}
              type="button"
              className={`pr-chip${prefs?.studyMinutes === m ? ' is-on' : ''}`}
              aria-pressed={prefs?.studyMinutes === m}
              disabled={!prefs}
              onClick={() => save({ studyMinutes: m })}
            >
              {m === 60 ? t('1 h / jour', '1 è / jou') : t(`${m} min / jour`, `${m} min / jou`)}
            </button>
          ))}
        </div>
      </div>
      <SaveNote status={status} t={t} />
    </div>
  );
}

function SaveNote({ status, t }: { status: 'idle' | 'saving' | 'saved' | 'failed'; t: T }) {
  if (status === 'saved') {
    return <small className="pr-ok" role="status"><Check size={13} aria-hidden="true" /> {t('Enregistré sur ton compte', 'Anrejistre sou kont ou')}</small>;
  }
  if (status === 'failed') {
    return <small className="pr-failed" role="alert"><AlertTriangle size={13} aria-hidden="true" /> {t('Non enregistré — réessayez.', 'Pa anrejistre — eseye ankò.')}</small>;
  }
  return null;
}

/* ── Weak and strong units ──────────────────────────────────────────────── */

function SpotChip({ spot, titles, isCreole, t, tone }: {
  spot: SkillSpot; titles: Record<string, string>; isCreole: boolean; t: T; tone: 'weak' | 'strong';
}) {
  const title = titles[spot.unitKey] || t(`Unité ${spot.unitNo}`, `Inite ${spot.unitNo}`);
  const count = tone === 'weak'
    ? t(`${spot.count} à revoir`, `${spot.count} pou revize`)
    : strongSpotLabel(spot, isCreole);
  return (
    <Link to={practiceHref(spot)} className={`pr-spot pr-spot--${tone}`}>
      <span className="pr-spot__course">{courseLabel(spot.course, isCreole)}</span>
      <span className="pr-spot__title">{title}</span>
      <span className="pr-spot__count">{count}</span>
    </Link>
  );
}

/**
 * Points faibles = review questions due again, by unit. Points forts = lessons
 * at "proficient" or "mastered", by unit. Every chip opens practice on that
 * unit; the weak list also leads to the revision session itself.
 */
export function SkillSpots({ uid, isCreole, t, preview }: {
  uid: string; isCreole: boolean; t: T;
  /** Dev preview only: fixture review map + mastery instead of the account's. */
  preview?: { review: ReviewMap; mastery: ProgressMap };
}) {
  const [weak, setWeak] = React.useState<SkillSpot[] | null>(preview ? weakSpots(preview.review) : null);
  const [strong, setStrong] = React.useState<SkillSpot[] | null>(preview ? strongSpots(preview.mastery) : null);
  const [titles, setTitles] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let live = true;
    loadUnitTitles().then((x) => { if (live) setTitles(x); });
    if (preview) return () => { live = false; };
    loadReviewMap(uid).then((m) => { if (live) setWeak(weakSpots(m)); }).catch(() => { if (live) setWeak([]); });
    readMastery(uid).then((p) => { if (live) setStrong(strongSpots(p)); }).catch(() => { if (live) setStrong([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return (
    <div className="pr-spots">
      <div className="pr-field">
        <span className="pr-label">{t('Points à renforcer', 'Pwen pou ranfòse')}</span>
        {weak === null ? (
          <span className="pr-muted">{t('Chargement…', 'Ap chaje…')}</span>
        ) : weak.length === 0 ? (
          <span className="pr-muted">
            {t('Aucune question à revoir pour l’instant. Les erreurs aux quiz apparaissent ici.', 'Pa gen kesyon pou revize kounye a. Erè nan quiz yo parèt isit la.')}
          </span>
        ) : (
          <>
            <div className="pr-spot-list">
              {weak.map((s) => <SpotChip key={s.unitKey} spot={s} titles={titles} isCreole={isCreole} t={t} tone="weak" />)}
            </div>
            <Link to="/revision" className="pr-inline-link">
              <RotateCcw size={14} aria-hidden="true" /> {t('Lancer ma révision', 'Kòmanse revizyon mwen')} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
      <div className="pr-field">
        <span className="pr-label">{t('Points forts', 'Pwen fò')}</span>
        {strong === null ? (
          <span className="pr-muted">{t('Chargement…', 'Ap chaje…')}</span>
        ) : strong.length === 0 ? (
          <span className="pr-muted">
            {t(
              'Pas encore de leçon pratiquée avec succès. Réussissez les exercices d’une leçon pour la voir ici ; un test de chapitre la rend maîtrisée.',
              'Poko gen leson ou pratike avèk siksè. Reyisi egzèsis yon leson pou w wè l isit la ; yon tès chapit fè l metrize.',
            )}
          </span>
        ) : (
          <div className="pr-spot-list">
            {strong.map((s) => <SpotChip key={s.unitKey} spot={s} titles={titles} isCreole={isCreole} t={t} tone="strong" />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Schoolmates ────────────────────────────────────────────────────────── */

/**
 * The other students from the same school on this week's board — only what
 * the board already shows publicly (pseudo, portrait, XP). No friends, no
 * requests, no chat: none of that exists.
 */
export function Schoolmates({ entries, uid, school, t }: {
  entries: any[]; uid: string; school: string; t: T;
}) {
  if (!school) return null;
  const key = normalizeName(school);
  const mates = (entries || []).filter((e) => e.id !== uid && e.school && normalizeName(e.school) === key).slice(0, 6);
  return (
    <section className="pr-card pr-mates" aria-labelledby="pr-mates-title">
      <h2 id="pr-mates-title" className="pr-card__title pr-card__title--sm">{t('Élèves de ton école au classement', 'Elèv lekòl ou nan klasman an')}</h2>
      {mates.length === 0 ? (
        <p className="pr-muted">
          {t('Personne d’autre de ton école au classement cette semaine.', 'Pa gen lòt moun lekòl ou nan klasman an semèn sa a.')}
        </p>
      ) : (
        <ul className="pr-mates__list">
          {mates.map((e) => (
            <li key={e.id} className="pr-mate">
              <UserAvatar seed={e.id} name={e.displayName} size={32} className="pr-mate__avatar" />
              <span className="pr-mate__name">{e.displayName}</span>
              <span className="pr-mate__xp num">{e.rank}{e.rank === 1 ? t('re', 'e') : 'e'} · {e.xp || 0} XP</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Account ────────────────────────────────────────────────────────────── */

/** Password sign-in only: a Google account has no password here to reset. */
export function hasPasswordSignIn(): boolean {
  try {
    return (getCurrentUser()?.providerData || []).some((p: any) => p?.providerId === 'password');
  } catch {
    return false;
  }
}

export function AccountBlock({ email, t, onLogout, showLogout = true }: {
  email: string | null; t: T; onLogout: () => void;
  /** The phone layout puts "Se déconnecter" alone under the settings list. */
  showLogout?: boolean;
}) {
  const canReset = !!email && hasPasswordSignIn();
  const [reset, setReset] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const sendReset = async () => {
    if (!email) return;
    setReset('sending');
    try {
      await sendPasswordReset(email);
      setReset('sent');
    } catch {
      setReset('failed');
    }
  };

  return (
    <div className="pr-account">
      <div className="pr-arow pr-arow--static">
        <span className="pr-arow__text">
          <span className="pr-arow__label">{t('Adresse e-mail', 'Adrès imèl')}</span>
          <span className="pr-arow__value">{email || '—'}</span>
        </span>
        <Mail size={20} aria-hidden="true" />
      </div>

      {canReset && (
        <>
          <button type="button" className="pr-arow" onClick={sendReset} disabled={reset === 'sending' || reset === 'sent'}>
            <span className="pr-arow__text">{t('Changer mon mot de passe', 'Chanje modpas mwen')}</span>
            {reset === 'sending' ? <Loader2 size={20} className="profile-spin" aria-hidden="true" /> : <KeyRound size={20} aria-hidden="true" />}
          </button>
          {reset === 'sent' && (
            <small className="pr-ok" role="status">
              <Check size={14} aria-hidden="true" /> {t(`Lien envoyé à ${email}.`, `Nou voye lyen an bay ${email}.`)}
            </small>
          )}
          {reset === 'failed' && (
            <small className="pr-failed" role="alert">
              <AlertTriangle size={14} aria-hidden="true" /> {t('L’e-mail n’est pas parti — réessayez.', 'Imèl la pa t pati — eseye ankò.')}
            </small>
          )}
        </>
      )}

      <nav className="pr-account__rows" aria-label={t('Compte', 'Kont')}>
        <Link to="/releve" className="pr-arow"><span className="pr-arow__text">{t('Relevé de progression', 'Relve pwogrè')}</span><FileText size={20} aria-hidden="true" /></Link>
        <Link to="/privacy" className="pr-arow"><span className="pr-arow__text">{t('Confidentialité', 'Konfidansyalite')}</span><ShieldCheck size={20} aria-hidden="true" /></Link>
        {showLogout && (
          <button type="button" className="pr-arow pr-arow--accent" onClick={onLogout}>
            <span className="pr-arow__text">{t('Se déconnecter', 'Dekonekte')}</span><LogOut size={20} aria-hidden="true" />
          </button>
        )}
        <Link to="/delete-account" className="pr-arow pr-arow--danger"><span className="pr-arow__text">{t('Supprimer mon compte', 'Efase kont mwen')}</span><Trash2 size={20} aria-hidden="true" /></Link>
      </nav>
    </div>
  );
}

/* ── Ta régularité ──────────────────────────────────────────────────────── */

const DAY_NAMES: [string, string][] = [
  ['Lundi', 'Lendi'], ['Mardi', 'Madi'], ['Mercredi', 'Mèkredi'], ['Jeudi', 'Jedi'],
  ['Vendredi', 'Vandredi'], ['Samedi', 'Samdi'], ['Dimanche', 'Dimanch'],
];

/**
 * The streak and the level, folded out of the old stat strip into one card
 * (Stitch 07 "Ta régularité"). The dots are this week's active days from the
 * streak doc's `activeDays` — nothing is inferred from the streak count — and
 * the level row is the trivia level the rest of the site shows.
 */
export function Regularity({ streak, level, isCreole, t, now }: {
  streak: any;
  level: { level: number; xp: number; xpToNext: number; progressPct: number };
  isCreole: boolean;
  t: T;
  now?: Date;
}) {
  const days = streak?.currentStreak || 0;
  const next = STREAK_MILESTONES.find((m) => m.days > days);
  const dots = weekDots(streak?.activeDays, now);
  const activeCount = dots.filter((d) => d.active).length;
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
  const pct = Math.max(0, Math.min(100, level.progressPct || 0));

  return (
    <section className="pr-card pr-reg" aria-labelledby="pr-reg-title">
      <div className="pr-reg__head">
        <h2 id="pr-reg-title" className="pr-card__title">{t('Ta régularité', 'Regilarite ou')}</h2>
      </div>
      <p className="pr-reg__streak">
        {days > 0
          ? (days === 1 ? t('1 jour de suite', '1 jou youn dèyè lòt') : t(`${days} jours de suite`, `${days} jou youn dèyè lòt`))
          : t('Pas de série en cours', 'Pa gen seri kounye a')}
      </p>
      <ol className="pr-dots" aria-label={t(`Cette semaine : ${activeCount} jour${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} sur 7`, `Semèn sa a : ${activeCount} jou aktif sou 7`)}>
        {dots.map((d, i) => {
          const [fr, ht] = DAY_NAMES[i];
          const name = isCreole ? ht : fr;
          return (
            <li key={d.date} className={`pr-dot${d.active ? ' is-on' : ''}${d.today ? ' is-today' : ''}${d.future ? ' is-future' : ''}`}>
              <span aria-hidden="true">{name.charAt(0)}</span>
              <span className="pr-sr">{name} : {d.active ? t('actif', 'aktif') : t('pas d’activité', 'pa gen aktivite')}</span>
            </li>
          );
        })}
      </ol>
      <p className="pr-muted">
        {next
          ? t(`Prochain palier : ${next.days} jours`, `Pwochen palye : ${next.days} jou`)
          : t('Tous les paliers atteints', 'Tout palye yo fèt')}
      </p>
      <div className="pr-reg__level">
        <div className="pr-reg__level-row">
          <span className="pr-reg__level-name">{t(`Niveau ${level.level}`, `Nivo ${level.level}`)}</span>
          <span className="pr-reg__xp">{nf(level.xp)} XP</span>
        </div>
        <span
          className="pr-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={t(`Progression vers le niveau ${level.level + 1}`, `Pwogrè pou nivo ${level.level + 1}`)}
        >
          <span className="pr-bar__fill" style={{ width: `${pct}%` }} />
        </span>
        <p className="pr-muted">{t(`Encore ${nf(level.xpToNext)} XP pour le niveau ${level.level + 1}`, `Rete ${nf(level.xpToNext)} XP pou nivo ${level.level + 1}`)}</p>
      </div>
    </section>
  );
}

/** A Réglages row on the phone: icon, label, optional value, and its panel. */
export function SettingsRow({ id, icon, label, value, open, onToggle, children }: {
  id: string; icon: React.ReactNode; label: string; value?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`pr-srow${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="pr-srow__btn"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        id={`${id}-btn`}
        onClick={onToggle}
      >
        <span className="pr-srow__icon" aria-hidden="true">{icon}</span>
        <span className="pr-srow__label">{label}</span>
        {value && <span className="pr-srow__value">{value}</span>}
        <ChevronRight size={18} className="pr-srow__chev" aria-hidden="true" />
      </button>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="pr-srow__panel" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
