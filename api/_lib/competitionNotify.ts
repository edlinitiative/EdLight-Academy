/**
 * Best-effort push delivery for competition inbox records.
 *
 * Called only after a competition mutation has COMMITTED in this request — a
 * replayed receipt never reaches here, so a retried tap cannot re-send. The
 * inbox record is the durable notification; a push is a courtesy on top and
 * must never fail or noticeably delay the mutation.
 *
 * Payload contract (web + app): { type: 'competition', action, targetKind,
 * targetId, path } — a typed reference, never a score, answer or message body.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { sendExpoPushToUser } from './expoPush';
import { isPushConfigured, sendPushToUser } from './push';
import {
  inboxPath,
  pushCopy,
  type InboxAction,
  type InboxTargetKind,
} from '../../shared/competition/notifications';

export interface CompetitionNotice {
  uid: string;
  action: InboxAction;
  targetKind: InboxTargetKind;
  targetId: string;
  title: string;
}

/** One mutation never pushes to more people than this; the inbox still records everyone. */
export const PUSH_FANOUT_CAP = 200;
const CONCURRENCY = 10;
const BUDGET_MS = 3000;

async function deliverOne(db: Firestore, notice: CompetitionNotice) {
  const [user, prefs] = await Promise.all([
    db.doc(`users/${notice.uid}`).get(),
    db.doc(`users/${notice.uid}/settings/notifications`).get(),
  ]);
  // Opt-out, not opt-in, like the other server senders: absent means on.
  const settings = prefs.exists ? prefs.data() ?? {} : {};
  if (settings.competitionUpdates === false) return;
  const u = user.data() ?? {};
  const ht = (settings.language || u.prefs?.language || u.language) === 'ht';
  const { title, body } = pushCopy(notice.action, notice.title, ht);
  const path = inboxPath(notice.targetKind, notice.targetId);
  const data = {
    type: 'competition',
    action: notice.action,
    targetKind: notice.targetKind,
    targetId: notice.targetId,
    path,
  };
  await Promise.all([
    sendExpoPushToUser(notice.uid, { title, body, data }).catch((err) =>
      console.warn('[competition] expo push failed', err?.name ?? 'Error'),
    ),
    isPushConfigured()
      ? sendPushToUser(notice.uid, {
          title,
          body,
          url: path,
          tag: `competition-${notice.targetKind}-${notice.targetId}`,
          data,
        }).catch((err) =>
          console.warn('[competition] web push failed', err?.name ?? 'Error'),
        )
      : null,
  ]);
}

/** One push per recipient per mutation (first notice wins), capped and time-boxed. Never rejects. */
export async function deliverCompetitionNotices(
  db: Firestore,
  notices: CompetitionNotice[],
  actorUid: string,
): Promise<void> {
  const seen = new Set<string>([actorUid]);
  const queue = notices
    .filter((n) => (seen.has(n.uid) ? false : (seen.add(n.uid), true)))
    .slice(0, PUSH_FANOUT_CAP);
  if (!queue.length) return;
  const run = (async () => {
    for (let i = 0; i < queue.length; i += CONCURRENCY)
      await Promise.all(
        queue.slice(i, i + CONCURRENCY).map((n) =>
          deliverOne(db, n).catch((err) =>
            console.warn('[competition] notice failed', err?.name ?? 'Error'),
          ),
        ),
      );
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    run,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BUDGET_MS);
    }),
  ]);
  if (timer) clearTimeout(timer);
}
