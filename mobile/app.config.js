// Dynamic Expo config — reads Firebase credentials from environment variables.
// In development: create a .env.local file (see .env.example).
// In EAS builds: set secrets via `eas secret:create`.

module.exports = ({ config }) => ({
  ...config,
  extra: {
    firebaseApiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            ?? '',
    firebaseAuthDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
    firebaseProjectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
    firebaseStorageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    firebaseAppId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             ?? '',
  },
});
