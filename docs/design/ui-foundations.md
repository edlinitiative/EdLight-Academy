# UI foundations: components, states, accessibility

Status: P1 of the [premium product roadmap](2026-10-18-premium-product-implementation-roadmap.md)
(§1 consistent UI foundations, the accessibility parts of §4, §5 reading and touch comfort, §6 navigation and input).
It serves release requirements PRE-01, PRE-04, PRE-05, PRE-06, PRE-07 and PRE-08.

This page lists the one set of primitives each platform uses, how a data screen behaves in each state, and the accessibility rules. The tests at the end enforce them.
The visual language is unchanged: Limyè and Estil Klè on the learning side, the night stadium on the Arène side.
Never use left-border accent stripes or hero bands.

## 1. What to use for what

### Web (`src/`)

| Need | Use | Notes |
| --- | --- | --- |
| Action button | `.button` + `--primary` / `--secondary` / `--ghost` / `--danger` / `--light`, sizes `--sm` / `--lg` | One button system, defined at the end of `index.css`. Radius `--r-btn` (12px), heights `--btn-h-lg` / `--btn-h` / `--btn-h-sm` = 52 / 44 / 36. **One primary per screen.** Danger fill is #C62828 (white label 5.6:1). |
| Arène action | `.an-go` (primary) / `.an-ghost` | Night-stadium surfaces only (`body.arena-night`). |
| Card, tile, pill, row, meter | `src/styles/pf.css`: `.pf-card`, `.pf-tile`, `.pf-pill`, `.pf-rows` / `.pf-row`, `.pf-meter`, `.pf-head` + `.pf-eyebrow`, `.pf-link`, `.pf-btn` | Put `pf` on the page root. Colour runs on one `tone` axis (azure, amber, emerald, rose, violet, slate). Every tone is AA-tested. |
| Chips, filters, segmented switch | `<button aria-pressed>` inside `role="group"` + `aria-label` (e.g. `.cl-chip`, `.xp-seg`, `.sp-tabs`) | Chips and segmented switches stay pills. A single-choice set that behaves like radios uses `role="radio"` + `aria-checked` (e.g. Practice mode, quiz length). |
| Loading | `LoadingState` (`components/StateViews.tsx`) wrapping a **content-shaped** skeleton built from `Skeleton` / `SkeletonText` (`components/Skeleton.tsx`) | Gives one polite "Chargement…" announcement (`role="status"`, `aria-busy`). The blocks themselves stay `aria-hidden`. Without children it draws card rows. |
| Empty | `EmptyState` | `role="status"`. Always pass an `action`, because an empty view must not be a dead end. Use `headingLevel` to keep the outline in order and `page` when it replaces a page body. |
| Error | `ErrorState` | `role="alert"`. Pass `onRetry` (+ `retrying`) and an `action` as the way back. Pass `offlineTitle` / `offlineMessage` for honest offline copy; it switches on `navigator.onLine === false`. Use `compact` for one failed section on a page that still works. |
| Visually hidden text | `.sr-only` | For live-region labels. |
| Status text colour | `--danger-ink`, `--success-ink`, `--warning-ink` | The `-500` hues are for fills, icons and bars only. As text they fail AA: success is 3.1:1, warning 2.4:1, danger 4.2:1. |
| Secondary text | `--text-600` / `--text-500` / `--text-400` | All AA on every ground in both themes. `--text-300` is decorative only (rules, disabled glyphs), never words. |

### Mobile (`mobile/src/`)

| Need | Use | Notes |
| --- | --- | --- |
| Action button | `components/ui/Button`: variants `primary` / `secondary` / `outline` / `ghost` / `danger` / `success`, sizes `sm` / `md` / `lg` (40 / 48 / 52) | Built on `PressableScale` (spring + haptic). Real `disabled` and `loading` states. Filled variants use the `*Fill` tokens so white labels clear AA. |
| Pressable surface | `components/ui/PressableScale` or `ui/Card` (`onPress` + `accessibilityLabel`) | Card defaults to `accessibilityRole="button"` when pressable. |
| Page title, section header | `ui/PageTitle`, `ui/SectionHeader` | One title row, no hero band. |
| Segmented switch | `ui/Segmented` | |
| Search | `ui/SearchField` | |
| Loading | `StateViews.ListSkeleton` (list screens), `Skeleton` blocks for custom shapes, `LoadingState` for full-screen | The skeleton sweep stops under Reduce Motion. |
| Empty | `StateViews.EmptyState` with `ctaLabel` + `onCta` | |
| Error | `StateViews.ErrorState` with `onRetry` + `secondaryLabel` / `onSecondary` (the way back) | Offline (NetInfo) switches to "Tu es hors ligne / Ou pa sou entènèt" copy. |
| One failed section | `StateViews.InlineError` | Keeps the rest of the screen usable, e.g. the Leaderboard failing beside the Arène actions. |
| Colours | `useColors()` / `useTheme()` from `theme/theme.ts` | Status words and meaning-carrying icons use `dangerInk` / `successInk` / `warnInk` / `coralInk`. White-label fills use `azureFill` / `successFill` / `dangerFill`. |
| Motion | `useReduceMotion()` / `isReduceMotionOn()` (`utils/motion.ts`), `modalAnimation(reduce)` for every `<Modal>`, presets in `theme/motion.ts` | |

