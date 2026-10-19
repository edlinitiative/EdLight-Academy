# P0 code validation: core student journeys

**Roadmap item:** P0, "Resolve data loss, blocked access, incorrect submissions, and broken handoffs found during validation" (`docs/design/2026-10-18-premium-product-implementation-roadmap.md`).
**Contract:** release-readiness §5 (CON-01…CON-06, CON-11, CON-15) and §10 (E2E-01…E2E-04).
**Date:** 2026-10-19. **Method:** code-level tracing on web (`src/`), API (`api/`), shared (`shared/`) and mobile (`mobile/`).

## What this document is, and what it is not

This is a **code-level** validation. No installed build was used and no device was involved. The results below therefore mean:

- **OK:** the code path handles the case correctly. Device evidence is still required.
- **Fixed:** a defect was confirmed in the code and fixed. A regression test is cited where one exists. Device evidence is still required.
- **Open:** confirmed, or likely, but not fixed in this pass. The reason is given in each row.

**Nothing here is `Verified` in the sense of `candidate.json`.** This table is the script for the real-device run. A tester follows the **Étapes testeur** column (in French) on iOS, Android and a browser, then records the observed result.

Severity order: data loss > wrong grade > blocked access > broken handoff > cosmetic.

## Defects fixed in this pass

| # | Severity | Platform | Defect (root cause) | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| F1 | Data loss / privacy | web + mobile | **Exam drafts leaked across accounts.** The device mirror was stored as `edlight-exam-draft-<examId>` with no owner. On a shared device, student B was offered student A's answers as "votre tentative", and choosing Reprendre wrote them into B's account. | The mirror now carries a `uid`. Take screens restore only the owner's mirror (`readLocalExamDraft`), and listings hide other accounts' mirrors (`isOtherAccountDraft`). | `src/utils/__tests__/examDraft.test.ts` |
| F2 | Wrong grade | web + mobile | **Stale answers from the previous attempt.** Drafts were saved with `{merge:true}`, which merges the `answers` map key by key and never deletes a key. A cleared answer came back on resume. A second attempt at an exam inherited the first attempt's answers and graded them as the student's. Results were also merged, so a retake kept the old `preGradedResults`, and the web regrades from those when results are read on another device. | Draft writes use `mergeFields` (each map sent replaces the stored one). Results are fully replaced. | `src/services/__tests__/examAttemptWrites.test.ts` |
| F3 | Data loss | mobile | **Offline submit could lose the finished exam.** Submit deleted the local mirror first, then awaited two Firestore writes. Offline, those writes never settle, so the spinner ran forever, and RN Firestore keeps its cache in memory only, so killing the app lost the paper. The attempt was also marked `submitted` before the result was written, so a failure between the two writes left a submitted attempt with no result. | Result and `submitted` mark are written in one batch (`commitExamSubmission`), with a bounded wait (`settleWithin`, 12 s). The mirror is removed only after the server acknowledges. Otherwise the student gets an honest "Pas encore envoyé" message and can retry. | `examAttemptWrites.test.ts`, `examDraft.test.ts` |
| F4 | Blocked access / misleading status | web | **Offline submit never reached the results page.** `await saveExamResult` never resolved offline, so the student never saw the results. A rejected write was swallowed, but the page still read as saved. | Atomic batch plus an 8 s bounded wait, then navigation. The results page states whether the result is "Pas encore enregistré" (pending) or "pas pu être enregistré" (failed). The mirror is kept until the server acknowledges. The study-plan write no longer blocks navigation. | as above |
| F5 | Wrong grade (duplicate) | web + mobile | **Double submission.** The timer's auto-submit at 0:00 and a tap on Remettre, or a double tap, ran the grading twice, including two rounds of AI essay calls. | Re-entrancy guard on submit. | covered by the guard; device check E-6 |
| F6 | Broken handoff | web ↔ mobile | **Resume position lost across devices.** The web saves `currentQ` and mobile saves `currentIdx`, so a paper resumed on the other platform opened at question 1. | Both fields are written, and `draftPosition` reads either. Mobile drafts also clear the web's immediate-mode grades. | `examDraft.test.ts` |
| F7 | Data loss | web + mobile | **Gamification profile wiped by a failed read.** When the profile read failed (offline, or a token or permission error), defaults were returned and then written over the real profile: `xp`, `totalGames`, `leaderboard.displayName` and `school`. | Write paths use a read that throws and skip the write. Display paths still fall back to defaults. | `mobile/src/services/__tests__/triviaReadFailure.test.ts` |
| F8 | Data loss | web | **Profile overwritten at sign-in.** A failed profile read was taken to mean "document missing", and the non-merge create reset `track`, `onboarding_completed`, `grade` and `school`. | The document is created only for a new account or a confirmed absence (`shouldCreateUserDoc`, `getUserProfileResult`). | `src/services/__tests__/userDocWriteDecision.test.ts` |
| F9 | Blocked access | web | **Offline PWA launch spun forever on "/".** Session restore awaited the `last_seen` write, which never acknowledges offline, so `setUser` and `setAuthConfirmed` never ran. | The write is no longer awaited (`src/index.tsx`). | device check A-4 |
| F10 | Wrong content / privacy | web | **Logout kept the previous student's state.** The class (`grade`, `gradeChosen`) survived logout, so the next student skipped the class step and got the wrong level. The Sandra conversation id also survived, so every message returned 403. | Logout clears all three. The class is now mirrored to `users/{uid}.grade` (the same field as mobile), restored at sign-in and backfilled. | `src/contexts/__tests__/logoutIsolation.test.ts` |
| F11 | Blocked access | web + mobile | **Mo Kaché daily grid was per device.** On a shared phone, one student's finished grid locked a sibling out of the daily word. | The key is per account (`edlight_mokache_<uid>_<date>`). | `src/components/games/__tests__/moKacheKey.test.ts` |
| F12 | Data loss (regression) | mobile | **Mastery could regress.** The debounced push wrote the whole local map with a field-level merge, so a phone that last synced days ago wrote `bestPct: 40` over the 100 earned on the web. `mergeRemoteProgress` also replaced the store, dropping a score recorded during the sign-in read. | The push joins the server copy first. On a failed read it pushes only the lessons that changed. Store merges are joins, not replacements. | `mobile/src/services/__tests__/masterySyncPush.test.ts` |
| F13 | Data loss | mobile | **Last result lost at sign-out.** Signing out within the 4 s debounce dropped the last exercise result. | `logoutUser` flushes the pending push first (`flushMasterySync`, bounded at 2.5 s). | `masterySyncPush.test.ts` |
| F14 | Blocked access | mobile | **Sign-out impossible offline.** `logoutUser` awaited `unregisterPushToken`, whose `updateDoc` never settles offline. | Bounded to 3 s. | device check A-6 |
| F15 | Broken handoff | mobile | **Cold-start links dropped.** A duel invite (`/defi/CODE`) or an Arène link that launched the app landed on Home, because the post-auth replay covered only competition screens. | Any resolved target is replayed (`shouldReplayInitialTarget`). | `mobile/src/navigation/__tests__/initialLink.test.ts` |
| F16 | Broken handoff | mobile | **Duel-result push opened the wrong place.** Tapping it opened the Jeux tab instead of the duel. | It opens `Defi` with `data.code`. | device check D-5 |
| F17 | Wrong result / lost submission | mobile | **Duel screen mishandled who was looking, and lost responses.** The challenger could "relever" their own duel (rejected by the server, shown as a network error). A third person saw the opponent's score as "Toi". An `already_played` reply after a lost response showed as a failure, with no resend. | `duelViewerRole` gates the card. `recoveredAcceptOutcome` recovers the recorded result (web parity). A resend is offered and server errors get real copy. The cached duel is refreshed. | `mobile/src/utils/__tests__/duelViewer.test.ts` |
| F18 | Wrong grade | web | **Quiz keys read as a letter or number before text.** The text key "1" among ["0","1",…] graded "0" as correct; the d-orbital key "d" was read as option D; an out-of-range key produced an MCQ nobody could get right; array `options` broke parsing. Flashcards showed `options[0]` as the answer. | A shared resolver, `shared/quizKey.ts` (the app's rule: text, then letter, then number, bounds-checked). Ungradable flashcards are dropped. | `src/services/__tests__/quizBankAnswerKey.test.ts` |
| F19 | Blocked access | web | **Lesson completion unreachable.** "Terminer la leçon" never appeared and video progress was never tracked, because `enrollInCourse` has no caller. `confirmLessonComplete` threw `no-progress-document`. | Signed-in students count as enrolled, and completion creates the progress document with a merge. | `src/services/__tests__/confirmLessonCompleteWeb.test.ts` |
| F20 | Wrong lesson / account | web | **UnitQuiz wrote to the wrong lesson or account.** The quiz instance survived a jump to another unit, so the chapter test promoted unit 2's lessons using unit 1's answers. The completion effect re-fired after an account switch and wrote the score into the next student's progress. The first quiz in a course did not complete its lesson (a race with document creation). Mastery counted correct answers found after retries. | Remount per unit and lesson, one completion write per run, completion chained after the attempt write, mastery percentage from first tries. | CourseDetail suites; device check L-6 |
| F21 | Blocked access | web + mobile | **Sandra stuck.** Requests had no ceiling, so the panel stayed "sending" and ignored later messages. On the web, a foreign conversation id caused permanent 403s. | Abort after 90 s; the prompt is kept for retry. On the web, a refused conversation id is dropped and the message is sent once more. | `src/services/__tests__/authedFetchTimeout.test.ts` |

## Journey × interruption matrix

Platform column: W = web/PWA, M = mobile app. Each row's **Étapes testeur** column is the device script.

### J1: Sign-up / sign-in → onboarding → Home (E2E-01, CON-01, CON-15)

| ID | Interruption case | Pl. | Result | Notes | Étapes testeur (FR) |
| --- | --- | --- | --- | --- | --- |
| A-1 | Sign-in (Google, e-mail) from a protected page | W | OK | Auth is a modal and the page does not change. `/defi/:code` refetches after login. | Ouvrir `/exams/terminale/<id>` déconnecté → « Se connecter » → Google. Vérifier qu'on reste sur la même page d'examen. |
| A-2 | Signed-out visit to `/dashboard` | W | **Open** | `Courses.tsx` redirects to "/" without remembering the destination. Minor (H2). | Ouvrir `/dashboard` déconnecté, se connecter : noter la page d'arrivée. |
| A-3 | Flaky network at sign-in | W | **Fixed** (F8) | — | Activer « Slow 3G » puis se connecter avec un compte qui a déjà classe et filière. Vérifier que classe, filière et école sont conservées. |
| A-4 | PWA opened offline while signed in | W | **Fixed** (F9) | — | PWA installée, mode avion, ouvrir : l'accueil s'affiche (pas de rond qui tourne sans fin). |
| A-5 | App killed mid-onboarding (language/class/tour) | M | OK | `languageChosen`, `gradeChosen` and `tourCompleted` are persisted; the `hydrated` gate opens. | Pendant la visite guidée, fermer l'app de force, rouvrir : reprise à l'étape suivante, pas de retour au choix de langue. |
| A-6 | Sign-out offline | M | **Fixed** (F14) | — | Mode avion → Profil → Se déconnecter : déconnexion en moins de 5 s. |
| A-7 | Account switch A → B on the same device | W+M | **Fixed** (F1, F10, F11) / OK (mobile store) | Mobile `clearStudentSession` was already correct. | A commence un examen et répond à 3 questions, joue Mo Kaché, discute avec Sandra, puis se déconnecte. B se connecte : aucune réponse de A, la classe est redemandée (web), Sandra répond, Mo Kaché est jouable. |
| A-8 | Returning on a new browser | W | **Fixed** (F10) | The class is restored from the account. | Choisir NS4 sur le web, se déconnecter, se reconnecter : NS4 sans redemande. |
| A-9 | Previous account's reminders after a switch | M | OK (by code) | The push token is removed at logout (now bounded). Needs device proof (CON-15). | A active les rappels, se déconnecte ; B se connecte : aucun rappel de A le lendemain. |

### J2: Lesson video → quiz → mastery → chapter test (E2E-02, CON-02, CON-03, CON-06)

| ID | Interruption case | Pl. | Result | Notes | Étapes testeur (FR) |
| --- | --- | --- | --- | --- | --- |
| L-1 | Complete a lesson (new account) | W | **Fixed** (F19) | — | Nouveau compte → un cours → leçon vidéo : le bouton « Terminer la leçon » apparaît ; après tap, l'état « Terminé » apparaît seulement après confirmation. |
| L-2 | Complete offline, then reconnect | W | OK | Persistent cache plus server-ack confirmation. | Mode avion → Terminer : état « en attente » ; réseau rétabli : « Terminé ». |
| L-3 | Complete offline, then app killed | M | **Open** | The memory-only cache drops the queued write. Local `completed` is applied only after the server acknowledges (the deliberate LJ-05 design). Needs a persisted outbox. | Mode avion → Terminer → tuer l'app → réseau → rouvrir : noter si la leçon est terminée. |
| L-4 | Quiz key correctness | W | **Fixed** (F18) | Mobile was already correct. | Quiz Chimie (orbitales s/p/d/f) : la bonne réponse « d » est acceptée. |
| L-5 | Mastery written from both devices | M | **Fixed** (F12) | One shared document (`users/{uid}/mastery/lessons`) on both platforms, verified. | Web : 100 % sur une leçon. Téléphone resté ouvert depuis la veille : faire une autre leçon. Web : la première leçon reste à 100 %. |
| L-6 | Jump between units mid-quiz | W | **Fixed** (F20) | — | Leçon-quiz du chapitre 1, puis (barre latérale) leçon-quiz du chapitre 2 : les questions changent ; le test de chapitre ne promeut que les leçons du chapitre testé. |
| L-7 | Sign-out within 4 s of finishing practice | M | **Fixed** (F13) | — | Finir une pratique, se déconnecter tout de suite, se reconnecter : le niveau obtenu est conservé. |
| L-8 | Chapter test interrupted (background/kill) | M | **Open** | Answers live in component state only (no autosave). A short test, so a restart is acceptable; recorded as an exception. | Commencer un test de chapitre, tuer l'app : le test recommence à zéro (attendu). |
| L-9 | Web mastery write when the record read fails | W | **Open** | `recordLessonExercise` returns null and drops the score. A blind write is unsafe because a field merge can lower `bestPct`. Needs a transaction. | — |
| L-10 | Concurrent web/phone write to the same lesson | W | **Open** | The read-modify-write is not transactional (S3). A rare race. | — |

### J3: Exam start → answer → leave → resume → submit → results → history (E2E-03, CON-05)

| ID | Interruption case | Pl. | Result | Notes | Étapes testeur (FR) |
| --- | --- | --- | --- | --- | --- |
| E-1 | Answer types: MCQ, multi-blank fill_blank, scaffold, condition builder | W+M | OK | Shapes are covered by the `shared/question` audits (memory: question engine). Grading was not changed in this pass. | Bac Maths : remplir une question à 2 blancs, une « scaffold », une à conditions ; soumettre ; vérifier la correction ligne à ligne. |
| E-2 | Tab closed / app killed mid-exam | W+M | OK | A synchronous local mirror plus a flush on visibilitychange, pagehide and AppState. | Répondre à 4 questions, fermer l'onglet ou tuer l'app, rouvrir l'examen : « Reprendre » à la bonne question avec les 4 réponses. |
| E-3 | Answer cleared, then resume | W+M | **Fixed** (F2) | — | Répondre à Q2, puis l'effacer ; quitter ; reprendre sur l'autre appareil : Q2 est vide. |
| E-4 | Retake after a submitted attempt | W+M | **Fixed** (F2) | — | Soumettre un examen ; le recommencer et ne répondre qu'à Q1 ; quitter puis reprendre : seules les réponses de la nouvelle tentative existent. |
| E-5 | Cross-device resume (web ↔ app) | W+M | **Fixed** (F6) | — | Commencer sur le web jusqu'à Q5, reprendre sur le téléphone : ouverture à Q5. |
| E-6 | Timer reaches 0 while the confirmation dialog is open | W | **Fixed** (F5) | — | Examen chronométré, laisser le temps finir avec la fenêtre « Remettre ? » ouverte : un seul résultat dans l'historique. |
| E-7 | Submit offline | W | **Fixed** (F4) | — | Mode avion → Remettre : la correction s'affiche avec « Pas encore enregistré… » ; réseau : l'historique montre le résultat. |
| E-8 | Submit offline, then app killed | M | **Fixed** (F3) | — | Mode avion → Soumettre : message « Pas encore envoyé » ; tuer l'app ; réseau ; rouvrir l'examen : « Reprendre » avec toutes les réponses ; soumettre : un seul résultat. |
| E-9 | Shared device, two accounts, same exam | W+M | **Fixed** (F1) | — | (see A-7) |
| E-10 | Timer while the app is closed | W+M | **Open (product decision)** | The remaining time is saved and restored, so the timer pauses while away. Practice exams, not official ones. Document it or make it wall-clock; the decision belongs to the owner. | Examen chronométré, fermer 5 min, rouvrir : noter si le temps a continué. |
| E-11 | Essay AI grading unavailable at submit | W+M | **Fixed** | A failed grader call is `ungraded` (left out of the percentage, never 0), shown as "Correction provisoire", with "Corriger maintenant" on both platforms (transactional, idempotent, no XP/mastery side effects). Mobile now calls `/api/grade-essay` after submit. `src/utils/__tests__/essayRegrade.test.ts`, `mobile/src/services/__tests__/essayGrading.test.ts`. | Couper le réseau pendant « Correction… » d'une dissertation : le message « Correction provisoire » s'affiche. |
| E-12 | Results/history after reload on another device | W+M | OK | The stored summary is preferred over a regrade. Stale data removed by F2. | Ouvrir `/exams/resultats` sur un autre appareil : même score. |
| E-13 | Exam finished on mobile advances the study plan | M | **Open** | Mobile has no `recordTaskResult` (D12). The plan never advances from the app. | — |

### J4: Daily challenge / trivia / duels (E2E-04, CON-07)

| ID | Interruption case | Pl. | Result | Notes | Étapes testeur (FR) |
| --- | --- | --- | --- | --- | --- |
| D-1 | Daily challenge replayed | W+M | OK | The +50 XP is deduplicated per user per day in `xpBreakdown`. | Faire le défi du jour deux fois : bonus une seule fois. |
| D-2 | Round finished offline or with a token error | W+M | **Fixed** (F7) | — | Mode avion, finir une partie Trivia, réseau : XP, pseudo et école intacts (pas remis à zéro). |
| D-3 | Leaderboard award POST fails | W+M | **Open** | No outbox or retry, so board XP drifts from profile XP. Needs a persisted outbox plus server dedup on `eventId`. | — |
| D-4 | Duel link opened signed out on another device | W | OK | `/defi/:code` keeps the code through the auth modal. | Créer un défi sur le téléphone, ouvrir le lien sur un ordinateur déconnecté, se connecter, jouer : le résultat apparaît chez les deux. |
| D-5 | Duel link that cold-starts the app; duel-result push | M | **Fixed** (F15, F16) | — | App fermée de force, toucher le lien WhatsApp `…/defi/XXXX` : l'écran du défi s'ouvre. Toucher la notification « ton ami a joué » : le défi s'ouvre. |
| D-6 | Challenger opens their own link; a third person opens a played duel | M | **Fixed** (F17) | The web was correct. | Ouvrir son propre lien : pas de bouton « Relever », message « C'est ton défi ». Un 3ᵉ compte : « déjà relevé ». |
| D-7 | Response lost after the score was recorded | M | **Fixed** (F17) | — | Couper le réseau juste après la dernière réponse, réessayer : le résultat enregistré s'affiche (pas « erreur »). |
| D-8 | Score trusted from the client | API | **Open (trust)** | `api/challenges/accept.ts` and `create.ts` accept a client score. Server grading from the answer indexes is needed. | — |
| D-9 | Different question banks across OTA and web | W+M | **Open (likely)** | No bank-version stamp on challenges. | — |

### J5: Sandra (CON-04)

| ID | Interruption case | Pl. | Result | Notes | Étapes testeur (FR) |
| --- | --- | --- | --- | --- | --- |
| S-1 | Message in flight while backgrounded or on a dead network | W+M | **Fixed** (F21) | Aborted after 90 s, and the text is kept for retry. | Envoyer un message puis couper le réseau : au plus 90 s plus tard, « Réessayer » apparaît avec le texte conservé. |
| S-2 | Retry after the reply was saved but the response lost | API | **Open** | No `clientMessageId`, so a retry duplicates the exchange (and on the first message, creates an orphan conversation). | — |
| S-3 | Account switch in the same tab | W | **Fixed** (F10, F21) | Mobile was already OK. | (see A-7) |
| S-4 | Token expiry mid-request | W+M | OK | `getIdToken()` refreshes before every call. | — |
| S-5 | Transcript after the mobile screen closes | M | **Open (cosmetic)** | The conversation id is kept but the transcript isn't restored. | — |

### J6: Study plan (CON-06)

| ID | Case | Pl. | Result | Notes |
| --- | --- | --- | --- | --- |
| P-1 | Exam task completed on the web | W | OK | `recordTaskResult` after submit (no longer blocks navigation). |
| P-2 | Practice or video tasks completed | W+M | **Open** | No code path marks them done (`useStudyPlan.recordResult` has no caller). This is a feature gap, not a regression. |
| P-3 | Exam task completed on mobile | M | **Open** | See E-13. |
| P-4 | Two devices update the plan | W | **Open** | `recordTaskResult` rewrites the whole `tasks` array (last write wins). Needs a transaction. |

### J7: Offline (E2E-01, E2E-02)

| ID | Case | Pl. | Result | Notes |
| --- | --- | --- | --- | --- |
| O-1 | Cold start offline | W | **Fixed** (F9) | The SW navigation races a 2.5 s timeout against the cached shell (memory: SW guards, unchanged). |
| O-2 | Queued writes survive a tab close | W | OK | `persistentLocalCache` with the multi-tab manager. |
| O-3 | Queued writes survive an app kill | M | **Open (platform)** | RN Firestore uses a memory cache only. Mitigated where it matters most: the exam mirror is kept until the server acknowledges (F3), and mastery lives in the persisted store and is re-pushed at the next sync. Lesson completion (L-3) and the XP award (D-3) remain. |
| O-4 | Every awaited write on a user path is bounded | W+M | **Fixed where found** | Exam submit, session restore, logout and Sandra. Grep `settleWithin` and `withTimeout` when adding new awaited writes. |

## Open items, by severity

1. **L-3 / O-3 (data loss, mobile):** lesson completion queued offline is lost if the app is killed. Fix: a persisted completion outbox replayed at launch. Applying `completed` locally before acknowledgement would contradict the LJ-05 design, so the owner must decide.
2. **D-3 (data loss, both platforms):** leaderboard XP award with no retry. Fix: a persisted outbox plus a server dedup key.
3. ~~**E-11 (wrong grade, web):** essays that failed AI grading are scored 0.~~ Fixed: an `ungraded` status excluded from the percentage, plus "Corriger maintenant" on web and mobile (and mobile essays are now AI-graded at all). Device check: submit a dissertation offline on the phone, reconnect, tap "Korije kounye a".
4. **D-8 (trust):** client-reported duel score. Fix: server-side grading.
5. **S-2:** Sandra retry idempotency (`clientMessageId`).
6. **L-9 / L-10 / P-4:** non-transactional read-modify-writes (web mastery, study plan).
7. **E-13 / P-2 / P-3:** study-plan propagation is missing for practice and video tasks, and for exams finished on mobile.
8. **E-10:** exam timer pauses while away; product decision.
9. **A-2:** `/dashboard` return destination; **S-5:** mobile Sandra transcript.

## How this was produced

- Three parallel read-only audits (auth/onboarding/offline, learning/mastery/study plan, trivia/duels/Sandra) plus a direct trace of the exam journey on both platforms.
- Each fix began with a failing test where the logic could be isolated: F1–F3, F6–F8, F10, F12, F13, F15, F17–F19, F21. The UI-wiring fixes (F4, F5, F9, F14, F16, F20) are covered by the device steps above.
- Commits are on this branch (see `git log`). Firestore rules were not changed: `examAttempts` and `examResults` are owner read/write, so batch and `mergeFields` writes are allowed.
