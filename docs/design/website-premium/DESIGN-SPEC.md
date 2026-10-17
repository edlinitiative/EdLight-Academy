# Design specification — premium EdLight Academy website

Date: October 16, 2026  
Version: 1.0 proposed  
Companion: [Product requirements and acceptance criteria](PRD.md)  
Scope: website only; responsive browser layouts included; native app excluded.

## 1. Design concept

**A serious learning studio with an inviting competitive world.**

The learning side should feel composed, open, and human: strong lesson identity, excellent reading surfaces, purposeful spacing, and confidence about progress. The arena should feel like entering an EdLight competition: deep navy, distinctive school and Haitian geography artwork, energetic but restrained highlights, and immediate access to play.

Premium quality comes from deliberate composition and consistency. A large gradient, a glass panel, or a particle effect is not a substitute for content, hierarchy, or a reliable interaction.

### Recognizable signatures

- Existing EdLight logo and rays, preserved rather than approximated.
- Marine ink, bright blue actions, warm coral used sparingly for competitive entry.
- Source Sans 3 for readable content; Plus Jakarta Sans for selected display headings.
- Carefully designed course covers and mode artwork with consistent composition.
- A clear next step and a visible relationship to the student's actual activity.

### Design constraints

- Avoid defaulting to a white rounded card around every block of text.
- No more than two nested bounded surfaces in a primary task; question/answer grouping is functional, not decorative nesting.
- No tiny uppercase labels for critical instructions, timer state, or grading caveats.
- No invented data, student testimonials, school crests, active players, awards, or approximate progress presented as confirmed.
- Do not use a decorative empty map/city as the largest useful region on an otherwise empty lobby.
- Do not render competitive answer correctness before rules permit disclosure.

## 2. Status and interpretation

Values below are proposed design tokens and layout constraints, not an assertion that current CSS already implements them. Map them onto existing semantic variables during implementation instead of introducing a parallel theme. The PRD governs behavior, rule changes, and data contracts; this document governs proposed presentation.

Reference compositions: 1440 × 900 desktop, 1280 × 720 laptop, and **1280 × 633 short laptop**; responsive views at 1024, 768, 390, and 320 CSS pixels. Designs must also survive 200% zoom and long FR/HT strings. Measurements are CSS pixels unless stated otherwise.

## 3. Foundations

### 3.1 Color

| Semantic token | Light learning | Dark learning | Arena | Use |
|---|---|---|---|---|
| `canvas` | `#F7F9FC` | `#0D1729` | `#091426` | Page background |
| `surface` | `#FFFFFF` | `#142239` | `#12223B` | Main task/content surface |
| `surface-muted` | `#EDF2F8` | `#1B2C46` | `#1B3152` | Secondary group/track |
| `ink-primary` | `#12213A` | `#F2F6FC` | `#F5F8FF` | Titles, questions, main text |
| `ink-secondary` | `#465873` | `#B9C7DA` | `#C1CFE4` | Supporting content |
| `ink-muted` | `#5A6B85` | `#9DAFC7` | `#A7BAD5` | Timestamps/metadata |
| `border` | `#DCE5F0` | `#344762` | `#365171` | Group boundaries, not sole control indicator |
| `action` | `#1558B8` | `#1558B8` | `#1558B8` | Filled primary button with white text |
| `action-hover` | `#114A99` | `#114A99` | `#114A99` | Primary hover/pressed |
| `link` | `#1558B8` | `#9DC4FF` | `#9DC4FF` | Links/text actions |
| `accent-coral` | `#FF5C39` | `#FF5C39` | `#FF5C39` | Sparse brand flourish/arena start |
| `accent-gold` | `#FFB92E` | `#FFB92E` | `#FFB92E` | Earned rewards/medal accent |

Use dark marine text on coral/gold fills; do not assume white text passes contrast. Subtle borders are acceptable for nonessential grouping; actionable input boundaries and focus must meet non-text contrast requirements independently.

| State | Light fill/ink | Dark fill/ink | Additional cues |
|---|---|---|---|
| Success | `#E7F7EF` / `#11643A` | `#173F31` / `#A4ECC7` | Check icon + explicit text |
| Warning | `#FFF3DC` / `#805000` | `#47371E` / `#FFDA91` | Warning icon + consequence |
| Error | `#FDEBEC` / `#A12232` | `#48232D` / `#FFB7C0` | Error icon + recovery |
| Info | `#EAF2FE` / `#174E96` | `#1A3458` / `#BED8FF` | Info icon + explanation |

These pairings are candidates. Measure actual composited states, opacity, hover/focus, and disabled text before release. Target text contrast ≥4.5:1, large text ≥3:1, essential non-text boundaries ≥3:1. Never infer compliance from hex values alone.

Learning uses the student's persisted light/dark preference. Arena uses its coherent competition palette; it must not overwrite the saved preference. Exiting the arena restores learning preference. Theme toggle behavior is explicit: in arena it can open an appearance explanation/control rather than promise a light arena that has not been designed. No transient light flash while entering a dark route.

### 3.2 Typography

Keep fonts self-hosted. Reuse available font files. Mathematical notation uses the existing math renderer with readable text equivalents where supported.

