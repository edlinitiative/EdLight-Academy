/**
 * The "Explique-moi" handle a correction reads. Null (no button) when no
 * ExplainProvider is above it, or when the student is signed out: Sandra
 * needs an account, and the sign-in sheet cannot present over a practice
 * modal. Kept apart from ExplainSheet so a correction does not import the
 * whole chat screen.
 */
import { createContext, useContext } from 'react';
import type { QuestionContext } from '../../../../shared/explainContext';

export type ExplainFn = (ctx: QuestionContext) => void;

export const ExplainContext = createContext<ExplainFn | null>(null);

export function useExplain(): ExplainFn | null {
  return useContext(ExplainContext);
}
