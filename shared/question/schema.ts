/**
 * The question IR — "a document with holes", after Khan's Perseus.
 *
 * WHY A NEW SCHEMA AT ALL
 *
 * Today every surface re-derives what a question is from eight loosely-typed
 * fields (`correct`, `answer_parts`, `options`, `scaffold_text`, blanks in the
 * prompt…), and each surface guesses slightly differently. That is why the same
 * class of bug — raw LaTeX, a missing input, a phantom answer — keeps
 * reappearing in a new place after being fixed in another.
 *
 * WHY NOT ADOPT PERSEUS
 *
 * Perseus is MIT and excellent, but its questions are authored AS Perseus JSON.
 * Adopting it means re-authoring 9,426 questions. So we take its architecture —
 * the prompt is a document, each hole is a typed widget, widgets grade
 * independently — and design the schema so OUR corpus compiles into it with no
 * re-authoring. The compiler is the valuable part, not the renderer.
 *
 * DESIGN RULES
 *
 *  - Every widget grades itself. No surface may invent grading logic again.
 *  - Validation is separate from scoring: "not a number" is not "wrong".
 *  - Partial credit is native — 82.7% of our questions carry authored steps and
 *    100% carry points, so a question is a sum of parts, never all-or-nothing.
 *  - Nothing here renders. This file is data and rules only, so web and mobile
 *    cannot drift.
 */

/** A hole in the prompt, or a step in the ladder. Each grades on its own. */
export type Widget =
  /** Free text: the default for short answers. */
  | {
      kind: 'text';
      id: string;
      answer: string;
      /** Other accepted spellings/forms. Our biggest fairness gap at 15.4%. */
      alternatives?: string[];
      /** Typo tolerance is subject-gated — never on for maths. */
      fuzzy?: boolean;
      /** Placeholder / label shown to the student. */
      label?: string;
    }
  /** A number, with the tolerance and units Perseus treats as first-class. */
  | {
      kind: 'numeric';
      id: string;
      answer: number;
      /** Absolute tolerance. Defaults to a relative 1% at grade time. */
      tolerance?: number;
      /** "cm", "m/s" — accepted but not required unless `unitRequired`. */
      unit?: string;
      unitRequired?: boolean;
      label?: string;
    }
  /** One of N. Options are short in our corpus (median 13 chars). */
  | {
      kind: 'choice';
      id: string;
      options: string[];
      /** Index into `options`. */
      answer: number;
      label?: string;
    }
  /**
   * Put the items in order. The cheapest new format available to us: our
   * 19,041 authored steps ALREADY are the correct sequence, so an ordering
   * exercise generates from content that exists.
   */
  | {
      kind: 'order';
      id: string;
      /** Presented shuffled; `answer` is the correct order of these indices. */
      items: string[];
      answer: number[];
      label?: string;
    }
  /** Long-form. Cannot be auto-scored; carries a model answer to compare. */
  | {
      kind: 'essay';
      id: string;
      minWords?: number;
      modelAnswer?: string;
      label?: string;
    };

export type WidgetKind = Widget['kind'];

/** The prompt is a document: prose, holes, and the occasional figure. */
export type Block =
  | { type: 'text'; content: string }
  | { type: 'widget'; id: string }
  | { type: 'figure'; description: string };

export interface CompiledQuestion {
  id: string;
  /** The prompt, with widget holes in place — never a string to append to. */
  prompt: Block[];
  /** Every widget by id, whether it sits in the prompt or in the ladder. */
  widgets: Record<string, Widget>;
  /**
   * Ordered ids of the widgets that form the step ladder. Empty when the
   * question is answered in one go.
   */
  steps: string[];
  /** Total marks. Split across widgets at grade time; no step carries its own. */
  points: number;
  /** Progressive help. Present on 100% of our corpus, ~66 chars each. */
  hints: string[];
  /** Why the answer is the answer (90.7%). */
  explanation?: string;
  /** A worked answer (83.6%) — never yet shown in the app. */
  modelAnswer?: string;
  /** Other routes to the same answer (21.2%) — never yet shown either. */
  approaches?: string[];
  /** Provenance, so a compiled question can be traced back. */
  source: { type: string; subject?: string };
}

/** What a student has entered, keyed by widget id. */
export type Response = Record<string, string | number | number[] | null>;

/** Validation is not scoring: malformed input is not a wrong answer. */
export type Validity =
  | { state: 'empty' }
  | { state: 'invalid'; reason: 'not-a-number' | 'incomplete' }
  | { state: 'ok' };

export interface WidgetScore {
  id: string;
  validity: Validity;
  /** Null when the widget cannot be auto-scored (essay). */
  correct: boolean | null;
  /** Marks earned for this widget. */
  earned: number;
  possible: number;
}

export interface QuestionScore {
  widgets: WidgetScore[];
  earned: number;
  possible: number;
  /** True only when every auto-scorable widget is right. */
  allCorrect: boolean;
  /** True when nothing in the question can be auto-scored. */
  needsReview: boolean;
}
