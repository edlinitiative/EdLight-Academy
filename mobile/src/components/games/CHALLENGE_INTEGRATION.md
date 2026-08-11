# Défi d'un ami — integration checklist (for the orchestrator)

Workstream D delivered the duel feature as self-contained new files. Nothing is
wired into existing screens yet — that was reserved to avoid conflicts with the
agents editing `TriviaScreen.tsx` / `JeuxHub.tsx`. Wire it as follows.

## 0. REQUIRED — rate-limit buckets (api/_lib/rateLimit.ts)

Unknown buckets fail OPEN (unlimited). Add to `LIMITS`:

```ts
  // "Défi d'un ami" duels (api/challenges/*). Fail open (not COST_ENDPOINTS).
  'challenge-create': { max: 30, windowSec: 3600 },
  'challenge-accept': { max: 30, windowSec: 3600 },
```

## 1. Challenger side — "Défier un ami" on the trivia results screen

Only for standard category rounds (`categoryId` in `TRIVIA_CATEGORIES` — not
`'daily'`/`'mixed'`, whose draws span banks and can't be reproduced by index).

a. When building a round in `TriviaScreen`, capture the bank indexes of the
   picked questions BEFORE option shuffling:

```ts
import { idxsOf } from '../utils/seededDraw';
const bank = TRIVIA_QUESTIONS[categoryId];
const questionIdxs = idxsOf(bank, pickedQuestions); // null if not from this bank
```

b. On the results screen, when `questionIdxs` is non-null:

```ts
import { createChallenge, shareChallenge } from '../services/challengeService';
const created = await createChallenge({ categoryId, questionIdxs, score });
if (created) {
  await shareChallenge({
    categoryLabel,               // localized category name
    score, total: questionIdxs.length,
    url: created.url,            // https://academy.edlight.org/defi/<code>
    lang: isCreole ? 'ht' : 'fr',
  });
}
```

## 2. Recipient side — deep link → ChallengeCard → play → accept

a. `app.json` already has `"scheme": "edlight"`. `AppNavigator` has NO linking
   config today — add one to `NavigationContainer`:

```ts
const linking = {
  prefixes: ['edlight://', 'https://academy.edlight.org'],
  config: { screens: { Defi: 'defi/:code' } },
};
```

b. Add a `Defi` route (root stack, like `Leaderboard`) whose screen:

```ts
const { challenge, isLoading } = useChallenge(code);
// resolve label: TRIVIA_CATEGORIES.find(c => c.id === challenge.categoryId)
<ChallengeCard challenge={challenge} categoryLabel={label} busy={launching}
  onAccept={() => {
    const bank = TRIVIA_QUESTIONS[challenge.categoryId];
    const questions = drawByIdxs(bank, challenge.questionIdxs);
    if (!questions) { /* show "Mets à jour l'app pour jouer ce défi" */ return; }
    // run these questions through QuizPlayer (option order may shuffle freely),
    // then: const outcome = await acceptChallenge({ code, score });
    // render won/lost/tie + outcome.xpAwarded (+20 win / +10 tie / 0 loss).
  }} />
```

   Guests: `getChallenge` requires auth (rules) — route through the auth modal
   first; the referral code in the share message handles attribution.

c. One-attempt is enforced server-side (409 `already_played`); still hide the
   CTA when `challenge.status === 'played'` (ChallengeCard does this) and
   handle `{ error: 'already_played' | 'expired' | 'self_challenge' }`.

## 3. Web fallback

`https://academy.edlight.org/defi/<code>` currently 404s on the web app. Add a
`/defi/:code` route (or a redirect-to-store landing) in the web codebase so the
https link works for people without the app. Universal links (iOS AASA /
Android App Links) are a follow-up — the `edlight://` scheme works today via
the share message's https link → web landing → "Ouvrir dans l'app" button.

## 4. Deploy

- `npx firebase-tools deploy --only firestore:rules --project edlight-academy`
  (new `challenges/{code}` get-only rule).
- Vercel deploy picks up `api/challenges/*` automatically on push.

## API contract

**POST /api/challenges/create** — Bearer ID token.
Body `{ categoryId, questionIdxs: number[], score }` →
`{ ok, code, url, appUrl, expiresAt }` · 400 invalid input · 429 rate.

**POST /api/challenges/accept** — Bearer ID token.
Body `{ code, score }` →
`{ ok, result: 'won'|'lost'|'tie', challengerScore, opponentScore, total, xpAwarded }`
· 404 not_found · 409 already_played · 410 expired · 400 self_challenge.

**Firestore** `challenges/{code}`: `{ code, challengerUid, challengerName,
categoryId, questionIdxs, total, challengerScore, createdAt, expiresAt (+7 d),
opponent: null | { uid, name, score, playedAt }, status: 'open'|'played' }`.
Client access: authed `get` only; all writes via Admin SDK.

Winner XP is paid server-side into the weekly + all-time leaderboard entries
(increment pattern, same docs as /api/leaderboard/award).
