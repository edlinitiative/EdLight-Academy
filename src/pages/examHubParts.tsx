/* ══ Exams hub pieces (Ted's third mockup, 2026-09-23) ══════════════════════
   The featured paper, the dense table of papers carrying the student's own
   status, and a Bac average calculator the student fills in themselves.
   Real data only — the catalogue index, the student's drafts and results. No
   PDFs, no "grille" downloads, no inspectors' guides: none of those exist. */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, FileText, PlayCircle } from '../components/icons';
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

/** The featured paper: a real one, with its real duration and points. */
export function FeaturedPaper({ exam, name, status, ht, navigate }: {
  exam: any; name: { title: string; subtitle: string }; status: PaperStatus; ht: boolean; navigate: (to: string, opts?: any) => void;
}) {
  const topics = paperTopics(exam, 5);
  const points = typeof exam.total_points === 'number' && exam.total_points > 0 ? exam.total_points : null;
  const q = exam._questionCount || 0;
  return (
    <section className="exam-hub__card exam-hub__featured" aria-labelledby="exam-featured-title">
      <div className="exam-hub__featured-bar">
        <span className="exam-hub__featured-icon" aria-hidden="true"><Clock size={18} /></span>
        <div>
          <p className="exam-hub__featured-kicker">{ht ? 'Egzamen blan · vrè kondisyon' : 'Examen blanc · conditions réelles'}</p>
          <p className="exam-hub__featured-sub">
            {exam.duration_minutes
              ? (ht ? 'Kwonomèt la mache pandan tout dire ofisyèl la. Repons ou anrejistre pandan w ap travay.' : 'Le chronomètre tourne sur la durée officielle. Tes réponses sont enregistrées au fil de l’épreuve.')
              : (ht ? 'Sijè sa a pa bay dire : pa gen kwonomèt.' : 'Ce sujet n’indique pas de durée : pas de chronomètre.')}
          </p>
        </div>
      </div>
      <div className="exam-hub__featured-body">
        <div className="exam-hub__featured-main">
          <div className="exam-hub__tags">
            <span className="exam-hub__tag">{exam._subject}</span>
            {exam.year && <span className="exam-hub__tag exam-hub__tag--soft">{exam.year}</span>}
            {name.subtitle && <span className="exam-hub__tag exam-hub__tag--soft">{name.subtitle}</span>}
          </div>
          <h2 id="exam-featured-title" className="exam-hub__featured-title">{exam._subject} — {name.title}</h2>
          {topics.length > 0 && (
            <ul className="exam-hub__topics">{topics.map((tp) => <li key={tp}>{tp}</li>)}</ul>
          )}
        </div>
        <dl className="exam-hub__facts">
          <div><dt>{ht ? 'Dire' : 'Durée'}</dt><dd>{durationLabel(exam.duration_minutes, ht)}</dd></div>
          {points ? <div><dt>{ht ? 'Pwen' : 'Barème'}</dt><dd>{points} pts</dd></div> : null}
          {q > 0 ? <div><dt>{ht ? 'Kesyon' : 'Questions'}</dt><dd>{q}</dd></div> : null}
        </dl>
      </div>
      <div className="exam-hub__featured-foot">
        <span className="exam-hub__featured-status"><FileText size={15} aria-hidden="true" /> <StatusPill status={status} ht={ht} /></span>
        <PaperAction exam={exam} status={status} ht={ht} navigate={navigate} big />
      </div>
    </section>
  );
}

type CalcRow = { id: number; subject: string; grade: string; coef: string };
const CALC_KEY = 'edlight-bac-average-v1';

/**
 * The student's own weighted average. Nothing is pre-filled but subject
 * names: a subject's coefficient depends on the série and the year's
 * circular, and a hard-coded table here would be a claim this page cannot
 * back. So the student types grade AND coefficient and the page does the
 * arithmetic — no pass/fail verdict, which is the jury's to give.
 */
export function AverageCalculator({ subjects, ht }: { subjects: string[]; ht: boolean }) {
  const [rows, setRows] = useState<CalcRow[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CALC_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch { /* no storage */ }
    return [];
  });
  const [seeded, setSeeded] = useState(rows.length > 0);
  useEffect(() => {
    if (!seeded && subjects.length) {
      setRows(subjects.slice(0, 5).map((s, i) => ({ id: i + 1, subject: s, grade: '', coef: '' })));
      setSeeded(true);
    }
  }, [subjects, seeded]);
  useEffect(() => {
    if (!seeded) return;
    try { localStorage.setItem(CALC_KEY, JSON.stringify(rows)); } catch { /* no storage */ }
  }, [rows, seeded]);

  const update = (id: number, patch: Partial<CalcRow>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const num = (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  let sum = 0;
  let coefs = 0;
  for (const r of rows) {
    const g = num(r.grade);
    const c = num(r.coef);
    if (g == null || c == null || c <= 0 || g < 0 || g > 20) continue;
    sum += g * c;
    coefs += c;
  }
  const avg = coefs > 0 ? sum / coefs : null;

  return (
    <section className="exam-hub__card" aria-labelledby="exam-calc-title">
      <div className="exam-hub__card-head">
        <h2 id="exam-calc-title" className="exam-hub__card-title">{ht ? 'Kalkile mwayèn ou' : 'Calculer ma moyenne'}</h2>
        <span className="exam-hub__tag">/20</span>
      </div>
      <p className="exam-hub__note">
        {ht
          ? 'Mete nòt ou (sou 20) ak koyefisyan chak matyè jan lekòl ou ba ou l. Kalkil la rete sou aparèy ou.'
          : 'Entre ta note (sur 20) et le coefficient de chaque matière, tel que ton école te l’indique. Le calcul reste sur ton appareil.'}
      </p>
      <div className="exam-calc">
        <div className="exam-calc__row exam-calc__row--head" aria-hidden="true">
          <span>{ht ? 'Matyè' : 'Matière'}</span><span>{ht ? 'Nòt' : 'Note'}</span><span>Coef.</span><span />
        </div>
        {rows.map((r) => (
          <div key={r.id} className="exam-calc__row">
            <input aria-label={ht ? 'Matyè' : 'Matière'} value={r.subject} onChange={(e) => update(r.id, { subject: e.target.value })} />
            <input aria-label={ht ? 'Nòt sou 20' : 'Note sur 20'} inputMode="decimal" placeholder="—" value={r.grade} onChange={(e) => update(r.id, { grade: e.target.value })} />
            <input aria-label={ht ? 'Koyefisyan' : 'Coefficient'} inputMode="decimal" placeholder="—" value={r.coef} onChange={(e) => update(r.id, { coef: e.target.value })} />
            <button type="button" className="exam-calc__remove" aria-label={ht ? 'Retire' : 'Retirer'} onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}>×</button>
          </div>
        ))}
        <button type="button" className="exam-calc__add"
          onClick={() => setRows((x) => [...x, { id: Math.max(0, ...x.map((y) => y.id)) + 1, subject: '', grade: '', coef: '' }])}>
          + {ht ? 'Ajoute yon matyè' : 'Ajouter une matière'}
        </button>
      </div>
      <div className="exam-calc__result">
        <span>{ht ? 'Mwayèn' : 'Moyenne'}</span>
        <strong>{avg == null ? '—' : `${avg.toFixed(2).replace('.', ',')} / 20`}</strong>
      </div>
      {avg != null && (
        <span className="exam-calc__bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (avg / 20) * 100)}%` }} /></span>
      )}
    </section>
  );
}
