# Product requirements — premium EdLight Academy website

Date: October 16, 2026  
Version: 1.0 proposed  
Product owner: EdLight Academy owner; named delivery/design/engineering owners to be assigned  
Companion: [Design specification](DESIGN-SPEC.md)

## 1. Product intent

Make EdLight Academy a website students actively want to return to: an inviting place to understand a lesson, practice with confidence, prepare for an official exam, and compete for their school.

“Premium” means coherent art direction, clear decisions, readable content, reliable state, and thoughtful feedback from entry to completion. It applies equally to an empty inbox, a failed save, a wrong answer, and a championship result. The platform remains accessible and free under the current product model; premium does not mean adding a paywall.

The redesign must make these four promises credible:

1. **I know what to do next.** Starting or continuing useful work is easier than navigating an inventory of features.
2. **My learning is treated seriously.** Videos, equations, questions, corrections, and progress look carefully prepared.
3. **I can trust the website.** It distinguishes what is saved, received, provisional, unavailable, or final.
4. **Competition feels worth joining.** Games have a recognizable world and responsive feedback without obstructing play.

## 2. Problems and evidence

| Finding | Evidence | Product consequence |
|---|---|---|
| Repeated rounded panels and small metadata flatten hierarchy | Inspected quiz and exam screens | Students must parse controls instead of immediately seeing the next action |
| Quiz setup duplicates mode/start choices across main panel, sidebar, and chapter rows | Existing build; `src/pages/Quizzes.tsx` | Unnecessary decisions and competing CTAs |
| Temporary empty exercise messaging precedes populated content | Observed during quiz loading | Available content briefly appears missing |
| Video preview prominently shows a drawing-tool palette | First inspected mathematics course/lesson | Course quality feels less curated before playback |
| Resume capabilities vary by video provider/embed path | `CourseDetail.tsx`, `YouTubePlayer.tsx` | Continuity promise must match actual capability |
| Stray mathematical delimiters appear in a live paper | First inspected math question | Exam credibility and comprehension suffer |
| Similar exam titles are difficult to distinguish | Existing exam catalog | Choosing the correct paper is harder than necessary |
| Arena entry spends much of the viewport on an empty city; game selection sits below | Existing build | New visitors see absence before play |
| Arena and trivia presentation differ | Existing build; newer source attempts unified night theme | Competitive identity is interrupted across routes |
| Notification creation/read/reminder behavior is incomplete | `NotificationCenter.tsx`, notification services | Generic messages, disappearing read items, and scheduling without choice |
| Multiple global and page styling layers coexist | `index.tsx`, `index.css`, page CSS, `pf.css` | Local redesigns drift and regress across screens |

Useful foundations already exist: focus modes, course progression, exam drafts, missed-question review, bilingual content, actual school standings, and multiple game modes. The redesign should compose these more effectively rather than recreate their underlying logic indiscriminately.

## 3. Audience and jobs

| Audience | Main job | Needs |
|---|---|---|
| New visitor | Determine whether EdLight fits their class and start something useful | Clear program coverage, guest entry, credible examples, understandable language choice |
| Returning student | Resume unfinished learning | Accurate continuation, remembered class/subject, minimal setup |
| Student preparing for national exams | Select, complete, and review the right paper | Distinct paper identity, dependable timer/save, clear grading limits |
| Casual player | Start an enjoyable short game | Immediate play, understandable rules, easy replay |
| Competitive student | Represent a school, join a room/event, understand results | Eligibility, clear registration, receipt states, actual standings |
| Student using limited data or unstable internet | Make progress without losing work | Lightweight pages, explicit offline state, recovery, optional media |

School organizers and spectators are secondary audiences. Tournament creation/join and spectator continuity are included; a new educator dashboard or broadcast redesign is not.

## 4. Scope

### Included

- Shared website navigation, account entry, language/theme behavior, search presentation, and focused task shells.
- Public landing and signed-in home hierarchy needed to connect the core journeys.
- Course catalog, course overview, video lesson workspace, completion and next activity.
- Practice selection, free practice, finite quiz, feedback, results, and missed-question review.
- Exam discovery, overview, preview, taking, submission, results, and attempt history.
- Arena lobby, story progression, trivia, supported mini-games, duels, private rooms, championship registration/play/results, and leaderboard presentation.
- Website inbox, reminders, preferences, push/email message presentation and copy associated with these journeys.
- Loading, empty, error, offline, reconnecting, permission, restricted, provisional, and success states.
- Responsive browser behavior and accessibility.

