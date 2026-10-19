# Larger product additions: evaluation

Date: October 19, 2026

Roadmap item: P2, "Evaluate larger product additions" in the [premium product implementation roadmap](2026-10-18-premium-product-implementation-roadmap.md). Each proposal below states a student need with its source, a scope, dependencies and risks, a rough cost, a success measure, and a recommendation.

The proposals below preserve the original evaluation. The owner subsequently requested implementation on October 19. Local implementation status is recorded below; it does not establish deployment, installed-device acceptance or successful pilot outcomes. The roadmap's P0/P1 release gates still apply.

## Implementation status after checking the current source

| Item | Current state | Evidence / remaining work |
| --- | --- | --- |
| 1. Explique-moi | Already implemented before this pass on web and native correction surfaces | `shared/explainContext.ts`, `api/_lib/explainGate.ts`, web `ExplainWithSandra`, native `ExplainButton`/`ExplainSheet`; sanitizer, assessment gate, disclosures and `correction_explain_opened` tests exist. Canonical reviewed explanation cache remains later. |
| 2. Mobile essay grading | Already implemented before this pass, including the dissertation rubric profile | `mobile/src/services/essayGrading.ts`, shared regrading, result pending/retry/criterion feedback and `essayDissertation.test.ts`. Real teacher calibration and the measured agreement target remain unverified. |
| 3. Class spaces | MVP implemented locally in this pass | [Implementation and pilot acceptance](2026-10-19-class-spaces-implementation.md): approved teacher grants, six-character codes, approval, private weekly board, exam assignments, server-recomputed objective marks, web/native student access, account deletion and privacy copy. School pilot has not been run. |
| 4. Offline revision packs | Not part of this pass | Tracked separately. The offline-failure evidence this document asks for has not been supplied. |
| 5. Parent progress links | MVP implemented locally in this pass | [Implementation](2026-10-19-parent-links-and-ambassadors.md): revocable 7/30/90-day read-only links, 192-bit tokens stored only as SHA-256 hashes, public `/suivi/:token` (signed out, noindex, no-referrer, rate-limited, scope limited to first name, class, course mastery, recent exam percentages, streak, XP and last activity), web and native create/share/list/revoke, deletion on account deletion, server-only rules and `releve_link_created`/`viewed`/`revoked` telemetry. Not deployed. No retention effect has been measured. |
| 6. School ambassadors | Tools implemented locally in this pass. Rewards remain a human process. | [Implementation](2026-10-19-parent-links-and-ambassadors.md): admin designation and revocation (at most 2 per school), badge beside the public alias, and a web and native dashboard. Retained recruits are defined in `shared/ambassadors.ts` as 3 or more server-observed Haiti days within 14 days of signup. Retention is computed on demand from Firestore write metadata and never client-reported. Burst and shared-address flags go to human review. The admin report has CSV export and a manual "récompense remise" record, and account deletion pseudonymizes recruit links. Reward amounts, fulfilment owner and guardian contact for minors are still open operations decisions. |
| 7–9. Rejected additions | Not built | The recommendations below remain unchanged. |

The original “mobile never calls the grader” and “corrections have no Sandra entry” statements below describe the earlier scan and are superseded by this status table. No production retention or essay-grading baseline was measured in this local implementation session.

## Ranked summary

| Rank | Addition | Student need, in one line | Size | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | **Explique-moi: Sandra explains a missed question** | "I got it wrong and the one-line explanation does not show me how" | S–M | **Do next** |
| 2 | **Essay grading on mobile, calibrated for French dissertation** | Essays taken on the phone are scored 0 and marked for a review that never happens | S–M | **Do next** |
| 3 | **Class spaces: teacher-verified classes, class board, assigned practice** | Rivalry and accountability inside a real class or school, not a national board | M (MVP) / L | **Do next, as a pilot with 1–2 schools** |
| 4 | Offline revision packs (exams + practice, no video) | Practice on metered data and unstable connections | M | Later, after device telemetry shows the gap |
| 5 | Student-shared progress record for parents | A parent or teacher wants to see progress without an account | S | Later (small; extend the existing relevé) |
| 6 | School ambassador programme | Students recruit their own schools; the referral loop is otherwise dead | S engineering + ongoing ops | Later, as an operations pilot after class spaces |
| 7 | WhatsApp / SMS reminders | Reminders on the channel students actually read | M + per-message cost | No for now |
| 8 | Shareable certificates and badges (standalone) | Recognition that is worth showing | S–M | No as a standalone feature |
| 9 | Peer study groups with chat | Study with friends | L + moderation | No |

