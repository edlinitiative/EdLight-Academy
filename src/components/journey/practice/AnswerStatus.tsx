import React from 'react';
import { Check, X, Circle, AlertCircle, HelpCircle, RotateCcw } from '../../icons';

/**
 * The one vocabulary for an answer's outcome (LJ-08). Each status carries an
 * icon AND words, so it survives without colour, and each has its own words
 * so "unanswered" and "not auto-corrected" are never read as "wrong".
 *
 *   correct     right on the first try
 *   retry       right, after one or more wrong tries (hints were shown)
 *   tryagain    wrong, tries remain — the same question stays open
 *   incorrect   wrong, no tries left
 *   partial     part-credit (no bank question produces this today; kept so a
 *               future grader has a word for it instead of borrowing "wrong")
 *   unanswered  shown but never checked
 *   ungraded    no answer key the page can compare with
 */
export type AnswerStatusKind = 'correct' | 'retry' | 'tryagain' | 'incorrect' | 'partial' | 'unanswered' | 'ungraded';

type Tx = (fr: string, ht: string) => string;

export function answerStatusLabel(kind: AnswerStatusKind, tx: Tx, tries?: number): string {
  switch (kind) {
    case 'correct': return tx('Correct du premier coup', 'Kòrèk premye fwa');
    case 'retry': return tries && tries > 1
      ? tx(`Correct au ${tries}ᵉ essai`, `Kòrèk nan ${tries}yèm esè`)
      : tx('Correct après un indice', 'Kòrèk apre yon endis');
    case 'tryagain': return tx('Pas encore', 'Poko');
    case 'incorrect': return tx('Incorrect', 'Pa kòrèk');
    case 'partial': return tx('Partiellement correct', 'Kòrèk an pati');
    case 'unanswered': return tx('Sans réponse', 'San repons');
    case 'ungraded': return tx('Non corrigée automatiquement', 'Pa korije otomatikman');
    default: return '';
  }
}

const ICON: Record<AnswerStatusKind, React.ComponentType<any>> = {
  correct: Check,
  retry: Check,
  tryagain: RotateCcw,
  incorrect: X,
  partial: AlertCircle,
  unanswered: Circle,
  ungraded: HelpCircle,
};

export default function AnswerStatus({
  kind,
  tx,
  tries,
  label,
  className = '',
}: {
  kind: AnswerStatusKind;
  tx: Tx;
  tries?: number;
  /** Override the words (they must still say the same thing). */
  label?: string;
  className?: string;
}) {
  const Icon = ICON[kind];
  return (
    <span className={`pq-status pq-status--${kind} ${className}`.trim()} data-status={kind}>
      <Icon size={15} weight="bold" aria-hidden="true" />
      <span>{label || answerStatusLabel(kind, tx, tries)}</span>
    </span>
  );
}
