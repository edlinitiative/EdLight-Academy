/**
 * Profile — the learner's account hub (the bottom-nav "Profil" destination)
 * ─────────────────────────────────────────────────────────────────────────
 * Consolidates identity, the Exam Readiness Score, progression (XP/level/streak),
 * achievements, the weekly leaderboard, and the secondary "Mon espace" links
 * that used to live in the mobile drawer (Dashboard, Study Plan, Notifications,
 * theme/language, sign-out). Guests get a focused sign-in invitation.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Flame, Trophy, Zap, Target, LayoutDashboard, CalendarCheck, Bell, Brain,
  Info, LogOut, Moon, Sun, Languages, Award, GraduationCap, Sparkles, ChevronRight, Check,
  Gift, Share2, Copy, MessageCircle, Loader2, Settings, ShieldCheck, MapPin, Trash2,
  FileText, RefreshCw, AlertTriangle,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { logoutUser } from '../services/authService';
import { getReferralCode, inviteMessage, type ReferralCode } from '../services/referralService';
import { STREAK_MILESTONES } from '../services/streakService';
import { setLeaderboardOptIn as saveBoardIdentity } from '../services/triviaService';
import { isValidAlias } from '../services/leaderboardService';
import ReadinessCard from '../components/ReadinessCard';
import ProgressDashboard from '../components/ProgressDashboard';
import SchoolField from '../components/arena/SchoolField';
import { GRADES, TRACK_BY_CODE } from '../config/trackConfig';
import { HAITI_DEPARTMENTS, OTHER_CITY, citiesOf, findCity } from '../data/haitiGeo';
import { schoolKey } from '../../shared/schools';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getFirstName } from '../utils/shared';
import './Profile.css';

function initialsOf(user) {
  const name = user?.name || user?.displayName || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EL';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/**
 * InviteCard — "Inviter des amis". Reveals the caller's referral code on demand
 * (GET /api/referrals/code), then offers WhatsApp, native share, and copy. Fully
 * theme-aware via CSS custom properties.
 */
