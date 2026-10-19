# Parent progress links and school ambassador tools

Date: October 19, 2026

Status: implemented locally; not deployed. Implements items 5 and 6 of [Larger product additions](2026-10-19-larger-product-additions.md). No pilot has been run and no outcome is claimed.

## 5. Student-shared progress record for parents

### How it works

- **Student, web:** Profil → Compte → **Partager mon suivi** (`/partager-suivi`). **Native:** Profil → **Partager mon suivi / Pataje swivi mwen** (root `ProgressShare` screen).
- The student picks 7, 30 or 90 days (default 90) and creates a link. Web offers WhatsApp, the native share sheet and copy. Native opens the system share sheet. The message is one sentence plus the link, with no em-dash: "Voici le suivi de mes progrès sur EdLight Academy : https://academy.edlight.org/suivi/…" (Kreyòl: "Men swivi pwogrè mwen sou EdLight Academy : …").
- The privacy line is shown above the create button in both languages (`SHARE_PRIVACY`).
- The list shows active links with their creation date, days left, view count and last view. **Désactiver** revokes a link immediately. Each student can have at most 5 active links. A link is shown only once, when it is created, because the server keeps only its hash.
- **Parent:** `/suivi/:token` opens signed out. The page sits outside the site layout (brand line and FR/Kreyòl switch only) and draws the same `ReleveSheet` as `/releve`. It adds "Mis à jour", "Dernière activité", XP, current streak and the link's expiry date. Revoked, expired and unknown links get a friendly page that tells the parent to ask for a new link. A rate-limited view gets a retry message.

### Security and privacy

- **Tokens.** 24 random bytes (192 bits) from `crypto.randomBytes`, base64url. Only `sha256(token)` is stored, as the document id `progressShares/{tokenHash}` = `{ uid, createdAt, expiresAt, revokedAt, scope: 'progress-v1', lastViewedAt, views }`. The owner revokes by hash id, and a hash cannot open the page.
- **Scope.** `GET /api/progress-share?token=` returns only `PublicProgress` (`shared/progressShare.ts`), rebuilt field by field by `toPublicProgress`:
  - first name only (`defaultAlias`)
  - class (grade code)
  - per-course lessons completed or total, with mastery per course and per unit (shared mastery model, same arithmetic as `/releve`)
  - the 5 most recent exam percentages, read with a `select()` projection so answers are never fetched
  - live streak and best streak, XP, and the last activity day
  
  Never returned: full name, email, school, city, uid, answers, quiz accuracy or Sandra transcripts.
- **Indexing and leaks.** Responses are `private, no-store`, and the API and page send `X-Robots-Tag: noindex, nofollow` plus a robots meta tag. `/suivi/*` is served with `Referrer-Policy: no-referrer` (vercel.json) so the token does not leak in a Referer header.
- **Rate limit.** Public views are limited to 120 per hour per salted-hashed caller address (`progress-share-view`). Owner actions are limited to 60 per hour per uid.
- **Rules.** `progressShares/**` denies all client access (explicit block in `firestore.rules`; covered by `scripts/test_competition_rules.cjs`).
- **Account deletion** deletes every share (`eraseProgressShares`, before the user tree).
- **Telemetry** (existing sink and detail allowlist): `releve_link_created { scope, target: d7|d30|d90 }` and `releve_link_revoked { scope }` from the clients, and `releve_link_viewed { scope, outcome }` logged by the server. None of them carries a token, uid or address.
- The Arena guardian emails are not used. There is no parent account and no parent email.

## 6. School ambassador programme

### Definitions (single source: `shared/ambassadors.ts`)

- **Recruit:** a distinct account that redeemed the ambassador's existing referral code. The server allows one referral per account and refuses self-referral.
- **Retained recruit:** the server observed learning activity on **at least 3 distinct days (Haiti calendar) within the first 14 days after signup**, the signup day being day 1.
  - Signup time is the Firestore server `createTime` of `users/{uid}`.
  - Activity days come from Firestore's own write metadata (`createTime`/`updateTime`) on these sources: quiz attempts, exam drafts and results, course progress, review schedule, mastery, streak and XP profile. Dates a client writes, such as `streaks/global.activeDays`, are never used.
  - Days already observed are kept (union), so the count only grows. It is a conservative lower bound, because a document updated on several days shows only its latest update.
  - A recruit is scanned at most every 6 hours while the window is open, and at most 40 recruits per request. One scan after the window closes makes the outcome final.
- **Fraud flags** (for human review, never automatic penalties):
  - `burst`: 5 or more of one ambassador's recruits signed up within 10 minutes
  - `shared_ip`: 3 or more redeemed from the same salted-hashed address
  
  A school computer room legitimately shares an address, so a reviewer decides. The report shows both "retenues" and "retenues sans signalement".
- **Reward period:** the Haiti calendar month of the recruit's signup (`YYYY-MM`).

