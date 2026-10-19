# Report triage runbook — "Signaler un problème"

Covers ADV-23 / TRU-10. Any signed-in student can report an event, team or
league from its page ("Signaler un problème" / "Siyale yon pwoblèm"). This is
how those reports reach a person and get closed.

## Owner

- **Owner:** the EdLight platform admin — the `info@edlight.org` account
  (`users/{uid}.role == 'admin'`).
- Every account with `role: 'admin'` (first 10) is notified. Adding a second
  admin is how you add a backup reviewer; no code change is needed.

## How a report reaches the owner

1. `report-content` (`api/_lib/competition.ts`) writes
   `competitionReports/{id}` with `state: 'open'` and the reporter's reason.
2. In the same transaction every admin gets one **inbox item** per reported
   target, `users/{uid}/competitionInbox/report_<kind>_<targetId>`, action
   `report_received` ("Signalement à examiner"). A new report on the same target
   marks it unread again instead of adding a row.
3. After the commit, admins get a **push** (app + web): "Un signalement attend
   une décision de modération." The push carries no reason and no reporter. At
   most **one push per target per hour**, tracked in the server-only
   `competitionReportAlerts/{kind}_{targetId}` (`reports`, `lastReportAt`,
   `lastPushedAt`). A replayed request never pushes again.
4. An admin who has set `competitionUpdates: false` gets the inbox item but no
   push.

## Where to triage

- **Web:** sign in as the admin and open `/arena/competitions`. The
  **"Modération privée"** panel lists open reports (up to 30), each showing the
  kind and the reporter's reason.
- **App:** the same workspace (Arène → compétitions). Tapping the push opens the
  reported team, event or league.
- **Raw data (fallback):** Firestore console → `competitionReports`, where
  `state == 'open'`.

## Target: 24 hours

Look at every open report within **24 hours** of the push. During a live event
weekend (Friday evening to Sunday), check every few hours.

## How to resolve

In the "Modération privée" panel, each report has a `moderation-review` form:

1. **Décision et justification** (at least 5 characters): what you decided and
   why. This is stored on the report as `resolution`, with your uid and the
   time.
2. **Accès public:**
   - *Retirer de la découverte*: marks the target `moderated: true`. An event
     is removed from the public directory; a league is made non-public.
   - *Conserver*: closes the report and changes nothing about the target.
3. Submit. The report becomes `state: 'resolved'` and leaves the panel.

Several reports about one target each need their own decision.

## Escalation

- **Safety risk** (threats, self-harm, sexual content involving minors, a
  student's personal information): hide the target right away (*Retirer de la
  découverte*), then email the director and the school contact the same day.
  Follow the legal reporting duties that apply. Do not wait for the 24-hour
  target.
- **School or organiser dispute:** hide only if the content breaks the rules.
  Otherwise choose *Conserver* and contact the school's approved host.
- **Repeat offender:** note it in the resolution. Account action (deletion,
  role removal) is done from the admin console (`/admin/users`).
- **The owner is unavailable for more than 24 hours:** give a second trusted
  account `role: 'admin'` so it starts receiving the inbox items and pushes.

## Checking the loop works

1. From a test student account, report a test team.
2. Within a minute, the admin account should get the push and see the
   "Signalement à examiner" item in "Mon activité".
3. Resolve it from "Modération privée", then check that the report is
   `resolved` in Firestore.
