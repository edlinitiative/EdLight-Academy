# Candidate evidence ledger

`candidate.json` freezes the requested full target and tracks all 69 contract requirements. The decision is BLOCKED. Existing functionality may exist even where coverage remains conservatively marked `Not implemented`; those rows need a complete implementation/coverage audit before promotion.

Use the source inventory as the start of MAP-01/MAP-02, then add role-specific actions, settings, links/notifications, content interactions and marketing/help claims found in the rendered products. Assign owners and acceptance scenarios. Do not treat the declaration scan as a complete capability audit.

`advertisedCapabilities` records what the products promise about Arène and competitions (copy, entry points, notifications, store text). Each row maps to requirement IDs, journeys, implementation, automated tests, pending evidence and any mismatch between the promise and the code/flags. The readable summary is [advertised-capabilities.md](advertised-capabilities.md). Each promise is located by a verbatim `match` snippet; `npm run release:inventory` refreshes its line, `release:check` warns when the copy no longer exists, and `release:gate` fails on unverified rows, open mismatches and unmapped copy. Learning/exam/Sandra claims still need rows.

`Implemented/unverified` means relevant pilot code exists, not that a release gate passed. To set `Verified`, attach owner, exact commit/build/environment, platform/device/network, scenario, expected/observed behavior, dated evidence and the required sign-off. Never copy an automated test result into installed-device or production evidence.

[p0-code-validation.md](p0-code-validation.md) is the P0 code-level validation of the core student journeys (sign-in/onboarding, lesson→mastery, exams, duels, Sandra, study plan, offline): defects fixed, open items, and the journey × interruption table that serves as the French step-by-step script for the real-device run. Its "OK/Fixed" results are code evidence only — never copy them into `Verified`.

Run `npm run release:check` for structural coverage; run `npm run release:gate` for the blocking evidence decision. A valid JSON ledger is not a green release.