### Excluded

- Native iOS/Android UI changes, native navigation, or a mobile app redesign.
- New payment/subscription system, replacement LMS, new AI tutor, or new game engine.
- Changing exam scoring, mastery, XP economics, ranking formulas, prize eligibility, or competition enforcement as a styling task.
- Replacing the whole video library. Existing content receives an inventory and prioritized remediation; new recording is separately estimated.
- Rebuilding the admin console or spectator broadcast. Existing links and functional compatibility remain required.
- Publishing, deployment, production data migration, or sending notifications as part of this documentation task.

Phone-browser layouts remain in scope: a website must work responsively even though the native application is excluded.

## 5. Outcomes and success criteria

No baseline has been measured. Targets below are proposed release criteria, not existing performance claims.

| Outcome | Proposed target | Measurement |
|---|---|---|
| Clear first action | At least 80% of representative participants start the assigned lesson, quiz, or game without moderator assistance | Moderated task study; at least 8 participants across class/language/device needs; directional, not statistically conclusive |
| Faster entry | Median quiz/game time to first question improves at least 25% against the same baseline task | Same account state and device/network profile before/after; exclude deliberate rule reading |
| Reliable continuity | All scripted draft/resume/reconnect acceptance scenarios pass | Scenario suite with guest and account states |
| Trustworthy assessment | Zero known blocking content-rendering defects in the release fixture set; every unsupported scoring state labeled | Content review plus automated/rendered fixtures |
| Consistent quality | Every P0 screen meets visual, state, bilingual, keyboard, and responsive gates | Design and QA sign-off matrix |
| Better learning follow-through | Improve lesson-to-relevant-practice and result-to-review conversion relative to baseline | Event funnels; report guest/account separately; no arbitrary uplift promise before baseline |
| Useful notifications | Improve relevant destination opens without increasing unsubscribe/disable rate | Delivery/open/action cohorts, where measurable; retain a holdout if feasible |

Proposed performance budgets: p75 LCP ≤2.5 seconds, INP ≤200 ms, CLS ≤0.1 on supported pages where sufficient field data exists. Also test a cold-cache midrange device on constrained networking. Third-party video startup is reported separately. These are targets, not guarantees about the current site.

## 6. Information architecture

Retain five primary destinations: **Accueil, Apprendre, Pratiquer, Examens, Arène**. Translate navigation consistently into Kreyòl. Notifications, search, account, language, and theme are utilities, not additional primary destinations.

| Destination | Primary intent | Existing routes to preserve |
|---|---|---|
| Home | Start or continue the next useful activity | `/` |
| Learn | Find a course and follow lessons | `/courses`, `/courses/:courseId`, `/dashboard` |
| Practice | Practice a skill or take a short quiz | `/practice`, `/quizzes`, `/revision` |
| Exams | Complete and review official papers | `/exams`, `/exams/:level`, subject/overview/take/results paths, `/exams/resultats` |
| Arena | Enter games and school competition | `/arena`, `/arena/histoire`, `/jeux`, `/jeux/:gameId`, `/tournois/*`, `/defi/:code`, `/classement` |
| Championship | Register, prepare, play, and see authoritative results | `/arena/championnat`, `/arena/jouer`, `/arena/jouer/:tid` |
| Supporting | Identity, study plan, printed progress, help | `/profile`, `/study-plan`, `/releve`, existing help/legal routes |

Preserve `/trivia` and other existing redirects and invitation links. Route preservation does not require preserving duplicated interface elements. Current `/dashboard` behavior is retained until a separately reviewed route change is necessary.

## 7. Experience principles

