# EdLight Academy — premium website redesign

Date: October 16, 2026  
Status: proposed product and design baseline; documentation only  
Scope: responsive website, including laptop, tablet browser, and phone browser. Native mobile application excluded.

## Read in this order

1. [Product requirements](PRD.md): purpose, scope, journeys, functional requirements, acceptance criteria, measurement, delivery, and decisions.
2. [Design specification](DESIGN-SPEC.md): visual foundations, responsive layouts, screen composition, components, interaction states, content, accessibility, and design handoff.

The PRD defines **what the experience must achieve**. The design specification defines **how it should look and behave**. Requirement identifiers connect both documents. These are implementation-ready written specifications, not completed visual mockups or an authorization to implement or deploy.

## How to use this package

- Start design with the lesson workspace, quiz session, exam session, arena lobby, and notification inbox. Validate complete journeys before expanding to secondary screens.
- Use the proposed values and decisions as a coherent baseline. Confirm the decision register before implementing affected scoring, persistence, messaging, or competition changes.
- Keep existing URLs, educational records, security controls, and bilingual support. Reuse current services where their behavior satisfies the requirements.
- Produce desktop and responsive visual designs plus interaction prototypes using the handoff checklist in the design specification.
- Record approved deviations against requirement IDs. Do not silently introduce a different scoring definition or data model while styling a screen.

## Relationship to existing documentation

This package is the proposed authority for the **new website presentation and UX**. It does not supersede backend integrity rules or native-app specifications. It consolidates and extends the website direction in [the September redesign plan](../../EDLIGHT_UI_UX_REDESIGN_PLAN_FOR_CLAUDE.md) and [the Arena visual handoff](../../ARENA_VISUAL_DESIGN_HANDOFF.md).

Older documents may describe browser gameplay as unavailable. Current [browser-play configuration](../../../shared/arena/webPlay.ts) enables it. This package preserves the configured eligibility policy and requires the UI to reflect it accurately; it does not authorize weakening or strengthening enforcement.

## Evidence boundaries

The October audit visually inspected the existing local `dist` build at a 1280 × 633 desktop viewport: public home, course catalog and overview, lesson, quiz setup and question, exam catalog/overview/taking, arena lobby, and trivia setup. Current TypeScript/CSS was also inspected. The build and current source differ in places, including arena theming. Findings from the build are not assertions about the latest deployed production website.

Notifications, signed-in continuity, live multiplayer, final grading, broadcast, and phone/tablet behavior require fresh runtime validation. Their requirements here are proposed behavior, informed by source review. No claim of user research, production performance measurement, or complete accessibility verification is made.
