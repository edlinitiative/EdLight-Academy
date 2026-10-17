# PRD: the connected EdLight learning journey

Date: October 17, 2026  
Version: 1.0 proposed  
Status: Product and design specification; documentation only  
Scope: Responsive website; Arena and native app implementation excluded  
Product owner: EdLight Academy; delivery owners to be assigned

## 1. Product intent

Create one coherent journey:

**Home → lesson → relevant practice → understandable correction → evidence of progress → next useful action.**

Students should spend their attention learning rather than reselecting subjects, interpreting progress labels, or deciding among competing buttons. Every step should preserve context, make its purpose clear, and explain what has actually been saved.

The experience should feel like a carefully prepared personal learning studio: inviting, readable, calm during concentration, and satisfying when work is completed. Premium quality comes from composition, original educational artwork, interaction precision, and trustworthy feedback.

## 2. Context and source of truth

This PRD translates the [core UX/UI audit](./2026-10-17-learning-platform-ux-ui-audit.md) into a bounded delivery specification. Reuse the existing [website PRD](./website-premium/PRD.md) and [design specification](./website-premium/DESIGN-SPEC.md) for platform-wide requirements and proposed foundations.

This document specifies this journey in greater detail. If it conflicts with an existing requirement, record and resolve the conflict before implementation. It does not change scoring, mastery criteria, guest limits, curriculum coverage, content rights, or server authorization.

Evidence consists of source inspection and existing documentation. No new student study, production measurement, or complete rendered-device audit was performed for this PRD. Proposed values are design and testing targets, not measured outcomes.

## 3. Problem

EdLight already has resume information, course outlines, contextual practice links, corrections, mastery, review queues, and a study workspace. These capabilities span several screens and presentation patterns. Their existence does not guarantee students understand the connection between them.

The journey must resolve five questions:

1. What should I do now?
2. What am I learning, and where am I in the course?
3. Can I use what I just learned?
4. What was wrong, and how can I improve?
5. What changed in my progress, and what comes next?

## 4. Audience and jobs

| Student situation | Job | Design implication |
| --- | --- | --- |
| Returning with an unfinished lesson | Resume without searching again | Accurate lesson identity and supported playback restoration |
| New account or guest | Find suitable available material and experience a first useful activity | Honest class coverage and low-friction entry |
| Struggling with a topic | Understand an error and try appropriate practice | Specific correction and preserved topic context |
| Preparing for exams | Build understanding that supports paper practice | Relevant pathways without making this journey an exam redesign |
| Using limited data or an unstable connection | Continue safely and understand availability | Lightweight presentation, explicit saving, and recoverable failures |
| Using Kreyòl, assistive technology, or large text | Complete the same meaningful tasks | Equal information and functional parity |

## 5. Scope

### Included

- Signed-in Home continuation and new-student starting states.
- Guest entry from an available course or public sample into suitable learning.
- Course overview as an optional orientation step.
- Video lesson workspace, outline, existing completion action, and continuation.
- Contextual entry to existing practice and finite quiz modes.
- Answer feedback, correction, session summary, and existing review handoff.
- Progress explanation using existing completion, mastery, and review evidence.
- Supporting search, contextual Sandra entry, and navigation behavior needed for the journey.
- Visual foundations, original asset brief, responsive layouts, motion, accessibility, and all essential states.

### Excluded

- Arena, games, competitive rankings, spectators, and broadcast.
- Native iOS/Android application changes.
- New grading formulas, mastery thresholds, XP rules, or adaptive assessment models.
- A new video player engine, replacement course library, or unrestricted video downloads.
- New transcript, notes, audio, or resource capabilities without available content and a separate data contract.
- A full redesign of exam taking, educator tools, admin, notifications, or account settings.
- Deployment, production migration, automatic messaging, and implementation as part of this documentation task.

## 6. Outcomes

No baseline has been established. Collect baseline task observations before comparing the redesigned journey.

