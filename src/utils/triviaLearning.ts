import { trackEvent } from './telemetry';
import type { TriviaQuestion } from '../data/triviaData';

export function triviaOptions(q: TriviaQuestion, isCreole: boolean): string[] {
  return isCreole && Array.isArray(q.optionsHt) && q.optionsHt.length === q.options.length && q.optionsHt.every((o) => typeof o === 'string' && o.trim())
    ? q.optionsHt : q.options;
}

export function triviaExplanation(q: TriviaQuestion, isCreole: boolean): string {
  const text = isCreole ? q.explanationHt || q.explanation : q.explanation;
  return typeof text === 'string' ? text : '';
}

/** Uses the site's telemetry and its optional analytics provider; never blocks play. */
export function trackTriviaEvent(name: string, detail?: Record<string, unknown>) {
  trackEvent(name, detail);
  try { (window as any).gtag?.('event', name, detail); } catch { /* best effort */ }
}
