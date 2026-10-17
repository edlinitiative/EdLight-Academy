/**
 * Which due Révision questions belong to a topic (LJ-09: "the review
 * destination matches the session"). Pure.
 *
 * A question matches a scope when its id was named explicitly, or when its
 * subject (and unit, if the scope has one) agree — read from the review
 * entry's own metadata first, then from the bank row, because older entries
 * were recorded without metadata.
 */
import { dueQuestionIds, type ReviewMap } from '../../../utils/review';
import { toInt } from '../../../utils/practiceCards';
import { normalizeCourseCode } from './practiceScope';

export interface ReviewScope {
  subjectCode?: string;
  unitNo?: number | null;
  /** Ids that belong regardless of metadata (this session's misses). */
  ids?: string[];
  /** "Chimie NS1 · Grandeurs et mesures" */
  label?: string;
  /** Telemetry: who opened it. */
  source?: string;
}

export function inScope(
  id: string,
  review: ReviewMap,
  row: any | undefined,
  scope: ReviewScope | null | undefined,
): boolean {
  if (!scope) return true;
  if (scope.ids?.includes(id)) return true;
  if (!scope.subjectCode) return false;
  const e = review[id];
  const subject = e?.subjectCode || row?.subject_code || row?.course_code;
  if (!subject || normalizeCourseCode(String(subject)) !== normalizeCourseCode(scope.subjectCode)) return false;
  if (scope.unitNo == null) return true;
  const unit = e?.unitNo ?? toInt(row?.unit_no ?? row?.Chapter_Number);
  return unit === scope.unitNo;
}

/** Due ids in scope, most recently missed first. Ids no longer in the bank are left out. */
export function dueIdsInScope(review: ReviewMap, raw: any[], scope?: ReviewScope | null): string[] {
  const byId = new Map<string, any>();
  for (const row of raw ?? []) if (row?.id) byId.set(String(row.id), row);
  return dueQuestionIds(review).filter((id) => byId.has(id) && inScope(id, review, byId.get(id), scope));
}

/** The bank rows behind `dueIdsInScope`, same order. */
export function dueRowsInScope(review: ReviewMap, raw: any[], scope?: ReviewScope | null): any[] {
  const byId = new Map<string, any>();
  for (const row of raw ?? []) if (row?.id) byId.set(String(row.id), row);
  return dueIdsInScope(review, raw, scope).map((id) => byId.get(id));
}
