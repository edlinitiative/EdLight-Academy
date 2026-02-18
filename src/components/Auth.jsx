import React, { useState, useEffect, useRef } from 'react';
import useStore from '../contexts/store';
import { loginWithEmailPassword, registerWithEmailPassword, loginWithGoogle } from '../services/authService';

export function AuthModal({ onClose }) {
  const storeActiveTab = useStore(state => state.activeTab);
  const [activeTab, setActiveTab] = useState(storeActiveTab || 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const modalRef = useRef(null);
  
  const setUser = useStore(state => state.setUser);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Auto-focus modal on mount
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (activeTab === 'signup' && !name) {
      setError('Please enter your name');
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
      setSuccess(activeTab === 'signin' ? 'Successfully logged in!' : 'Account created successfully!');
      
      // Auto close modal after successful authentication
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      // Handle different Firebase error messages
      let errorMessage = err.message;
      if (errorMessage.includes('auth/invalid-email')) {
        errorMessage = 'Invalid email address';
      } else if (errorMessage.includes('auth/user-not-found')) {
        errorMessage = 'No account found with this email';
      } else if (errorMessage.includes('auth/wrong-password')) {
        errorMessage = 'Incorrect password';
      } else if (errorMessage.includes('auth/weak-password')) {
        errorMessage = 'Password should be at least 6 characters';
      } else if (errorMessage.includes('auth/email-already-in-use')) {
        errorMessage = 'An account with this email already exists';
      } else if (errorMessage.includes('auth/invalid-credential')) {
        errorMessage = 'Invalid email or password';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    
    try {
      const userData = await loginWithGoogle();
      setUser(userData);
      setSuccess('Successfully signed in with Google!');
      
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
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="auth-modal" onClick={(e) => e.stopPropagation()} ref={modalRef} tabIndex={-1}>
        <div className="auth-modal__header">
          <h2 id="auth-modal-title" className="auth-modal__title">Welcome to EdLight</h2>
          <button className="auth-modal__close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className="auth-modal__tabs">
          <button 
            className={["auth-modal__tab", activeTab === 'signin' ? 'auth-modal__tab--active' : ''].join(' ')}
            onClick={() => setActiveTab('signin')}
            type="button"
          >
            Sign In
          </button>
          <button 
            className={["auth-modal__tab", activeTab === 'signup' ? 'auth-modal__tab--active' : ''].join(' ')}
            onClick={() => setActiveTab('signup')}
            type="button"
          >
            Create Account
          </button>
        </div>

        {/* Google Sign-In */}
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="button button--secondary button--pill"
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
            Continue with Google
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'signup' && (
            <div className="form-field">
              <label className="form-label" htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
          )}

          <div className="form-field">
            <label className="form-label" htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <div className="form-message form-message--error">{error}</div>}
          {success && <div className="form-message form-message--success">{success}</div>}

          <button 
            type="submit" 
            className="button button--primary button--pill" 
            style={{ width: '100%', marginTop: '0.75rem' }}
            disabled={loading}
          >
            {loading ? 'Please wait...' : (activeTab === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="form-footnote">
          {activeTab === 'signin' 
            ? <>Don't have an account? <button type="button" className="form-footnote__link" onClick={() => setActiveTab('signup')}>Sign up now!</button></>
            : <>Already have an account? <button type="button" className="form-footnote__link" onClick={() => setActiveTab('signin')}>Sign in instead!</button></>}
        </p>
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
          {track ? '🔄 Changer de filière' : '🎓 Choisir ma filière'}
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