- One dominant next action per state; secondary actions remain discoverable.
- Prefer one meaningful surface over nested boxes around every label.
- Keep learning calm, assessment authoritative, and competition expressive. Share typography, controls, and state meanings.
- Tell students what matters now. Place detailed policies in accessible secondary content unless needed for a decision.
- Never equate XP, lesson completion, quiz accuracy, paper score, and exam readiness.
- Distinguish no data from zero performance, and loading from empty.
- Respect French and Haitian Creole as complete experiences. Never silently substitute English.
- Use genuine Haitian school/geographic identity; never fabricate attendance, crests, testimonials, or competition activity.
- Maintain student control over notifications, reminders, sound, and motion.

## 8. Core journeys

### J1. Learn and practice

Home/catalog → relevant course overview → start/resume lesson → watch/read → completion → relevant practice → explanation → continue course or review.

On return, restore the known lesson and any supported playback position. If exact playback position cannot be restored, communicate that briefly without claiming otherwise. A guest who signs in returns to the original activity rather than a generic home screen.

### J2. Short quiz

Practice → choose subject/unit with remembered or explicit defaults → choose practice or finite quiz once → start → answer/check → feedback → next → result → review mistakes or return to the same unit.

Setup exposes only valid choices. The session shows one consistent score meaning. Exiting a session uses the persistence policy actually implemented; no implied recovery promise.

### J3. Official exam

Exam catalog → distinct paper overview → review timing/grading/save terms → preview or explicitly begin → answer/navigate → review unanswered items → confirm submission → submitting → confirmed result → explanations and relevant revision.

Opening a catalog card or preview never silently starts a new clock. Resuming an active exam does not reset its timer. Network uncertainty never masquerades as submission success.

### J4. Play and compete

Arena → quick play/story/duel/room/championship → concise mode rules → play → receipt/feedback appropriate to mode → result → replay, next stage, or board.

School membership is contextual. Casual play is not blocked solely to collect school information. Protected competition follows actual eligibility and browser-play policy.

### J5. Act on a notification

Inbox/push/email → concise relevant message → exact activity or truthful fallback → complete action → read state remains available in inbox. Reminder → choose schedule/timezone/channel → save confirmation → edit/pause/delete.

## 9. Functional requirements

Priority: **P0** required for the core redesign release; **P1** next increment; **P2** optional enhancement. The same ID is used for design and QA tracking.

### 9.1 Shared shell and entry

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| WEB-01 | P0 | Use consistent navigation and active states across canonical/legacy routes. A lesson, practice session, exam, and competitive round each have a task-specific header and obvious exit. Global promos, assistant launchers, milestone modals, and notification prompts cannot obstruct an active task. |
| WEB-02 | P0 | Guest entry remains available wherever currently allowed. Required authentication states explain the benefit/restriction and preserve destination/context through sign-in. Never discard answers merely because auth opens or expires. |
| WEB-03 | P0 | Language switch preserves route and session state; FR/HT cover controls, validation, notification copy, dates, and critical errors. Educational content language is labeled separately when no translation exists. |
| WEB-04 | P0 | Remember valid class/subject preferences without silently changing the scope of a deep link. Unsupported class/content combinations show available alternatives, never invented coverage. |
| WEB-05 | P0 | Public home explains coverage and offers guest start; signed-in home leads with the highest-confidence continuation/review action. No more than one primary action in its first content region. Progress and school competition remain secondary. |
| WEB-06 | P0 | Loading reserves layout; skeletons never display a definitive empty/error state. Network errors offer safe retry. All actionable controls have pending, disabled, success, and failure behavior where applicable. |
| WEB-07 | P1 | Search uses the shared visual language, groups actual courses/papers/activities, and preserves contextual destinations. No-results suggests valid categories; loading and failure are distinct. |

