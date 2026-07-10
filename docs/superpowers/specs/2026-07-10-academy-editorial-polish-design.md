# EdLight Academy — Editorial Polish Design

**Date:** 2026-07-10
**Status:** Approved (design); pending implementation plan
**Goal:** Raise the visual polish of Academy's public-facing surfaces by porting the
*style* (not the colors) of the `edlinitiative/code` marketing site — a
Codecademy-inspired print-editorial language — onto Academy's existing React +
plain-CSS stack.

## Constraints (hard)

- **Colors unchanged.** Keep Academy's institutional blue `#0857A6`, warm off-white
  canvas, and existing semantic palette exactly. This is structure, type, and motion only.
- **No new fonts.** Academy already loads **Inter** (body), **Literata** (serif),
  and **Geist Mono** — the editorial system is built from these.
- **No logic changes.** No changes to auth, routing, quiz/exam grading, data, or i18n.
  All French/Creole strings stay intact.
- **Accessibility.** All motion gated behind `prefers-reduced-motion`; contrast and
  focus states preserved; document/UI language behavior unchanged.

## Reference style signatures (from `edlinitiative/code`)

Studied via that repo's `docs/design/catalog-editorial-system.md` and marketing
components. The color-agnostic ingredients that make it read as polished:

1. **Editorial typography** — chunky display headings + monospace uppercase eyebrow
   labels. In Academy: **Literata** serif for display headings (tight `-0.02em`
   tracking), **Geist Mono** uppercase + letter-spaced for eyebrows/labels/meta.
2. **Near-sharp corners** — `~4–10px` radii instead of soft `16px` everywhere.
3. **Hairline borders over floaty shadows** — crisp `1px` borders as the primary
   separator; shadows minimized.
4. **Hatched offset frame** — a letterpress diagonal-stripe shadow peeking off a
   card's bottom-right corner. Signature accent, used **sparingly**.
5. **Metadata strips** — `icon · MONO LABEL · bold value` rows.
6. **Scroll-reveal motion** — subtle fade-and-rise as sections enter the viewport.
7. **One confident CTA** — a single weighty primary button per view.

## Design

### Shared editorial layer (added to `src/index.css`)

New tokens (scoped so untouched in-app screens are unaffected):

| Token | Value | Use |
|---|---|---|
| `--r-panel` | `10px` | large hero / feature panels |
| `--r-card` | `6px` | content cards, chips |
| `--r-btn` | `6px` | buttons |

New utility classes:

- `.font-editorial` — `font-family: var(--font-serif)`, `letter-spacing: -0.02em`,
  weight 600–700. For display headings.
- `.font-label` — `font-family: var(--font-mono)`, `text-transform: uppercase`,
  `letter-spacing: 0.08em`, small size, `--text-500`. For eyebrows/labels.
- `.hatch-frame` — the offset diagonal-stripe frame, using the **existing ink color**
  `--text-900` (no new color):
  ```css
  .hatch-frame { position: relative; }
  .hatch-frame::after {
    content: ""; position: absolute; inset: 0; transform: translate(6px, 6px);
    z-index: -1; border: 1px solid var(--text-900);
    background: repeating-linear-gradient(45deg, var(--text-900) 0 1px, transparent 1px 6px);
    opacity: 0.9;
  }
  ```
- `.meta-strip` / `.meta-strip__item` — flex row of icon + `.font-label` + bold value.
- `.reveal` / `.reveal--in` — starting `opacity:0; translateY(12px)`, transitioning to
  visible; wrapped in `@media (prefers-reduced-motion: no-preference)` so reduced-motion
  users get no transform.

### Motion primitive (`src/components/Reveal.tsx`)

A tiny wrapper: `IntersectionObserver` adds `.reveal--in` when the element enters the
viewport (once). Respects `prefers-reduced-motion` (renders visible immediately if the
user prefers reduced motion). No dependency added.

### Per-surface application

**Phase 1 — Foundation.** Add the tokens, utilities, and `Reveal`. No visual change
until applied.

**Phase 2 — Marketing.** Home sections (`src/pages/home/*`, `Home.tsx`) + `About`,
`Contact`, `FAQ`, `Help`, `Privacy`, `Terms`. Apply: Literata display headings, mono
eyebrows, editorial radii + hairline borders on cards/panels, `Reveal` on sections, a
confident primary CTA, and the hatched frame on the hero aside card + one featured CTA
(sparingly).

**Phase 3 — Catalog.** `Courses`, `CourseDetail`, `ExamLanding`. Mono eyebrows, meta
strips (level / duration / lessons / questions), crisp cards, editorial section headings.

**Phase 4 — In-app chrome.** `Dashboard` + exam flow (`ExamBrowser`, `ExamTake`,
`ExamResults`). Lighter touch — type, corners, and meta strips only; no interaction or
layout restructuring on these dense functional screens.

### Rollout

Implement **all four phases**, each as its own commit, then the user reviews the whole
result live. Hatched frame used **sparingly** (hero aside + one featured CTA).

## Guardrails / non-goals

- Not restructuring page layouts or information architecture.
- Not touching mobile app (`mobile/`).
- Not altering any color value, font family set, grading, or data.
- Each phase must keep the production build green and the test suite (140) passing.

## Success criteria

- Public surfaces share one editorial visual language (type + corners + borders + meta + motion).
- Zero color changes; no new fonts; no functional regressions; build + tests green.
- Reduced-motion users see no movement.