| Role | Family | Desktop size/line | Compact size/line | Weight |
|---|---|---|---|---|
| Marketing display | Plus Jakarta Sans | 48/56 | 34/41 | 750–800 |
| Page title | Plus Jakarta Sans | 32/40 | 27/34 | 700–750 |
| Section title | Plus Jakarta Sans | 24/32 | 22/29 | 700 |
| Lesson/question title | Source Sans 3 | 24/34 | 21/30 | 600–700 |
| Long question/passage | Source Sans 3 | 20/31 | 18/28 | 400–500 |
| Body | Source Sans 3 | 17/26 | 16/25 | 400 |
| Answer option | Source Sans 3 | 18/27 | 17/26 | 500 |
| Control | Source Sans 3 | 16/22 | 16/22 | 600 |
| Supporting text | Source Sans 3 | 15/22 | 14/21 | 400–500 |
| Metadata | Source Sans 3 | 14/20 | 13/19 | 500 |
| Optional eyebrow | Source Sans 3 | 12/17 | 12/17 | 700 |
| Competitive score | Plus Jakarta Sans | 48/52 | 36/42 | 750 |
| Timer | Source Sans 3, tabular numerals | 22/28 | 19/25 | 700 |

No essential instruction below 14px. Eyebrows may use uppercase with 0.06em tracking; prose and controls use sentence case. Use tabular numerals for clocks, ranks, counters, and changing scores. Geist Mono is optional for room codes, not an aesthetic default for every label.

Reading measure: 60–75 characters for prose; question column target 680–820px. Do not shrink content to fit one line. Long course/paper titles wrap; only secondary breadcrumbs may truncate with a full accessible name.

### 3.3 Spacing, shape, and depth

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Content padding: 32px desktop main surface, 24px compact, 16px phone browser.
- Section gaps: 48px browsing pages, 32px workspaces, 24px compact task surfaces.
- Component gap: 12–16px; related label/helper gap 4–8px.
- Radius: 8px small controls, 12px buttons/inputs/options, 20px main bounded surfaces; pill only for compact tags, not every CTA.
- Border: 1px semantic border; focus/selected treatment uses an additional 2–3px ring/outline without layout shift.
- Shadow: subtle surface separation, e.g. `0 8px 24px rgba(15,30,56,.06)`; raised dialog `0 24px 64px rgba(0,0,0,.22)`.
- Hover lift limited to navigable covers/mode cards, ≤2px; no lift for paragraphs, answer options, or entire forms.
- Avoid text glows and stacked heavy shadows in normal reading surfaces.

### 3.4 Grid and breakpoints

| Width | Outer gutter | Layout |
|---|---|---|
| ≥1280 | 48px, max content 1280px | 12 columns, 24px gaps; 3-column rail + 9-column content or 8+4 overview |
| 1024–1279 | 32px | Content + 280px rail where useful; collapse nonessential panels |
| 768–1023 | 24px | 8 columns; optional outline drawer; overview stacks if readability needs it |
| 480–767 | 20px | Single column; task utilities collapse, never the primary action |
| <480 | 16px | Single column; full-width task and compact sheets |

Switch based on content fit, not device names. A focused question column may remain narrow on a wide screen; surrounding whitespace is intentional when it improves concentration. A large decorative region with no useful action is not.

### 3.5 Motion and sound

| Interaction | Duration | Treatment |
|---|---|---|
| Button/selection state | 100–150ms | Color/opacity, no bounce |
| Drawer/dialog | 180–240ms | Small translation + fade; respect focus |
| Question transition | 120–180ms | Short crossfade; maintain reading position |
| Confirmed reward | 400–700ms once | Small contained burst, then static state |
| Rank change | 250–400ms | Animate only confirmed movement; retain numeric/text outcome |

Reduced motion removes displacement, counting animations, parallax, and particle effects. Every result must be immediately understandable in a static frame. No screen requires waiting for animation to act. Sound is off until explicitly enabled; persist the choice. Live timer correctness never depends on animation frames.

## 4. Application shells

### Browsing shell — WEB-01, WEB-05

Header 72px desktop / 60–64px compact. Logo left, five primary destinations centered when space permits, utilities right. Keep one clear account CTA for guests; secondary sign-in remains a text action. Avoid a second primary nav row on desktop.

Language is accessible from header/account utilities and footer, not exclusively at the bottom of a long page. Search has a labeled icon control; notification badge is a count with an accessible unread label. Profile menu holds settings and progress links.

For narrow browser layouts, use one existing navigation pattern consistently. Do not show both a full bottom navigation and a redundant hamburger hierarchy with identical destinations. Retain current bottom navigation if it passes usability checks; show a utility drawer for additional items. Native app navigation is unaffected.

### Focused learning/practice shell — WEB-01, LEARN-02, QUIZ-03

Use a compact 56–64px task header: back to course/unit, readable context, optional progress. Remove marketing footer, app-install promotions, search popover launchers, global notification interruptions, milestone modals, and floating assistant. A deliberately invoked learning aid can be a contextual action if supported; it never floats over answers.

Exiting practice/quiz explains loss only if actual unsaved state will be lost. Returning from a lesson keeps the course/outline context. Back behavior is a labeled product action, not an ambiguous icon with unknown destination.

### Exam/competitive shell — EXAM-03, ARENA-07

Full task context replaces the marketing header. Persistent timer/receipt and exit/submit controls; no promotional or social overlays. Protected competitions expose no assistant route or answer preview. Essential warnings occupy reserved compact space rather than repeatedly shifting the question.

Focus stacking order: task content < sticky header/action rail < temporary panel < modal dialog. Centralize semantic layers; do not solve overlap with escalating arbitrary z-index values.