| Outcome | Measure | Proposed acceptance |
| --- | --- | --- |
| Students understand the next action | Unassisted task initiation | At least 80% of participants identify and begin the intended next activity in a small moderated study; directional evidence only |
| Continuation preserves context | Resume and handoff scenarios | All scripted course/lesson/unit/context cases pass |
| Correction is useful | Student explains the error and chooses a relevant next step | Evaluate comprehension in the prototype study, not only button clicks |
| Progress is credible | Student distinguishes completion from mastery | No tested participant is told that video completion alone proves mastery |
| Work is dependable | Save, interruption, account, and reconnect scenarios | All release-blocking scenarios pass; no known incorrect saved-state claim |
| More learning follows lessons | Lesson-to-practice and correction-to-review completion | Compare with baseline using equivalent cohorts; set uplift targets after baseline |
| Presentation is inclusive | Responsive, keyboard, language, and reduced-motion fixtures | All mandatory fixtures pass before sign-off |

Avoid optimizing session duration, notification acceptance, or animation exposure as substitutes for useful learning.

## 7. Journey and navigation model

| Step | Student intent | Primary action | Context carried forward |
| --- | --- | --- | --- |
| Home | Continue or begin suitable work | Resume lesson / start available lesson | Course, lesson, supported position, class, language |
| Overview, if needed | Understand the course before starting | Start / resume | Selected course and real next lesson |
| Lesson | Understand the topic | Complete lesson, then contextual practice or continuation | Course, unit, lesson, available bank mapping |
| Practice entry | Apply this topic | Start the relevant session | Valid scope, mode, actual count |
| Practice | Answer and learn | Submit / continue according to mode | Attempt and response state, permitted feedback |
| Correction | Understand the outcome | Review or retry appropriate material | Actual result, supported explanation, review mapping |
| Progress | Understand what improved | Continue learning / revisit due review | Confirmed evidence and next available activity |

Existing URLs remain supported. Do not create a new disconnected progress route solely to satisfy the prototype. Locate the journey's progress summary in an existing appropriate surface and link to deeper history when useful.

An explicit student choice overrides a recommendation. Recommendations must not silently switch class, abandon an unfinished attempt, or restart a completed session.

## 8. Functional requirements

### LJ-01: a meaningful Home continuation

- Display one dominant continuation or starting action with topic, subject, and relevant status.
- Resume the actual lesson rather than sending returning students to a generic course catalog.
- Describe playback position only when restoration is supported and a valid position exists.
- A deliberately unfinished exam may remain the primary continuation under existing product rules; preserve it rather than replacing it with a less relevant lesson.
- Keep a compact review alternative and a way to browse. Do not duplicate a full catalog on Home.
- Empty accounts receive an actual available lesson or a skippable class selection. Do not invent progress or weaknesses.

**Acceptance:** A returning student can identify the exact destination before clicking. A new student can start suitable available material without navigating an empty history screen.

### LJ-02: class and content suitability

- Preserve selected class and language throughout the journey.
- Distinguish unavailable curriculum coverage from an empty search and from a loading failure.
- When suggesting material from another level, label it and let the student choose.
- Use canonical identifiers internally and student-readable names in the interface.

**Acceptance:** Unsupported grade, unavailable unit, stale lesson link, and language fallback each have an accurate message and a useful exit.

### LJ-03: purposeful course overview

- Show a short course description, concrete authored outcomes where present, class, real outline, and one start/resume action.
- Show actual duration and verified instructor information only when available.
- Preserve catalog filters and the selected course when returning to browsing.
- Deep links to a valid lesson may enter the lesson directly; do not force repeated overview visits.

**Acceptance:** Students can assess suitability and start the intended lesson without interpreting technical course codes.

### LJ-04: focused lesson workspace

- Show lesson title and unit context before the player in reading order.
- Keep current position, outline access, and next action understandable on a short laptop.
- Respect supported provider controls and source aspect ratio. Do not imply a fully custom or offline player when unsupported.
- Outline items indicate current and completed state with text or symbols, not color alone.
- Contextual help and resources must not overlap playback or essential controls.
- Preserve the existing focused-shell behavior and provide a clear return to course.

**Acceptance:** Students can watch, locate themselves in the outline, ask for supported help, and find the next action without navigating through promotional content.

