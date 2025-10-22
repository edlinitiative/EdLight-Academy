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
    // Render Google button if library is available and client ID is configured
    const g = window.google && window.google.accounts && window.google.accounts.id;
    const runtimeClientId = (typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) || GOOGLE_CLIENT_ID || '';
    if (g && runtimeClientId && googleBtnRef.current) {
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
      try {
        g.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 320,
        });
      } catch {}
    }
  }, [googleBtnRef, setUser, onClose]);

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
          {!(typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) && !GOOGLE_CLIENT_ID && (
            <small className="text-muted">Google sign-in not configured. Set window.EDLIGHT_GOOGLE_CLIENT_ID to enable.</small>
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