## 5. Screen specifications

### S01. Public home and signed-in home

Requirements: WEB-02–05.

**Public:** 7+5 editorial hero. Left: program/audience, one strong benefit heading, two short supporting lines, primary guest-start CTA plus secondary account action. Right: a working sample question or carefully curated lesson preview with clear sample labeling. Show verified coverage beneath. Avoid a wall of counters competing with the first action.

Next sections: choose subject/class → explain video/practice/exam connection → school competition preview → trust/help/footer. Use actual nonprofit identity and program facts, not invented social proof. Every featured unavailable subject is visibly labeled.

**Signed in:** greeting is modest; main region is “Continue…” with real lesson/paper context and one action. Secondary region offers due review or neutral practice start. Progress summary is small and explains the measure. Arena invitation is lower priority unless an explicitly joined event needs action.

**Empty account:** ask class once with a skip option; show a real available starting course. No fabricated percentages or diagnostic weakness. Auth/grade collection does not interrupt an active task.

### S02. Course catalog

Requirements: LEARN-01, WEB-04.

- Page title and useful coverage statement; class and subject controls on one clear row.
- Course collection uses consistent subject cover art and readable course names; module/lesson counts below, availability last.
- Prefer 3 cards at wide desktop, 2 compact, 1 phone. A course is a navigable item with one primary link, not nested conflicting click targets.
- Class selection affects only supported content; unavailable state offers actual neighboring coverage without silently changing class.
- Returning from overview restores filters and scroll position.
- Loading uses stable cover/text skeletons. Empty search differs from unavailable class. Retry preserves filters.

### S03. Course overview

Requirements: LEARN-01, LEARN-06.

Desktop 7+5: title, two-to-three concrete outcomes, verified coverage/language, start/resume; curated preview cover to the right. Below: readable module outline with current/complete states and actual lesson types. One dominant start/resume; practice is secondary.

The hero cover uses a clean image/frame or designed subject composition. No exposed software menu or incidental editing palette when a better valid frame exists. Do not hide poor in-video production behind a misleading cover; record content remediation separately.

Long descriptions use progressive disclosure after a complete meaningful paragraph, never an abrupt ellipsis after a generic sentence. Unknown duration is omitted; teacher identity only appears when verified.

### S04. Video lesson workspace

Requirements: LEARN-02–07, WEB-01.

Desktop composition:

```text
Task header: ← Course name                    Lesson 2 of 6
---------------------------------------------------------
Lesson title + short unit context        | Course outline
                                         | Current lesson
16:9 player, responsive width             | Other lessons
                                         | Unit test
---------------------------------------------------------
Actual playback/completion state          | Outline remains
Summary / available resources             | independently usable
Primary next lesson or practice action    |
```

- At ≥1280: content `minmax(0,1fr)` + 304–320px outline, gap 32px. At 1024: outline 280px or collapsed if player readability suffers.
- Title precedes the player; concise state and continuation follow. Keep ancillary notices out of the title line.
- Player uses 16:9 for ordinary video; respect different source ratio when needed. No forced viewport-filling player that hides every lesson action on a short laptop.
- Outline is sticky below task header when it fits; its own scrolling is keyboard reachable and never traps page scroll. Current item is explicit with text/icon, not color alone.
- Below 1024: outline becomes a labeled drawer/sheet; current lesson remains visible outside it. Opening/closing restores focus.
- Resources appear only when present. No empty “Notes/Transcript/Downloads” tabs suggesting capabilities that do not exist.
- Completion next-action region sits in document flow, not an overlay over the video.

**Provider constraints:** keep lawful/provider-supported YouTube controls. Standardize framing and surrounding interaction instead of promising a fully white-label player. Exact resume notice: “Reprise à 04:12” only when restored; unsupported position uses short factual copy plus current lesson continuity. Caption availability and media language are visible when relevant.

**Media failure:** compact panel in player bounds: “La vidéo n’a pas pu se charger” + retry; available lesson text/practice below remains usable. Do not claim video is available offline without an actual download path. Long buffering preserves last known position and controls where supported.

### S05. Practice and quiz setup

Requirements: QUIZ-01–02, QUIZ-07.

Maximum content width 1120px. Page header → one scope selector (subject, class, unit) → one two-option mode switch → concise rules → one primary start action. Show actual question pool/deck size; if only 7 valid questions exist, label 7 before starting.

For personalized accounts, show one small “Questions à revoir” recommendation based on real review data. It is an alternative entry, not an additional full session configurator.

Chapter list sits below setup. Each row names chapter, availability, and one contextual action/menu; selecting a row updates or starts that chapter predictably. No separate sidebar with duplicated mode/length/start controls.

Default recommended layout:

```text
Pratiquer
Matière [Maths]  Classe [NS IV]  Chapitre [Fonctions]

[ S’entraîner ] [ Faire un quiz ]
One short statement of retry, timing, and score/save policy
[ Commencer ]

Chapitres / questions due (real data)
```

Loading disables start with “Chargement des questions…” and stable layout. Empty appears only after a successful load confirms no valid content; offer change unit. Failure offers retry, not “0 questions.”

### S06. Practice/quiz question

Requirements: QUIZ-03–04.

