# Adaptive Content — grade-aware personalization

**Status:** Spec / not yet implemented (as of 2026-07)
**Related, already shipped:** `pickHomeSuggestion()` (season-aware Home card) in
`shared/trackConfig.ts`; `SmartSuggestion.tsx` (mobile). This spec generalizes
that from *season* to *grade + season + content availability*.

---

## Principle

> Meet the student where they are. Always lead with the **best of what we
> actually have** for their grade, and degrade gracefully when we have little.

The app decides what to surface from two inputs:

1. **Who they are** — grade / level (+ filière for Terminale, already captured as `track`).
2. **What exists** — which surfaces (exams, cours, quizzes, trivia, readiness)
   have real content for that grade *right now*.

The second input is what makes this durable: as content lands for lower grades,
those students' Home upgrades automatically — no code change, just catalog growth.

---

## Grade → content emphasis (Haitian system, mapped to today's catalog)

| Grade | Lead with | De-emphasize | Content we have today |
|-------|-----------|--------------|------------------------|
| **7e–8e** (fondamental) | **Trivia** (universal hook) | Exams, readiness | No cours / no exams → trivia only |
| **9e** (fin fondamental) | 9ème national exams + quizzes + trivia | Bac | **22** `9eme_af` exams |
| **NS1–NS3** (secondaire) | **Cours** + quizzes + trivia | Bac exams / readiness | Cours exist (Chimie NS1, Éco NS1/2/3, …) |
| **NS4 / Terminale** | Bac exams + readiness + everything | — | **470** `baccalaureat` exams |
| **Post-Bac** | Préfac (concours) | Bac | **38** `universite` exams *(shipped: SmartSuggestion)* |

Refinement over the first sketch: it's **not** "pre-Bac ⇒ no exams." Each grade
has its own relevant content (9e has national exams; NS1–NS3 have cours). Only
7e–8e genuinely fall back to trivia-only today.

Catalog levels (from `exam_catalog_index.json`): `9eme_af` (22), `baccalaureat`
(470), `universite` (38). Season logic already lives in `currentPlanSeason()`.

---

## Architecture

1. **Capture grade.** Add a light onboarding step ("Quelle classe ?") →
   store a `grade` field alongside `track` (persisted in the Zustand store,
   mirroring `track` + `dismissedSuggestionKey`). Max one extra tap.

2. **Grade → content profile (config, in `shared/`).** A pure map from grade to:
   - an **ordered priority** of Home surfaces (e.g. `NS2 → [cours, trivia, quizzes, exams]`),
   - the **relevant exam level(s)** (`9e → 9eme_af`, `NS4 → baccalaureat`, `post-bac → universite`),
   - a **default suggestion kind** (generalizes `pickHomeSuggestion`).

3. **Availability gate.** Before surfacing a section, check it has content for
   the grade (course count, exam count by level). Never headline an empty
   section — fall through the priority list until something is non-empty
   (trivia is the universal floor).

4. **Home reprioritization.** The Dashboard reorders its rails/tiles by the
   grade profile instead of the fixed order. `SmartSuggestion` takes `grade`
   too and picks the right nudge.

## Suggested sequencing (each phase ships value alone)

1. Capture grade in onboarding.
2. Grade → content-profile config (pure, shared, testable).
3. Home reprioritization + grade-aware `SmartSuggestion`.
4. Availability gate (auto-surface the richest available; auto-upgrades as content lands).

---

## Design cautions

- **Reprioritize, don't lock.** A curious NS2 student must still be *able* to
  open Bac exams — just don't make it their headline.
- **Onboarding budget = one extra tap.** Grade + filière is the ceiling; more
  than that and drop-off climbs.
- **Never a dead end.** The availability gate must guarantee no student lands on
  "aucun contenu."
- **Data-driven, not hardcoded.** Priorities gate on live content counts so the
  system improves as the catalog grows, rather than needing edits per content drop.

## Open questions

- Exact grade options in onboarding (7e, 8e, 9e, NS1–NS4, Post-Bac?) — keep the
  list short and localized (FR/HT).
- Does `grade` supersede or complement `track`? (Terminale still needs filière
  for readiness coefficients; lower grades may not need a filière at all.)
- How to re-ask/adjust grade later (new school year rollover).
