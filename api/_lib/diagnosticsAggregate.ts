/**
 * Queryable error aggregates + fatal-signature alerts for /api/telemetry.
 *
 * The raw event stream goes to hosting runtime logs (`student_diagnostics`),
 * which are searchable but not queryable from the admin console and expire
 * with the plan's retention. This keeps ONE bounded document per error
 * signature per UTC day — `diagnosticErrors/{YYYYMMDD}_{signature}` — with
 * counts, fatal counts, platform split and the last build/update that sent
 * it. Nothing in it identifies a student: inputs are already sanitized
 * diagnostic events (shared/telemetry.ts), so there is no message, no uid, no
 * URL — only the signature, error class/kind, bundle coordinate, static
 * screen name and release identifiers.
 *
 * Alerting (once per signature per day, claimed by `alertedAt` on the day
 * doc): a FATAL signature never seen on an earlier day alerts on its first
 * report; a known one alerts when it reaches FATAL_SPIKE_THRESHOLD fatal
 * reports in a day. Admins get a competition-inbox item plus a push through
 * the existing competition notification path.
 *
 * Bounds: client sessions send each signature at most 3 times; one request
 * carries at most 20 events; each instance writes at most WRITE_BUDGET
 * signature-days per minute (beyond that, events are still logged, just not
 * aggregated). The collection is server-only: Firestore rules have no match
 * for it, so clients can neither read nor write it.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { DiagnosticEvent } from '../../shared/telemetry';
import { SIGNATURE_PATTERN } from '../../shared/errorSignature';

export const DIAG_COLLECTION = 'diagnosticErrors';
export const FATAL_SPIKE_THRESHOLD = 5;
export const WRITE_BUDGET_PER_MINUTE = 300;
/** Not a person: only excluded from the push recipients. */
export const DIAGNOSTICS_ACTOR_UID = 'system_diagnostics';

const PLATFORMS = new Set(['ios', 'android', 'web']);
const RELEASE_KEYS = ['platform', 'appVersion', 'buildNumber', 'runtimeVersion', 'updateId', 'updateGroup', 'channel', 'release', 'osVersion'] as const;

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export interface ErrorGroup {
  signature: string;
  count: number;
  fatalCount: number;
  platforms: Record<string, number>;
  eventName: string;
  errorName: string;
  errorKind: string | null;
  topFrame: string | null;
  screen: string | null;
  release: Record<string, string | number | boolean | null>;
}

export function isFatalEvent(event: DiagnosticEvent): boolean {
  return event.detail?.fatal === true || event.name === 'js_fatal_crash';
}

/** Groups the error events of one batch by signature. Events without a valid signature are ignored. */
export function groupErrors(events: DiagnosticEvent[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const event of events) {
    if (event.type !== 'error') continue;
    const signature = event.detail?.signature;
    if (typeof signature !== 'string' || !SIGNATURE_PATTERN.test(signature)) continue;
    const platform = String(event.context?.platform ?? '');
    const pkey = PLATFORMS.has(platform) ? platform : 'other';
    const g = groups.get(signature) ?? {
      signature, count: 0, fatalCount: 0, platforms: {}, eventName: event.name,
      errorName: event.error?.name ?? 'Error', errorKind: null, topFrame: null, screen: null, release: {},
    };
    g.count += 1;
    if (isFatalEvent(event)) g.fatalCount += 1;
    g.platforms[pkey] = (g.platforms[pkey] ?? 0) + 1;
    // Fatal events describe the signature better than a handled sibling.
    if (isFatalEvent(event) || g.count === 1) g.eventName = event.name;
    g.errorName = event.error?.name ?? g.errorName;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    g.errorKind = str(event.detail?.errorKind) ?? g.errorKind;
    g.topFrame = str(event.detail?.topFrame) ?? g.topFrame;
    g.screen = str(event.detail?.screen) ?? g.screen;
    const release: ErrorGroup['release'] = {};
    for (const key of RELEASE_KEYS) {
      const v = event.context?.[key];
      if (v !== undefined) release[key] = v;
    }
    g.release = release;
    groups.set(signature, g);
  }
  return [...groups.values()];
}