- Reading column 720–800px with compact task header.
- One progress element for finite quiz; free practice has no fictional total.
- Unit context small; question 22–24px for short stems, 18–20px for long passages.
- Options are full-width interactive rows, minimum 56px height, 12px gaps; text wraps naturally. Selected state: outline + filled indicator; hover is neutral, not selected-blue.
- One attempt indicator near feedback, not duplicated above and inside the question.
- Check disabled until a valid answer; helper explains why where needed. Verification does not automatically move to next question.
- After check, feedback occupies a stable region beneath answers. Primary action becomes Retry or Continue according to actual rules.
- Primary action is visible without scrolling for a short four-option fixture at 1280 × 720. At 633px height or long content, preserve readability and intentional scrolling; never cover options to satisfy a screenshot constraint.
- Compact action rail may be sticky only if safe-area padding and scroll clearance prevent overlap. Sticky height target ≤72px.

**Feedback examples:** correct = check + “Bonne réponse” + concise explanation. Wrong with attempts left = “Pas encore” + useful hint + Retry. Exhausted = show expected answer and explanation + Continue. Do not celebrate a retry-assisted answer as first-attempt success.

### S07. Quiz result and review

Requirements: QUIZ-05–06.

One score headline with explicit definition, e.g. first-attempt accuracy **only after D-03 resolves calculation**. Supporting measures can show eventual correct and hints used if recorded; do not invent historical detail.

Primary CTA Review mistakes if any; otherwise continue relevant learning. Replay is secondary. Small per-question review list contains stem, student's answer where available, expected answer, explanation, and hint usage if known. Preserve question order/context.

Guest save limitation is a useful sentence and optional sign-in link, not a blocking modal over the result. No exaggerated full-screen celebration for every quiz.

### S08. Exam catalog

Requirements: EXAM-01, EXAM-09.

Header: title + level/track context; results/history as secondary utility. One filter row for subject/year/session with search; collapse advanced filters if crowded. Show active filter chips and clear-all.

Primary catalog uses readable rows, not repeated giant featured cards. Each row includes subject/title, session/year, track/version distinction, actual duration/points, and status. One clear destination: “Voir l’épreuve” when opening overview; “Reprendre” for a valid draft. Do not label navigation to overview “Start” if the clock does not start there.

A small recommended/resumable paper can lead if supported by actual context. Calculator is a secondary tool link/disclosure. Similar paper names must expose source distinctions; uncertain duplicate records go to content review.

At narrow widths, rows become stacked items preserving identity, duration, and status. Table headings never become the only way to interpret a value.

### S09. Exam overview and preview

Requirements: EXAM-02.

Desktop 8+4 within 1120px. Left: breadcrumbs, complete paper title, source/track/year, concise metadata, section outline, sample/preview. Right: one action surface with Begin/Resume and a short timing/save statement. Sticky action surface only when shorter than available viewport.

Critical pre-start information fits into three readable items: time behavior, save policy, correction limits. Detailed instructions are available before beginning. Preview uses paper content without starting the clock; entering an already active attempt obeys its current timing contract.

Restart is a secondary destructive action with confirmation describing replaced draft/history behavior. Never use the same visual emphasis for Resume and Restart.

### S10. Exam-taking workspace

Requirements: EXAM-03–06, EXAM-08.

Desktop: task bar 64px → compact persistence strip 28–40px when needed → navigator 224–240px + question column up to 880px. Short laptop header plus strip target ≤104px, not a 165–227px permanent block.

Task bar: exit with label, short paper identity, answered count, tabular timer, Submit. Full title remains accessible. At narrow widths use two compact groups without truncating the clock or Submit.

Navigator: section labels, question indexes, current outline, answered state, optional flags only if implemented. Provide a readable list alternative when grids become dense. Current question change moves focus to heading and scrolls below sticky header. Do not renumber ambiguous sections without retaining section context.

Question surface: section instructions once where appropriate, question number/points, full stem, media/math, labeled inputs, then Previous/Next. Answer fields embedded in a sentence must preserve reading order and accessible labels. Long questions scroll naturally. Math overflow uses a localized scroll region or equivalent readable layout; the entire page must not overflow horizontally.

Persistent save text is compact: device-only / saving / account-saved / pending / failed. Only failures and offline constraints need a stronger banner. Use precise status, not repeated long warnings.

Hints/immediate correction controls appear only under the chosen exam mode. If immediate feedback makes an attempt practice rather than exam simulation, label that distinction before start and in results; preserve current policy pending review.

**Leave:** show a dialog only when needed to communicate actual progress/time consequences. **Expiry:** prevent further accepted edits under current contract, show submitting/uncertain state, and reconcile final outcome. Never freeze a decorative clock while server time continues silently.

### S11. Submission review and exam results

Requirements: EXAM-06–07.

Submission review is a focused dialog or full page on narrow browsers. Title, answered/unanswered counts, grading consequence, links to missing answers, primary Confirm submission, secondary Return to paper. No preselected irreversible checkbox or ambiguous “OK.”

Submitting: explicit pending text, disabled duplicate trigger, retained entered data. Timeout: “La confirmation prend plus de temps que prévu” with safe check-status/retry according to server contract; not a new attempt.

Result hierarchy:

1. Paper identity and final/provisional status.
2. Earned/possible points and score definition; manual evaluation scope if relevant.
3. Primary review action and one supported practice recommendation.
4. Per-question/section correction with student answer, awarded points, expected answer, explanation, and grading status.
5. History/retake/export actions only where supported.

