import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

// Fill these in app.json > extra, or override via EAS Secrets
export const firebaseConfig = {
  apiKey:            extra.firebaseApiKey            || '',
  authDomain:        extra.firebaseAuthDomain        || '',
  projectId:         extra.firebaseProjectId         || '',
  storageBucket:     extra.firebaseStorageBucket     || '',
  messagingSenderId: extra.firebaseMessagingSenderId || '',
  appId:             extra.firebaseAppId             || '',
};
