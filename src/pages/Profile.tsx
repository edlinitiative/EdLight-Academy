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
import {
  Flame, Trophy, Zap, Target, LayoutDashboard, CalendarCheck, Bell, Brain,
  Info, LogOut, Moon, Sun, Languages, Award, GraduationCap, Sparkles, ChevronRight, Check,
} from 'lucide-react';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useStreak } from '../hooks/useStreak';
import { logoutUser } from '../services/authService';
import { STREAK_MILESTONES } from '../services/streakService';
import ReadinessCard from '../components/ReadinessCard';
import ProgressDashboard from '../components/ProgressDashboard';
import Leaderboard from '../components/Leaderboard';
import { getFirstName } from '../utils/shared';
import './Profile.css';

function initialsOf(user) {
  const name = user?.name || user?.displayName || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EL';
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export default function Profile() {
  const navigate = useNavigate();
  const {
    user, isAuthenticated, language, setLanguage, theme, toggleTheme,
    setShowNotifications, toggleAuthModal, setActiveTab, logout,
  } = useStore();
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  const { level, profile } = useTrivia();
  const { streak } = useStreak();

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
                'Connectez-vous pour suivre votre score de préparation, vos XP, votre série et le classement.',
                'Konekte pou swiv nòt preparasyon ou, XP ou, seri ou ak klasman an.',
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

        {/* ── Leaderboard ── */}
        <div className="profile-area profile-area--leaderboard">
          <Leaderboard variant="full" />
        </div>

        {/* ── Mon espace — icon tile grid ── */}
        <div className="profile-area profile-area--monespace">
          <div className="profile-card">
            <div className="profile-card__header">
              <h2 className="profile-card__title"><Target size={18} /> {t('Mon espace', 'Espas mwen')}</h2>
              <div className="profile-espace-toggles">
                <button
                  type="button"
                  className="profile-toggle-btn"
                  onClick={() => toggleTheme()}
                  title={theme === 'dark' ? t('Mode clair', 'Mòd klè') : t('Mode nuit', 'Mòd lannwit')}
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <button
                  type="button"
                  className="profile-toggle-btn"
                  onClick={() => setLanguage(isCreole ? 'fr' : 'ht')}
                  title={isCreole ? 'Passer en français' : 'Pase an kreyòl'}
                >
                  <Languages size={15} />
                </button>
              </div>
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
              <Link to="/quizzes" className="profile-espace-tile">
                <Brain size={22} />
                <span>{t('Quiz', 'Quiz')}</span>
              </Link>
              <button type="button" className="profile-espace-tile" onClick={() => setShowNotifications(true)}>
                <Bell size={22} />
                <span>{t('Alertes', 'Notifikasyon')}</span>
              </button>
              <Link to="/about" className="profile-espace-tile">
                <Info size={22} />
                <span>{t('À propos', 'Sou nou')}</span>
              </Link>
            </div>
            <button type="button" className="profile-link profile-link--danger" onClick={handleLogout}>
              <LogOut size={18} /> {t('Déconnexion', 'Dekonekte')}<ChevronRight size={16} />
            </button>
          </div>
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
    </section>
  );
}