Use compact visual summaries, not multiple large circular meters of the same percentage. “Unanswered,” “incorrect,” “partial,” “pending,” and scaffold-supported outcomes keep distinct wording. A small sample of questions is not labeled a general weakness without evidence.

### S12. Arena lobby

Requirements: ARENA-01–02, ARENA-11.

Continuous navy shell across competitive destinations. Hero height target 320–400px on 900px-tall desktop; adapt shorter for 633px laptop so a playable mode/action is visible without scrolling. Header remains recognizably EdLight, using the arena palette.

Composition: title + concise competitive promise + primary Quick play + secondary Continue story/Join code. School/player strip is compact at right or beneath, containing actual school identity/progress. Do not make “choose school” the largest call to action for a guest seeking casual play.

Mode section immediately follows/overlaps hero without turning into a separate visual website. Six modes where supported: story, quick play, mini-games, duel, private room, championship. Distinct art, short mode label, actual rules, one action. A scheduled championship gets a date/status rather than a misleading Play button.

City/school visualization is a secondary progressively enhanced scene. With zero schools, show a compact illustrated invitation; do not reserve 300px of blank skyline. Demonstration data has a persistent visible “Démo” label and cannot mix with real rank counters.

Mode art should depict the game: real Haitian map for story; question/energy motif for quick play; opposing identities for duel; code/participants for room; stage/spotlights for championship. A generic icon centered on a large gradient is a fallback, not finished art direction.

### S13. Trivia setup, play, result

Requirements: ARENA-03, ARENA-07–09.

Setup uses arena shell, one selected mode, actual question/time rules, primary mixed-theme Start, and compact optional theme tiles. Do not insert a second large marketing hero between mode selection and play. Theme artwork and language are consistent with lobby.

Play centers the question, answers, meaningful progress, and timer if enabled. Keep timer outside the text measure; do not let urgent color overwhelm reading. Selected ≠ received ≠ correct. Solo feedback can disclose immediately; live modes follow authoritative disclosure rules.

Results show personal outcome first, verified XP/reward second, actual school contribution if supported, and final/provisional rank only for its defined competition. Replay and change theme remain within the game world. Sound/reward animation is optional and never blocks action.

### S14. Story map and stages

Requirements: ARENA-04.

Map is accurate and legible; stage detail panel shows chapter name, actual stars/unlock condition, next stage, and Start. Provide list mode with identical actions and progress. Locked nodes explain requirements on focus/click, not hover alone.

Desktop map + 320px stage panel; tablet stacks; phone uses list-first or a fit-to-region map with explicit zoom controls if needed. No mandatory precision dragging. Stars have textual equivalent. Returning from result selects the actual completed/next stage without losing context.

### S15. Duel/private room

Requirements: ARENA-05, ARENA-08.

Entry: Create room / Join code. Input accepts supported formatting and explains errors inline. Room code is selectable text plus copy action; successful copy uses a short status, failed copy leaves text accessible.

Lobby shows room identity, actual participants, readiness, host, capacity, and concise start rules. Pending/ready/left/reconnecting states are explicit. Invite controls do not automatically send messages to others. Existing host permissions remain authoritative.

On host loss, full/expired room, or unsupported join, explain state and offer a supported next action. Countdown cannot imply a start until accepted state is known. Avoid empty animated avatar circles as simulated participants.

### S16. Championship and boards

Requirements: ARENA-06–09.

Registration surface: event title, schedule/timezone, eligibility, verified prizes/rules, confirmed registration state, one primary next action. Keep forms focused; preserve entered data through recoverable errors. Prize claims/parental consent links remain compatible with current flows and rules.

Live waiting: named event, actual connection state, actual round/doors status, and next expected action. Do not show “Live” for merely scheduled events. Last-update age is visible when data is stale.

Answering: large readable question, timer, choices, one explicit submission interaction per existing mode. Receipt rail keeps selected/pending/received/rejected/unknown distinct. No confetti on mere selection.

Board: scope control distinguishes school/person/event; columns name score/XP/points appropriately. Top ranks may have modest special treatment, but the student's row remains findable even outside the top list. Qualification and provisional results are visible. Unknown/no rank is “Pas encore classé,” not rank 0.

Broadcast `/direct` remains a separate presentation mode. Link to it where useful; do not apply desktop task styles to the projector stage without a separate review.

### S17. Notification inbox

Requirements: NOTIF-01–03.

Desktop: right-side 420–460px dialog drawer, full-height with margins/safe inset. Header: Notifications, settings link, close. Tabs All/Unread; Reminders is a linked section or secondary tab without hiding inbox. Phone: full-width sheet/page with clear back/close.

Rows: event icon/art, meaningful title, two-line preferred body that can expand, relative time + exact accessible timestamp, unread indicator, contextual action. The row's main destination and read/menu controls are separate valid targets; never nest buttons inside links.

Group Today/Earlier with correct locale. Mark read leaves item in All. Mark all read reports partial failure honestly. Pagination/load-more preserves focus and order. Empty All: calm “Aucune notification pour le moment.” Empty Unread: “Tout est à jour” with All available; no large celebratory illustration.

Unavailable destination: retain event context and offer relevant course/event listing rather than a dead end. Legacy English text remains safely readable while future generation is localized; do not pretend old text has a reviewed translation.

### S18. Reminder editor and notification preferences

Requirements: NOTIF-04–05, NOTIF-07.

