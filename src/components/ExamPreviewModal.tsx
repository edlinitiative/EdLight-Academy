import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSingleExam } from '../utils/examCatalog';
import { subjectColor, QUESTION_TYPE_META } from '../utils/examUtils';
import { TRACK_BY_CODE } from '../config/trackConfig';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import InstructionRenderer from './InstructionRenderer';
import useStore from '../contexts/store';

/** Map the numeric difficulty (1–5) to a 3-tier label + tone (mirrors ExamBrowser). */
const DIFFICULTY_META = {
  1: { label: 'Facile', tier: 'easy' },
  2: { label: 'Facile', tier: 'easy' },
  3: { label: 'Moyen', tier: 'medium' },
  4: { label: 'Difficile', tier: 'hard' },
  5: { label: 'Difficile', tier: 'hard' },
};

/** Creole difficulty labels, keyed by tier (parallel to DIFFICULTY_META). */
const DIFFICULTY_LABEL_HT = { easy: 'Fasil', medium: 'Mwayen', hard: 'Difisil' };

const LANG_LABEL = { fr: 'Français', ht: 'Kreyòl', en: 'English', es: 'Español' };

/**
 * A lightweight "quick-look" for an exam.
 *
 * Clicking a card opens this instead of jumping straight into the heavy
 * full-exam render. It lazily fetches the small per-exam JSON (a few KB) to
 * show the section structure + a sample question, while the stat/type data
 * comes from the slim index that's already in memory.
 *
 * Two clear ways out:
 *   • "Aperçu complet"  → the existing read-through preview in ExamTake.
 *   • "Commencer/Refaire" → starts the exam immediately (autostart) so the
 *     student doesn't have to scroll past the whole paper first.
 */