### LJ-05: truthful completion and continuation

- Reuse existing completion and mastery logic. Do not award mastery because a video ended.
- Show saving, delayed confirmation, queued/offline, failure, and confirmed states where supported by the persistence layer.
- Prevent duplicate submissions while the same write is pending.
- Show the completion acknowledgment only after the required confirmation; a queued state remains explicitly pending.
- After confirmation, offer a relevant practice action when mapped content exists, alongside an appropriately secondary next-lesson option.
- If current course rules require a chapter test or other gate, preserve that rule.

**Acceptance:** A dropped connection does not produce a false completion celebration. Repeating a save cannot award duplicate progress. A completed lesson does not restart on the next visit unless the student chooses it.

### LJ-06: contextual practice entry

- Carry course, level, unit, and lesson attribution only when mappings are valid.
- A lesson-origin entry shows a compact confirmation of topic, mode, actual available count, and save behavior.
- A general Practice entry retains subject/class/unit controls and customization.
- Do not call unit-wide questions lesson-specific when lesson mapping is unavailable.
- Unknown or stale scope falls back with an explanation and explicit choice, not a silent unrelated question set.
- Prefer a finite session for the designed journey; retain open practice as an alternative. Use current supported session sizes until a separate product decision approves a change.

**Acceptance:** A valid lesson handoff avoids repeated topic selection. Loading never briefly claims “0 questions.” A small bank shows the actual count before entry.

### LJ-07: understandable session behavior

- Explain feedback timing, retry behavior, session length where fixed, and what is saved before starting.
- Preserve existing distinctions between practice and quiz; do not introduce a time limit or grade that the mode does not have.
- Expose question position for finite sessions and a clear exit for open practice.
- Confirmation, navigation, and feedback behavior remain consistent within a mode.
- Preserve student answers where existing persistence supports it; do not promise recovery for currently unsupported session state without implementing and testing it.

**Acceptance:** Students can explain the selected mode's basic behavior and safely understand what happens when leaving.

### LJ-08: useful correction

- Distinguish selected response, result, expected response where disclosure is permitted, and supported explanation.
- Preserve partial, unanswered, pending/manual, and unsupported-scoring states.
- Prefer authored worked steps and relevant references. Do not fabricate a misconception diagnosis or explanation to fill a visual slot.
- Offer a retry or related practice action only where supported and label whether it is the same question or another one.
- Contextual Sandra help is optional and governed by existing eligibility and assessment restrictions.

**Acceptance:** Students understand what happened and have a relevant next action even when no detailed authored explanation exists.

### LJ-09: result-to-review continuity

- Summarize actual session outcomes without confusing unanswered or ungraded items with incorrect ones.
- Explain which errors enter the existing review mechanism and when that information is confirmed.
- Allow correction review before leaving the session where supported.
- Preserve source attribution when transferring valid items to review; omit unsupported writes rather than pretending review was scheduled.
- Avoid a dead-end success screen; offer one dominant next action based on real state.

**Acceptance:** The review destination matches the session and uses existing identifiers. Students who have nothing due receive an accurate next option rather than a fabricated weakness.

### LJ-10: evidence-based progress

- Present completion, practice, mastery, and review as distinct concepts.
- Use the existing mastery model and authoritative records. Avoid a new blended “readiness” score.
- Identify scope and denominator: a topic, unit, course, or attempt—not an unexplained global percentage.
- Explain changes with supported facts. Show a before/after comparison only when both states are available and comparable.
- Do not imply future mastery increases before results are confirmed.

**Acceptance:** A student can explain what the progress summary measures and why its next recommendation appears.

### LJ-11: supporting search, help, and navigation

- Search returns useful learning destinations with class and topic context; exact content should not be buried behind generic pages without a reason.
- Search and outline dialogs contain and restore focus appropriately, and keyboard selection remains visible.
- Opening and dismissing help preserves the underlying task and scroll position.
- Authentication or grade entry must not unexpectedly discard an active question or invitation context.
- Remove reliance on hidden navigation gestures that reload the document; any proposed behavior change must preserve supported routes and current save protections.

