# EdLight mobile app audit

Date: October 17, 2026  
Scope: Existing React Native / Expo app in `mobile/`  
Deliverable: Audit and recommendations only; no application changes

## Assessment

The app has a substantial foundation: courses, exam preparation, adaptive next steps, daily challenges, duels, school standings, an AI assistant, and dedicated Arena registration, doors, live play, and results screens. Shared design tokens, motion presets, haptics, reduced-motion helpers, content caching, query persistence, and exam draft recovery already exist.

The largest opportunities are reliability at entry and account changes, a more coherent first session, persistent access to competition, clearer recovery states, and a stronger visual distinction between focused learning and Arena.

Adding more animation before addressing those issues would make an inconsistent experience more elaborate. The recommended direction is dependable learning with an expressive competition world, connected by one clear student identity.

## Evidence and limits

This is a source-code audit, not a device-based visual audit or a penetration test. Findings marked **confirmed** describe code paths or configuration observed in the checkout. Their visible behavior still needs reproduction on a device. Findings marked **recommendation** describe design opportunities rather than verified defects.

Reviewed areas include app startup, authentication, navigation, onboarding, dashboard, trivia, course playback, exam recovery, assistant interactions, Arena hooks and screens, theme and motion utilities, connectivity, notifications, persistence, and app configuration.

Attempted verification:

```text
cd mobile
npm test -- --runInBand --silent
```

The command stopped before running tests: **Preset jest-expo not found**. The package declares `jest-expo`, but it is unavailable in the current dependency installation. No dependencies were installed. No simulator, physical device, production service, or app-store build was tested. Existing tests are concentrated on utilities, scoring, and domain logic; they do not establish that complete navigation and device flows work.

Priority definitions:

- **P0:** Protect access and account correctness before expanding the experience.
- **P1:** Important usability, competition, accessibility, or recovery work.
- **P2:** Product and presentation improvements after essential flows are reliable.

## The 20 improvements

### 1. Remove profile writes from the authentication gate

**P0 · Confirmed code risk**

`AuthGate` awaits `upsertUserDocument` before calling `setUser` and `setAuthConfirmed`. The upsert performs Firestore reads and writes and can reject or remain pending. There is no surrounding catch/finally in this callback. Hiding the splash after a timeout does not resolve the authentication gate.