Considered and excluded because the capability already exists (see [Already built](#already-built-not-proposed)): spaced-repetition daily review, hosted trivia tournaments with prizes, and a teacher content pipeline (intake stage).

## Evidence base and constraints

### Sources

- Owner feedback: 96+ TestFlight submissions since August 2026 (memory note `testflight-feedback-loop`). Open product asks: a "more addicting" exam list, interclass and intra-school ("more localized") competition, a hosted trivia tournament with sign-ups, reminders and a prize awarded outside the app, a more premium CourseDetail, and an Examens landing redesign.
- Growth notes (`growth-audit-2026-09`, `growth-engine`): about 100–123 accounts in September 2026. Diagnosis: an account gap rather than a content gap. Only 8 referral codes were ever issued (about 6% of users), producing 1 completed referral. In-app XP has no value outside the app, so the useful rewards are mobile data top-ups, Coursera licences, and status. A $500 budget buys prizes, not advertising.
- Google Ad Grants (`google-ad-grants`): rejected for thin SPA content. This is a website issue, so it informs none of the proposals below.
- [Learning journey PRD](2026-10-17-learning-journey-prd.md). LJ-08 "useful correction" says not to fabricate explanations and allows optional contextual Sandra help, subject to the assessment restrictions. Its section 15 lists the events the journey should emit.
- [Learning platform audit](2026-10-17-learning-platform-ux-ui-audit.md) and [mobile app audit](2026-10-17-mobile-app-audit.md). Mobile finding 16 says video needs internet and no user-managed download library exists. It suggests revision packs only where format and rights permit.
- Arena docs ([product spec](arena-competition-platform/PRODUCT-SPEC.md), [user journeys](arena-competition-platform/USER-JOURNEYS.md), [premium roadmap](2026-10-17-arena-premium-roadmap.md) item 11 "class and house competitions"). The spec states that the current `grade` grouping is a level such as NS I, not a verified class, and that "verified classroom groups" are added separately.

### What exists today (scanned October 19)

Web pages include courses, lessons, quizzes, `/revision` (missed-question review), `/releve` (a printable progress record written for parents and teachers), study plan, exams (browser, overview, take, results, history), Sandra, trivia, duels (`/defi`), leaderboard (`/classement`), Arena, `/tournois` (user tournaments with `teamRule: school | grade`), the competition workspace and projector, `/teach` and instructor profiles, and admin.

The mobile app covers the same student surface: Dashboard, Courses, CourseDetail, Exam landing, browser, overview, take, results and history, Quizzes, Sandra, Search, StudyPlan, Teach, Trivia, Challenge, Leaderboard, Profile, Avatar, and Arena (hub, doors, lobby, live, watch, result, tournois, competition workspace).

Server endpoints include `chat` (Sandra RAG + tools), `grade-essay`, `grade-scaffold`, `generate-plan`, `send-reminders`, `daily-nudge`, `reengagement`, `send-push`, `referrals/*`, `tournois`, `competition`, `arena/*` (including claims and guardian consent), `telemetry`, and `users/export|delete`.

### Platform constraints that shape every proposal

- **Haiti context.** Low and metered bandwidth, often a phone shared within a family, French and Kreyòl parity required, the Bac and MENFP exam calendar as the motivator, and schools as the social unit.
- **Minors.** Most users are secondary students. Any new contact data (parent, phone), any peer-to-peer messaging, and any public display of identity needs guardian-consent thinking. The Arena consent flow is the existing precedent.
- **Firestore.** The billing account holds 5 projects, its maximum, so new features live in `edlight-academy`. The October 10 outage showed that read volume matters. Prefer server-maintained aggregate documents over fan-out client reads.
- **Mobile delivery is OTA-only for JS.** `runtimeVersion` is pinned at 1.2.0. A new native dependency breaks the OTA contract and needs a store build that the owner runs himself. `expo-file-system` is already in `mobile/package.json`. Confirm it is linked in the shipped binary before relying on it.
- **No native crash reporter yet**, and the production telemetry sink is P0 work. Success measures below use only signals that exist today, or name the single event that must be added.
- **Small team and ops budget.** Anything that needs human review, verification or fulfilment has a recurring cost that counts as much as the build.

### Telemetry available for success measures

- GA4 (web): `sign_up`, `login`, `lesson_complete`, `quiz_complete`, `app_download_click`.
- Mobile `trackEvent`: `practice_started`, `practice_completed`, `session_cleared`. Diagnostics: `critical_request_started|succeeded|failed|recovered` into Vercel runtime logs via `/api/telemetry`.
- Firestore facts readable by admin scripts:
  - `users/{uid}/examAttempts/*` (results per question, including `manual` status)
  - `users/{uid}/mastery/lessons` and `mastery/review` (missed-question queue)
  - `users/{uid}/reviewState/*` (SM-2 schedule)
  - `chatConversations` (messages, tool calls, page context)
  - `invitesSent` and `invitesSentBy_{kind}` on user docs
  - `streaks/global`
  - `siteStats/public`
  - tournament and competition collections

Where a proposal needs a new event, it names exactly one, following the PRD section 15 naming.

---

## 1. Explique-moi: Sandra explains a missed question

**Recommendation: do next.**

**Student need.** The PRD's core question 4 is "What was wrong, and how can I improve?" (LJ-08). The exam catalog carries an `explanation` on most questions: about 9,400 keys, of which about 900 are null. These explanations are usually one sentence of the form "the answer is correct because…". They are not a worked method, and on maths and physics a student who missed the step cannot rebuild it from them. Sandra already explains concepts and is deliberately disabled during a live exam paper (`SandraWidget` restriction `exam`), but **results pages and quiz corrections have no entry into Sandra at all**. The owner's earlier feedback sessions repeatedly fixed correction display (raw LaTeX, multi-blank inputs), which is evidence that corrections are the most-viewed learning surface after video.

**Proposal.** An "Explique-moi" action on each incorrect or partial item in exam results, quiz results and Revizyon. It opens Sandra with a structured context: question text, the authored explanation, the expected answer, the student's own answer, subject, level, and the exam/question id. Sandra answers step by step in the student's language. A follow-up chip offers "Un exercice similaire", which routes to existing practice for the mapped lesson when the mapping exists.

**Scope.**

- MVP (web + app, OTA): a button on results rows. `api/chat` already accepts `page` and `studentContext`; add a sanitized `questionContext` field. Add a prompt section that requires steps to be grounded in the provided expected answer and explanation, and an honest fallback when no key exists.
- Later: cache one canonical explanation per question id, generated once and reviewed in admin. This cuts LLM cost and allows the reviewed explanation to become authored content.

**Dependencies and risks.**

- *Integrity.* Keep the existing restriction: no entry on `/take` or during competition. Results pages only appear after submission.
- *Privacy.* The PRD records that Sandra currently receives topic context, not student answers. Sending the student's answer changes that contract. It needs a one-line disclosure on the button sheet, and transcripts remain admin-visible as today.
- *Accuracy.* The LLM can be wrong on maths. Grounding on the stored expected answer, plus refusing when the key is a placeholder (`hasOnlyPlaceholderKey`), limits this. The cached-and-reviewed later stage is the real fix.
- *Cost.* Gemini 2.5 Flash per call, bounded by the existing `chat` rate limit of 30 per hour.
- *Ops.* None beyond the existing Sandra transcript review.

**Cost.** S–M: a button on 3 results surfaces × 2 platforms, a prompt section and context sanitizer, and tests. No new collections and no native change.

**Success measure.**

- **Primary:** of students who open Explique-moi on a missed item, the share who answer a question from the same lesson or exam subject correctly within 7 days. Target ≥ 40%. Measured by joining `chatConversations` (page context `explain`) to subsequent `mastery/review` resolutions and `examAttempts`.
- **Usage guard:** at least 15% of results views with ≥ 1 incorrect item use the action at least once in the first month.
- Needs one new event: `correction_explain_opened`.

## 2. Essay grading on mobile, calibrated for French dissertation

**Recommendation: do next.**

**Student need.** The exam catalog contains **814 essay questions**, and the Bac's French, philosophy and social-science papers are essay-led. On the web, `ExamTake` calls `/api/grade-essay`, an analytic rubric grader whose score is computed deterministically from per-criterion judgements. **The mobile app never calls it.** `ExamTakeScreen` passes an empty pre-graded map to `gradeExam`, so every mobile essay lands as `status: 'manual'` with 0 points awarded, and no human review queue exists. The September TestFlight batch already caught the related false claim "3 questions corrigées automatiquement" on a 3-essay paper. Most students use the phone, so the platform's largest Bac-relevant question type is effectively ungraded where students actually are.

**Proposal.**

1. Call the existing grader from mobile after submission, for essay and short-answer items, with the same body shape as the web.
2. Show the criterion feedback (strengths and improvements) in mobile results.
3. Calibrate a *dissertation* rubric profile for French and philosophy:
   - thesis and problematique
   - plan (introduction, development, conclusion)
   - argument plus example
   - language

   Calibration uses a small set of real graded copies collected with teachers.

**Scope.**

- MVP (OTA): wire mobile to `/api/grade-essay`. Show the grade as "indicatif", with a pending state while grading runs and a retry if it fails. Store it in the attempt doc as the web does.
- Later: the dissertation rubric profile and a teacher-graded calibration set of 20–30 copies to measure agreement.

**Dependencies and risks.**

- *Honesty.* Label the score as an AI estimate, never as an official grade. A failed grading call must show "non corrigé", never 0/20.
- *Cost.* One LLM call per essay per attempt, rate-limited.
- *Calibration.* This needs teachers, so it overlaps the class-spaces pilot (item 3).
- *Data.* Sends the essay text to the LLM provider. This is already the case on the web; the privacy page should say so.

**Cost.** S for the MVP wiring (shared grading code exists). M for the dissertation rubric and calibration.

**Success measure.**

- **Primary:** the share of mobile essay answers left in `manual` status. Today it is 100%. Target ≤ 5% within 2 weeks of the OTA. Measured from `examAttempts` result statuses.
- **Quality, later stage:** AI–teacher agreement within ±2/20 on ≥ 70% of the calibration set.

## 3. Class spaces: teacher-verified classes, class board, assigned practice

**Recommendation: do next, as a pilot with 1–2 partner schools.**

**Student need.** The owner has asked repeatedly for **interclass and intra-school, "more localized" competition**. The growth notes show that national boards and generic referrals do not move students. Only 1 referral completed, while the school tournament card was "the one mechanic where recruiting a non-friend is rational". The Arena product spec warns that today's `grade` grouping (used by `/tournois` with `teamRule: 'grade'`) is a *level* such as NS I and not a real class. It says verified classroom groups must be "added separately", and Arena roadmap item 11 calls for class-versus-class rounds with join codes. Teachers also have no way to point a class at specific practice, which is how Haitian classrooms already organize revision before the Bac.

**Proposal.** A teacher (approved through the existing `/teach` instructor intake and `AdminInstructors`) creates a *class* with a 6-character join code. Students join from the app or web, and the teacher approves the roster.

Each class gets:

- a class board for the week (practice and quiz XP, plus completed assignments)
- "assignments": the teacher picks an existing quiz set, exam paper or lesson, with a due date
- a class-versus-class weekly round between classes of the same school, by reusing the existing user-tournament engine with a new `teamRule: 'class'` that uses verified membership

**Scope.**

- MVP, web-first for the teacher and app + web for students:
  - class creation and join code
  - roster approval
  - class board as one server-maintained aggregate doc per class per week
  - one assignment type (quiz set or exam paper) with a completion count
- Later:
  - class-versus-class fixtures through the competition workspace and leagues
  - a teacher view of per-student mastery
  - house groupings
  - mobile teacher tools

**Dependencies and risks.**

- *Privacy of minors.*
  - A teacher sees only enrolled students' names, completion and scores. Answers and Sandra transcripts stay private.
  - Students choose to join, and leaving is one tap.
  - Class boards are visible only to members and never public.
  - This needs a privacy-policy update and a clear statement to students.
- *Authority.* Choosing a school in a profile does not prove enrollment (product spec section 3). Only approved teachers can create classes, and only the teacher's approval grants membership.
- *Integrity.* Assignment scores reuse existing graders. Class rounds reuse the tournament engine's server-only scoring, so no new client-trusted score paths are introduced.
- *Firestore load.* Aggregate docs, written server-side on attempt completion, keep reads flat as class count grows.
- *Ops.* Teacher verification is manual. That is acceptable for a 1–2 school pilot, but it is the scaling limit.
- *Dependency.* Works best after P1 competition continuity is complete.

**Cost.** M for the MVP (new `classes` collection plus rules, join/approve flows, weekly aggregate, one assignment type, two student surfaces, one teacher page). L for the full version with fixtures and teacher analytics.

**Success measure.**

- **Primary:** among students in pilot classes, the share active on ≥ 3 distinct days per week over the 4 pilot weeks, against the same school's non-joined students and the app-wide baseline. Target: at least 1.5× the non-joined cohort. Measured from `streaks/global.activeDays`.
- **Secondary:**
  - assignment completion ≥ 60% by the due date (from the assignment's completion counts)
  - ≥ 1 new sign-up per 3 enrolled students from join-code links (via `sign_up` plus the join-code attribution field)
- Needs one new event: `class_joined`.

## 4. Offline revision packs (exams and practice, no video)

**Recommendation: later. Revisit once the P0 telemetry sink reports how often students lose connection mid-task.**

**Student need.** Low and metered bandwidth is the defining constraint (PRD audience row "limited data or unstable connection"). Mobile audit finding 16 notes that cached metadata, persisted queries and exam drafts exist, but there is no user-managed download, and the roadmap lists "downloadable revision packs" as a scoped candidate. Lesson rows already show duration because students on metered data choose by size (`mastery-model` note).

**Proposal.** Per level and subject, a downloadable pack containing exam papers (text, figure descriptions and explanations), the matching quiz-bank questions, and the student's review queue. All grading runs locally with the shared graders, results are queued, and they sync on reconnect. Video is excluded: lessons are YouTube embeds, and downloading them is not permitted.

**Scope.** MVP on mobile only: a "Télécharger pour réviser hors ligne" control on the Exam landing level card, a size estimate before download, storage management in Profile, and a queued-results indicator. Later: web via the service worker. The service worker has a history of cache poisoning (`sw-bundle-poisoning`), so treat that as a separate, careful project.

**Dependencies and risks.**

- *OTA viability.* This depends on `expo-file-system` being in the shipped native build. It is in `package.json`, but verify that before scoping. If it is missing, this needs a store build.
- *Integrity.* Offline exam scores are practice only and never count toward competition or boards that need server timing.
- *Sync conflicts.* Mastery's monotonic merge already handles offline work, and `examAttempts` need the same treatment.
- *Storage on shared low-end phones.* The full `exam_catalog.json` is 22 MB, so packs must be per level and subject.
- *Ops.* Pack rebuilds on content change.

**Cost.** M.

**Success measure.**

- **Primary:** practice items completed while offline per pack-holding student per week, plus the share of queued results that sync successfully. Target ≥ 99% sync with no lost attempts.
- Before building, the P0 sink's `critical_request_failed` rate on exam and practice flows should show a meaningful offline-failure share (for example ≥ 5% of exam submissions); otherwise the pack solves a problem students do not have.
- Needs one new event: `offline_pack_downloaded`.

## 5. Student-shared progress record for parents

**Recommendation: later. Small, and best built after the journey work makes progress figures trustworthy.**

**Student need.** `/releve` was written explicitly for parents and teachers ("often on paper… with no way to ask a follow-up question"), but a parent can only see it if the student prints it. Parents often pay for the data bundle, and the phone may be shared. A parent who can see progress has a reason to keep paying for it. The Arena consent flow already collects guardian emails, but only for competition consent, and that data must not be repurposed.

**Proposal.** The student creates a revocable, read-only share link to their relevé (no parent account) and sends it over WhatsApp with the existing share helpers. The page shows the same figures as `/releve`, a "last updated" date, and both languages. It does not offer a parent email digest.

**Scope.** MVP on web for the page and app + web for creating and revoking the link. Later, only with guardian consent: an opt-in monthly email through the existing `emailShell`.

**Dependencies and risks.**

- *Privacy.* The student controls the link and can revoke it. Unguessable tokens, no indexing, and no school, city or name beyond what the relevé already prints.
- *Credibility.* The figures must follow the PRD's completion-versus-mastery distinction first.
- *Ops.* None.

**Cost.** S.

**Success measure.**

- **Primary:** among students who create a link, 30-day retention against matched non-sharers. Target ≥ +10 points, as directional evidence only.
- **Secondary:** links created per month, and share-link opens.
- Needs one new event: `releve_link_created`.

## 6. School ambassador programme

**Recommendation: later, as an operations pilot that starts after class spaces exist.**

**Student need.** Growth is limited by reach, not content (`growth-audit`), and schools are the social unit. Generic referral failed for three stated reasons: no real reward, no moment of pride, and nothing measured (`growth-engine`). An ambassador fixes the first two with a real, deliverable reward (a data top-up or Coursera licence) and public status in their school.

**Proposal.** One or two student ambassadors per school, selected by the team. Each gets a personal referral code that is already supported. They receive a monthly top-up tied to *active* recruited students, not sign-ups, plus an ambassador badge on their profile and school board.

**Scope.** Engineering is small: an `ambassador` flag, a per-code report of recruits active in the last 14 days built from existing referral and streak data, and an admin page to see it. Most of the work is operations: selection, payouts and fraud checks.

**Dependencies and risks.**

- *Fraud.* Sign-up farming is the obvious attack. Paying only on recruits with ≥ 3 active days mitigates it.
- *Ops load.* Monthly payouts and support are recurring work.
- *Minors.* Payments to minors need a guardian or school contact.
- *Sequencing.* Ambassadors are far more effective when recruits land in a class space (item 3) than in an empty app.

**Cost.** S engineering. The ongoing ops cost is the real cost, plus the top-up budget, which fits inside the $500 prize framing.

**Success measure.**

- **Primary:** recruits per ambassador still active after 14 days. Target ≥ 10 per ambassador per month.
- **Secondary:** cost per retained student ≤ $1.
- Measured from referral redemption, `streaks/global` and `invitesSentBy_*`.

## 7. WhatsApp / SMS reminders

**Recommendation: no for now.**

**Student need.** Students read WhatsApp far more than email, and the app already relies on WhatsApp for sharing (`duels`, `schoolInvite`, `scoreShare`). The reminder system currently uses email (`send-reminders`, `daily-nudge`, `reengagement` with personalized bilingual templates) and push (`send-push`).

**Why not now.**

- **No measurement yet.** The effect of the existing email and push reminders on return visits has not been measured. Adding a paid channel before knowing whether reminders move anything spends money blind.
- **Platform overhead.** The WhatsApp Business Platform needs business verification, pre-approved templates, per-conversation fees, and explicit opt-in.
- **Phone numbers of minors.** The app does not collect them today and should not start without a consent design.
- **SMS cost.** SMS to Haitian carriers has a per-message cost with no rich content.
- **Ops.** Template approvals, opt-outs and number hygiene are recurring work.

**What would change the answer.** Measure first, using `streaks/global`: the return rate within 24 hours of an email or push reminder, against students who received none. If push and email return rates are both low and a parent or teacher channel (items 3 and 5) has not closed the gap, run a 4-week WhatsApp pilot with opted-in students aged 18 and over in Préfac/postbac. The bar to proceed: a ≥ 2× return-within-24h rate over push.

**Cost if built.** M, plus per-message fees.

## 8. Shareable certificates and badges (standalone)

**Recommendation: no as a standalone feature.**

**Student need.** Recognition is a real motivator (the champion share card, rank emblems), and `growth-engine` notes that in-app status is a free reward.

**Why not.** Most of it exists already or is specified elsewhere:

- `ShareCard` with a champion mode and `@edlightacademy` on every card
- rank emblems
- per-course badges recorded on progress docs and printed on `/releve`
- Arena certificates, which the competition product spec already defines (issuer, result status, "a participation certificate is not a mastery credential")

A separate generic certificate system risks implying credentials the platform has not measured, which the PRD forbids. Completion is not mastery.

**What to do instead.**

- Finish the Arena certificate as specified.
- Add a share action to the chapter-test `mastered` moment, the one place a real earned achievement already exists. That is S and belongs to P1 learning continuity.

## 9. Peer study groups with chat

**Recommendation: no.**

**Student need.** Studying with friends is real, but students already do it in their own WhatsApp groups. The app's social needs are met by duels, school boards, tournaments and (proposed) class spaces, all of which avoid free-text messaging between minors.

**Why not.**

- **Moderation.** Peer chat among minors needs moderation tooling, reporting, retention policy and staff to act on reports. `AdminModeration` is a report queue for lesson comments, not a tool for conversations.
- **Shared phones.** Shared devices make account mix-ups and exposure of private messages more likely; the mobile audit already flags account-isolation risks.
- **Firestore load.** Real-time listeners are the most read-intensive pattern on the platform.
- **The need is already served.** Item 3 serves the social-accountability part of it inside a teacher-approved context, without messaging.

---

## Already built (not proposed)

These came up as candidates or owner asks, but the capability exists. Remaining work belongs to P1 journey completion, not a new addition.

| Candidate / ask | What exists | Remaining gap, if any |
| --- | --- | --- |
| Spaced-repetition daily review | SM-2 schedule in `users/{uid}/reviewState/*` (`reviewService`, also used by study-plan tasks); missed-question queue in `mastery/review`; `/revision` on web, Revizyon on mobile, dashboard `ReviewBanner`; reminder emails link to it | Surfacing and continuity (PRD LJ-09), not a new system |
| Hosted trivia tournament with sign-ups, reminders and outside-app prize (owner ask) | `/tournois` user tournaments (scheduled, live, window, bracket); official Arena championships with registration, guardian consent, prize claims (`api/arena/claim`), competition workspace and projector; push reminders | Competition-journey continuity (roadmap section 3); prize fulfilment stays off-app by design |
| Interclass competition by level | `/tournois` `teamRule: 'grade'` and `school` | Only *level*, not a verified class. Covered by item 3 |
| Teacher content creator pipeline | `/teach` intake (`api/instructor-apply`), `InstructorProfile`, `AdminInstructors`, `CourseManager` | Authoring tools for outside teachers are not justified until item 3 brings real teachers in. Revisit then |
| AI-graded essays | `/api/grade-essay` (rubric, deterministic scoring) wired on web | Mobile wiring and dissertation calibration. Item 2 |
| "More addicting" exam list, Examens landing, premium CourseDetail (owner asks) | Existing screens | Design and UX work under P1 foundations and journeys, not a product addition |

## Suggested sequencing

1. **Items 1 and 2 together**, after the P0 telemetry sink. Both are OTA-safe, reuse existing endpoints, and close the correction loop on the phone. Ship the new events with them.
2. **Item 3 as a 4-week pilot** with 1–2 partner schools, once P1 competition continuity lands. Use pilot teachers for item 2's dissertation calibration.
3. **Items 5 and 6** after the pilot shows class spaces retain students.
4. **Item 4** only if P0 diagnostics show offline failure is common. Item 7 only if the reminder-effect measurement says email and push do not work.

Each "do next" item should get its own spec with a baseline measured *before* the build. Without that baseline, none of the targets above can be judged.
