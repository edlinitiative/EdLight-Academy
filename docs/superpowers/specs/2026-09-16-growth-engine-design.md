# Growth engine, signup funnel, and quiz feel — design

**Date:** 2026-09-16
**Status:** approved in chat (approach C + B + A), implementation in progress
**Budget:** $500, earmarked for prizes rather than ad spend

## The problem, from live data

| Signal | Value |
|---|---|
| Users | 123 |
| Referral codes ever issued | 8 (~6% of users) |
| Referrals completed | 1 |

The referral system is not missing — `referralService`, `InviteSheet`, `ShareCard`,
`ShareCardCapture`, `challengeService` and code redemption at signup all exist and work.
It is **ignored**. Three causes:

1. **No reason to invite.** The reward is "nou chak ap genyen yon bonus" — unqualified XP,
   which has no value outside the app and so cannot motivate an outside-the-app action.
2. **No moment of pride.** Sharing happens at emotional peaks. The invite lives in a menu.
3. **Nothing measured.** There is no k-factor, so no way to tell whether a change worked.

## Why $500 cannot be ad spend

10,000–30,000 users on $500 is $0.017–$0.05 per user. Real install cost in Haiti runs
$0.30–$2 even on cheap channels, so $500 of ads buys hundreds to low thousands of installs.
80–240× growth from 123 users comes from compounding (k > 1) or institutional distribution,
not from media buying. The $500 is therefore spent on **prizes that make inviting worth
doing**, which is the only lever that compounds.

No confirmed channel exists yet; Instagram is the most plausible. The design must therefore
manufacture its own public moment rather than assume a school hands us 2,000 students.

**Milestone discipline:** the next target is **1,000 users with a measurable k-factor**, not
10–30k. If each user does not bring at least one more, no prize budget compounds, and we
need to know that in weeks rather than after the money is gone.

## Reward tiers

| Tier | Vehicle | Why |
|---|---|---|
| Repeat | Mobile data / credit top-up | Best motivation per dollar, instant, and it removes the very barrier to using the app |
| Aspirational | Coursera license | High perceived value, ~zero marginal cost, digitally deliverable, on-brand |
| Headline | Cash / physical | Loudest and most shareable; fraud-prone, so reserved for a vetted single winner |
| Always-on | Status (champion banner, public board) | Free and infinitely repeatable |

## Workstreams, in build order

Each stage makes the next worth more. Building growth mechanics on an unmeasured, leaking
funnel is how the budget disappears invisibly.

### 1. Funnel + instrumentation

- Measure the loop: invites sent, invites opened, installs attributed, activation, k-factor.
- An invited friend must land on the thing they were invited to (the duel, the school board),
  not a generic home screen.
- Reduce first-run friction so an invited user can play before registering.

### 2. Growth engine — C (headline) + B (always-on) + A (reward rail)

**C. School / class tournament.** The competing unit is the school or class, not the
individual. This is the only mechanic here where a user benefits from recruiting people who
are not close friends — your school cannot win if only you play. It is inherently
Instagram-able (countdown, live board, named winning school), and it gives schools a reason
to adopt us, which re-opens the institutional channel we do not currently hold.
Reuses the existing `haitiGeo` school/city data and the École/Ville leaderboard scopes.

**B. Duel-first virality.** 1v1 challenges as the always-on loop between tournaments.
Costs nothing per user and genuinely compounds, because a duel requires a second person.
`challengeService` already exists.

**A. Reward rail.** The payout mechanism both of the above draw on.

### 3. Quiz feel and art direction

Animation and artwork for the quiz surfaces, plus the winner artwork below. This is what
makes an arriving user stay, which is what converts installs into users. Art direction to be
chosen from a design canvas rather than picked unilaterally (established pattern).

## Winner artwork (first deliverable)

`ShareCard` already renders a 1080×1920 story card, captured to PNG, with the referral code
baked into every share. It has two modes (`score`, `rank`), carries `academy.edlight.org`,
and is bilingual FR/HT.

Extensions:

- **A `champion` mode** for tournament and weekly winners — the "surreal" treatment: radiant
  rays echoing the logo's own motif, aurora glow, laurel/trophy, dramatic depth.
- **Instagram handle** added to the footer of *every* mode, alongside the website.
- Winners get a ready-to-post PNG; the referral code stays baked in, so each victory post is
  also an invite.

## Out of scope

- Paid acquisition of any kind.
- Cash payouts at scale (fraud surface) — headline prize only, vetted manually.
- Invite-gated content unlocks (dark pattern; damages trust with students).