**Acceptance:** Keyboard-only students can search, open a lesson, use its outline, practice, and exit help without losing orientation.

## 9. Visual direction

### A composed learning studio

Use quiet surfaces, strong educational content, clear typography, and original subject artwork. Let lesson identity and the current task lead. Reserve high visual emphasis for the action that advances the journey.

Reuse the existing semantic token system; do not introduce a parallel theme for this journey. The following are proposed targets consistent with the broader design package, subject to rendered contrast and device validation.

| Foundation | Direction |
| --- | --- |
| Light canvas | Soft neutral background such as `#F7F9FC`, white working surfaces, marine primary text |
| Dark canvas | Marine surfaces with readable light text; preserve the student's saved preference |
| Primary action | Existing accessible blue pairing; one primary action per local task region |
| Subject identity | Stable subject colors plus original diagrams or motifs; color is never the only identifier |
| Display headings | Existing Plus Jakarta Sans, used selectively |
| Reading and questions | Existing Source Sans 3, with comfortable line height and math-aware composition |
| Numbers | Tabular figures where changing values would otherwise shift layout |
| Borders and depth | Subtle grouping; use whitespace before adding nested panels or shadows |
| Artwork | Coordinated composition, title-safe area, and authentic relationship to the curriculum |

### Typography targets

| Role | Desktop starting target | Compact starting target |
| --- | --- | --- |
| Page title | 32/40 px | 27/34 px |
| Section title | 24/32 px | 22/29 px |
| Lesson/question title | 24/34 px | 21/30 px |
| Long question or passage | 20/31 px | 18/28 px |
| Body | 17/26 px | 16/25 px |
| Answer option | 18/27 px | 17/26 px |
| Control | 16/22 px | 16/22 px |
| Supporting context | 15/22 px | 14/21 px |

Treat these as design candidates, not forced overrides of every existing component. Important instructions, errors, and scoring caveats must not shrink to decorative metadata sizes. Long passages use a readable line length, approximately 60–75 characters where feasible; mathematical content receives layout appropriate to its structure.

### Composition by screen

| Screen | Primary composition | Secondary content | Visual restraint |
| --- | --- | --- | --- |
| Home | One large real continuation with topic and action | Compact due review and progress | Greeting and metrics do not dominate |
| Overview | Outcomes and start/resume alongside authentic preview | Readable outline | Collapse long prose progressively |
| Lesson | Title, player, current context, continuation | Outline and optional help | No floating promotion over content |
| Practice entry | Topic confirmation, mode, real count, start | Scope adjustment | No duplicated start/configuration panels |
| Question | Prompt, response, permitted feedback | Position and exit | No animated background or unrelated metrics |
| Correction | Response, verdict, explanation | Related practice/reference | Feedback hierarchy survives without color |
| Progress | Confirmed evidence and next step | Detailed history | No decorative global score |

### Course artwork requirements

Create a consistent family of subject covers and educational illustrations. Inventory existing usable assets first. For new artwork, specify subject, curricular relevance, title-safe region, light/dark behavior, desktop/mobile crop, accessible text equivalent where informative, and export requirements.

Use actual instructional frames when they help assess teaching. Do not add generic stock students or invented testimonials as substitutes for demonstrating the product.

## 10. Animation and interaction specification

### Principles

- The student's input receives immediate feedback, independent of network confirmation.
- Motion explains continuity, selection, or confirmed change.
- Reading phases remain visually calm.
- A celebration is brief, meaningful, dismissible where relevant, and never a required wait.
- Layout remains stable while assets and results load.
- Existing shared tokens and reduced-motion mechanisms are reused and completed.

### Motion vocabulary

Timing values are prototype candidates. Validate on baseline devices and tune as a system.

