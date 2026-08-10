// Extends Jest's `expect` with DOM matchers like toBeInTheDocument / toHaveFocus.
import '@testing-library/jest-dom';

// src/config/firebase.ts reads its config from a runtime-injected global that
// index.html sets in the browser. Nothing injects it under jsdom, so apiKey
// was '' and src/services/firebase.ts threw `auth/invalid-api-key` from
// getAuth() at IMPORT time — before any test body ran. That broke every suite
// which transitively reached the firebase service, however indirectly:
// AuthModal.test.tsx mocked authService but still pulled it in through
// Auth.tsx → referralService.ts, and failed to load at all.
//
// Set the global here so importing the module is safe everywhere, rather than
// making each test discover its own path to it and mock that. These are
// syntactically valid dummies, not credentials: getAuth() only checks that a
// key is present, and no test may reach the network. Firestore needs no
// equivalent — createDb() already falls back when persistence is unavailable.
//
// Do NOT put real values here. A test that needs Firebase behaviour should
// mock the module; a test that merely imports something which imports it just
// needs initialization not to throw.
window.EDLIGHT_FIREBASE_CONFIG = {
  apiKey: 'test-api-key',
  authDomain: 'test.firebaseapp.com',
  projectId: 'test-project',
  storageBucket: 'test.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
};

// jsdom has no layout engine, so its built-in `offsetParent` getter always
// returns null — which breaks visibility checks (e.g. focus-trap skipping
// hidden elements). Override it to return the parent for attached, non-hidden
// elements so those checks behave like a real browser in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() {
    if (this.style && this.style.display === 'none') return null;
    return this.parentNode || null;
  },
});
