import React, { useState } from 'react';
import useStore from '../contexts/store';
import { loginWithEmailPassword, registerWithEmailPassword, loginWithGoogle } from '../services/authService';

export function AuthModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const setUser = useStore(state => state.setUser);

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
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <img src="/assets/logo.png" alt="G" width={18} height={18} />
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