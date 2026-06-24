import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, GraduationCap, Eye, EyeOff, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useStore from '../contexts/store';
import { loginWithEmailPassword, registerWithEmailPassword, loginWithGoogle, sendPasswordReset } from '../services/authService';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';

export function AuthModal({ onClose }) {
  const { t } = useTranslation();
  const storeActiveTab = useStore(state => state.activeTab);
  const [activeTab, setActiveTab] = useState(storeActiveTab || 'signin');
  const [mode, setMode] = useState('auth'); // 'auth' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const modalRef = useRef(null);

  const setUser = useStore(state => state.setUser);

  // Lock the page behind the sheet, trap focus inside it, and enable
  // drag-down-to-dismiss on touch — the .auth-modal element is the scroller.
  useBodyScrollLock();
  useFocusTrap(modalRef);
  const swipe = useSwipeToDismiss(onClose, { scrollRef: modalRef });

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Map a raw Firebase auth error to a friendly, localized message.
  const mapAuthError = (raw) => {
    const code = String(raw || '');
    if (code.includes('auth/invalid-email')) return t('authErrors.invalidEmail');
    if (code.includes('auth/user-not-found')) return t('authErrors.userNotFound');
    if (code.includes('auth/wrong-password')) return t('authErrors.wrongPassword');
    if (code.includes('auth/weak-password')) return t('authErrors.weakPassword');
    if (code.includes('auth/email-already-in-use')) return t('authErrors.emailInUse');
    if (code.includes('auth/invalid-credential')) return t('authErrors.invalidCredential');
    return t('authErrors.generic');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!email || !password) {
      setError(t('authErrors.fillAllFields'));
      setLoading(false);
      return;
    }

    if (activeTab === 'signup' && !name) {
      setError(t('authErrors.enterName'));
      setLoading(false);
      return;
    }

    try {
      let userData;

      if (activeTab === 'signin') {
        userData = await loginWithEmailPassword(email, password);
      } else {
        userData = await registerWithEmailPassword(email, password, name);
      }

      setUser(userData);
      setSuccess(activeTab === 'signin' ? t('auth.signedIn') : t('auth.accountCreated'));

      // Auto close modal after successful authentication
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(mapAuthError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError(t('authErrors.fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      await sendPasswordReset(email);
      setSuccess(t('auth.resetSent'));
    } catch (err) {
      setError(t('authErrors.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setSuccess('');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const userData = await loginWithGoogle();
      setUser(userData);
      setSuccess(t('auth.googleSuccess'));

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      // Ignore if user simply closed the popup
      if (err.message && err.message.includes('popup-closed-by-user')) {
        // Silent ignore - user chose not to sign in
      } else if (err.message && err.message.includes('cancelled-popup-request')) {
        // Also ignore if a new popup request cancelled the previous one
      } else {
        setError(t('authErrors.googleFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        tabIndex={-1}
        style={swipe.style}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        <div className="auth-modal__header">
          <h2 id="auth-modal-title" className="auth-modal__title">
            {mode === 'reset' ? t('auth.resetTitle') : t('auth.welcome')}
          </h2>
          <button className="auth-modal__close" onClick={onClose} aria-label={t('auth.close')}>
            ×
          </button>
        </div>

        {mode === 'reset' ? (
          <>
            <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
              {t('auth.resetBody')}
            </p>
            <form onSubmit={handleReset}>
              <div className="form-field">
                <label className="form-label" htmlFor="reset-email">{t('auth.emailAddress')}</label>
                <input
                  id="reset-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                />
              </div>

              {error && <div className="form-message form-message--error" role="alert">{error}</div>}
              {success && <div className="form-message form-message--success" role="status">{success}</div>}

              <button
                type="submit"
                className="button button--primary"
                style={{ width: '100%', marginTop: '0.75rem' }}
                disabled={loading}
              >
                {loading ? t('auth.sending') : t('auth.sendResetLink')}
              </button>
            </form>

            <p className="form-footnote">
              <button type="button" className="form-footnote__link" onClick={() => switchMode('auth')}>
                {t('auth.backToSignIn')}
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="auth-modal__tabs">
              <button
                className={["auth-modal__tab", activeTab === 'signin' ? 'auth-modal__tab--active' : ''].join(' ')}
                onClick={() => setActiveTab('signin')}
                type="button"
              >
                {t('auth.signIn')}
              </button>
              <button
                className={["auth-modal__tab", activeTab === 'signup' ? 'auth-modal__tab--active' : ''].join(' ')}
                onClick={() => setActiveTab('signup')}
                type="button"
              >
                {t('auth.createAccount')}
              </button>
            </div>

            {/* Google Sign-In */}
            <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="button button--secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.02 24.02 0 0 0 0 21.56l7.98-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {t('auth.continueWithGoogle')}
              </button>
            </div>

            <div className="auth-divider">
              <span className="auth-divider__label">{t('auth.orWithEmail')}</span>
            </div>

            <form onSubmit={handleSubmit}>
              {activeTab === 'signup' && (
                <div className="form-field">
                  <label className="form-label" htmlFor="auth-name">{t('auth.fullName')}</label>
                  <input
                    id="auth-name"
                    type="text"
                    autoComplete="name"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.fullNamePlaceholder')}
                  />
                </div>
              )}

              <div className="form-field">
                <label className="form-label" htmlFor="auth-email">{t('auth.emailAddress')}</label>
                <input
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="auth-password">{t('auth.password')}</label>
                <div className="input-with-action">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.passwordPlaceholder')}
                    aria-describedby={activeTab === 'signup' ? 'auth-password-rule' : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {activeTab === 'signup' && (
                  <small id="auth-password-rule" className="form-hint">{t('auth.passwordRule')}</small>
                )}
              </div>

              {activeTab === 'signin' && (
                <div style={{ textAlign: 'right', marginBottom: '0.4rem' }}>
                  <button type="button" className="form-footnote__link" onClick={() => switchMode('reset')}>
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              )}

              {error && <div className="form-message form-message--error" role="alert">{error}</div>}
              {success && <div className="form-message form-message--success" role="status">{success}</div>}

              <button
                type="submit"
                className="button button--primary"
                style={{ width: '100%', marginTop: '0.75rem' }}
                disabled={loading}
              >
                {loading ? t('auth.pleaseWait') : (activeTab === 'signin' ? t('auth.signIn') : t('auth.createAccount'))}
              </button>
            </form>

            <p className="form-footnote">
              {activeTab === 'signin'
                ? <>{t('auth.noAccount')} <button type="button" className="form-footnote__link" onClick={() => setActiveTab('signup')}>{t('auth.signUpNow')}</button></>
                : <>{t('auth.hasAccount')} <button type="button" className="form-footnote__link" onClick={() => setActiveTab('signin')}>{t('auth.signInInstead')}</button></>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function UserDropdown({ user, onLogout }) {
  const track = useStore((s) => s.track);
  const [showTrackSelector, setShowTrackSelector] = React.useState(false);

  // Lazy-import track info to avoid circular deps
  const trackInfo = React.useMemo(() => {
    try {
      const { TRACK_BY_CODE } = require('../config/trackConfig');
      return track ? TRACK_BY_CODE[track] : null;
    } catch { return null; }
  }, [track]);

  return (
    <>
      <div className="dropdown__menu">
        <div className="dropdown__item dropdown__item--muted">
          <strong>{user.name}</strong>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>{user.email}</span>
        </div>
        <div className="dropdown__divider" />
        <Link
          to="/profile"
          className="dropdown__item"
          onClick={() => useStore.getState().setShowUserDropdown(false)}
        >
          <User size={14} /> Mon profil
        </Link>
        {trackInfo && (
          <>
            <div className="dropdown__divider" />
            <div className="dropdown__item dropdown__track">
              <span>Filière</span>
              <span className="dropdown__track-badge" style={{ color: trackInfo.color }}>
                {trackInfo.icon} {trackInfo.shortLabel}
              </span>
            </div>
          </>
        )}
        <div className="dropdown__divider" />
        <button
          className="dropdown__item"
          onClick={() => {
            useStore.getState().setShowUserDropdown(false);
            setShowTrackSelector(true);
          }}
        >
          {track ? <><RefreshCw size={14} /> Changer de filière</> : <><GraduationCap size={14} /> Choisir ma filière</>}
        </button>
        <div className="dropdown__divider" />
        <button className="dropdown__item" onClick={onLogout}>
          Sign Out
        </button>
      </div>
      {showTrackSelector && (
        <TrackSelectorModal
          currentTrack={track}
          onClose={() => setShowTrackSelector(false)}
          onSelect={() => setShowTrackSelector(false)}
        />
      )}
    </>
  );
}

/** Lazy wrapper so TrackSelector is only loaded when needed */
function TrackSelectorModal({ currentTrack, onClose, onSelect }) {
  const TrackSelector = React.lazy(() => import('./TrackSelector'));
  return (
    <React.Suspense fallback={null}>
      <TrackSelector mode="modal" currentTrack={currentTrack} onClose={onClose} onSelect={onSelect} />
    </React.Suspense>
  );
}