Evidence: [App.tsx](../../mobile/App.tsx#L59), [Firebase upsert](../../mobile/src/services/firebase.ts#L119).

**Improve:** Confirm the authenticated session independently of best-effort profile synchronization. Give pending or failed synchronization its own recoverable state. Handle account changes while asynchronous work is in progress.

**Validate:** Cold launch signed in with no network, blocked Firestore access, a slow profile request, and a write rejection. The app should reach an appropriate usable screen rather than remain on loading.

### 2. Isolate cached student state between accounts

**P0 · Confirmed code risk**

The streak query uses `['global-streak']` for every student although its query function reads a specific UID. This key is persisted across launches. The inspected logout paths do not clear the QueryClient or its persisted cache. A fresh cached streak can therefore be reused after switching accounts. Other profile queries, such as trivia, already include a UID and demonstrate the safer pattern.

Evidence: [useStreak](../../mobile/src/hooks/useStreak.ts#L19), [query persistence](../../mobile/src/services/queryPersistence.ts#L19), [logout service](../../mobile/src/services/authService.ts#L82), [store logout](../../mobile/src/contexts/store.ts#L234).

**Improve:** Include identity in all student-specific keys. Define cache clearing and persistence rules for logout, account deletion, and account switching. Review grade and learning preferences retained by store logout to distinguish device preferences from student-owned state.

**Validate:** Student A signs out and student B signs in within the cache freshness window, including after restarting offline. B must not see A's streak or other private progress. This audit did not establish server-side cross-account access.

### 3. Sequence onboarding through one coordinator

**P1 · Confirmed overlapping eligibility**

The grade modal sets `gradeChosen=true` and keeps itself visible with `showMission=true`. The navigation tour becomes visible when `gradeChosen && !tourCompleted`, without checking the first-mission state. Both native modals can become eligible simultaneously; presentation order needs device reproduction.

Evidence: [WelcomeGradeModal](../../mobile/src/components/WelcomeGradeModal.tsx#L41), [NavTour](../../mobile/src/components/NavTour.tsx#L92).

**Improve:** Use an explicit sequence for grade selection, first useful activity, and optional help. Prefer contextual navigation help after the first successful action. Preserve the destination of an invitation during onboarding.

**Validate:** Fresh install, skip grade, select grade, dismiss first quiz, launch through a duel invitation, and launch through an Arena invitation. Only one onboarding surface should own attention at a time.

### 4. Complete and validate Arena deep links

**P1 · Confirmed configuration gap**

The JavaScript navigator maps Arena routes, but Android's declared HTTPS intent filter only covers `/defi`. The dynamic app config preserves that configuration. Also, the broad `arena/:tournamentId` route could interpret web subpaths such as `championnat` or `demo` as tournament IDs; actual cross-platform URL behavior requires testing.

Evidence: [Android configuration](../../mobile/app.json#L46), [link mapping](../../mobile/src/navigation/AppNavigator.tsx#L138), [dynamic config](../../mobile/app.config.js).

**Improve:** Define one web/app URL contract with explicit reserved routes, valid tournament identifiers, and a fallback for unsupported destinations. Configure and verify native associations for supported Arena links.

**Validate:** Installed release builds on both platforms, cold and warm launch, signed out, invalid tournament, and all shared invitation formats. Navigator configuration alone does not prove native link delivery works.

### 5. Keep Home usable when the course feed fails

**P1 · Confirmed dependency coupling**

Dashboard returns a full-screen loading or error state based on `useCourses`, before rendering independent content such as the Arena announcement, daily activity, and navigation shortcuts.

Evidence: [Dashboard guards](../../mobile/src/screens/DashboardScreen.tsx#L213), [Arena announcement placement](../../mobile/src/screens/DashboardScreen.tsx#L574).

**Improve:** Keep the dashboard shell and independently available actions visible. Load and recover course sections locally. Preserve the primary next step when it can be computed from saved state.

**Validate:** Course feed unavailable while an Arena event is open. A course error must not remove the student's route back into competition.

### 6. Distinguish Arena absence, connection failure, and waiting

**P1 · Confirmed state-model gap**

Lobby and doors views combine errors and missing tournaments into `absent`. The live view discards subscription errors; a missing or failed question can become `inPause` because that state is derived from `!answerable`.

Evidence: [Lobby composition](../../mobile/src/hooks/useArena.ts#L340), [live composition](../../mobile/src/hooks/useArena.ts#L424), [lobby empty state](../../mobile/src/screens/arena/ArenaLobbyScreen.tsx).

**Improve:** Expose separate states for unavailable event, reconnecting, denied access, question loading, actual round interval, and ended event. Provide an appropriate retry or return action. Retain last-known data only with clear stale-state labeling.

**Validate:** Reject the tournament listener, reject the question listener, reconnect mid-question, and open a deleted event. Each should produce an accurate explanation rather than an ordinary interval or “nothing scheduled” message.

### 7. Define consistent background and resume timing

**P1 · Confirmed timer inconsistency**

Arena derives its time from timestamps. Trivia decrements a local counter every second. Timer callbacks can be suspended or delayed when an app backgrounds. The intended pause policy for practice and scored duels should be explicit.

Evidence: [Arena clock](../../mobile/src/hooks/useArena.ts#L73), [Trivia timer](../../mobile/src/screens/TriviaScreen.tsx#L700).

**Improve:** Use deadlines for activities intended to keep running and an explicit pause/resume model for activities allowed to pause. Keep authoritative competition timing on the server. Consider clock skew separately from timer drift.

**Validate:** Lock the phone, switch apps, receive a call, and resume after a question's deadline. Verify the UI, answer acceptance, and reward calculation agree.

### 8. Connect query recovery to native app lifecycle

**P1 · Confirmed integration not found in inspected app source**

NetInfo drives an offline banner, but no `onlineManager` or `focusManager` bridge was found in `mobile/src` or `mobile/App.tsx`. Native foreground and reconnect behavior should not be assumed from browser defaults.

Evidence: [NetworkStatus](../../mobile/src/components/NetworkStatus.tsx), [QueryClient setup](../../mobile/App.tsx#L40).

**Improve:** Connect native connectivity and foreground state to query lifecycle behavior, with intentional exceptions for authoritative Arena subscriptions. Show students when saved state is being refreshed.

**Validate:** Open a cached screen offline, regain connectivity, background the app long enough for data to change, then foreground it. Confirm relevant queries recover without remounting the app.

### 9. Ask for notification permission when its value is clear

**P1 · Confirmed current trigger**

The auth listener calls `requestPermissions` after a signed-in user resolves, including passive auth events. The helper avoids repeatedly asking after denial, but the initial request is tied to authentication rather than a chosen reminder or event.

Evidence: [Auth notification request](../../mobile/App.tsx#L100), [permission helper](../../mobile/src/services/notificationService.ts#L75).

**Improve:** Offer permission after a student chooses a study reminder, follows an Arena event, or explicitly enables notifications. Explain the exact benefit first. Keep categories and preferences understandable.

**Validate:** Fresh sign-in does not unexpectedly prompt; requesting a selected reminder does. Denied permissions should have a clear settings path without repeated prompts.

### 10. Complete reduced-motion and responsive onboarding coverage

**P1 · Confirmed coverage gaps; device impact unverified**

The app has a shared reduced-motion hook, but the loading screen loops its zoom animation without using it, and stack transitions are configured directly. NavTour measures screen dimensions at module initialization and manually matches one tab-bar geometry; iOS uses a separate native tab navigator.

Evidence: [Loading animation and transitions](../../mobile/src/navigation/AppNavigator.tsx#L185), [NavTour geometry](../../mobile/src/components/NavTour.tsx#L14), [platform tab selection](../../mobile/src/navigation/TabNavigator.tsx), [motion helper](../../mobile/src/utils/motion.ts).

**Improve:** Apply motion preferences across launch and navigation, clean up persistent loops, and derive tutorial positioning from actual layout. Test platform-specific bars rather than assuming they share geometry.

**Validate:** Reduced motion enabled before launch and changed during use, iPad size changes, large text, and both tab implementations.

### 11. Give Arena a permanent mobile destination

**P1 · Recommendation grounded in navigation**

The primary tabs are Home, Courses, Exams, Trivia/Jeux, and Profile. Arena is a set of root event screens, surfaced through a conditional Home announcement. The card hides when there is neither an open event nor a registered student's active event. No dedicated mobile spectator route was found in the root navigator.

Evidence: [Root navigator](../../mobile/src/navigation/AppNavigator.tsx), [tabs](../../mobile/src/navigation/TabNavigator.tsx), [announcement selection](../../mobile/src/components/ArenaAnnounceCard.tsx#L41).

**Improve:** Establish an always-available Arena hub within the existing five-tab structure or through a validated navigation redesign. Include school identity, challenges, next real fixture, and access to results and watching when available. Keep competition discoverable between national events.

**Validate:** A new student can find school competition without waiting for an announcement. A returning player can rejoin an active event with minimal navigation.

### 12. Give Arena its own visual world within the app

**P1 · Recommendation; visual review required**

The app's shared theme includes an editorial serif display face and calm learning surfaces. Arena largely consumes these same tokens and ordinary section layouts. It already has entrance animations, counters, and an animated demo loop; it does not need to start from zero.

Evidence: [Theme](../../mobile/src/theme/theme.ts), [Arena lobby](../../mobile/src/screens/arena/ArenaLobbyScreen.tsx), [live play](../../mobile/src/screens/arena/ArenaLiveScreen.tsx).

**Improve:** Create an Arena theme with school crests, coordinated venue art, competitive typography, player cards, and occasion-specific lighting. Preserve readable educational content and the app's recognizable identity. Use the [visual and broadcast brief](./2026-10-17-arena-visual-motion-broadcast-brief.md) as direction, not as an implemented specification.

### 13. Design mobile watching as a separate experience

**P2 · Recommendation**

Provide a portrait-first spectator composition with a persistent event and score header, phase information, school following, and editorial scene changes. Treat fullscreen or landscape watching as a separate design decision; the app currently declares portrait orientation.

Include explicit live, delayed, replay, reconnecting, and provisional labels. Keep spectators' participation separate from official scoring and delay sensitive question information where necessary. Coordinate school entrances, score reveals, and champion presentation through real match events.

### 14. Make competitive results feel earned and actionable

**P2 · Recommendation**

Arena already has provisional-result handling and sharing UI. Build on that with a recognizable school result card, a concise explanation of contribution, an appropriate celebration, and the next available action.

Evidence: [ArenaResultScreen](../../mobile/src/screens/arena/ArenaResultScreen.tsx), [share components](../../mobile/src/components/share/ShareCard.tsx).

**Improve:** Separate routine completion, personal best, team qualification, and confirmed championship victory. Do not imply unavailable rematches, ratings, or earned titles. Explain how a student outside the counting five still participates.

### 15. Improve reading hierarchy, text scaling, and touch comfort

**P1 · Recommendation with confirmed small text tokens**

Theme captions are 12 pt; micro and overline text are 11 pt. Some onboarding text caps scaling. These values are not automatically defects, but they warrant scrutiny when used for rules, errors, status, or action instructions.

Evidence: [Type scale](../../mobile/src/theme/theme.ts#L146), [onboarding scaling](../../mobile/src/components/WelcomeGradeModal.tsx#L84).

**Improve:** Keep essential information comfortably readable, audit touch targets and contrast, and test large text and screen-reader order. Avoid truncating school names, mathematical expressions, or instructions that affect scoring.

### 16. Make offline capability visible and honest

**P1 · Recommendation grounded in existing caching**

Content caching, persisted query data, and exam drafts exist. Course videos use a WebView player; cached metadata does not make video playback available offline. An explicit user-managed download library was not found in the reviewed screens.

Evidence: [Data service caching](../../mobile/src/services/dataService.ts), [video playback](../../mobile/src/screens/CourseDetailScreen.tsx#L135), [exam drafts](../../mobile/src/screens/ExamTakeScreen.tsx#L431).

**Improve:** Distinguish saved metadata, locally available exercises, saved attempts, and network-required video or competition. Consider downloadable revision packs only for content whose format and rights permit it. Provide saved-at, pending-sync, and retry information where useful.

### 17. Simplify Home around the student's next meaningful action

**P2 · Recommendation**

Home already computes a next step and supports resume and review. Preserve that work. Make the visual hierarchy distinguish a primary learning action, a secondary competitive opportunity, and lower-priority discovery content.

Evidence: [Dashboard next-step computation](../../mobile/src/screens/DashboardScreen.tsx#L178).

**Improve:** Review how daily activity, course continuation, exam entry, Arena, leaderboard, and study plan compete for attention. Test first-time, returning, exam-focused, and competition-focused students rather than optimizing only one state.

### 18. Connect learning outcomes to useful practice

**P2 · Recommendation**

The app already tracks mastery and has review logic. Strengthen the explanation connecting a missed question, the underlying skill, a short practice opportunity, and later improvement.

**Improve:** Give results a specific next learning action. Distinguish actual mastery evidence from course completion and XP. Let competition motivate practice without making learning progress depend on winning matches.

**Validate:** A student can explain what to practice after an incorrect answer and later find evidence of improvement.

### 19. Unify interaction quality across learning and competition

**P2 · Recommendation**

Shared motion presets, haptics, and reduced-motion support exist. Standardize how they communicate selection, submission, loading, success, and celebration across exams, quizzes, challenges, and Arena.

Evidence: [Motion tokens](../../mobile/src/theme/motion.ts), [haptics](../../mobile/src/utils/haptics.ts).

**Improve:** Establish an interaction inventory and test repeat play. Keep reading phases calm and avoid repeated celebratory effects on routine actions. Consider user control over haptic intensity or disabling haptics; any sound layer should be opt-in and independent of essential meaning.

### 20. Establish a repeatable device quality and observability loop

**P1 · Recommendation; verification gap**

No top-level error boundary, Sentry/Crashlytics integration, or dedicated product-event instrumentation was found by targeted searches of the inspected app source. This does not prove production has no external monitoring. Existing tests could not run in this checkout.

**Improve:** Restore a reproducible test environment, verify release startup, add recoverable error containment and appropriate diagnostics, and define a small privacy-conscious event vocabulary for activation and completed flows.

Track first useful action, completed quiz, invitation acceptance, Arena registration, successful reentry, answer receipt failures, completed match, and next-day return. Avoid collecting unnecessary student content or personal information.

**Validate:** A failure can be detected, attributed to a build and flow, and reproduced. Measure cold-start time, frame pacing, input latency, and recovery on agreed baseline devices before adding expensive visuals.

## Screen-level direction

| Area | Preserve | Improve next |
| --- | --- | --- |
| Startup and authentication | Native splash handoff, font fallback, cached launch data | Decouple profile synchronization; provide bounded and recoverable startup states |
| Onboarding | Grade personalization and first useful activity | One coordinated sequence; contextual permission requests; invitation preservation |
| Home | Personalized next step, resume, review, real Arena announcements | Section-level loading and a clearer primary action |
| Courses | Real video imagery, lesson progression, mastery summaries | Playback recovery, local availability labels, text and tablet validation |
| Exams | Draft recovery, focus mode, back protection, loading/error chrome | Validate interrupted submission and offline recovery on devices |
| Trivia and duels | Daily challenge, repeatable duel questions, reward breakdown, existing motion | Consistent timer policy and a simpler connection to Arena identity |
| Arena lobby and doors | Identity checks, qualification explanation, warm-up, presence heartbeat | Persistent discovery, truthful failure states, clear entry priority, distinctive school presentation |
| Arena live | Timestamp clock, answer receipts and retry, focused play | Recovery status, accessible timing cues, device sleep/background/back behavior validation |
| Arena results | Provisional labeling and sharing | Contribution story, achievement hierarchy, available next action |
| Leaderboard and profile | Existing school and personal progress | Stable identity, seasonal context if implemented, correct account isolation |
| Sandra | Existing retry behavior and keyboard handling | Device validation of long answers, math, link destinations, and interrupted requests |
| Watching | Existing web broadcast provides a reference | A deliberate mobile spectator route and layout if mobile watching is approved |

## Recommended order

### First: reliability and student state

Address **1 and 2** first. Then cover onboarding coordination, deep links, Home dependency failures, Arena error states, and timing behavior: **3–7**. Restore runnable tests and add focused regression coverage for these risks as part of **20**.

### Next: everyday usability

Complete native query recovery, notification timing, reduced-motion coverage, readable essential text, and honest offline states: **8–10, 15, and 16**. Validate on devices before declaring these flows complete.

### Then: a compelling mobile Arena

Design **11–14** as one coherent flow: permanent hub, school identity, play, watch, results. Reuse the existing live-event rules and receipt handling. Review original artwork and motion prototypes before committing to a larger asset pipeline.

### Finally: sustained learning and engagement

Refine Home, learning follow-through, and interaction consistency: **17–19**. Measure whether students complete more useful activities and voluntarily return; do not treat animation usage or notification opt-in alone as success.

## Required device audit before a visual sign-off

- Small and large phones, an agreed baseline Android device, and a tablet.
- Both supported languages, long school names, mathematical content, and large text.
- Light and dark appearance, reduced motion, and screen-reader navigation.
- Fresh install, guest use, returning account, logout, account switch, and deletion.
- Cold and warm links into duels and Arena using release builds.
- No network, slow network, disconnect during submission, and reconnect during a live round.
- Background, phone lock, incoming call, hardware back, and swipe navigation.
- Video load failure, exam draft restoration, assistant retry, and provisional result updates.
- Long sessions to check memory, battery use, animation work, and subscriptions.

Record screenshots and short screen recordings of complete flows. Only then give screen-specific visual judgments or quantitative performance claims.

## Documentation references

- [Expo: Android App Links](https://docs.expo.dev/linking/android-app-links/): native intent filters and domain association must work alongside JavaScript routing.
- [Apple: requesting notification authorization](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications): permission requests should arrive in a context that explains their value.
- [TanStack Query: React Native integration, v4 reference](https://tanstack.com/query/v4/docs/framework/react/react-native): describes the native connectivity and app-focus integration pattern. The app uses Query v5; verify implementation details against its installed version before making changes.

## Deliverable boundary

This audit creates a planning document only. It does not change application behavior, dependencies, deployment, native configuration, or production data. Findings are recommendations for a separately authorized implementation and device validation pass.