### Competition motion and sound (P2)

| Need | Web | Mobile |
| --- | --- | --- |
| Phase rules (one phase name, which cue a change earns, row movement, board lines) | `shared/competition/presentation.ts` | same file |
| Motion tokens | `arena-art/motion/tokens.ts` (`DUR`, `EASE`) = `--mo-*` on `:root` in `arena-art/motion/competition.css` | `theme/motion.ts` |
| Phase moments | `.mo-enter` (question/room), `.mo-phase` (phase label), `.mo-locked` (answer locked), `.mo-right` / `.mo-wrong` (reveal), `.mo-podium` (3rd → 1st), `.mo-delta` ("▲ 2") | `arenaMotion(reduce)` in `components/arena/arenaMotion.ts`: `enter`, `phase`, `reveal`, `reorder`, `podium(place)` |
| Standings reorder | `useFlipList` + `useBoardMoves` (rows travel 600 ms after the reveal: answer, then points, then standings) | Reanimated `layout={motion.reorder}` + `useBoardMoves` |
| Reduced motion | Every animation is declared only under `prefers-reduced-motion: no-preference`; `useFlipList({ reduced })` animates nothing | `arenaMotion(true)` returns `undefined` everywhere |
| Cues | "Sons" switch in Profile → Réglages, off by default, per device (`arena-art/sound`). Five cues: question opens, answer locked, correct, wrong, podium (`competitionCues.ts`) | Haptics (`arenaHaptics`, honours the Vibrations switch). No audio module in the native build. |

No decorative loops. Every cue and every movement doubles text that is already on screen ("✓ Bonne réponse", "▲ 2 / gagne 2 places").

**Native sound is a store-build follow-up.** `expo-av` / `expo-audio` are not in `mobile/package.json` or the app.json plugins, and adding a native module breaks the OTA runtime contract (`runtimeVersion` 1.2.0). With the next store build: add `expo-audio`, bundle five short cues, add a `soundEnabled` device preference (default off) beside `hapticsEnabled` in `settings/preferences.ts`, a "Sons" row in Profil, and play through `arenaCue` respecting the iOS silent switch (`playsInSilentMode: false`).

Review: `/arena/studio?pj=<scenario>&full=1#competitions` shows the public screen alone at window size (check 1920×1080 and 1280×720: nothing scrolls); `&room=<scenario>` shows the tournament room, with "Rejouer le reclassement" to replay a reorder.

## 2. State behaviour for every data screen

A data screen shows exactly one of these states, and each state looks like the screen it belongs to.

1. **Loading**: a skeleton the same shape as the content, so nothing jumps when data arrives. Never a bare spinner on a page, and never "0 questions" or "Aucun …" while loading.
2. **Empty**: says what is missing and offers the next useful action (change the filter, pick another level, create the first one).
3. **Error**: plain-language cause, **Réessayer** that keeps the student's input, and a way back (the parent list, "Retour").
   A failed fetch is never shown as empty: "aucun résultat" after a network failure is a false statement.
4. **Offline**: the error state's offline variant. It says what is unavailable and what still works.
   Saved content stays visible. Video honestly requires internet.
5. **Partial failure**: when one independent section fails, show `ErrorState compact` (web) or `InlineError` (mobile) in that section only. Navigation and other sections stay usable (roadmap §4).
6. **Submitting**: the control is disabled with a busy state (`Button loading`, `aria-busy`), and repeat taps are ignored.

The representative screens on these components after this pass:

- **Web learning:** Courses, CourseDetail, Quizzes, Revision, the exam hub (Landing, Browser, Subject, Overview, History), ExamResults.
- **Web competition:** Tournois hub and room. They share the same components, seated on the night surface.
- **Mobile learning:** Courses, CourseDetail, Exam Landing, Browser, Overview, History, Results and Take, Search.
- **Mobile competition:** Leaderboard.

## 3. Accessibility checklist

### Both platforms