### 9.2 Courses and video workspace

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| LEARN-01 | P0 | Course catalog makes class/subject coverage and availability clear. Course overview shows title, useful learning outcomes, actual lesson/module counts, content language, and start/resume. Duration is shown only from credible metadata and labeled approximate if estimated. |
| LEARN-02 | P0 | Lesson workspace puts lesson identity, player, current outline position, and next action in a coherent desktop composition. Outline can collapse, remains keyboard accessible, and never obscures player controls. Current/complete/locked states are distinct. |
| LEARN-03 | P0 | Player supports only provider-supported controls. Playback/loading/error state is visible; blocked media has retry/open-source or text/practice alternatives when available. Do not offer unavailable speed, captions, download, or exact resume controls. |
| LEARN-04 | P0 | Restore last lesson using existing authoritative progress; restore playback position where supported. Clearly distinguish local-browser playback history from account-synced progress. Switching devices cannot produce a false claim that playback is synced. |
| LEARN-05 | P0 | Completion follows existing learning rules. Watching is not labeled mastery. Completion provides one next lesson/practice action and optional return to outline. Reopening the completed lesson does not duplicate rewards. |
| LEARN-06 | P0 | Audit covers/posters and opening frames for P0 courses. No selected hero/thumbnail should prominently feature accidental menus/tool palettes when a clean valid frame is available. Missing art uses a designed subject cover; it does not imply the lesson itself was rerecorded. |
| LEARN-07 | P1 | Resources and lesson summary render only when authored/available; structured tabs or disclosures have URL/session continuity. Transcripts/captions require a content workflow and QA before being promised. Student notes are deferred to P2 pending persistence/privacy design. |

### 9.3 Practice and quiz

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| QUIZ-01 | P0 | One setup surface chooses subject, class, unit, and mode. Chapter-row actions may deep-link/start their own unit but must not duplicate a second independent session configurator. Selected scope and actual deck size are shown before start. |
| QUIZ-02 | P0 | Free practice and finite quiz are explicitly distinguished. Explain retry/hint policy, timing, and what is saved before the session. Keep current attempt/scoring rules until decision D-03 is resolved. |
| QUIZ-03 | P0 | Session presents one question, readable answers, one attempt indicator, progress where finite, and one primary Check/Continue action. Blank submission is prevented with an accessible explanation. A known-wrong answer is not automatically resubmitted as a new attempt. |
| QUIZ-04 | P0 | Feedback identifies correct/incorrect with text and icon, gives useful authored explanation/hints where available, and does not auto-advance before the student can read it. Screen readers receive concise state updates. |
| QUIZ-05 | P0 | Finite quiz results use the actual scoring definition. Retry-assisted success and first-attempt success are not conflated. Show questions attempted, explained score, mistake review, and one relevant next action. Never call a quiz score an official grade or mastery. |
| QUIZ-06 | P0 | Existing signed-in missed-question review persists through its current model. Guest result and account-save limitations are explicit. Quiz refresh/recovery follows the declared policy in D-04; no silent empty restart. |
| QUIZ-07 | P1 | Personalized recommendation uses real review data and names the basis, e.g. questions still due from exercises. When evidence is absent, offer a neutral starting unit rather than a fabricated diagnosis. |

### 9.4 Exams

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| EXAM-01 | P0 | Each catalog item has a distinguishable identity: subject, year/session, level/track and version where supplied. Preserve real source IDs. Potential duplicates are reviewed; never delete/merge based on similar titles alone. Filters persist on return. |
| EXAM-02 | P0 | Overview explains actual duration, points, sections, question count, correction limits, and save/resume state. One explicit Begin action starts a new timed attempt; preview does not. Existing draft takes priority over accidental restart. |
| EXAM-03 | P0 | Exam session keeps timer, question context, answer status, navigation, and submit accessible without excessive chrome. Question and answer are never truncated. Question navigator distinguishes current, answered, unanswered, and flagged if flagging is supported. |
| EXAM-04 | P0 | Save status distinguishes device-only, saving, account-saved, offline/pending, and failed. Account-saved requires confirmed persistence. Failed saves preserve entered data and offer retry; concurrent-device conflicts cannot silently overwrite newer answers. Conflict handling is a dependency, not assumed existing functionality. |
| EXAM-05 | P0 | Countdown derives from the current exam timing contract; refresh, navigation, reconnection, and resume must not reset or extend an attempt. Untimed papers say untimed. Expiry/submission behavior is explicit and idempotent. No new pause promise without D-05 approval. |
| EXAM-06 | P0 | Submission review shows answered/unanswered counts and consequences; confirm is deliberate. Submitting prevents duplicate attempts and communicates uncertain receipt. Terminal success requires confirmed acceptance or a clearly labeled local-only result under guest policy. |
| EXAM-07 | P0 | Results show earned/possible points, exact score meaning, correction status, question verdicts, explanations, and a supported next study action. Manual/pending evaluation is labeled provisional. Preserve historical grading version/results; do not silently recompute old scores. |
| EXAM-08 | P0 | Exam content fixtures cover all shipped question types: multiple choice, numeric/text/fill, matching, multipart, mathematical expressions, figures/tables, and manual grading where present. No raw markup, broken formulas, missing units, or misleading instructions in release fixtures. Unsupported content has a readable fallback and is triaged. |
| EXAM-09 | P1 | History differentiates completed attempts, active drafts, and provisional results. Resume returns to the correct question/timing state. Grade calculator moves to a secondary tool/disclosure and never competes with the selected paper. |