Editor fields: label/activity (optional scope), date or recurring days, local time, timezone, channels. Defaults are visible but not saved until Confirm. Preview sentence states exact schedule: “Lundi, mercredi et vendredi à 18:00 — America/Port-au-Prince.” Use the user's actual selected timezone; never infer from language alone.

Define DST behavior with engineering: retain local wall time for recurring study reminders; specify one-time ambiguous/nonexistent time resolution before save. If backend cannot support it, limit exposed scheduling capability explicitly.

Reminder list shows next run and recurrence, enabled/paused state, edit, pause/resume, delete. Delete confirmation can be lightweight with undo if supported; failure restores prior state.

Preferences separate channels and categories. Browser permission granted does not mean server subscription succeeded; show actual subscription capability. Permission denial gives concise instructions. Test push is secondary diagnostic UI, not the primary settings CTA.

## 6. Component contracts

Each component needs default, hover, focus-visible, active, disabled, pending, error, long-string, FR/HT, light/dark/arena, and narrow-width variants where relevant.

| Component | Anatomy and behavior |
|---|---|
| Button | Label mandatory for primary action; optional leading/trailing icon. Minimum 44px height; 48px preferred. Pending preserves width and exposes progress text. One primary per decision region. Destructive variant reserved for real loss. |
| Icon button | ≥44×44 target; accessible label and visible focus; tooltip supplementary. Never icon-only for Submit/Begin exam. |
| Text link | Underline in prose; focus distinct from hover; useful destination name. Opening external media is identified where relevant. |
| Input/select | Persistent label, value, helper, error. Minimum 48px height. Errors associated via description; no placeholder-only label. Avoid destructive dependent resets without warning. |
| Segmented control | Two-to-three mutually exclusive choices; semantic radios/tabs appropriate to function. Selected text/icon/background; arrow-key behavior. |
| Answer option | Full-row hit target, label/letter, wrapped content, state icon/text. Selected, submitted, wrong, correct, disabled, and unknown are separate. Radio semantics for single choice. |
| Progress indicator | Actual current/total or actual percentage with label. No faux loading percent. Linear by default; rings reserved for compact earned outcome where useful. |
| Timer | Tabular numerals, explicit remaining/elapsed context, accessible updates at meaningful thresholds rather than each second. Critical state text/icon, not red alone. |
| Save/receipt status | Text + small icon; device/pending/confirmed/failed/unknown. Live region updates on material change. Never inferred from click alone. |
| Course/mode cover | Predictable ratio, authored art, text outside image where possible; accessible name from title. Decorative art alt empty; informative diagrams get equivalents. |
| Status tag | Concise true state. Informational by default; not shaped like a button unless interactive. |
| Question navigator | Current/answered/unanswered distinct; accessible names include question number and state; section context retained. |
| Notification row | Event context, timestamp, unread status, destination, overflow/read action. Read state persists in All. |
| Empty/error view | State-specific headline, short reason, one recovery action, optional small art. Do not reuse “nothing here” for network errors. |
| Dialog/drawer | Named heading, close, focus trap, initial focus, Escape policy, return focus. Critical confirmation uses deliberate primary action. Background inert. |
| Skeleton | Reserves final dimensions; hidden decorative parts; parent accessible loading state. No repeating spoken placeholders. |

### Layer and scroll rules

- Sticky headers and action rails reserve scroll clearance. Focused inputs and question headings must not be hidden beneath them.
- Dialog opening locks background scroll without shifting layout. Closing restores scroll and focus.
- Only one blocking dialog at a time; queue nonessential milestones until the task ends.
- Browser back behavior is specified per journey; dialogs do not strand students in an ambiguous history state.
- Native browser dialogs are replaced in student flows with the shared accessible components; admin redesign remains out of scope.

## 7. Feedback placement and duration

| Situation | Pattern | Duration/action |
|---|---|---|
| Invalid answer/input | Inline field/question feedback | Until corrected; focus stays near task |
| Correct/wrong practice answer | Inline feedback region | Until Continue; authored explanation readable |
| Copied code/saved preference | Nonblocking status/toast | ~5 seconds with equivalent persistent state where needed |
| Failed save/connection | Persistent banner/status adjacent to task | Until resolved/dismissed when safe; Retry/Details |
| Irreversible submission/restart | Dialog/full narrow page | Explicit confirm/cancel |
| Earned completion | Inline result + optional short celebration | Immediate actions, no mandatory delay |
| Live received/rejected/unknown answer | Persistent receipt rail | Until authoritative transition; no disappearing toast |

Toasts: desktop near lower-right only outside task control regions; compact browser above safe area. Max two noncritical visible, deduplicate repeated messages. Errors needing action do not auto-dismiss. Screen-reader announcements are polite except genuinely urgent blocking conditions; avoid repetitive assertive updates.

## 8. State matrix

All anchor designs must include these variations, not only populated happy paths.

