/**
 * The parts of /profile that read something the page did not already hold:
 * the goal and daily rhythm, the weak/strong units, the schoolmates on the
 * board and the account block. Each one either shows real data or says
 * plainly that there is none yet — no placeholder figures.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Check, FileText, KeyRound, Loader2, LogOut, Mail, RotateCcw, ShieldCheck, Trash2,
} from '../../components/icons';
import PixelAvatar from '../../components/PixelAvatar';
import { loadReviewMap } from '../../services/reviewService';
import { readMastery } from '../../services/masteryService';
import { getCurrentUser, getUserProfile, updateUser } from '../../services/firebase';
import { sendPasswordReset } from '../../services/authService';
import { normalizeName } from '../../../shared/leaderboardAgg';
import {
  GOALS, RHYTHMS, courseLabel, loadUnitTitles, practiceHref, readStudyPrefs, strongSpots, weakSpots,
  type SkillSpot, type StudyPrefs,
} from './profileData';

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

/* ── Goal and rhythm ────────────────────────────────────────────────────── */

/**
 * Main goal and daily minutes, saved on tap to users/{uid} with a merge write.
 * Nothing else reads them yet; they are the student's own statement, kept on
 * the account so it follows them to another device.
 */
export function GoalRhythm({ uid, t }: { uid: string; t: T }) {
  const [prefs, setPrefs] = React.useState<StudyPrefs | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  React.useEffect(() => {
    let live = true;
    getUserProfile(uid).then((doc) => { if (live) setPrefs(readStudyPrefs(doc)); });
    return () => { live = false; };
  }, [uid]);

  const save = async (patch: Partial<StudyPrefs>) => {
    const prev = prefs;
    setPrefs((p) => ({ ...(p || { studyGoal: null, studyMinutes: null }), ...patch }));
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
    : t(`${spot.count} maîtrisée${spot.count > 1 ? 's' : ''}`, `${spot.count} metrize`);
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
export function SkillSpots({ uid, isCreole, t }: { uid: string; isCreole: boolean; t: T }) {
  const [weak, setWeak] = React.useState<SkillSpot[] | null>(null);
  const [strong, setStrong] = React.useState<SkillSpot[] | null>(null);
  const [titles, setTitles] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let live = true;
    loadReviewMap(uid).then((m) => { if (live) setWeak(weakSpots(m)); }).catch(() => { if (live) setWeak([]); });
    readMastery(uid).then((p) => { if (live) setStrong(strongSpots(p)); }).catch(() => { if (live) setStrong([]); });
    loadUnitTitles().then((x) => { if (live) setTitles(x); });
    return () => { live = false; };
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
            {t('Pas encore de leçon maîtrisée. Réussissez les exercices d’une leçon pour la voir ici.', 'Poko gen leson metrize. Reyisi egzèsis yon leson pou w wè l isit la.')}
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
    <div className="pr-mates">
      <span className="pr-label">{t('Élèves de ton école au classement', 'Elèv lekòl ou nan klasman an')}</span>
      {mates.length === 0 ? (
        <span className="pr-muted">
          {t('Personne d’autre de ton école au classement cette semaine.', 'Pa gen lòt moun lekòl ou nan klasman an semèn sa a.')}
        </span>
      ) : (
        <ul className="pr-mates__list">
          {mates.map((e) => (
            <li key={e.id} className="pr-mate">
              <PixelAvatar seed={e.id} size={32} className="pr-mate__avatar" />
              <span className="pr-mate__name">{e.displayName}</span>
              <span className="pr-mate__xp num">#{e.rank} · {e.xp || 0} XP</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/classement" className="pr-inline-link">
        {t('Voir le classement', 'Gade klasman an')} <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
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

export function AccountBlock({ email, t, onLogout }: { email: string | null; t: T; onLogout: () => void }) {
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
      <div className="pr-field">
        <span className="pr-label">{t('Adresse e-mail', 'Adrès imèl')}</span>
        <span className="pr-readonly"><Mail size={15} aria-hidden="true" /> {email || '—'}</span>
      </div>

      {canReset && (
        <div className="pr-field">
          <button type="button" className="pr-row" onClick={sendReset} disabled={reset === 'sending' || reset === 'sent'}>
            {reset === 'sending' ? <Loader2 size={16} className="profile-spin" aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
            {t('Changer mon mot de passe', 'Chanje modpas mwen')}
          </button>
          {reset === 'sent' && (
            <small className="pr-ok" role="status">
              <Check size={13} aria-hidden="true" /> {t(`Lien envoyé à ${email}.`, `Nou voye lyen an bay ${email}.`)}
            </small>
          )}
          {reset === 'failed' && (
            <small className="pr-failed" role="alert">
              <AlertTriangle size={13} aria-hidden="true" /> {t('L’e-mail n’est pas parti — réessayez.', 'Imèl la pa t pati — eseye ankò.')}
            </small>
          )}
        </div>
      )}

      <nav className="pr-rows" aria-label={t('Compte', 'Kont')}>
        <Link to="/releve" className="pr-row"><FileText size={16} aria-hidden="true" /> {t('Relevé de progression', 'Relve pwogrè')}</Link>
        <Link to="/privacy" className="pr-row"><ShieldCheck size={16} aria-hidden="true" /> {t('Confidentialité', 'Konfidansyalite')}</Link>
        <Link to="/delete-account" className="pr-row pr-row--danger"><Trash2 size={16} aria-hidden="true" /> {t('Supprimer mon compte', 'Efase kont mwen')}</Link>
        <button type="button" className="pr-row pr-row--danger" onClick={onLogout}>
          <LogOut size={16} aria-hidden="true" /> {t('Déconnexion', 'Dekonekte')}
        </button>
      </nav>
    </div>
  );
}
