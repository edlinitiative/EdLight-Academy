/**
 * useLessonCompletion — React binding for completionController (PRD LJ-05).
 * All the rules live in the controller; this only re-renders on its changes
 * and keeps it scoped to the current account + course + connectivity.
 */
import { useEffect, useReducer, useRef } from 'react';
import { trackJourney } from '../../../utils/learningJourney';
import { reportError } from '../../../services/telemetry';
import {
  createCompletionController, type CompletionController, type CompletionOutcome, type SaveFn,
} from './completionController';

export function useLessonCompletion({
  uid, courseId, offline, save, onConfirmed, slowAfterMs,
}: {
  uid: string | null | undefined;
  courseId: string | null | undefined;
  offline: boolean;
  save: SaveFn;
  onConfirmed?: (lessonId: string, outcome: CompletionOutcome) => void;
  slowAfterMs?: number;
}): CompletionController {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const saveRef = useRef(save);
  saveRef.current = save;
  const confirmedRef = useRef(onConfirmed);
  confirmedRef.current = onConfirmed;

  const ref = useRef<CompletionController | null>(null);
  if (!ref.current) {
    ref.current = createCompletionController({
      save: (...args) => saveRef.current(...args),
      slowAfterMs,
      track: (name, detail) => trackJourney(name, detail),
      onChange: () => rerender(),
      onConfirmed: (id, outcome) => confirmedRef.current?.(id, outcome),
      onError: (error) => reportError(error, { surface: 'lesson_completion' }),
    });
  }
  const controller = ref.current;
  useEffect(() => { controller.setScope(uid, courseId); }, [controller, uid, courseId]);
  useEffect(() => { controller.setOffline(offline); }, [controller, offline]);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}
