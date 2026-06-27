# EdLight Mobile — Expo Setup Guide

## Overview

React Native (Expo SDK 52) mobile app for EdLight Academy. Lives at `mobile/` inside the monorepo alongside the web app (`src/`).

**Stack:** Expo • React Navigation 6 • NativeWind v4 (Tailwind) • Firebase JS SDK • Zustand + AsyncStorage • React Query

**Student-facing screens:** Dashboard · Courses · Course Detail (with YouTube via WebView) · Exam Landing · Exam Browser · Exam Take · Exam Results · Quizzes · Trivia · Profile

---

## 1. Prerequisites

- Node 18+
- Expo CLI: `npm install -g expo-cli` (or use `npx expo`)
- iOS: Xcode 15+ (for iOS Simulator)
- Android: Android Studio + emulator (optional)
- Expo Go app on your phone (fastest way to preview)

---

## 2. Install dependencies

```bash
cd mobile
npm install
```

---

## 3. Firebase configuration

Copy `.env.example` to `.env.local` and fill in your Firebase project credentials (same project as the web app — `edlight-academy`):

```bash
cp .env.example .env.local
```

Find your credentials in the [Firebase Console](https://console.firebase.google.com) → Project Settings → Your apps → Web app config.

> **Note:** On Expo Go (development), Firebase config is read from `app.config.js` → `EXPO_PUBLIC_*` env vars. In EAS builds, set them as EAS Secrets.

---

## 4. Google Sign-In (optional, adds native OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Credentials
2. Create OAuth 2.0 Client IDs for iOS and Android (use your bundle ID `org.edlight.academy`)
3. Add the client IDs to `AuthScreen.tsx` where `Google.useAuthRequest` is configured

---

## 5. App assets

Create placeholder PNG assets (required by Expo):

```bash
# 1024×1024 icon.png
# 1284×2778 splash.png (or any aspect ratio)
# 1024×1024 adaptive-icon.png (Android)
# 196×196 favicon.png (web)
# 96×96 notification-icon.png
```

Or use [Expo's asset generator](https://docs.expo.dev/guides/app-icons/).

---

## 6. Run the app

```bash
cd mobile
npx expo start
```

Then:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan the QR code with **Expo Go** on your phone

---

## 7. Build for production (EAS)

```bash
npm install -g eas-cli
eas login
eas build:configure

# iOS
eas build --platform ios

# Android
eas build --platform android
```

---

## Key Architecture Decisions

| Web | Mobile |
|-----|--------|
| `react-router-dom` | React Navigation 6 (bottom tabs + native stacks) |
| CSS / className | NativeWind v4 (same `className=` API, compiled to StyleSheet) |
| `localStorage` (Zustand persist) | AsyncStorage |
| `signInWithPopup` (Google) | `expo-auth-session` + `GoogleAuthProvider.credential()` |
| `katex` + `dangerouslySetInnerHTML` | WebView with inline KaTeX HTML |
| YouTube `<iframe>` | WebView with YouTube embed URL |
| `web-push` | `expo-notifications` |
| `window.EDLIGHT_FIREBASE_CONFIG` | `expo-constants` + `app.config.js` |
| `/exam_catalog.json` (static file) | Fetched from `https://edlight-academy.web.app` |

---

## Shared code (no changes needed)

- `src/services/` — Firebase functions (Firestore reads/writes)
- `src/hooks/useStreak.ts`, `useTrivia.ts`, `useProgress.ts`
- `src/utils/examUtils.ts`, `mathCAS.ts`, `dailyChallenge.ts`
- `src/data/triviaData.ts`
- `src/config/trackConfig.ts`

---

## Known limitations / future work

- [ ] Admin screens not included (use the web app for admin)
- [ ] Push notifications require EAS build (Expo Go has limited support)
- [ ] Google Sign-In needs OAuth client IDs configured
- [ ] App icons/splash need real assets (see Step 5)
- [ ] Offline mode: exam catalog is fetched at runtime from the web app