### 9.5 Arena, trivia, and games

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| ARENA-01 | P0 | Lobby offers immediate quick play and visible alternatives within the first 900px-wide desktop viewport at 900px height. School identity and event status support play rather than replacing it. Empty city/board has a compact designed state with an actual action. |
| ARENA-02 | P0 | Shared competitive shell connects lobby, trivia, story, rooms, duels, championship, and boards. Mode descriptors explain solo/live, timer, question count, and reward rules from configuration. Casual XP is not presented as championship standing/prize credit. |
| ARENA-03 | P0 | Solo/trivia entry allows a valid default mix with one primary Start action; themes are an optional alternative. Configure once. Gameplay feedback and result preserve mode identity and state. Replay does not force a full return to the lobby. |
| ARENA-04 | P0 | Story map uses real geography/progression, distinguishes locked/current/cleared stages and earned stars with text, and has a list alternative. Existing unlock/star rules remain unchanged. Returning restores actual stage state. |
| ARENA-05 | P0 | Duels/rooms cover create/join, code entry, invite, host waiting, participant ready, full/expired/not-found, host departure, reconnect, play, and results. Expose only supported host controls. Pending invitation is never shown as accepted. |
| ARENA-06 | P0 | Championship entry reflects configured browser-play and eligibility rules; show schedule with timezone, actual registration state, and a single correct action for scheduled/open/closed/live/completed states. A registration is complete only after confirmed acceptance. |
| ARENA-07 | P0 | Competitive answer state distinguishes selected, submitting, received, rejected/late, and unknown receipt. “Received” requires authoritative acknowledgment. Clock/rank/reward state follows server authority where applicable. No client celebration claims a prize or final rank. |
| ARENA-08 | P0 | Disconnection has explicit recovery and last-confirmed status; duplicate submissions cannot earn additional points. Recovery follows event policy. Do not expose protected answers through review/assistant affordances during a live competitive round. |
| ARENA-09 | P0 | Results and boards distinguish personal, school, casual, event, provisional, and final measures. Show the student's own outcome even outside top ranks. Preserve existing qualification and aggregation rules; explain restricted/insufficient data states. |
| ARENA-10 | P1 | Mini-game surfaces adopt shared entry/pause/result/error patterns without changing game mechanics. Verify each shipped game with keyboard and pointer; unsupported input gets an explicit alternative or capability notice. |
| ARENA-11 | P1 | City/art/school scenes progressively enhance a usable lobby; reduced motion, low-data, and no-WebGL environments retain all essential actions. No fake live activity or demonstration standings without a persistent demo label. |

### 9.6 Notifications and feedback

