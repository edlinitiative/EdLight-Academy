import React, { useState } from 'react';
import useStore from '../contexts/store';

export default function Settings() {
  const { user, isAuthenticated, logout } = useStore();
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);

  if (!isAuthenticated) {
    return (
      <section className="section">
        <div className="container">
          <div className="card card--message">
            <h2>Please sign in to access settings</h2>
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
            <h1>Tell us about what you like</h1>
            <p className="text-muted">Manage your preferences and account settings.</p>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr', maxWidth: '700px', gap: '1.5rem' }}>
          {/* Notifications Settings */}
          <div className="card">
            <h3 className="card__title">Notifications</h3>
            
            <div className="notification-setting">
              <label className="notification-setting__label">
                <input 
                  type="checkbox" 
                  checked={emailNotifications}
                  onChange={(e) => setEmailNotifications(e.target.checked)}
                />
                <span>Email Notifications</span>
              </label>
              <p className="text-muted">Receive email updates about your courses and progress</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input 
                  type="checkbox" 
                  checked={pushNotifications}
                  onChange={(e) => setPushNotifications(e.target.checked)}
                />
                <span>Push Notifications</span>
              </label>
              <p className="text-muted">Get browser notifications for important updates</p>
            </div>

            <div className="notification-setting">
              <label className="notification-setting__label">
                <input 
                  type="checkbox" 
                  checked={weeklyDigest}
                  onChange={(e) => setWeeklyDigest(e.target.checked)}
                />
                <span>Weekly Progress Digest</span>
              </label>
              <p className="text-muted">Receive a weekly summary of your learning activity</p>
            </div>
          </div>

          {/* Privacy Settings */}
          <div className="card">
            <h3 className="card__title">Privacy & Data</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Data Export</h4>
                <p className="text-muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  Download a copy of your personal data and learning history
                </p>
                <button className="button button--ghost button--sm">
                  Export My Data
                </button>
              </div>

              <div>
                <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Delete Account</h4>
                <p className="text-muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  Permanently delete your account and all associated data
                </p>
                <button className="button button--ghost button--sm" style={{ color: 'var(--danger-500)' }}>
                  Delete Account
                </button>
              </div>
            </div>
          </div>

          {/* Account Actions */}
          <div className="card">
            <h3 className="card__title">Account Actions</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                className="button button--ghost"
                onClick={() => {
                  // Handle password change
                  alert('Password change feature coming soon!');
                }}
              >
                Change Password
              </button>
              
              <button 
                className="button button--primary"
                onClick={() => {
                  logout();
                  window.location.href = '/';
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

