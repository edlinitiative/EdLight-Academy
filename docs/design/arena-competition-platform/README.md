# Arène competition platform

Date: October 18, 2026

Status: Proposed product, experience and implementation specification

Scope: Mobile and website; discovery, individual play, teams, school competitions, leagues and physical events

Arène should become a place to discover, enter, organize and follow academic competition. A student's school is their home base; it does not limit what they can discover or automatically place them on an official team. Students can compete individually, form teams with friends, represent a class or school, and follow public competitions across Haiti.

The experience connects discovery to eligibility, preparation, play, results and the next meaningful activity. Organizers can run a small classroom event without needing a national championship console. National events retain their distinctive presentation and stricter integrity rules.

## Read in this order

1. [Product specification](PRODUCT-SPEC.md): competition model, decisions, permissions, scoring, privacy and release scope.
2. [Complete user and game journeys](USER-JOURNEYS.md): student, captain, teammate, organizer, spectator, league and physical-event experiences, including interruptions and exceptions.
3. [Premium experience specification](EXPERIENCE-SPEC.md): navigation, screens, interaction states, visual hierarchy, motion and accessibility.
4. [Architecture and delivery plan](IMPLEMENTATION-PLAN.md): current source inventory, required changes, proposed contracts, compatibility, sequencing and acceptance gates.
5. [Product release readiness contract](../2026-10-18-premium-product-release-readiness.md): product-wide purpose, continuity, parity, trust and presentation requirements; platform evidence, pilot and final release gates.

## Core decisions proposed

| Question | Recommendation |
| --- | --- |
| What is Arène? | One competition destination across both platforms, retaining practice and friend challenges as supporting activities |
| What is a school? | Affiliation, eligibility context and a community home; distinct from a named team and from verified school representation |
| Can students create teams? | Yes: a persistent team has accepted members; each event receives a separate roster snapshot |
| How do teams first play? | Each registered starter answers independently on their own device; a published fixed-roster formula combines their points |
| How many players? | First named-team pilot: exactly three starters; event rules define readiness and missing-player behavior |
| Can there be individual competitions? | Yes; entry mode is explicit before registration. Mixed individual/team entry requires separate divisions, not one blended board |
| What about shared answers and relays? | Specified as later game modes with their own submission authority and recovery behavior |
| Can schools organize? | Yes; verified school organizers can publish school-backed events. Student-created events are labeled as such |
| Must an event have prizes? | No. Recognition and participation are sufficient; rewards are optional and their provider is explicit |
| Can rewards happen elsewhere? | Yes; external fulfillment is labeled and tracked separately from the competition result |
| Can events be private? | Yes. Discoverability, entry eligibility and viewing access are separate controls |
| Can events happen in person? | Yes: app-supported events first, then external listings with organizer-reported results |
| Is every tournament a league? | No. A league has seasons, divisions, fixtures and its own published standings policy |
| Does this replace the official championship engine? | No. Unify discovery and presentation while preserving source-specific scoring, timing, consent and results authority |

## Fit with the existing design direction

This expands the [October 17 Arena roadmap](../2026-10-17-arena-premium-roadmap.md) from a personal match lobby into a discoverable competition world. A real active task takes priority over a generic “play” button. School, regional and national discovery coexist with the official championship rather than appearing as variants of that championship.

The [visual and broadcast brief](../2026-10-17-arena-visual-motion-broadcast-brief.md) remains the visual foundation: Haitian night stadium, readable sports graphics, school identity and purposeful ceremonies. Everyday school events receive a restrained version of that language. The [premium product roadmap](../2026-10-18-premium-product-implementation-roadmap.md) continues to govern reliability, truthful saved/submitted states and cross-device validation.

These documents specify future behavior. The source inventory distinguishes existing functionality from proposed additions. Writing this specification does not implement or publish the platform. The diagnostics foundation and initial specifications were merged into `main` at `76fc8e7`; that merge does not establish production distribution or completion of the proposed platform.

## Decisions to validate in the pilot

Validate the three-player default, school organizer onboarding, school-membership approval workload, competition frequency, student appetite for persistent teams and the usefulness of regional discovery with participating schools. Do not assume every school already has sufficient connectivity, an administrator, or enough active players to sustain a league.

Launch gates are complete journeys and reliable operation, not the number of event types visible in a menu.

Pilot code and remaining gates are recorded in [the implementation record](../2026-10-18-competition-platform-implementation.md) and [candidate ledger](../release-readiness/README.md). Full readiness remains blocked.