| ID | Priority | Requirement and acceptance criteria |
|---|---|---|
| NOTIF-01 | P0 | Inbox provides All and Unread, chronological groups, meaningful timestamps, type/state, and contextual destinations. Marking read changes unread state without removing the item from All. History retention follows D-06. |
| NOTIF-02 | P0 | New notification templates are localized, actionable, and based on actual data. Each carries a stable event ID, template/version, type, timestamps, read state, destination, and typed parameters. Legacy text records render safely without mandatory migration. |
| NOTIF-03 | P0 | Opening an item follows a safe internal destination; expired/deleted/restricted targets get a useful fallback. Read-state failures are recoverable. Unknown delivery/open status is not presented as confirmed. |
| NOTIF-04 | P0 | Reminder creation requires explicit schedule selection/confirmation: time, days/date, timezone, recurrence, and enabled channels. Edit/pause/delete are available. Save failure preserves the form. No silent next-day daily reminder creation. |
| NOTIF-05 | P0 | Preferences separate in-app, push, and email capability/category choices. Browser permission is requested after a user action and explanation, never at first visit. Denial provides browser instructions without repeated prompts. Saved preferences reflect server confirmation. |
| NOTIF-06 | P0 | Toasts, inline feedback, banners, and dialogs follow a shared severity/placement system. Replace native browser alerts in student flows. Critical actionable failures remain visible; harmless success confirmation does not block. |
| NOTIF-07 | P1 | Push/email use the same event intent and verified parameters with channel-specific formatting. Apply deduplication and user timezone; recommended promotional cap/quiet hours in D-07. Required operational messages follow a separately documented category policy. |
| NOTIF-08 | P1 | Email uses accessible HTML/text, a real brand header, one primary destination, concise verified context, and preferences link. No unsupported duration, invented peer count, or mastery claim in generated copy. |

## 10. Data and behavior contracts

### Preserve current sources of truth

| Concept | Existing integration anchors | Redesign rule |
|---|---|---|
| Course/lesson progress and mastery | `progressTracking`, `masteryService`, `CourseDetail` | Completion, mastery, and playback position remain separate concepts |
| Exercise review | `reviewService`, `DirectBankQuiz` | Review records cannot be relabeled as exam-derived mastery |
| Exam drafts/results | `examAttempts`, `examResults`, `ExamTake`, `ExamResults` | Maintain IDs/history and confirmation semantics |
| School standings | leaderboard services and shared aggregation | Preserve qualification, scope, and actual values |
| Competition state | `useArenaPlay`, arena APIs, shared arena contracts | Server acknowledgment/state wins over animation/client assumptions |
| Notifications/reminders | notification/push services, reminder scheduler and APIs | New presentation needs explicit retention, schedule, and delivery contracts |

Names above identify repository modules, not a mandate to retain internal implementation details. Any schema evolution requires backward-compatible readers and review of shared mobile consumers.

### Required distinctions

- **Playback position:** browser-local unless a verified account sync path exists.
- **Quiz score:** current implementation must be audited before copy is finalized. `DirectBankQuiz` awards terminal correctness after retries while a result string refers to first-try answers; resolve this mismatch explicitly through D-03.
- **Paper score:** earned points divided by possible points for the defined graded scope, with provisional/manual limits stated.
- **Mastery/readiness:** only use their existing validated models, never infer from a single screen's completion animation.
- **Rank:** competition scope and timestamp must be known; stale cached rank is not live.
- **Save/receipt:** local storage, queued write, remote confirmation, and accepted submission are distinct.

### Persistence changes to estimate separately

Read notification history, reminder timezone/quiet hours, quiz session recovery, multiple exam attempts/concurrent editing, and any new transcript/note feature may require service/schema work. Do not promise these as CSS-only changes. The implementation plan must explicitly map each requirement to existing support or a new dependency.

## 11. Cross-cutting quality

- Meet WCAG 2.2 AA as the target; document and resolve findings rather than claiming compliance from token selection alone.
- Complete journeys with keyboard and a screen reader; support visible focus, zoom, reduced motion, and non-color state cues.
- Never truncate assessment questions/options or require hover to access essential functions.
- Test desktop widths 1024/1280/1440, a 768 tablet, 390 phone browser, 320 reflow, and 200% zoom. Short laptop viewports are mandatory because the audit used 633px height.
- Support current stable Chrome, Edge, Firefox, and Safari plus Android Chrome/iOS Safari at release; confirm exact version matrix at kickoff.
- Keep third-party embeds and optional illustrations from blocking page navigation or answer entry.
- Load large media only when relevant. Avoid mandatory cinematic intros, looping background video, and autoplay audio.
- Sanitize rendered content and internal destinations, retain existing auth/access checks, and exclude student answer text and personal identifiers from analytics.
- Shared backend changes must remain compatible with the native application even though its UI is out of scope.

## 12. Analytics plan

