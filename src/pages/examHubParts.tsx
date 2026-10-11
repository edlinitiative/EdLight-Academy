/* ══ Exams hub pieces ═════════════════════════════════════════════════════════
   Level list, a paper's status pill and its one action. Real data only — the
   catalogue index, the student's drafts and results. (The average calculator
   and the featured-paper card were removed with the 2026-10 rethink.) */
import React from 'react';
import { Link } from 'react-router-dom';
import { PlayCircle } from '../components/icons';
import { levelToSlug } from '../utils/examLevels';

export const HUB_LEVELS = [
  { raw: 'baccalaureat', fr: 'Baccalauréat', ht: 'Bakaloreya' },
  { raw: '9eme_af', fr: '9ᵉ AF', ht: '9yèm AF' },
  { raw: 'universite', fr: 'Université', ht: 'Inivèsite' },
];

/** Section headers like "A.- Recopier…" are instructions, not topics. */
export function paperTopics(exam: any, max = 4): string[] {
  const list: string[] = Array.isArray(exam?.topics) ? exam.topics : [];
  return list
    .filter((s) => typeof s === 'string' && s.length <= 34
      && !/^[A-Z0-9]{1,2}\s*[.\-–)]/.test(s)
      && !/points|exercice|traiter|recopier|partie|question/i.test(s))
    .slice(0, max);
}

export function durationLabel(min: number | null | undefined, ht: boolean): string {
  if (!min) return ht ? 'San kwonomèt' : 'Sans chronomètre';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}

export type PaperStatus = { kind: 'draft'; answered: number } | { kind: 'done'; pct: number | null } | { kind: 'new' };

export function paperKey(exam: any): string {
  return String(exam?.exam_id ?? exam?._idx);
}

export function PaperAction({ exam, status, ht, navigate, big = false }: {
  exam: any; status: PaperStatus; ht: boolean; navigate: (to: string, opts?: any) => void; big?: boolean;
}) {
  const key = paperKey(exam);
  const slug = levelToSlug(exam.level);
  const cls = `exam-hub__btn${big ? ' exam-hub__btn--big' : ''}`;
  if (status.kind === 'draft') {
    return (
      <button type="button" className={`${cls} exam-hub__btn--primary`}
        onClick={() => navigate(`/exams/${slug}/${key}/take`, { state: { autostart: true, resume: true } })}>
        <PlayCircle size={big ? 18 : 15} aria-hidden="true" /> {ht ? 'Kontinye' : 'Reprendre'}
      </button>
    );
  }
  if (status.kind === 'done') {
    return (
      <Link className={`${cls} exam-hub__btn--soft`} to={`/exams/${slug}/${key}/results`}>
        {ht ? 'Wè rezilta a' : 'Voir le résultat'}
      </Link>
    );
  }
  return (
    <Link className={`${cls} ${big ? 'exam-hub__btn--primary' : 'exam-hub__btn--line'}`} to={`/exams/${slug}/${key}`}>
      <PlayCircle size={big ? 18 : 15} aria-hidden="true" /> {big ? (ht ? 'Kòmanse eprèv la' : 'Démarrer l’épreuve') : (ht ? 'Kòmanse' : 'Démarrer')}
    </Link>
  );
}

export function StatusPill({ status, ht }: { status: PaperStatus; ht: boolean }) {
  if (status.kind === 'draft') {
    return <span className="exam-hub__pill exam-hub__pill--amber">{ht ? `An kou · ${status.answered} rep.` : `En cours · ${status.answered} rép.`}</span>;
  }
  if (status.kind === 'done') {
    const tone = status.pct == null ? 'slate' : status.pct >= 60 ? 'green' : status.pct >= 40 ? 'amber' : 'red';
    return <span className={`exam-hub__pill exam-hub__pill--${tone}`}>{status.pct == null ? (ht ? 'Fèt' : 'Fait') : `${status.pct}%`}</span>;
  }
  return <span className="exam-hub__pill exam-hub__pill--slate">{ht ? 'Pou fè' : 'À faire'}</span>;
}
