# Candidate evidence ledger

`candidate.json` freezes the requested full target and tracks all 69 contract requirements. The decision is BLOCKED. Existing functionality may exist even where coverage remains conservatively marked `Not implemented`; those rows need a complete implementation/coverage audit before promotion.

Use the source inventory as the start of MAP-01/MAP-02, then add role-specific actions, settings, links/notifications, content interactions and marketing/help claims found in the rendered products. Assign owners and acceptance scenarios. Do not treat the declaration scan as a complete capability audit.

`Implemented/unverified` means relevant pilot code exists, not that a release gate passed. To set `Verified`, attach owner, exact commit/build/environment, platform/device/network, scenario, expected/observed behavior, dated evidence and the required sign-off. Never copy an automated test result into installed-device or production evidence.

Run `npm run release:check` for structural coverage; run `npm run release:gate` for the blocking evidence decision. A valid JSON ledger is not a green release.