| Role | Starting duration | Behavior |
| --- | --- | --- |
| Press/focus acknowledgment | 80–140 ms | Small visual response; keyboard focus remains clear |
| Selection change | 120–180 ms | Border/background or check-state change without shifting labels |
| Component reveal | 180–260 ms | Gentle fade and up to 8 px travel where meaningful |
| Task transition | 220–350 ms | Short continuity transition; do not delay navigation or focus |
| Outline/help panel | 180–260 ms | Predictable entrance, accessible focus management, immediate close |
| Confirmed progress update | 400–650 ms | Animate from actual previous value to confirmed next value |
| Completion acknowledgment | Approximately 600–1,000 ms | Subtle check or local highlight; next action available immediately |

Use the shared emphasis curve or an equivalent consistent ease-out for entrances, a shorter exit, and restrained spring behavior for direct manipulation. Do not independently invent motion physics for each page.

### Choreography across the journey

| Moment | Animation | Required constraint |
| --- | --- | --- |
| Home becomes ready | Stable skeleton resolves to continuation | Do not replay staggered entrances on every background refresh |
| Resume lesson | Preserve topic identity as the task shell changes | No full-page theatrical intro before learning |
| Open outline | Short panel transition | Focus enters appropriately and returns to its trigger |
| Choose answer | Immediate selection indicator | Never imply server acceptance or correctness prematurely |
| Submit answer | Pending state followed by actual result | Keep selected response visible; prevent duplicate actions |
| Reveal correction | Verdict and explanation appear in readable order | No shake, flashing, or humiliating wrong-answer treatment |
| Continue question | Short transition after an explicit action | Reading time is controlled by the student where mode rules allow |
| Complete lesson | Confirmed local acknowledgment and continuation | Queued or failed writes cannot trigger a saved-state celebration |
| Update progress | Explain confirmed change, then settle | Do not grow a bar from zero on every revisit |
| Enter review | Preserve topic and source context | Never silently replace the requested review with unrelated practice |

### Reduced motion, sound, and interruption

- Honor the system motion preference on initial load and when it changes.
- Replace movement and animated counting with settled states or brief fades; preserve all information.
- Do not use sound as required feedback. A new learning soundscape is not in scope; any optional future audio requires explicit controls and user initiation.
- Stop unnecessary animation in hidden views. Repeated renders must not restart feedback sequences.
- Late responses are scoped to the originating activity and account. Navigating elsewhere must not cause a stale completion animation on an unrelated lesson.
- Never move a focused answer or control away from the student during interaction.

## 11. Responsive and accessibility requirements

Reference compositions: 1440×900 desktop, 1280×720 laptop, 1280×633 short laptop, 1024 px tablet browser, 768 px compact browser, 390 px phone, and 320 CSS px reflow testing. Also test zoom and large text; viewport width alone is insufficient.

- Wide lesson layout: flexible primary column and approximately 304–320 px outline, subject to actual reading space.
- Constrained layouts: collapse the outline into a labeled sheet or drawer rather than shrinking the player or question text excessively.
- Phone layout: one content column; controls remain reachable and do not overlay question text, math, or provider playback controls.
- Avoid nested scroll traps. Any independently scrolling outline must be keyboard usable.
- Support keyboard-only completion, visible focus, meaningful headings, labeled controls, state announcements, and accessible modal behavior.
- Validate text and non-text contrast in actual light/dark composited states. Do not rely on token names as evidence of compliance.
- Prefer at least 44 px primary-control height as a comfort target; evaluate all targets against applicable accessibility requirements and exceptions.
- Mathematical expressions, tables, and figures need a deliberate reading and overflow strategy without clipping or hiding answer controls.
- French and Kreyòl carry equivalent rules and recovery information. Do not assume the shortest language string.

## 12. Context and persistence contract

This is a logical contract to map onto existing routes, stores, and services—not an instruction to create a new backend schema.

| Context | Use | Rule |
| --- | --- | --- |
| Student identity or guest state | Scope progress and access | Never reuse private state across accounts |
| Selected class and language | Suitable material and copy | Preserve explicit choice; show unsupported coverage honestly |
| Course, unit, lesson identifiers | Resume and practice attribution | Validate against current content; display readable names |
| Provider and supported playback position | Resume video | Promise only restoration that the integration supports |
| Practice scope, mode, actual count | Session entry | Derive from valid available content |
| Attempt/session identity | Correction and recovery | Use existing identifiers; avoid duplicate submissions |
| Save status | Trust and continuation | Distinguish local interaction, pending persistence, and confirmed outcome |
| Existing review/mastery evidence | Next recommendation and progress | No new inference or threshold introduced by styling |