- Every interactive element has a role, an accessible name and its state:
  - selected, pressed or checked chips and toggles
  - expanded disclosures
  - disabled or busy buttons
- Icon-only controls always have a label.
- Text contrast is at least 4.5:1, and focus rings and other meaning-carrying non-text at least 3:1, in light, dark and the Arène night.
- Reduced motion keeps all information. Animations are skipped or made static, never essential.
- Loading is announced once, politely. Errors are announced assertively. Countdowns are not announced on every tick.

### Web

- One `<main id="main-content">` (in `Layout`) and the skip link. Pages never add a second `<main>`.
- Headings stay in order. Pass state components a `headingLevel` that fits where they sit.
- Every interactive element is reachable by keyboard. `role="button"` elements need `tabIndex={0}` and Enter + Space handling. Do not nest a button inside a button.
- Focus is visible. The global `:focus-visible` ring must not be removed unless the rule replaces it (e.g. `:focus-within` on a search wrapper).
- Every input has a label: a `<label>`, `aria-label` or `aria-labelledby`. A placeholder is not a label.
- Custom controls:
  - chips and segmented switches use `aria-pressed`
  - radio-like sets use `role="radio"` + `aria-checked`
  - disclosures use `aria-expanded`
- `prefers-reduced-motion` is honoured globally (`index.css`). Per-component `@media` guards add static fallbacks.

### Mobile

- Every touchable has an `accessibilityRole`. Use `accessibilityState` for `selected`, `checked`, `disabled` and `busy`.
- Every touch target is at least 44pt (`touch.min`), or uses `hitSlop` to reach that size.
- Dynamic Type stays on. Cap growth with `maxFontSizeMultiplier` (1.5–2) only on fixed-height controls such as chips, pills, segmented switches, tab labels and button labels. Never use `allowFontScaling={false}` on reading text.
- Every reanimated or `Animated` loop checks `useReduceMotion()`. Every `<Modal>` uses `modalAnimation(reduce)`.
- In sheets, focus order follows the visual order: title, body, then actions. Decorative layers are `accessible={false}`.

## 4. Automated checks

| Check | File |
| --- | --- |
| Web token contrast: core text on every ground, links, filled buttons, status inks on their washes, pf tones, Arène night. Reads the real stylesheets, last declaration wins. | `src/__tests__/tokenContrast.test.ts` (helper `src/utils/contrast.ts`) |
| Web static guards: keyboard-operable `role="button"`, single `<main>`, toggle state on chips, no unreplaced focus-outline removal, global reduced motion, skip link, no left-border stripes | `src/__tests__/a11yStatic.test.ts` |
| Web state views: roles, names, heading levels, retry/back, offline copy | `src/components/__tests__/StateViews.test.tsx` |
| Mobile token contrast (light, dark, arena) | `mobile/src/theme/__tests__/contrast.test.ts` (helper `mobile/src/theme/contrast.ts`) |
| Mobile static guards: every touchable has a role, every animating file checks Reduce Motion | `mobile/src/__tests__/a11yStatic.test.ts` |
| Mobile state views and primitives: roles, busy, alert, CTA, Button/Card, reduced-motion behaviour | `mobile/src/components/__tests__/StateViews.test.tsx`, `mobile/src/components/ui/__tests__/uiPrimitives.test.tsx` |

`jest-axe` and `axe-core` are not installed, so these targeted tests stand in for them.
Rendered-page checks still need a browser run: axe or Lighthouse in Chrome, at 200% zoom, light and dark.

## 5. What still needs a person and a device

These are not covered by the checks above. They are required evidence for PRE-05 to PRE-08.

- **Screen readers:**
  - VoiceOver (iOS) and TalkBack (Android): reading order in sheets and modals, which now open without animation under Reduce Motion
  - the AuthScreen celebration overlay
  - Leaderboard rows
  - exam answer inputs
- **Large text:** the largest Dynamic Type sizes on a small phone, checking chips, the search pill, exam tiles and long school names. On the web, 200% zoom on the exam hub and Tournois.
- **Keyboard:** a full web run through Home → lesson → quiz → exam → results, and Arène → Tournois → room. The math keyboard symbol toolbar is still mouse/touch only (`tabIndex=-1`); typing LaTeX in the field is the keyboard path.
- **Visual review:**
  - the new status inks (red, green, amber) in both themes
  - the deeper danger button
  - shared state cards on the exam surface and in the Arène night
  - the mobile Leaderboard skeleton in night mode
- **Offline:** a real disconnect showing the offline error copy on both platforms.
- **Legacy English-only components** that are still reachable: `EssayQuiz` and `FlashcardDeck` copy. They are now accessible, but not yet translated.