export default function ExamPreviewModal({ exam, attempt, level, onClose }) {
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  const id = exam.exam_id || exam._idx;
  const color = subjectColor(exam._subject);
  const title = exam._title || exam.exam_title || 'Examen';

  // Lazily fetch the single small exam file for structure + a sample question.
  // Same queryKey ExamTake uses, so opening the exam afterwards is instant.
  const { data: full, isPending: isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: () => fetchSingleExam(id),
    enabled: id != null,
    staleTime: Infinity,
  });

  const startBtnRef = useRef(null);
  const bodyRef = useRef(null);

  // Drag the sheet down to dismiss on touch (only when the body is at the top).
  const swipe = useSwipeToDismiss(onClose, { scrollRef: bodyRef });

  const startNow = useCallback(
    () => navigate(`/exams/${level || ''}/${id}`, { state: { autostart: true } }),
    [navigate, level, id]
  );
  const fullPreview = useCallback(
    () => navigate(`/exams/${level || ''}/${id}`),
    [navigate, level, id]
  );

  // Lock body scroll + focus the primary action so Enter starts immediately.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    startBtnRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Keyboard: Esc closes, Enter starts (unless a control already has focus,
  // which handles Enter natively — avoids double-firing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter') {
        const tag = document.activeElement?.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        startNow();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, startNow]);

  const sections = full?.sections || [];
  const sectionRows = useMemo(
    () => sections.map((s, i) => ({
      title: s.section_title || `Section ${i + 1}`,
      count: (s.questions || []).length,
    })),
    [sections]
  );

  // First question with text — a teaser of what the paper looks like.
  const sample = useMemo(() => {
    for (const s of sections) {
      for (const q of (s.questions || [])) {
        if (q && q.question) return q;
      }
    }
    return null;
  }, [sections]);

  const typeEntries = Object.entries(exam._typeCounts || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const diff = DIFFICULTY_META[exam.difficulty] || null;
  const duration = exam.duration_minutes || 0;
  const points = exam.total_points || 0;
  const qCount = exam._questionCount || 0;
  const autoGradable = exam._autoGradable || 0;
  const sectionCount = sectionRows.length;

  const tracks = (exam.tracks || []).filter((t) => t && t !== 'ALL');

  const pct = attempt && typeof attempt.percentage === 'number' ? attempt.percentage : null;
  const tone = pct == null ? '' : pct >= 60 ? '--good' : pct >= 40 ? '--mid' : '--low';
  const attemptDate = attempt?.submittedAtMs
    ? new Date(attempt.submittedAtMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  const sampleOptions = sample && sample.options ? Object.entries(sample.options) : [];

  return createPortal(
    <div
      className="exam-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`${t("Aperçu de l'examen", 'Apèsi egzamen an')} : ${title}`}
      onClick={onClose}
    >
      <div
        className="exam-preview__panel"
        style={{ '--exam-accent': color, ...(swipe.style || {}) } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        <button className="exam-preview__close" onClick={onClose} type="button" aria-label={t("Fermer l'aperçu", 'Fèmen apèsi a')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        {/* Header */}
        <div className="exam-preview__header">
          <h2 className="exam-preview__title">{title}</h2>
          <div className="exam-preview__tags">
            {exam._level && <span className="exam-preview__tag">{exam._level}</span>}
            {diff && (
              <span className={`exam-preview__tag exam-preview__tag--diff exam-preview__tag--${diff.tier}`}>
                {t(diff.label, DIFFICULTY_LABEL_HT[diff.tier])}
              </span>
            )}
            {exam.language && (
              <span className="exam-preview__tag">{LANG_LABEL[exam.language] || exam.language.toUpperCase()}</span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="exam-preview__body" ref={bodyRef}>
          {/* Best-score / attempt banner */}
          {attempt && (
            <div className={`exam-preview__attempt exam-preview__attempt${tone}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
              <span>{pct != null ? t(`Meilleur score : ${pct}%`, `Pi bon nòt : ${pct}%`) : t('Déjà tenté', 'Deja eseye')}</span>
              {attemptDate && <span className="exam-preview__attempt-date">· {attemptDate}</span>}
            </div>
          )}

          {/* Stat grid */}
          <div className="exam-preview__stats">
            <div className="exam-preview__stat">
              <span className="exam-preview__stat-value">{qCount}</span>
              <span className="exam-preview__stat-label">{t('question', 'kesyon')}{qCount !== 1 ? t('s', '') : ''}</span>
            </div>
            {duration > 0 && (
              <div className="exam-preview__stat">
                <span className="exam-preview__stat-value">{duration}</span>
                <span className="exam-preview__stat-label">{t('minutes', 'minit')}</span>
              </div>
            )}
            {points > 0 && (
              <div className="exam-preview__stat">
                <span className="exam-preview__stat-value">{points}</span>
                <span className="exam-preview__stat-label">{t('points', 'pwen')}</span>
              </div>
            )}
            <div className="exam-preview__stat">
              <span className="exam-preview__stat-value">{sectionCount || (isLoading ? '…' : '—')}</span>
              <span className="exam-preview__stat-label">{t('section', 'seksyon')}{sectionCount > 1 ? t('s', '') : ''}</span>
            </div>
          </div>

          {autoGradable > 0 && (
            <p className="exam-preview__autograde">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
              {isCreole
                ? `${autoGradable} kesyon korije otomatikman`
                : `${autoGradable} question${autoGradable !== 1 ? 's' : ''} corrigée${autoGradable !== 1 ? 's' : ''} automatiquement`}
            </p>
          )}

          {/* Section structure */}
          <section className="exam-preview__block">
            <h3 className="exam-preview__block-title">{t('Structure', 'Estrikti')}</h3>
            {isLoading ? (
              <div className="exam-preview__skeleton">
                <span /><span /><span />
              </div>
            ) : sectionRows.length > 0 ? (
              <ol className="exam-preview__sections">
                {sectionRows.map((sec, i) => (
                  <li key={i} className="exam-preview__section-row">
                    <span className="exam-preview__section-dot" style={{ background: color }} />
                    <span className="exam-preview__section-name">{sec.title}</span>
                    <span className="exam-preview__section-qty">{sec.count}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="exam-preview__muted">{t('Structure indisponible.', 'Estrikti pa disponib.')}</p>
            )}
          </section>

          {/* Question-type breakdown */}
          {typeEntries.length > 0 && (
            <section className="exam-preview__block">
              <h3 className="exam-preview__block-title">{t('Types de questions', 'Kalite kesyon')}</h3>
              <div className="exam-preview__chips">
                {typeEntries.map(([type, count]) => {
                  const meta = QUESTION_TYPE_META[type] || QUESTION_TYPE_META.unknown;
                  return (
                    <span key={type} className="exam-preview__chip">
                      {meta.label} <strong>{String(count)}</strong>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* Tracks / filières */}
          {tracks.length > 0 && (
            <section className="exam-preview__block">
              <h3 className="exam-preview__block-title">{t('Filières', 'Filyè')}</h3>
              <div className="exam-preview__chips">
                {tracks.map((t) => (
                  <span key={t} className="exam-preview__chip exam-preview__chip--track">
                    {TRACK_BY_CODE[t]?.shortLabel || t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Sample question teaser */}
          {sample && (
            <section className="exam-preview__block">
              <h3 className="exam-preview__block-title">{t("Aperçu d'une question", 'Apèsi yon kesyon')}</h3>
              <div className="exam-preview__sample">
                <div className="exam-preview__sample-text">
                  <InstructionRenderer text={sample.question} inline={false} />
                  {sampleOptions.length > 0 && (
                    <ul className="exam-preview__sample-options">
                      {sampleOptions.slice(0, 4).map(([key, text]) => (
                        <li key={key}>
                          <span className="exam-preview__sample-opt-letter">{String(key).toUpperCase()}.</span>
                          <span><InstructionRenderer text={String(text)} inline /></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="exam-preview__sample-fade" aria-hidden="true" />
              </div>
              <p className="exam-preview__sample-note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                {isCreole ? `Kòmanse egzamen an pou wè ${qCount} kesyon yo.` : `Commencez l'examen pour voir les ${qCount} questions.`}
              </p>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="exam-preview__footer">
          <div className="exam-preview__footer-actions">
            <button className="exam-preview__btn exam-preview__btn--ghost" onClick={fullPreview} type="button">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
              {t('Aperçu complet', 'Apèsi konplè')}
            </button>
            <button
              ref={startBtnRef}
              className="exam-preview__btn exam-preview__btn--primary"
              style={{ background: color }}
              onClick={startNow}
              type="button"
              aria-keyshortcuts="Enter"
            >
              <span>{attempt ? t('Refaire', 'Refè') : t('Commencer', 'Kòmanse')}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </button>
          </div>
          <p className="exam-preview__footer-hint">
            <kbd>Entrée</kbd> {t('pour commencer', 'pou kòmanse')} <kbd>Échap</kbd> {t('pour fermer', 'pou fèmen')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
