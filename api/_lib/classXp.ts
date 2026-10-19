import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { CLASS_LIMITS, classWeek, type ClassWeek } from '../../shared/classes';

// Kept apart from classSpaces so the practice-award endpoint does not load the fixture/tournament engine.
const emptyWeek = (): ClassWeek => ({ xp: {}, completed: {} });

/** Reads are performed before any award writes. Returned callback writes in the SAME award transaction. */
export async function prepareClassXp(db: Firestore, tx: Transaction, uid: string, xp: number, now: number): Promise<() => void> {
  const classes = await tx.get(db.collection('classes').where('memberUids', 'array-contains', uid).limit(CLASS_LIMITS.perStudent));
  const active = classes.docs.filter((d) => !d.data().archived && d.data().members?.[uid]);
  const rows = await Promise.all(active.map(async (d) => {
    const ref = d.ref.collection('weeks').doc(classWeek(now));
    const snap = await tx.get(ref);
    const week = (snap.data() as ClassWeek) || emptyWeek();
    week.xp[uid] = (week.xp[uid] || 0) + xp;
    return { ref, week };
  }));
  return () => rows.forEach(({ ref, week }) => tx.set(ref, week));
}