### How to use it

1. **Admin → Utilisateurs → Croissance** (`/admin/users/growth`). Search a student by name, email or uid, type or confirm the school, and click **Désigner**. A school can have at most 2 active ambassadors. **Révoquer** ends dashboard access and removes the badge, and the history is kept.
2. The ambassador sees **Ambassadeur** on their profile (web pill, native tag) and a **Tableau ambassadeur** entry (web profile account rows; native Profile row, only while designated). The dashboard (`/ambassadeur`, native `Ambassador`) shows:
   - their code and link, with WhatsApp, share and copy
   - recruits, active recruits and in-progress recruits, for this month and in total
   - their school's weekly and all-time rank, XP and member count from the existing collective snapshots
   
   The ambassador never sees individual recruits.
3. Leaderboard rows (web national board, school drill-down and own row; native rows) show an **Ambassadeur / Anbasadè** badge beside the public alias. The badge list (`GET /api/ambassadors?view=directory`) holds only uids, which are already public on board entries, and is CDN-cached for 5 minutes.
4. **Monthly report:** pick the month, then **Exporter en CSV**. The CSV includes a byte-order mark for Excel, and cells starting with `= + - @` are neutralised. **Détails** lists each recruit's signup, observed days, state and flags. Tick **récompense remise** and add notes (amount, date, who handed it over). This is a record only. No payment is made by the app.

### Data and integrity

- **Collections:** `ambassadors/{uid}`, `ambassadorRecruits/{recruitUid | anon_…}` and `ambassadorRewards/{uid}_{YYYY-MM}`. All are server-only, with explicit deny blocks in the rules.
- **Recruit records:** `/api/referrals/redeem` writes the recruit record (server signup time plus hashed address) right after a successful claim, as a best-effort step that never blocks redemption. Referrals made before this change get a record lazily, without an address hash.
- **Authorisation:** admin actions require `users/{uid}.role == 'admin'`. The dashboard requires an active designation. The caller is always the verified token, never a body field.
- **Account deletion:**
  - A deleted recruit's record moves to an `anon_` id with no uid and no address hash, and keeps counting so past rewards stay explainable. Their referral doc is re-keyed with `referredUid: null`.
  - A deleted ambassador's designation is removed. Their recruit records, referral docs and reward records are re-keyed to a random alias, and reward notes are cleared.
  - Not changed: other users' `users/{uid}.referredBy` still holds the deleted uid, which is existing referral behaviour.

## Ops decisions needed before a pilot

- **Reward:** what one retained recruit is worth (for example a data top-up amount per N retained recruits per month, or a Coursera licence threshold), any cap per ambassador per month, and the budget inside the $500 prize framing. The proposal's targets are at least 10 retained recruits per ambassador per month and a cost of at most $1 per retained student.
- **Who fulfils:** who reviews flags, ticks "récompense remise", hands over top-ups, and by which day of the following month. Payments to minors need a guardian or school contact (item 6 risk). Collect that contact off-app or through a consented flow, not through these tools.
- **Selection:** who nominates ambassadors per school and how a revocation is communicated.
- **Salt:** set `ADDRESS_HASH_SALT` in Vercel to a random secret before launch. Without it, a fixed fallback salt is used.
- **Parent links:** confirm the 90-day default, and whether schools should be told the feature exists.

## Verification

Automated coverage:

- `api/__tests__/progressShare.test.ts` covers token entropy and hashing, durations, the active cap, view counting, no-leak scope with poisoned documents, the scope filter, revoked, expired and unknown links, owner-only revoke and account deletion.
- `progressShareRoute.test.ts` covers the hashed-address rate limit, no-store and noindex headers, the log without identifiers, and token-only ownership.
- `ambassadors.test.ts` covers:
  - the Haiti calendar, window boundaries, distinct accounts and self-exclusion
  - burst and shared-address flags, and CSV columns, quoting and formula escaping
  - designation cap and revocation, retention from server metadata while client dates are ignored
  - union and finality, the scan bound, redemption signals and the report with the reward record
  - pseudonymisation on deletion
- `ambassadorsRoute.test.ts` covers admin-only actions, the public cached directory and token-owned dashboards.
- Web: `pages/__tests__/progressShare.test.tsx` (public page, language switch, revoked, expired and rate-limited states, create, list and revoke) and `ambassadeur.test.tsx`. `Leaderboard.ambassador.test.tsx` covers the badge.
- Native: `screens/__tests__/progressShare.test.tsx` covers creation, the share sheet, revoke confirmation and the Kreyòl dashboard.

Before a pilot:

1. Deploy the API, rules and web together, then ship the app update by OTA. No new native dependency was added.
2. Set the salt.
3. On a real phone, create a link, open it signed out in another browser, revoke it, and confirm the friendly page.
4. Designate a test ambassador, redeem their code from two fresh accounts, study on 3 days, and confirm the counts, the CSV and deletion.
