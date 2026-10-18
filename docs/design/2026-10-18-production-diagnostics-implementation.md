# Premium roadmap: production diagnostics implementation

Date: October 18, 2026

Source: [Premium product implementation roadmap](2026-10-18-premium-product-implementation-roadmap.md).

## Delivered scope

This change implements the first P0 engineering gap: production delivery of the existing web/mobile diagnostic hooks. It also instruments HTTP requests for Arena registration, answers, presence, and friend challenge creation/acceptance on both platforms. It does not establish that the entire premium roadmap is complete.

- Release startup connects `trackEvent` and `reportError` to `POST /api/telemetry`. Development builds keep events local. Mobile preview builds report their actual update channel.
- Every report carries web commit/environment or native app version, binary build number, runtime, OTA update ID and channel where available. The server adds its own deployed commit, environment and receive time.
- The reporting destination is structured hosting runtime logs, searchable by `student_diagnostics`. This uses existing hosting infrastructure and needs no client credential or additional analytics SDK.
- Existing learning journey events now have a reporting destination. Critical requests add `critical_request_started`, `critical_request_succeeded`, `critical_request_failed` and `critical_request_recovered`, with flow, operation, ephemeral operation ID, HTTP status and elapsed time.
- Request success means an HTTP success response. It does not claim a saved lesson, correct answer, official rank or tournament victory. Recovery means a later HTTP success for an operation that failed during this process; it does not identify the same student or attempt across sessions.
- Shared filtering runs before transmission and again at ingestion. It drops unknown fields, nested payloads, identities, raw messages, raw stack traces, URL/query context and private answer text. Error diagnostics keep standard error classes and bounded source coordinates. Technical values must be short tokens, finite numbers, booleans or null.
- Delivery uses a bounded queue of 100 sanitized events, batches of up to 20 (under 48 KB), an eight-second reporting timeout, 30-second failure backoff and at most three attempts per failing batch. Permanent HTTP rejections are discarded. Network events and background/foreground transitions trigger a flush while respecting backoff.
- The endpoint validates content type, origin, schema and payload size and applies bounded per-instance burst protection. Native startup failures can report without authentication. These are untrusted client diagnostics, never scoring or eligibility evidence.

Arena attestation remains disabled. Its physical-device investigation and the conditions in `mobile/src/utils/attestation.ts` still apply.

## Reporting operations and rollout

1. Deploy the API endpoint together with the website. A hosting-only Firebase deploy does not install this Vercel function. Release the mobile JavaScript update through the normal build/update process after the endpoint is available. No deployment or OTA publication was performed in this implementation session.
2. In the hosting runtime logs, filter for `student_diagnostics`, then inspect `event.name`, `event.context`, `event.detail.flow`, `event.detail.step`, `event.detail.httpStatus` and `event.detail.operationId`. Compare the client build/update with `serverRelease`; they can legitimately differ.
3. Exercise a controlled handled error in an internal release build using `reportError(new Error('diagnostic_probe'), { flow: 'diagnostic_probe' })`. Confirm its `handled_error` record, binary build and OTA identifier arrive. Repeat in the deployed web release and check its commit identifier. Do not deliberately crash a student's app.
4. Exercise one recoverable network failure and retry for a challenge or Arena request. Confirm the failure and recovery records. Confirm ordinary lesson-save and practice events arrive through the existing hooks.
5. The release owner must name the person reviewing failures, choose log retention/drain and alert settings appropriate to the hosting plan, and record the first production receipt. These operational choices are pending, not silently configured here.

The queue is best effort and lives in memory: process termination, a fatal native crash, offline shutdown or repeated reporting failure may lose diagnostics. This is JavaScript observability, not a native crash reporter. Hosting retention depends on the deployed plan; these logs are not a permanent analytics warehouse. Per-instance limiting does not replace a distributed hosting firewall rule for a public endpoint. The app sends no cookies or authorization headers to this endpoint; hosting access logs have their own infrastructure retention policies.

## Local verification record

Base commit: `e157aec621186f793a65f6cd8a58df8a86536d80`, with this change in the working tree. No installed binary, OTA update or deployed backend was tested.

Automated coverage includes:

- Client sanitization followed by server re-sanitization, with private text and URL tokens removed.
- Batch/queue limits, single-flight delivery, transient failures, permanent rejections, retry exhaustion and a stalled transport.
- Controlled errors through the web global handler and native release sink, with release/build/update attribution.
- No production delivery in development mode.
- API validation, sanitized structured logging and burst limiting.
- Critical request outcomes and recovery, preserved response/error behavior, and reporting failures that do not affect requests.

| Check | Result |
| --- | --- |
| Root `npm test -- --runInBand --silent` | 168 suites, 2,393 tests passed |
| Mobile `npm test -- --runInBand --silent` | 67 suites, 678 tests passed |
| `npx tsc --noEmit -p api/tsconfig.json` | Passed |
| Mobile `npx tsc --noEmit -p tsconfig.json` | Passed |
| ESLint for changed web/API/shared/config files | Passed without warnings |
| ESLint for changed mobile files | No errors; existing unused imports/variables and require-rule directive warnings remain |
| `npm run build` | Passed, including catalog checks and 22 prerendered routes plus Home |
| `git diff --check` | Passed |

The production build reports large asset/entrypoint warnings (main entrypoint 1.27 MiB uncompressed) and outdated Browserslist data. These are build observations, not measured route-loading or device-performance baselines. No performance budget is asserted from this build alone.

## Installed-build validation still required

Use a separate record for each iOS, Android and browser run. Record commit, dirty-tree status, build number, OTA update ID, runtime, device/OS/browser, backend environment, tester, date, result and evidence link. A passing unit suite is not an installed-build result.

| Journey | Required validation | Status |
| --- | --- | --- |
| Startup/accounts | Fresh install, returning/offline launch, sign-out/switch, slow profile sync | Not run on devices |
| Invitations/onboarding | Signed-out cold/warm links, original destination, interrupted onboarding | Not run on devices |
| Learning | Resume, Sandra return, confirmed/failed/queued save, reconnect, focused practice | Not run on devices |
| Exams | Draft recovery, background timer, submission/retry, history | Not run on devices |
| Friend challenge | Two accounts, signed-out opening, sharing, completion, return to results | Not run across devices |
| Arena participant | Register/rejoin, answers, reconnect, background timing, provisional/final outcomes | Not run at a real event |
| Arena spectator | Follow/clear school, current question, board, reconnect, final state | Not run at a real event |
| Notifications | Denied/granted/later permission; cold/warm tap; sign-out | Not run on devices |
| Accessibility/responsive | Large text, reader, keyboard, reduced motion, long translations; phone/tablet/desktop | Hands-on review pending |
| Production diagnostics | Controlled error received with deployed binary/update/backend identifiers | Production receipt pending |

Run the roadmap's representative event with two physical phones and one browser before signing off competition continuity. Record defects and implement focused fixes from reproduced evidence. UI consolidation, further journey changes, performance baselines, motion and larger product additions remain subsequent roadmap work; this change introduces no visual redesign or new competition mode.
