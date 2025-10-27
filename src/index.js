import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initI18n } from './utils/i18n';
import useStore from './contexts/store';
import { onAuthStateChange, upsertUserDocument } from './services/firebase';

// Initialize internationalization
initI18n();

// Create root and render app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Sync Firebase auth state to app store
onAuthStateChange(async (user) => {
  const setUser = useStore.getState().setUser;
  if (user) {
    // Update last_seen in Firestore on session restore
    try {
      await upsertUserDocument(user, false);
    } catch (error) {
      console.error('Failed to update user document:', error);
    }
    
    setUser({
      uid: user.uid,
      name: user.displayName || 'Student',
      email: user.email || '',
      picture: user.photoURL || '',
    });
  } else {
    useStore.getState().logout();
  }
});