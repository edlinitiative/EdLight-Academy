import React, { useEffect, useRef, useState } from 'react';
import useStore from '../contexts/store';
import { GOOGLE_CLIENT_ID } from '../config';

export function AuthModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasClientId, setHasClientId] = useState(() => {
    const runtime = (typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) || '';
    return Boolean(runtime || GOOGLE_CLIENT_ID);
  });
  const [googleReady, setGoogleReady] = useState(false);
  const initDoneRef = useRef(false);
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

  useEffect(() => {
    // Ensure the Google Identity script is present; if not, inject it dynamically
    const ensureScript = () => {
      const existing = document.getElementById('google-identity-services');
      if (!existing) {
        const s = document.createElement('script');
        s.id = 'google-identity-services';
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
    };
    ensureScript();

    // Poll for the Google Identity library to load (since the script is async)
    let attempts = 0;
    const maxAttempts = 40; // ~10s at 250ms
    const interval = setInterval(() => {
      if (initDoneRef.current) {
        clearInterval(interval);
        return;
      }
      const g = window.google && window.google.accounts && window.google.accounts.id;
      const runtimeClientId = (typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) || GOOGLE_CLIENT_ID || '';
      if (g && runtimeClientId && googleBtnRef.current) {
        try {
          g.initialize({
            client_id: runtimeClientId,
            callback: (response) => {
              const data = decodeJwt(response.credential);
              if (data) {
                const profile = {
                  name: data.name || 'Student',
                  email: data.email || '',
                  picture: data.picture || ''
                };
                setUser(profile);
                onClose();
              }
            },
          });
          g.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 320,
          });
          initDoneRef.current = true;
          setHasClientId(true);
          setGoogleReady(true);
          clearInterval(interval);
        } catch (e) {
          // keep trying; likely rendering target not ready yet
        }
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
          setGoogleError('Unable to load Google Sign-In. It may be blocked by a network filter, ad blocker, or Content Security Policy.');
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [googleBtnRef, setUser, onClose]);

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
          <div ref={googleBtnRef} style={{ display: 'inline-flex' }} />
          {hasClientId && !googleReady && !googleError && (
            <small className="text-muted">Loading Google sign-in…</small>
          )}
          {!hasClientId && !googleBtnRef.current?.childElementCount && !googleError && (
            <small className="text-muted">Google sign-in not configured. Set window.EDLIGHT_GOOGLE_CLIENT_ID to enable.</small>
          )}
          {googleError && (
            <small className="text-danger">{googleError}</small>
          )}
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