function InviteCard({ lang }: { lang: 'fr' | 'ht' }) {
  const t = (fr: string, ht: string) => (lang === 'ht' ? ht : fr);
  const [data, setData] = React.useState<ReferralCode | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const res = await getReferralCode();
    setData(res);
    setFailed(!res);
    setLoading(false);
  };

  const message = data ? inviteMessage(data.code, data.link, lang) : '';

  const shareWhatsApp = () => {
    if (!data) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const shareNative = async () => {
    if (!data) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text: message }); } catch { /* cancelled */ }
    } else {
      shareWhatsApp();
    }
  };

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(`${data.code} — ${data.link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      shareNative();
    }
  };

  return (
    <div className="profile-card">
      <h2 className="profile-card__title"><Gift size={18} /> {t('Inviter des amis', 'Envite zanmi')}</h2>
      <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '-0.25rem' }}>
        {t(
          'Vous et votre ami gagnez un bonus quand il s’inscrit avec votre code : +1 gel de série et des XP chacun.',
          'Ou menm ak zanmi ou chak ap genyen yon bonus lè li enskri ak kòd ou : +1 jèl seri ak XP pou chak.',
        )}
      </p>

      {!data ? (
        <button
          type="button"
          className="button button--primary"
          style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          onClick={load}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Gift size={16} />}
          {failed ? t('Réessayer', 'Eseye ankò') : t('Obtenir mon code', 'Jwenn kòd mwen')}
        </button>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={copy}
            title={t('Copier', 'Kopye')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              background: 'var(--surface-muted)', border: '1px solid var(--primary-100)',
              borderRadius: 'var(--r-card)', padding: '0.9rem 1rem', cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.18em', color: 'var(--primary-500)' }}>
              {data.code}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {copied ? <><Check size={14} /> {t('Copié', 'Kopye')}</> : <><Copy size={14} /> {t('Copier', 'Kopye')}</>}
            </span>
          </button>

          <button
            type="button"
            className="button"
            onClick={shareWhatsApp}
            style={{ background: '#25D366', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <MessageCircle size={18} /> {t('Partager sur WhatsApp', 'Pataje sou WhatsApp')}
          </button>

          <button
            type="button"
            className="button button--secondary"
            onClick={shareNative}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
          >
            <Share2 size={18} /> {t('Partager', 'Pataje')}
          </button>
        </div>
      )}
    </div>
  );
}

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

export default function Profile() {
  const navigate = useNavigate();
  const {
    user, isAuthenticated, language, setLanguage, theme, toggleTheme,
    setShowNotifications, toggleAuthModal, setActiveTab, logout,
    grade, setGrade, setGradeChosen, track,
  } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();
  const { myRank } = useLeaderboard(50);
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
  const unlockedMilestones = new Set(streak?.milestones || []);

  const handleLogout = async () => {
    try { await logoutUser(); } catch {}
    logout();
    navigate('/');
  };

  return (
    <section className="section">
      <div className="container profile">

        {/* ── Hero: identity + level progress ── */}
        <div className="profile-area profile-area--hero">
          <header className="profile-header">
            <div className="profile-header__avatar">{initialsOf(user)}</div>
            <div className="profile-header__id">
              <h1 className="profile-header__name">{user.name || getFirstName(user) || t('Élève', 'Elèv')}</h1>
              {user.email && <p className="profile-header__email">{user.email}</p>}
              <div className="profile-header__chips">
                <span className="profile-chip profile-chip--level"><Zap size={13} /> {t('Niveau', 'Nivo')} {level.level}</span>
                <span className="profile-chip profile-chip--xp"><Sparkles size={13} /> {level.xp} XP</span>
                <span className="profile-chip profile-chip--streak"><Flame size={13} /> {streak?.currentStreak || 0} {t('j', 'j')}</span>
              </div>
            </div>
          </header>
          <div className="profile-level">
            <div className="profile-level__top">
              <span>{t('Niveau', 'Nivo')} {level.level}</span>
              <span className="text-muted">{level.xpToNext} XP → {t('niveau', 'nivo')} {level.level + 1}</span>
            </div>
            <div className="profile-level__bar">
              <span className="profile-level__fill" style={{ '--level-pct': `${level.progressPct}%` } as React.CSSProperties} />
            </div>
          </div>
        </div>

        {/* ── Réglages — five readable groups, each saying why it asks ──
             Learning preferences · identity/school · notifications ·
             appearance/language · account/privacy. Everything a student used
             to be asked for twice is edited here once. */}
        <div className="profile-area profile-area--settings">
          <div className="profile-card">
            <h2 className="profile-card__title"><Settings size={18} /> {t('Réglages', 'Reglaj')}</h2>
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
          </div>
        </div>

        {/* ── Readiness (main column) ── */}
        <div className="profile-area profile-area--readiness">
          <ReadinessCard />
        </div>

        {/* ── Achievements sidebar ── */}
        <div className="profile-area profile-area--aside">
          <div className="profile-card profile-card--full-height">
            <h2 className="profile-card__title"><Award size={18} /> {t('Réussites', 'Reyalizasyon')}</h2>
            <div className="profile-achievements">
              <div className="profile-stat">
                <span className="profile-stat__value">{profile.totalGames || 0}</span>
                <span className="profile-stat__label">{t('Parties trivia', 'Pati trivia')}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat__value">{accuracy}%</span>
                <span className="profile-stat__label">{t('Précision', 'Presizyon')}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat__value">{streak?.longestStreak || 0}</span>
                <span className="profile-stat__label">{t('Meilleure série', 'Pi bon seri')}</span>
              </div>
              <div className="profile-stat">
                <span className="profile-stat__value">{profile.bestScorePct || 0}%</span>
                <span className="profile-stat__label">{t('Meilleur score', 'Pi bon nòt')}</span>
              </div>
            </div>
            <div className="profile-milestones">
              {STREAK_MILESTONES.map((m) => {
                const unlocked = unlockedMilestones.has(m.id);
                return (
                  <div key={m.id} className={`profile-milestone ${unlocked ? 'is-unlocked' : ''}`} title={isCreole ? m.labelHt : m.label}>
                    <span className="profile-milestone__emoji">{m.emoji}</span>
                    <span className="profile-milestone__label">{isCreole ? m.labelHt : m.label}</span>
                    {unlocked && <Check size={12} className="profile-milestone__check" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Progression (full width) ── */}
        <div className="profile-area profile-area--progress">
          <ProgressDashboard />
        </div>

        {/* ── Classement — entry to the dedicated full page (no longer embedded) ── */}
        <div className="profile-area profile-area--leaderboard">
          <button
            className="profile-leaderboard-link"
            onClick={() => navigate('/classement')}
            type="button"
          >
            <span className="profile-leaderboard-link__icon"><Trophy size={20} /></span>
            <span className="profile-leaderboard-link__body">
              <span className="profile-leaderboard-link__title">{t('Classement', 'Klasman')}</span>
              <span className="profile-leaderboard-link__sub">{t('Voyez où vous vous situez', 'Wè kote ou ye')}</span>
            </span>
            {myRank ? <span className="profile-leaderboard-link__rank num">#{myRank}</span> : null}
            <ChevronRight size={18} className="profile-leaderboard-link__chev" />
          </button>
        </div>

        {/* ── Invite friends (two-sided referral) ── */}
        <div className="profile-area profile-area--invite">
          <InviteCard lang={isCreole ? 'ht' : 'fr'} />
        </div>

        {/* ── Certificates (future) ── */}
        <div className="profile-area profile-area--certs">
          <div className="profile-card profile-card--soon">
            <h2 className="profile-card__title"><GraduationCap size={18} /> {t('Certificats', 'Sètifika')}</h2>
            <p className="text-muted">
              {t(
                'Bientôt : obtenez des certificats vérifiables en complétant des parcours et des examens blancs.',
                'Talè : jwenn sètifika verifyab lè w konplete pakou ak egzamen blan.',
              )}
            </p>
            <span className="profile-soon-badge">{t('Bientôt', 'Talè')}</span>
          </div>
        </div>

      </div>

      {showTrackSelector && (
        <TrackSelectorModal currentTrack={track} onClose={() => setShowTrackSelector(false)} />
      )}
    </section>
  );
}