/** Pure alert rule. */
export function decideErrorAlert(input: { fatalCount: number; alreadyAlerted: boolean; seenBefore: boolean }): boolean {
  if (input.alreadyAlerted || input.fatalCount <= 0) return false;
  if (!input.seenBefore) return true;
  return input.fatalCount >= FATAL_SPIKE_THRESHOLD;
}

let budgetWindow = { start: 0, used: 0 };
export function __resetDiagnosticsBudgetForTests() {
  budgetWindow = { start: 0, used: 0 };
}
function takeBudget(now: number): boolean {
  if (now - budgetWindow.start >= 60_000) budgetWindow = { start: now, used: 0 };
  if (budgetWindow.used >= WRITE_BUDGET_PER_MINUTE) return false;
  budgetWindow.used += 1;
  return true;
}

export type AlertSender = (db: Firestore, alert: { signature: string; day: string; title: string }, now: number) => Promise<void>;

/** Short, non-personal title: what crashed where. */
export function alertTitle(g: Pick<ErrorGroup, 'errorName' | 'errorKind' | 'release'>): string {
  const r = g.release;
  const where = [r.platform, r.appVersion, r.buildNumber != null ? `(${r.buildNumber})` : null, r.release ? String(r.release).slice(0, 7) : null]
    .filter((x) => x != null && x !== '').join(' ');
  return `Crash ${g.errorName}${g.errorKind ? ` · ${g.errorKind}` : ''}${where ? ` · ${where}` : ''}`.slice(0, 80);
}

/** One inbox item + push per platform administrator. Mirrors competitionOrphans `alertAdmins`. */
export const alertAdminsOfError: AlertSender = async (db, alert, now) => {
  const admins = (await db.collection('users').where('role', '==', 'admin').limit(10).get()).docs.map((d) => d.id);
  if (!admins.length) return;
  const id = `diag_${alert.day}_${alert.signature}`;
  const batch = db.batch();
  for (const uid of admins)
    batch.set(db.doc(`users/${uid}/competitionInbox/${id}`), {
      id,
      kind: 'diagnostic',
      targetKind: 'diagnostic',
      targetId: alert.signature,
      action: 'error_spike',
      title: alert.title,
      read: false,
      updatedAt: now,
    });
  await batch.commit();
  // Lazy: the push senders stay out of the telemetry function's cold start.
  const { deliverCompetitionNotices } = await import('./competitionNotify');
  await deliverCompetitionNotices(
    db,
    admins.map((uid) => ({
      uid,
      action: 'error_spike' as const,
      targetKind: 'diagnostic' as const,
      targetId: alert.signature,
      title: alert.title,
    })),
    DIAGNOSTICS_ACTOR_UID,
  );
};

/** Has this signature been recorded on an earlier day? Single-field query (automatic index). */
async function seenOnEarlierDay(db: Firestore, signature: string, day: string): Promise<boolean> {
  const snap = await db.collection(DIAG_COLLECTION).where('signature', '==', signature).limit(10).get();
  return snap.docs.some((d) => (d.data() as { day?: string }).day !== day);
}

/**
 * Upserts the day aggregate for every signature in the batch and raises
 * alerts. Never throws: aggregation must not fail the telemetry request.
 */
