import React, { useState } from 'react';
import useStore from '../contexts/store';

export function AuthModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const setUser = useStore(state => state.setUser);

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Welcome to EdLight</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tabs">
          <button 
            className={\`tab \${activeTab === 'signin' ? 'active' : ''}\`}
            onClick={() => setActiveTab('signin')}
          >
            Sign In
          </button>
          <button 
            className={\`tab \${activeTab === 'signup' ? 'active' : ''}\`}
            onClick={() => setActiveTab('signup')}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'signup' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="input-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && <div className="error-message">⚠️ {error}</div>}
          {success && <div className="success-message">✓ {success}</div>}

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
            {activeTab === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-small text-gray" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
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
    <div className="dropdown-menu">
      <div className="dropdown-item" style={{ pointerEvents: 'none' }}>
        <strong>{user.name}</strong>
        <div className="text-small text-gray">{user.email}</div>
      </div>
      <div className="dropdown-divider" />
      <button className="dropdown-item" onClick={onLogout}>
        Sign Out
      </button>
    </div>
  );
}