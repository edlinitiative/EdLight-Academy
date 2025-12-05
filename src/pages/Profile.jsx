import React from 'react';
import useStore from '../contexts/store';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { user, isAuthenticated } = useStore();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <h2>Please sign in to view your profile</h2>
            <button 
              className="button button--primary button--pill"
              onClick={() => useStore.getState().toggleAuthModal()}
            >
              Sign In
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <h1>Customize your identity</h1>
            <p className="text-muted">Manage your account information and preferences.</p>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr', maxWidth: '600px' }}>
          <div className="card">
            <h3 className="card__title">Personal Information</h3>
            
            <div className="form-field">
              <label className="form-label">Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={user?.name || ''} 
                disabled 
              />
            </div>

            <div className="form-field">
              <label className="form-label">Email</label>
              <input 
                type="email" 
                className="form-input" 
                value={user?.email || ''} 
                disabled 
              />
            </div>

            <div className="form-field">
              <label className="form-label">Member Since</label>
              <input 
                type="text" 
                className="form-input" 
                value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'} 
                disabled 
              />
            </div>

            <p className="text-muted" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
              To update your profile information, please contact support.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