Do not place student responses or unnecessary personal information in URLs or analytics. Preserve existing access rules for answer keys, attempt data, and assistant context.

## 13. State matrix

| State | Presentation | Recovery/continuation |
| --- | --- | --- |
| Loading | Stable task-shaped skeleton and clear pending action | Avoid false empty content |
| Empty account | Suitable available starting material | Class selection or browse |
| Unsupported class/unit | Explain coverage | Explicit available alternatives |
| Invalid/deleted lesson | Explain unavailable destination | Course or catalog without losing class |
| Video failure | Keep lesson identity and non-video context | Retry or supported provider fallback |
| Offline | Distinguish available local content from network requirements | Preserve supported drafts; retry on reconnect |
| Saving | Selected work remains visible | Prevent duplicate submission |
| Slow/queued | Explicitly unconfirmed status | Explain waiting and supported safe navigation |
| Save failure | Specific failure beside affected action | Retry without losing response |
| Confirmed completion | Brief acknowledgment and updated true state | Contextual next action |
| No mapped practice | Explain available scope | Choose unit-wide practice or next lesson |
| Ungraded/manual result | Clear status and limitation | Available explanation or supported review route |
| Nothing due | Accurate caught-up state | Next lesson or chosen practice |
| Signed out/session expired | Preserve permitted context | Authenticate without exposing or misattributing records |

No essential failure state should be communicated only by a temporary toast.

## 14. Content and copy

Use direct, supportive language. Keep actions specific: resume the named lesson, start the actual practice, review the available correction. Avoid unsupported promises such as “you mastered this” after watching a video.

Proposed copy examples, to localize and review:

- “Reprendre : [titre de la leçon]”
- “Pratiquer ce chapitre · [nombre réel] questions”
- “Réponse partiellement correcte”
- “En attente de connexion — pas encore confirmé”
- “Leçon terminée. La maîtrise se construit avec la pratique.”

Dynamic examples must be populated from real data; they are not permission to invent counts or coverage. Educational explanations need content review separate from interface-copy review.

## 15. Measurement and diagnostics

Map these logical events to existing instrumentation or propose a minimal implementation:

| Event | Purpose |
| --- | --- |
| `learning_next_action_selected` | Understand entry decisions |
| `lesson_resume_requested` / `lesson_resume_resolved` | Measure accurate continuation |
| `lesson_completion_confirmed` | Count confirmed outcomes rather than button presses |
| `practice_handoff_opened` / `practice_started` | Measure contextual follow-through |
| `practice_completed` | Distinguish meaningful completion from entry |
| `correction_opened` | Understand use of feedback |
| `review_started` / `review_completed` | Measure useful correction-to-review continuation |
| `learning_save_failed` | Diagnose reliability problems |
| `progress_summary_opened` | Assess use alongside comprehension testing |

Record only necessary technical context such as entry source, supported scope identifiers, mode, language, viewport category, and outcome category. Avoid raw answers, chat text, names, or email in analytics. Define consent and retention through existing policy before adding instrumentation.

Prevent event duplication during retries, React rerenders, route revisits, and reconnection. Report guest and signed-in flows separately.

## 16. Required prototype and assets

### Prototype

Deliver a connected, reviewable prototype using one real available course and its valid practice scope:

1. Returning Home with an unfinished lesson.
2. Course overview as an alternative entry.
3. Lesson with outline and help states.
4. Confirmed completion and compact practice handoff.
5. A finite practice session with correct, incorrect, and relevant supported answer types.
6. Correction and session result.
7. Progress summary and real next action.

Provide desktop and phone versions plus a short-laptop validation layout. Include reduced-motion presentation and an animatic or interactive motion demonstration for the key transitions.

### Required fixtures

New student, guest, unsupported class, long Kreyòl title, complex math, missing explanation, no mapped practice, video failure, slow save, queued save, save rejection, partial/ungraded response, no due review, account switch, keyboard-only navigation, and reduced motion.