Use an approved analytics provider/consent policy; none is selected by this PRD. P0 delivery must include an event contract and measurement fixtures. Production collection starts only after configuration/privacy review.

| Event | Trigger | Useful non-sensitive properties |
|---|---|---|
| `activity_entry_viewed` | Main entry screen becomes usable | surface, viewport bucket, guest/account, locale, load outcome |
| `activity_started` | Confirmed session start | kind, mode, content ID, entry source, time since entry |
| `activity_resumed` | Actual restored state | kind, restore source, restored fields, success/failure |
| `answer_checked` | Practice feedback produced | activity kind, question ID, attempt number, outcome; no raw answer |
| `activity_completed` | Confirmed completion | kind, mode, content ID, completion status; avoid unnecessary score collection |
| `review_started` | Review opens | source activity kind, supported review category |
| `save_state_changed` | Persistence changes materially | kind, device/account, state, error category |
| `submission_state_changed` | Exam/live submission changes | kind, accepted/rejected/uncertain, retry count |
| `notification_actioned` | User follows a notification | template ID/version, channel, target category |
| `notification_preference_changed` | Confirmed preference write | category, channel, enabled; no email/address |
| `ui_recovery_actioned` | Retry/reconnect/fallback used | surface, error category, outcome |

Prevent double events from remounts/retries. Use session/operation IDs without placing emails, names, room codes, tokens, full URLs, or answer content in telemetry. Report before/after with equivalent cohorts; do not optimize away useful reading time merely to improve speed metrics.

## 13. Delivery plan

| Phase | Deliverables | Exit gate |
|---|---|---|
| 0 — establish baseline | Run current source build, capture all critical states, content/render inventory, scoring/timing contract, performance baseline | Evidence matrix and D-01–D-05 resolution recorded |
| 1 — foundations and prototypes | Shared tokens/components, home hierarchy, five anchor screen designs, complete clickable journeys | Design review plus usability tasks meet directional targets |
| 2 — learn/practice | Course entry, lesson workspace, quiz setup/session/result/review, shared feedback | P0 LEARN/QUIZ/WEB scenarios pass |
| 3 — exams | Catalog/overview/session/submission/results/history polish and rendering fixes | Timing/save/grading regression scenarios pass; content QA complete |
| 4 — arena | Lobby, story/trivia, rooms/duels, championship continuity and result states | Real multi-client scenario, policy review, and state coverage pass |
| 5 — notifications and release | Inbox/reminders/preferences, approved channel templates, final cross-flow QA | All release gates and rollback plan satisfied |

Phases are dependency order, not date estimates. Shared feedback and bilingual work start in phase 1, not at the end. Team capacity, content remediation effort, and backend gaps determine scheduling. Existing functionality remains usable during incremental rollout.

## 14. Release acceptance scenarios

| Scenario | Must pass |
|---|---|
| Guest starts lesson and signs in | Correct activity is retained; no fabricated synced playback; existing access limit remains accurate |
| Learner completes lesson | Existing completion rules run once; next practice matches actual subject/unit |
| Quiz loads slowly | Skeleton → valid scope/deck; never empty → populated as a loading substitute |
| Learner retries wrong answer | State remains attached to the answered option; attempt count and score definition stay consistent |
| Quiz finishes with assisted answers | Result distinguishes its approved score meaning; review remains available |
| Guest/account refreshes quiz | Declared recovery/exit policy is visible and followed |
| Exam preview → start → refresh | Clock begins only at start and resumes under approved timing policy |
| Account loses connectivity mid-exam | Entered answers retained; save status truthful; recovery does not reset timer |
| Submission request times out | No false final success and no duplicate attempt; safe status reconciliation |
| Exam needs manual evaluation | Provisional scope/score explained; ungraded is not called incorrect |
| Math/table/long question | Correct rendering, readable inputs, keyboard navigation, no clipped essential content |
| Empty arena and anonymous visitor | Immediate valid play action; no invented standings; school prompt does not block casual play |
| Room join fails/full/expired | Reason and next action are clear; no endless generic spinner |
| Competitive answer misses acknowledgment | Explicit unknown receipt; no unjustified received/correct/reward display |
| Live connection recovers | Authoritative round/state restored under actual policy |
| Notification marked read | Badge updates; item remains in All; failed write can recover |
| Reminder saved across timezone/DST | Confirmed schedule matches the chosen policy, including nonexistent/ambiguous local times |
| FR ↔ HT | Controls/errors retain intent and layout; in-progress answers remain intact |
| Keyboard/zoom/reduced motion | Complete each core journey without hidden controls or essential animation |

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing build gives stale visual evidence | Capture a fresh source build before implementation and review deltas explicitly |
| Art direction improves chrome but videos remain visually weak | Content/art inventory and clean covers/openings prioritized alongside workspace design |
| New UI silently changes education or competition semantics | Trace every displayed metric/state to existing contract; resolve decision register |
| Refactor breaks shared mobile data consumers | Backward-compatible schema, shared contract tests, staged rollout |
| Dark arena becomes difficult to read or too heavy | Contrast/motion/low-data fixtures and lightweight fallback |
| Notification improvements increase interruption | Explicit consent, category controls, deduplication, caps, quiet hours |
| Bilingual expansion breaks layout | Native-language review, expanded strings, actual FR/HT screenshots |
| Scope expands into backend replacement | Requirement-to-dependency mapping and separate estimates; preserve useful services |

