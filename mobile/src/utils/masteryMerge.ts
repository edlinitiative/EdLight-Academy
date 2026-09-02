/**
 * Mastery merge — see /shared/masteryMerge.ts for the real thing.
 *
 * Web and mobile write the same Firestore document, so the join that decides
 * what two devices' records add up to lives in /shared and is re-exported here.
 * Keep this file a re-export: a second copy of a lattice join is a second
 * opinion about a student's work.
 */
export * from '../../../shared/masteryMerge';
