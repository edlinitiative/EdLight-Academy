# Push notifications (mobile)

## How it works

1. **Local notifications** (`src/services/notificationService.ts`) — daily study
   reminder, trivia reminder, achievement/streak/leaderboard alerts. All of them
   go through one guard: OS permission granted **and** the Profile "Notifications"
   toggle not switched off (AsyncStorage key `@edlight:notifications_enabled`;
   unset = enabled by default once permission is granted). Strings are bilingual
   (`t(fr, ht)` selected from the Zustand store at schedule time); changing the
   language in ProfileScreen re-schedules the daily reminder so its text matches.

2. **Remote push** (`src/services/pushService.ts`) — after sign-in (and when the
   toggle is on), `registerForPushNotifications(uid)` fetches an Expo push token
   and stores it on the Firestore user doc:
   - `expoPushTokens` — array (`arrayUnion`), one entry per device
   - `pushTokenUpdatedAt` — server timestamp
   - `language` — `'fr' | 'ht'`, so the send script can localize per user

   On logout, the current device's token is removed (`arrayRemove`, best-effort).
   Taps on remote pushes are routed in `App.tsx`: a `data.tab` payload maps to
   `setActiveTab(tab)` (e.g. `{"tab": "trivia"}`), and `data.url` is opened via
   `Linking`.

## Why tokens don't register in Expo Go

Expo Go (SDK 53+) does not support remote push notifications — there is no
app-specific push credential inside the Go client. `registerForPushNotifications`
detects Expo Go (`Constants.appOwnership === 'expo'` / `executionEnvironment ===
'storeClient'`) and returns `null` silently. You need a **development build or
EAS build** (`eas build --profile development`) to get a token. Local
notifications work fine in Expo Go.

## projectId requirement

`Notifications.getExpoPushTokenAsync({ projectId })` requires the EAS project ID.
It is read from `Constants.expoConfig.extra.eas.projectId` (falling back to
`Constants.easConfig.projectId`). It **is currently present** in
`mobile/app.json` (`extra.eas.projectId: 84d5c2a1-53bc-443c-8a93-e17a1207322b`)
and `mobile/app.config.js` deliberately spreads `config.extra` so it survives
the dynamic-config override. If it were ever missing, registration skips
silently with a one-time console warning.

## Sending pushes: `scripts/send-push.js`

Standalone admin script (Node 18+, uses `firebase-admin` from the root
`package.json` — run it from the repo root). Credentials via
`FIREBASE_SERVICE_ACCOUNT_JSON` (inline JSON) or `FIREBASE_SERVICE_ACCOUNT_PATH`
(key-file path), same as the other scripts in `scripts/`.

```bash
# All users with a registered device, bilingual:
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json node scripts/send-push.js \
  --title "Quiz du jour disponible ! 🎯" \
  --body  "Testez vos connaissances et grimpez dans le classement." \
  --title-ht "Quiz jodi a disponib ! 🎯" \
  --body-ht  "Teste konesans ou epi monte nan klasman an." \
  --data '{"tab":"trivia"}'

# Single user:
node scripts/send-push.js --uid <userId> --title "..." --body "..."

# Preview recipients without sending:
node scripts/send-push.js --dry-run
```

The script chunks tokens by 100 (Expo API limit), logs push tickets and
receipts, and removes tokens that come back `DeviceNotRegistered` from the
user docs. Users whose doc has `language: 'ht'` get the `--title-ht/--body-ht`
variant; docs registered before the `language` field existed default to French.
