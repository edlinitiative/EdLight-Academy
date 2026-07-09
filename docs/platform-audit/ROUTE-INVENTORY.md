# Route Inventory — EdLight Academy

**Audit date:** 2026-06-26  
**Auditor:** Automated platform audit  
**Framework:** React 18 + React Router v6 (Webpack SPA)  
**Deployment:** Vercel (SPA rewrites, serverless API functions)

---

## Application Architecture

| Layer | Technology |
|---|---|
| Framework | React 18.3, React Router DOM 6.16 |
| Build | Webpack 5 (no Next.js/Vite) |
| State | Zustand 4 (persisted to localStorage) |
| Data fetching | @tanstack/react-query 4 |
| Backend | Vercel Serverless Functions (TypeScript) |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (email/password + Google OAuth) |
| Push notifications | Web Push (VAPID) |
| LLM grading | Gemini / DeepSeek / OpenAI (configurable via env) |
| Internationalization | i18next (French + Haitian Creole) |
| Math rendering | KaTeX + remark-math |
| PWA | Service Worker + Web App Manifest |

---

## Frontend Routes (React Router)

All routes are nested under `<Layout />` which renders the Navbar, Footer, and content `<Outlet />`.

| # | Path | Page Component | Role | Auth Required | Purpose | Status | Issues |
|---|---|---|---|---|---|---|---|
| 1 | `/` | `HomeRoute → Home` | Public | No | Marketing landing page | ✅ Working | Minor: no language-aware meta tags |
| 2 | `/courses` | `Courses` | Public | No | Course catalogue listing | ✅ Working | — |
| 3 | `/courses/:courseId` | `CourseDetail` | Public / Student | No (free preview, gated after N videos) | Course lesson player | ✅ Working | Free-preview limit relies on localStorage only |
| 4 | `/dashboard` | `Dashboard` | Student | Soft (redirects to courses if not authenticated) | Student learning hub | ✅ Working | No hard redirect for unauthenticated users |
| 5 | `/quizzes` | `Quizzes` | Student | No | Subject quiz browser | ✅ Working | — |
| 6 | `/exams` | `ExamLanding` | Public | No | National exam prep landing | ✅ Working | — |
| 7 | `/exams/:level` | `ExamBrowser` | Public | No | Browse exams by level (terminale / 9e / university) | ✅ Working | — |
| 8 | `/exams/:level/:examId` | `ExamTake` | Student | No | Take a practice exam | ✅ Working | No auth gate; unanswered drafts saved anonymously to sessionStorage, Firestore only if logged in |
| 9 | `/exams/:level/:examId/results` | `ExamResults` | Student | No | View exam results + analytics | ✅ Working | Results loaded from sessionStorage; lost on tab close if not logged in |
| 10 | `/study-plan` | `StudyPlan` | Student | Soft | AI-generated spaced-repetition plan | ✅ Working | Calls `/api/generate-plan` without auth |
| 11 | `/trivia` | `TriviaGames` | Public / Student | No | Trivia / gamification | ✅ Working | XP is client-reported |
| 12 | `/profile` | `Profile` | Student | No (guest view shown) | Account hub, stats, settings | ✅ Working | — |
| 13 | `/about` | `About` | Public | No | About EdLight | ✅ Working | Static content only |
| 14 | `/contact` | `Contact` | Public | No | Contact form | ✅ Working | Needs validation review |
| 15 | `/faq` | `FAQ` | Public | No | Frequently asked questions | ✅ Working | Static content only |
| 16 | `/help` | `Help` | Public | No | Help centre | ✅ Working | Static content only |
| 17 | `/privacy` | `Privacy` | Public | No | Privacy policy | ✅ Working | Static content only |
| 18 | `/terms` | `Terms` | Public | No | Terms of service | ✅ Working | Static content only |
| 19 | `/admin` | `Admin` (via `AdminRoute`) | Admin only | Yes — Firestore role check | Content management (videos, quizzes, users) | ✅ Working | Firestore role read on every page load; no server-side admin auth on Firestore writes |
| 20 | `/admin/courses` | `CourseManager` (via `AdminRoute`) | Admin only | Yes | Course structure editor | ✅ Working | Same concerns as /admin |
| 21 | `/admin/verify` | `AnswerVerification` (via `AdminRoute`) | Admin only | Yes | Exam answer verification tool | ✅ Working | — |
| 22 | `*` | `NotFound` | Public | No | 404 page | ✅ Working | — |

### Dynamic Route Notes

- `/exams/:level` accepts values: `terminale`, `9e`, `university` (validated in ExamBrowser)
- `/exams/:level/:examId` accepts either a UUID (`exam_id`) or a legacy numeric index; numeric IDs are auto-redirected to canonical UUID form
- Legacy numeric exam routes trigger a client-side redirect to the stable UUID form (`navigate(..., { replace: true })`)

---

## API Endpoints (Vercel Serverless Functions)

| # | Method | Path | Auth | Role | Purpose | Status | Issues |
|---|---|---|---|---|---|---|---|
| 1 | `POST` | `/api/grade-essay` | ❌ None | Public | AI essay grading | ⚠️ Works | No auth — anyone can call; drives up LLM costs |
| 2 | `POST` | `/api/grade-scaffold` | ❌ None | Public | AI scaffold blank grading | 🔴 Critical | **Hardcoded Gemini API key in source** + No auth |
| 3 | `POST` | `/api/generate-quiz` | ❌ None | Public | AI quiz generation | ⚠️ Works | No auth |
| 4 | `POST` | `/api/generate-plan` | ❌ None | Public | AI study plan generation | ⚠️ Works | No auth |
| 5 | `GET` | `/api/users/export` | ❌ None | Admin | Export user CSV | 🔴 Critical | **No auth — full PII dump to anyone** |
| 6 | `POST` | `/api/users/upsert` | ❌ None | System | Create/update user in GitHub CSV | 🔴 Critical | **No auth — anyone can write user records** |
| 7 | `POST` | `/api/oauth/google/token` | ❌ None | System | Google OAuth token exchange | ⚠️ Works | No CSRF protection; redirect_uri not validated server-side |
| 8 | `POST` | `/api/send-push` | Partial (`CRON_SECRET`) | Admin/Cron | Send push notification | ✅ Works | Requires `CRON_SECRET` bearer token |
| 9 | `POST` | `/api/send-broadcast` | Partial (`CRON_SECRET`) | Admin | Broadcast push notification | ✅ Works | Same |
| 10 | `GET/POST` | `/api/send-reminders` | Partial (`CRON_SECRET`) | Cron (every 15 min) | Send scheduled reminders | ✅ Works | — |
| 11 | `GET` | `/api/proxy` | ❌ None | Public | URL proxy for CORS bypass | ⚠️ Works | Open proxy — could be abused for SSRF |

---

## AuthCallback

`src/pages/AuthCallback.tsx` exists in source but is **not registered in the router**. It is dead code unless linked from elsewhere. No route is defined for it.

---

## Discovered-but-not-linked Routes

| Path | Notes |
|---|---|
| `/auth/callback` | No route — `AuthCallback.tsx` is unregistered |

---

## Summary

- **22 client routes** defined
- **11 API endpoints** (Vercel serverless)
- **3 P0 security findings** on API endpoints (see SECURITY-AUDIT.md)
- **1 dead page** (`AuthCallback.tsx`)
- Dashboard has no hard auth redirect for unauthenticated users (P2)
- All routes render correctly via SPA fallback rewrite
