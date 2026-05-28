// Firebase configuration
// Read from a runtime-injected global to avoid bundling secrets and undefined process.env in the browser
// Set window.EDLIGHT_FIREBASE_CONFIG in index.html or your hosting environment
const runtimeConfig = (typeof window !== 'undefined' && window.EDLIGHT_FIREBASE_CONFIG) || {};

export const firebaseConfig = {
  apiKey: runtimeConfig.apiKey || '',
  authDomain: runtimeConfig.authDomain || '',
  projectId: runtimeConfig.projectId || '',
  storageBucket: runtimeConfig.storageBucket || '',
  messagingSenderId: runtimeConfig.messagingSenderId || '',
  appId: runtimeConfig.appId || ''
};