| State | Learning/practice | Exams | Arena | Notifications |
|---|---|---|---|---|
| Loading | Stable outline/question skeleton | Catalog/paper skeleton | Real loading status; no fake standings | Row skeleton + loading label |
| Empty | No valid unit + change scope | No matching papers + clear filters | Compact invitation + valid play | Empty All vs empty Unread |
| Guest | Real preview/access limit | Device/account save policy | Casual play + optional school | Sign-in benefit if required |
| Offline | Available text; video constraints | Draft retained; timer policy explicit | Reconnect; no accepted claim | Cached list labeled; queued/failed action |
| Failure | Retry preserving scope | Preserve answers; safe reconcile | Reason + correct recovery | Preserve editor/read state; retry |
| Restricted | Actual account/content gate | Actual unavailable mode | Eligibility/room restrictions | Disabled channel with explanation |
| Pending | Playback/feedback operation | Saving/submitting | Selected/submitting/unknown receipt | Preference/reminder/read mutation |
| Complete | Next useful lesson/review | Final/provisional correction | Personal result/replay | Read retained; action outcome |
| Stale | Last known progress labeled | Conflict/latest draft handling | Last confirmed state/time | Refresh/load error without false empty |

## 9. Language and editorial specification

### Voice

Warm, precise, respectful. Use consistent direct address in each language, with reviewed FR/HT educational vocabulary. Avoid guilt, exaggerated praise, vague technical language, and empty urgency. Public French currently mixes `tu` and `vous`; proposed baseline is `tu` for student-facing website copy, subject to editorial review. Legal/formal consent copy may retain appropriate formality.

Every critical template requires review by a competent Haitian Creole speaker; example HT below is a draft, not final approved translation. Store strings centrally with typed parameters and plural rules. Dates/numbers use correct locale and timezone. Content language may differ from interface language and must be labeled.

### Message anatomy

Title: what happened or what is useful. Body: specific verified context. CTA: precise next action. Push aim ≤45-character title / ≤100-character body where possible, with no essential information dependent on truncation. Email/inbox can carry more context. Do not enforce character limits that break clear FR/HT phrasing.

| Intent | French draft | Kreyòl draft | Destination/data condition |
|---|---|---|---|
| Resume | **Reprends les fonctions** — Tu as terminé 3 leçons sur 5. Continue avec les variations. | **Kontinye etidye fonksyon yo** — Ou fini 3 leson sou 5. Kontinye ak varyasyon yo. | Exact lesson; real completed/total values |
| Review | **4 questions à revoir** — Reprends les exercices de chimie que tu as manqués. | **4 kesyon pou revize** — Repran egzèsis chimi ou te rate yo. | Review filter; real due count |
| Saved | **Tes réponses sont enregistrées** | **Repons ou yo anrejistre** | Only after account persistence acknowledgment |
| Pending save | **En attente de connexion** — Tes réponses restent sur cet appareil. | **N ap tann koneksyon an** — Repons ou yo rete sou aparèy sa a. | Only if local retention actually succeeded |
| Event reminder | **Ton championnat commence à 18:00** — Retrouve les règles et ta salle. | **Chanpyona ou a ap kòmanse a 18:00** — Gade règ yo epi antre nan sal ou a. | Registered event; actual timezone shown in expanded context |
| Readable failure | **Impossible d’enregistrer pour le moment** — Garde cette page ouverte et réessaie. | **Nou pa ka anrejistre pou kounye a** — Kite paj sa a ouvè epi eseye ankò. | Recovery verified; no false claim data is safe |

One emoji at most in optional casual message copy; none required. Do not use guilt-based streak-loss copy as the default. Never promise a “2-minute quiz,” specific bonus, peer count, or restored position without supporting configuration/data.

### Email and push

- Same event intent/template parameters; channel-appropriate formatting.
- Email max content width 600px, readable 16px body, restrained header/logo, one primary CTA, plaintext alternative, preferences link.
- No image-only instructions; images need alt text and text fallback.
- Message CTA restores exact supported context after login; expired events get appropriate fallback.
- Operational and promotional categories follow PRD D-07; OS permission is separate from subscribed channel state.

## 10. Asset specification

| Asset | Deliverable | Rules |
|---|---|---|
| Course cover system | Four core subject compositions plus valid level variants; 16:9 master | Real subject identity, restrained type, clean frames, no unrelated stock classroom promise |
| Lesson posters | Curated source frames or subject fallback | No accidental menus where avoidable; do not imply a rerecorded lesson |
| Arena mode art | Story, quick play, mini-game, duel, room, championship family | Consistent composition/light direction/detail; meaningful at small sizes |
| School city | Scalable buildings/state variants, compact empty scene | Based on actual state; no invented school crests |
| Map | Accurate Haitian departmental geometry with list equivalent | Preserve actual geography; accessible labeling |
| Empty states | Small neutral illustrations for no progress/inbox/search | Optional, lightweight; action remains dominant |
| Rewards | Restrained earned-state icons/motion | Only display confirmed rewards; static reduced-motion equivalent |

SVG for simple code-native graphics/icons/maps; optimized AVIF/WebP with fallback for raster covers. Responsive image sources, explicit dimensions, lazy loading below fold, meaningful alt text. Proposed budgets: course thumbnail ≤60KB, hero/mode raster ≤150KB, optional illustration bundle ≤300KB per route before interaction. Validate visual quality and network constraints rather than blindly hitting bytes.

Reuse established icon family with consistent stroke/optical weight; do not mix emoji, unrelated filled icons, and line icons as equivalent navigation symbols. Asset naming/manifest records source, usage, rights, dimensions, alt behavior, and fallback. No new asset generation is included in this written specification.

## 11. Accessibility and constrained-use detail

