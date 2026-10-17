import React from 'react';
import { Flag } from '../../icons';
import { SUPPORT_EMAIL } from './rulesFacts';
import './trust.css';

export interface ReportContext {
  kind: 'arena' | 'duel';
  /** Tournament id or duel code. */
  ref?: string | null;
  questionIndex?: number | null;
  /** The account, so a reviewer can find the record. The student sees it before sending. */
  uid?: string | null;
  /** 'dispute' words the subject as a contested result. */
  reason?: 'problem' | 'dispute';
}

/**
 * The mail a report opens: the same inbox as /contact (no backend — the
 * platform already handles contact by mailto, see src/pages/Contact.tsx).
 * Pre-filled with what a reviewer needs to find the record — edition or duel
 * code, question number, the time on this device — and a blank line for the
 * student's own words. Nothing is sent until they press send in their mail app.
 */
export function reportMailto(ctx: ReportContext, isCreole: boolean, at: Date = new Date()): string {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const what = ctx.kind === 'arena' ? t('Arène', 'Arèn') : t('Défi', 'Defi');
  const subject = ctx.reason === 'dispute'
    ? `[${what}] ${t('Contester un résultat', 'Konteste yon rezilta')}${ctx.ref ? ` — ${ctx.ref}` : ''}`
    : `[${what}] ${t('Signaler un problème', 'Siyale yon pwoblèm')}${ctx.ref ? ` — ${ctx.ref}` : ''}`;
  const lines = [
    t('Ce qui s’est passé :', 'Sa k te pase :'),
    '',
    '',
    '— — —',
    ctx.ref ? `${ctx.kind === 'arena' ? t('Édition', 'Edisyon') : t('Code du défi', 'Kòd defi a')} : ${ctx.ref}` : null,
    ctx.questionIndex != null ? `${t('Question', 'Kesyon')} : ${ctx.questionIndex + 1}` : null,
    `${t('Heure (cet appareil)', 'Lè (aparèy sa a)')} : ${at.toISOString()}`,
    ctx.uid ? `${t('Compte', 'Kont')} : ${ctx.uid}` : null,
    typeof window !== 'undefined' ? `${t('Page', 'Paj')} : ${window.location.pathname}` : null,
  ].filter((l) => l !== null);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export default function ReportProblem({ context, isCreole, label }: {
  context: ReportContext;
  isCreole: boolean;
  label?: string;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  return (
    <a
      className="trust-link"
      // Built at click time so the timestamp is the moment of the report.
      href={reportMailto(context, isCreole)}
      onClick={(e) => { e.currentTarget.href = reportMailto(context, isCreole); }}
    >
      <Flag size={16} aria-hidden="true" />
      {label || (context.reason === 'dispute'
        ? t('Contester un résultat', 'Konteste yon rezilta')
        : t('Signaler un problème', 'Siyale yon pwoblèm'))}
    </a>
  );
}