### Asset package

- Approved subject cover family and genuine instructional preview choices.
- Shared visual tokens and reusable control/state treatments.
- Motion timing sheet and transition storyboards.
- Export specifications and accessible equivalents for informative art.
- A content inventory identifying missing explanations or unusable source material.

Do not begin a large asset-production batch before the connected prototype establishes the visual direction.

## 17. Delivery sequence

### Phase A: validate existing behavior

Capture current task flows in the browser, map data contracts and route behavior, identify usable content fixtures, and reproduce audit findings. Separate current source from stale local builds and production behavior.

### Phase B: design the connected prototype

Produce key screen compositions, confirm the learning hierarchy, storyboard motion, and test the complete journey with representative students. Review visual craft and comprehension together.

### Phase C: implement a bounded vertical slice

After implementation is separately requested, connect one real course to its valid practice, correction, and progress flow. Reuse existing services and rules. Include failure and accessibility states in the slice.

### Phase D: validate and expand

Run regression and device scenarios, compare baseline task observations, then expand across supported subjects and content types. Keep unresolved content gaps visible in the delivery inventory.

## 18. Release acceptance scenarios

| ID | Scenario | Pass condition |
| --- | --- | --- |
| QA-01 | Returning student resumes a lesson | Correct lesson opens; position is restored or limitations are stated accurately |
| QA-02 | New student has no history | Real suitable starting option; no invented progress |
| QA-03 | Student's class is unsupported | Coverage explained; explicit valid alternative |
| QA-04 | Valid lesson-to-practice handoff | Context preserved; no unnecessary reconfiguration |
| QA-05 | Stale or missing practice mapping | Honest scope explanation; useful choice |
| QA-06 | Answer correction | Response, result, and available explanation are clear |
| QA-07 | Partial or ungraded answer | Correct status retained; no false final grade |
| QA-08 | Slow/offline completion | Pending is distinct from confirmed; no premature celebration |
| QA-09 | Retry or duplicate tap | No duplicate progress, rewards, or analytics outcomes |
| QA-10 | Account change during pending work | No other student's data or late feedback appears |
| QA-11 | Review and progress | Existing evidence reconciles; no invented mastery |
| QA-12 | Keyboard-only journey | Search, outline, answers, help, results, and exits remain usable |
| QA-13 | Phone, short laptop, zoom, long strings | No essential content or action clipped or covered |
| QA-14 | Reduced motion and silent use | Same information and task completion without decorative motion or audio |
| QA-15 | Back navigation and reload | Supported saved state recovers; unsupported transient recovery is not promised |
| QA-16 | Empty or failed data section | Other available actions remain usable and failure has recovery |

Design sign-off requires the visual system, motion, languages, state matrix, and responsive fixtures. Engineering sign-off requires authoritative-state correctness, scoped asynchronous responses, existing-rule preservation, and appropriate regression coverage.

## 19. Decisions to resolve before dependent implementation

| Decision | Proposed direction | Why it matters |
| --- | --- | --- |
| Home versus workspace responsibilities | Home for next action; workspace for broader planning | Avoid parallel competing dashboards |
| Progress destination | Reuse an appropriate existing surface with a compact journey summary | Prevent another disconnected dashboard |
| Lesson completion continuation | One contextual practice recommendation when valid; next lesson remains available | Connect learning without changing gates |
| Exact practice scope | Lesson-specific only when mapped; otherwise explicitly unit-wide | Prevent misleading content attribution |
| Session defaults | Reuse supported sizes and behavior first | Avoid accidental assessment changes |
| Guest continuity | Match actual limits and persistence; disclose save requirements | Avoid false cross-device recovery claims |
| Missing explanations | Inventory and author separately; retain an honest fallback | Content quality cannot be produced by layout alone |
| Baseline devices and performance budgets | Use existing website targets and establish a named test matrix | Keep visual ambition compatible with student access |

These are design and implementation decisions to resolve at the relevant stage, not reasons to delay documentation. No implementation, deployment, or production change is authorized by this PRD alone.