- Semantic landmarks/headings; one page h1; skip link goes to meaningful task content.
- Visible focus outline ≥2px with adequate contrast and offset. Essential interactions use native semantics where possible.
- Minimum target 44×44px for primary/timed actions, never below applicable WCAG target requirements. Allow spacing to prevent accidental answer selection.
- Radio answers: group label, per-option name, selection state, arrow/space operation. Check is a separate deliberate action unless the mode explicitly defines immediate submission.
- Dialogs trap focus, restore focus, and label heading/description. Modal content remains reachable at high zoom.
- Timer announcements at start, approved meaningful thresholds, and expiry; not every second. No unreviewed change to assessment timing to solve accessibility; document accommodations separately where applicable.
- Math/figures/tables have appropriate structure and equivalents. Test actual screen-reader math behavior; visual KaTeX alone does not establish accessibility.
- Correct/wrong/selected/pending distinguish shape/text/icon as well as color.
- Honor reduced motion and prefer low-data behavior where detectable or user selected. No autoplay audio/video.
- Usable at 320px reflow and 200% zoom; horizontal scroll limited to genuinely two-dimensional content with clear access.
- Error summary links to affected inputs for multi-field forms; field errors persist and describe correction.
- Network reconnection does not move focus or erase input. Text entry supports accents and avoids inappropriate autocorrect for formulas/codes.

## 12. Prototype and handoff package

### Required visual deliverables

1. Foundations sheet: semantic colors by theme, type, spacing, radii, elevation, icons, motion, focus.
2. Component library with variants listed in section 6 and clear state examples.
3. Anchor screens at 1440×900 and 1280×633: lesson, quiz setup/question/result, exam session/result, arena lobby/play/result, inbox/reminder editor.
4. Responsive variants at 768 and 390; 320 reflow/200% zoom verification frames for primary tasks.
5. FR/HT populated variants and long-content stress fixtures.
6. Clickable end-to-end prototypes for J1–J5 in the PRD, including failure/recovery branches.
7. Asset manifest and content remediation backlog, identifying work needed beyond UI implementation.
8. Screen-to-requirement annotations: routes, state sources, controls, keyboard behavior, actual versus proposed capability.

### Mandatory content fixtures

- Short and very long course/lesson titles in both languages.
- Video poster with/without valid source; buffering, blocked embed, unavailable exact resume.
- Four-option MCQ, true/false, numeric/text, multiline answer, matching, multipart stem, long passage, equation, table, figure, unsupported/manual grading.
- Quiz correct on first try, correct after retry, attempts exhausted, absent authored explanation.
- Exam guest/local state, confirmed account draft, conflicting draft, offline, expiry, uncertain submission, partial/manual result.
- Empty arena, dense populated board, unqualified school, unranked player, room full/expired, unknown answer receipt, stale live data.
- Empty/unread/read inbox, long message, deleted target, disabled/denied/unsubscribed push, reminder DST/timezone variants.

### Prototype evaluation

Use the tasks in PRD section 14. Ask participants to start and resume a lesson, take a quiz and explain their score, start/submit an exam, find a game and join a room, act on a notification and adjust a reminder. Record hesitation, wrong turns, interpretation of save/score states, and unassisted completion. Include native FR and HT review and browser users on constrained devices. Do not claim a small directional study proves learning effectiveness.

## 13. Implementation handoff constraints

- Begin from a fresh runnable source build; reconcile differences from audited `dist` before relying on screenshots.
- Map proposed semantic tokens to existing CSS variables; remove obsolete page rules only with verified scope. Do not add another global “premium overrides” stylesheet.
- Centralize shared controls/feedback while allowing distinct page compositions. Avoid rewriting course/scoring/arena services solely to apply visual changes.
- Keep external URLs, auth transitions, legacy routes, stored IDs, shared mobile contracts, and historical results compatible.
- Validate each new metric and status against an explicit source-of-truth mapping before displaying it.
- Add meaningful behavior/regression tests for answer loss, timing, scoring labels, receipt, read retention, and reminder scheduling. Simple visual changes need visual review rather than tests mirroring CSS.
- Use visual fixtures/screenshots with real content and actual state variants. A pristine happy-path mockup is insufficient for release.
- Stage by completed journey; unfinished new screens must not strand users between incompatible flows. Rollback restores UI without corrupting new or old records.

## 14. Design review scorecard

Score each dimension 1–5; a release anchor screen needs ≥4 in each and zero blocking correctness/accessibility defect. This is an internal review rubric, not a measured user satisfaction score.

| Dimension | A score of 4 or higher means |
|---|---|
| Hierarchy | Primary action/context obvious; no duplicated configurators or competing emphasis |
| Content craft | Clean covers, meaningful wording, exact math, useful explanation, credible metadata |
| Continuity | Return/resume/next behavior predictable; no misleading save or progress promise |
| Interaction | Pending/disabled/error/success states complete and responsive; feedback stays readable |
| Visual coherence | Shared type/control/state language, with deliberate learning/exam/arena composition |
| Accessibility | Keyboard, zoom, contrast, screen-reader semantics, motion/input alternatives verified |
| Responsiveness | Short laptop and phone browser retain readable content and reachable actions |
| Bilingual quality | Actual FR/HT strings reviewed; expanded content fits; no unexpected English |
| Performance | Optional art/media does not delay useful work; no disruptive layout shift |
| Trust | Score, rank, reward, save, receipt, and result status trace to actual evidence |

Approval should evaluate complete journeys and state transitions alongside static appearance. Final visual polish is complete only when the website remains composed and understandable while loading, reconnecting, failing, and recovering.
