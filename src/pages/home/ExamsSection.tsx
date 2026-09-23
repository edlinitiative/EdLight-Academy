import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, CheckCircle2, ArrowRight } from '../../components/icons';
import { TFn } from './content';

/**
 * Official papers, on the home pages.
 *
 * Ted's mockup has an "Annales corrigées du Baccalauréat" band. The papers are
 * real — 530 of them in /exam_catalog_index.json, the index the exam pages and
 * search already read — so every card here is a paper that exists and opens:
 * the latest Bac of the subject picked. No PDFs, no invented topics; the
 * topic chips are the paper's own section names.
 */
type Exam = {
  exam_id: string;
  level: string;
  subject: string;
  year: string;
  duration_minutes: number | null;
  topics?: string[];
};

const SUBJECTS = ['Mathématiques', 'Physique', 'Chimie', 'SVT', 'Économie'] as const;
const SUBJECT_HT: Record<string, string> = {
  'Mathématiques': 'Matematik', Physique: 'Fizik', Chimie: 'Chimi', SVT: 'SVT', 'Économie': 'Ekonomi',
};

/** Section headers like "A.- Recopier…" are instructions, not topics. */
const isTopic = (s: string) => s.length <= 32 && !/^[A-Z0-9]{1,2}\s*[.\-–)]/.test(s) && !/points|exercice|traiter|recopier/i.test(s);

let cache: Exam[] | null = null;

export default function ExamsSection({ t, title, eyebrow }: { t: TFn; title?: string; eyebrow?: string }) {
  const [exams, setExams] = useState<Exam[] | null>(cache);
  const [subject, setSubject] = useState<string>('Mathématiques');

  useEffect(() => {
    if (cache) return;
    let live = true;
    fetch('/exam_catalog_index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const arr: Exam[] = Array.isArray(d) ? d : Object.values(d || {}).flat() as Exam[];
        cache = arr;
        if (live) setExams(arr);
      })
      .catch(() => { if (live) setExams([]); });
    return () => { live = false; };
  }, []);

  const bac = useMemo(() => (exams || []).filter((e) => e.level === 'baccalaureat' && /^\d{4}$/.test(e.year)), [exams]);
  const shown = useMemo(
    // One paper per year: three 2025 maths papers (one per série) read as the
    // same card three times, since the index does not record the série.
    () => {
      const seen = new Set<string>();
      return bac
        .filter((e) => e.subject === subject)
        .sort((a, b) => b.year.localeCompare(a.year))
        .filter((e) => (seen.has(e.year) ? false : (seen.add(e.year), true)))
        .slice(0, 3);
    },
    [bac, subject],
  );
  const years = bac.length ? `${bac.reduce((m, e) => (e.year < m ? e.year : m), '9999')}–${bac.reduce((m, e) => (e.year > m ? e.year : m), '0000')}` : '';

  return (
    <section className="lp-section lp-exams" aria-labelledby="lp-exams-title">
      <div className="lp-container">
        <div className="lp-exams__head">
          <div>
            <span className="lp-tag">{eyebrow || t('Examens d’État officiels', 'Egzamen Leta ofisyèl')}</span>
            <h2 className="lp-section__title" id="lp-exams-title">
              {title || t('Les vrais sujets du Bac, à résoudre en ligne', 'Vrè sijè Bak yo, pou rezoud sou entènèt')}
            </h2>
          </div>
          {bac.length > 0 && (
            <span className="lp-exams__count">
              <CheckCircle2 size={18} aria-hidden="true" />
              {t(`${bac.length} épreuves du Bac · ${years}`, `${bac.length} eprèv Bak · ${years}`)}
            </span>
          )}
        </div>

        <div className="lp-exams__filters" role="group" aria-label={t('Matière', 'Matyè')}>
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              className={`lp-chip${subject === s ? ' is-on' : ''}`}
              aria-pressed={subject === s}
              onClick={() => setSubject(s)}
            >
              {t(s, SUBJECT_HT[s])}
            </button>
          ))}
        </div>

        <div className="lp-exams__grid">
          {exams === null
            ? [0, 1, 2].map((i) => <div key={i} className="lp-exam lp-exam--skeleton" aria-hidden="true" />)
            : shown.map((e) => {
              const topics = (e.topics || []).filter(isTopic).slice(0, 3);
              return (
                <article key={e.exam_id} className="lp-exam">
                  <div className="lp-exam__top">
                    <span className="lp-exam__session">{t(`Bac ${e.year}`, `Bak ${e.year}`)}</span>
                    {e.duration_minutes ? (
                      <span className="lp-exam__time"><Clock size={14} aria-hidden="true" /> {Math.round(e.duration_minutes / 60 * 10) / 10} h</span>
                    ) : null}
                  </div>
                  <h3 className="lp-exam__title">{t(`Épreuve de ${e.subject}`, `Eprèv ${SUBJECT_HT[e.subject] || e.subject}`)}</h3>
                  {topics.length > 0 && (
                    <ul className="lp-exam__topics">
                      {topics.map((tp) => <li key={tp}>{tp}</li>)}
                    </ul>
                  )}
                  <Link to={`/exams/terminale/${e.exam_id}`} className="lp-exam__cta">
                    {t('Résoudre en ligne', 'Rezoud sou entènèt')} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
        </div>

        <Link to="/exams" className="lp-exams__all">
          {t('Voir toutes les épreuves', 'Wè tout eprèv yo')} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
