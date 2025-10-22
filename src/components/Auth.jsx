import React, { useEffect, useRef, useState } from 'react';
import useStore from '../contexts/store';
import { startGoogleOAuth } from '../services/googleOAuth';

export function AuthModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [googleError, setGoogleError] = useState('');
  
  const setUser = useStore(state => state.setUser);
  const googleBtnRef = useRef(null);

  // Decode a Google ID token (JWT) to extract basic profile info client-side
  function decodeJwt(token) {
    try {
      const payload = token.split('.')[1];
      const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // No GIS dependency: we trigger OAuth 2.0 with PKCE on click

  // In case the inline script sets the client ID slightly after mount, re-check shortly to avoid false warning
  useEffect(() => {
    const check = () => {
      const runtime = (typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) || '';
      if (runtime || GOOGLE_CLIENT_ID) {
        setHasClientId(true);
      }
    };
    // Check on next tick and after a short delay
    const t1 = setTimeout(check, 0);
    const t2 = setTimeout(check, 300);
    const t3 = setTimeout(check, 1000);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (activeTab === 'signup' && !name) {
      setError('Please enter your name');
      return;
    }

    try {
      if (activeTab === 'signin') {
        // TODO: Replace with actual authentication
        setSuccess('Logging in...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        setUser({ name: name || 'Student', email });
        onClose();
      } else {
        setSuccess('Creating account...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        setActiveTab('signin');
        setSuccess('Account created! Please sign in.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal__header">
          <h2 className="auth-modal__title">Welcome to EdLight</h2>
          <button className="auth-modal__close" onClick={onClose} aria-label="Close">
            X
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
            onClick={async () => {
              try {
                setGoogleError('');
                await startGoogleOAuth();
              } catch (e) {
                setGoogleError(e.message);
              }
            }}
          >
            <img src="/assets/logo.png" alt="G" width={18} height={18} />
            Continue with Google
          </button>
          {googleError && (<small className="text-danger">{googleError}</small>)}
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

          <button type="submit" className="button button--primary button--pill" style={{ width: '100%', marginTop: '0.75rem' }}>
            {activeTab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="form-footnote">
          {activeTab === 'signin' 
            ? "Don't have an account? Sign up now!"
            : "Already have an account? Sign in instead!"}
        </p>
      </div>
    </div>
  );
}

export function UserDropdown({ user, onLogout }) {
  return (
    <div className="dropdown__menu">
      <div className="dropdown__item dropdown__item--muted">
        <strong>{user.name}</strong>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>{user.email}</span>
      </div>
      <div className="dropdown__divider" />
      <button className="dropdown__item" onClick={onLogout}>
        Sign Out
      </button>
    </div>
  );
}