## 16. Decision register

These defaults make the proposal concrete. They are not claims of owner approval. Visual execution can proceed around the defaults; dependent rule/schema changes require the decision to be recorded before implementation.

| ID | Decision | Recommended baseline | Impact/status |
|---|---|---|---|
| D-01 | Website art direction | Calm editorial learning workspace; disciplined dark arena; reuse current fonts/logo/blue | Proposed; approve through anchor-screen review |
| D-02 | Meaning of premium/free access | Preserve current free/guest access and actual account gates | Proposed; no pricing change |
| D-03 | Finite quiz score and retries | Preserve three-try instructional behavior; report first-attempt accuracy separately from eventual correct answers. Audit and fix current copy/calculation mismatch before choosing final labels | Product/data review required; no score formula change assumed |
| D-04 | Quiz recovery | P0 explicitly describes current persistence; P1 account/device session recovery only after estimate. Require exit confirmation when recoverable state will be lost | Proposed; schema/storage dependency |
| D-05 | Exam timing/pause/guest storage | Preserve verified current timing contract; no new pause or automatic time extension. Device-only draft labeled separately from account-saved. Review conflict/expiry behavior | Contract review required |
| D-06 | Notification history | Retain read items for a proposed 90-day period, bounded/paginated, with delete/archive options appropriate to record type | Owner/privacy review; retention not implemented |
| D-07 | Outbound frequency/timezone | Proposed maximum one proactive learning nudge per local day across channels; quiet hours 20:00–08:00; chosen scheduled reminders and event operations governed separately | Requires messaging/category policy and timezone storage |
| D-08 | Arena/browser eligibility | Respect current `ARENA_WEB_PLAY` and server restrictions. Do not introduce forced fullscreen, surveillance, or weaker anti-cheat as design work | Existing policy preserved; revalidate at implementation |
| D-09 | Captions/transcripts/notes | Caption availability labeled; P1 authored transcript workflow; P2 synced private notes | Content/storage work separately scoped |
| D-10 | Notifications localization | Render new template records in chosen UI language; legacy text remains readable and is not machine-retranslated without review | Proposed backward-compatible model |
| D-11 | Analytics and rollout | Use approved existing provider if available; otherwise select separately. Incremental rollout with preserved routes/history and ability to revert UI | Technical/privacy decision |

## 17. Definition of done

- Every P0 requirement has an implemented screen/state or an explicitly agreed release exception with owner and reason.
- Design handoff includes actual FR/HT, short laptop, responsive browser, long content, loading/error/offline, and guest/account variants.
- Complete journeys pass functional, accessibility, content, and visual review; broad “premium” approval does not waive state correctness.
- No known critical loss of answers, clock reset, false save/receipt/final result, broken math, or inaccessible primary action.
- Baseline and post-change measurements are reproducible; limits are reported honestly.
- Routes, account records, exam results, and competition rules remain compatible; rollback is documented before deployment.
