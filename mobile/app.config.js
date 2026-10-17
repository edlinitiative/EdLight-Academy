// Dynamic Expo config — reads Firebase credentials from environment variables.
// In development: create a .env.local file (see .env.example).
// In EAS builds: the EXPO_PUBLIC_FIREBASE_* vars live in the EAS "production"
// environment (eas env:list --environment production).
//
// IMPORTANT: spread config.extra so static app.json extras (notably
// extra.eas.projectId, the EAS project link) survive this override.
//
// The same spread is what carries android.intentFilters (the /defi and Arena
// App Links, see src/navigation/arenaLinks.ts for the URL contract) and
// ios.associatedDomains into the native build. Never rebuild `android` or `ios`
// from scratch here: a dropped intent filter only shows up as a link that
// opens the browser instead of the app, in a store build, weeks later.

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
