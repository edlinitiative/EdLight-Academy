// Dynamic Expo config — reads Firebase credentials from environment variables.
// In development: create a .env.local file (see .env.example).
// In EAS builds: the EXPO_PUBLIC_FIREBASE_* vars live in the EAS "production"
// environment (eas env:list --environment production).
//
// IMPORTANT: spread config.extra so static app.json extras (notably
// extra.eas.projectId, the EAS project link) survive this override.

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    firebaseApiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            ?? config.extra?.firebaseApiKey ?? '',
    firebaseAuthDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? config.extra?.firebaseAuthDomain ?? '',
    firebaseProjectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         ?? config.extra?.firebaseProjectId ?? '',
    firebaseStorageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? config.extra?.firebaseStorageBucket ?? '',
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? config.extra?.firebaseMessagingSenderId ?? '',
    firebaseAppId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             ?? config.extra?.firebaseAppId ?? '',
  },
});