export async function recordErrorAggregates(
  db: Firestore,
  events: DiagnosticEvent[],
  now: number,
  sendAlert: AlertSender = alertAdminsOfError,
): Promise<{ written: number; alerted: number }> {
  let written = 0;
  let alerted = 0;
  const day = dayKey(now);
  for (const g of groupErrors(events)) {
    if (!takeBudget(now)) break;
    try {
      const ref = db.doc(`${DIAG_COLLECTION}/${day}_${g.signature}`);
      const state = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = (snap.exists ? snap.data() : null) as Record<string, any> | null;
        const platforms: Record<string, number> = { ...(prev?.platforms ?? {}) };
        for (const [k, n] of Object.entries(g.platforms)) platforms[k] = (platforms[k] ?? 0) + n;
        const fatalCount = (prev?.fatalCount ?? 0) + g.fatalCount;
        tx.set(ref, {
          signature: g.signature,
          day,
          eventName: g.fatalCount ? g.eventName : prev?.eventName ?? g.eventName,
          errorName: g.errorName,
          errorKind: g.errorKind ?? prev?.errorKind ?? null,
          topFrame: g.topFrame ?? prev?.topFrame ?? null,
          screen: g.screen ?? prev?.screen ?? null,
          count: (prev?.count ?? 0) + g.count,
          fatalCount,
          platforms,
          last: g.release,
          firstSeen: prev?.firstSeen ?? now,
          lastSeen: now,
          alertedAt: prev?.alertedAt ?? null,
        });
        return { fatalCount, alreadyAlerted: !!prev?.alertedAt };
      });
      written += 1;
      if (!g.fatalCount || state.alreadyAlerted) continue;
      const seenBefore = await seenOnEarlierDay(db, g.signature, day);
      if (!decideErrorAlert({ fatalCount: state.fatalCount, alreadyAlerted: false, seenBefore })) continue;
      // Claim the day's alert; a concurrent request that loses sends nothing.
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if ((snap.data() as { alertedAt?: number | null } | undefined)?.alertedAt) return false;
        tx.set(ref, { ...(snap.data() as object), alertedAt: now });
        return true;
      });
      if (!claimed) continue;
      await sendAlert(db, { signature: g.signature, day, title: alertTitle(g) }, now);
      alerted += 1;
    } catch (error) {
      console.warn('[telemetry] aggregate failed', error instanceof Error ? error.name : 'Error');
    }
  }
  return { written, alerted };
}

export interface ErrorSummary {
  signature: string;
  eventName: string;
  errorName: string;
  errorKind: string | null;
  topFrame: string | null;
  screen: string | null;
  count: number;
  fatalCount: number;
  days: number;
  platforms: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
  last: Record<string, unknown>;
  alerted: boolean;
}

/** Folds day docs into one row per signature, most recent first. */
export function summarizeErrorDocs(docs: Array<Record<string, any>>, sinceDay: string): ErrorSummary[] {
  const rows = new Map<string, ErrorSummary>();
  for (const d of docs) {
    if (typeof d.signature !== 'string' || typeof d.day !== 'string' || d.day < sinceDay) continue;
    const row = rows.get(d.signature);
    if (!row) {
      rows.set(d.signature, {
        signature: d.signature, eventName: d.eventName ?? 'error', errorName: d.errorName ?? 'Error',
        errorKind: d.errorKind ?? null, topFrame: d.topFrame ?? null, screen: d.screen ?? null,
        count: d.count ?? 0, fatalCount: d.fatalCount ?? 0, days: 1, platforms: { ...(d.platforms ?? {}) },
        firstSeen: d.firstSeen ?? d.lastSeen ?? 0, lastSeen: d.lastSeen ?? 0, last: d.last ?? {}, alerted: !!d.alertedAt,
      });
      continue;
    }
    row.count += d.count ?? 0;
    row.fatalCount += d.fatalCount ?? 0;
    row.days += 1;
    row.alerted = row.alerted || !!d.alertedAt;
    for (const [k, n] of Object.entries(d.platforms ?? {})) row.platforms[k] = (row.platforms[k] ?? 0) + Number(n);
    row.firstSeen = Math.min(row.firstSeen, d.firstSeen ?? row.firstSeen);
    if ((d.lastSeen ?? 0) > row.lastSeen) {
      row.lastSeen = d.lastSeen;
      row.last = d.last ?? row.last;
      row.screen = d.screen ?? row.screen;
      row.topFrame = d.topFrame ?? row.topFrame;
      row.eventName = d.eventName ?? row.eventName;
    }
  }
  return [...rows.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** The admin read path: last `days` days (max 30), at most 300 day-docs scanned. */
export async function readErrorSummaries(db: Firestore, now: number, days = 7): Promise<ErrorSummary[]> {
  const span = Math.min(Math.max(Math.floor(days) || 7, 1), 30);
  const sinceDay = dayKey(now - (span - 1) * 86_400_000);
  const snap = await db.collection(DIAG_COLLECTION).orderBy('lastSeen', 'desc').limit(300).get();
  return summarizeErrorDocs(snap.docs.map((d) => d.data() as Record<string, any>), sinceDay);
}
