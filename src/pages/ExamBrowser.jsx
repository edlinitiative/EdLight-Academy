import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  buildExamIndex,
  subjectColor,
  examStats,
  QUESTION_TYPE_META,
} from '../utils/examUtils';

/** Fetch and cache the exam catalog */
function useExamCatalog() {
  return useQuery({
    queryKey: ['exam-catalog'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog.json');
      if (!res.ok) throw new Error('Failed to load exam catalog');
      return res.json();
    },
    staleTime: Infinity, // static asset, never re-fetch
  });
}

const ExamBrowser = () => {
  const navigate = useNavigate();

  const { data: rawExams, isLoading, error } = useExamCatalog();

  // Build index once
  const index = useMemo(() => {
    if (!rawExams) return null;
    return buildExamIndex(rawExams);
  }, [rawExams]);

  // Filter state
  const [levelFilter, setLevelFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [search, setSearch] = useState('');

  // Filtered list
  const filtered = useMemo(() => {
    if (!index) return [];
    let list = index.exams;

    if (levelFilter) list = list.filter((e) => e._level === levelFilter);
    if (subjectFilter) list = list.filter((e) => e._subject === subjectFilter);
    if (yearFilter) list = list.filter((e) => e._year === parseInt(yearFilter, 10));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          (e.exam_title || '').toLowerCase().includes(q) ||
          (e._subject || '').toLowerCase().includes(q) ||
          (e._yearRaw || '').toLowerCase().includes(q)
      );
    }

    // Sort: newest first
    return [...list].sort((a, b) => (b._year || 0) - (a._year || 0));
  }, [index, levelFilter, subjectFilter, yearFilter, search]);

  // Summary counts for filtered set
  const summary = useMemo(() => {
    const totalQ = filtered.reduce((s, e) => s + e._questionCount, 0);
    const gradable = filtered.reduce((s, e) => s + e._autoGradable, 0);
    return { exams: filtered.length, totalQ, gradable };
  }, [filtered]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="section">
        <div className="page-header">
          <h1 className="page-header__title">Examens</h1>
          <p className="page-header__subtitle">Chargement du catalogue…</p>
        </div>
        <div className="card card--centered card--loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section">
        <div className="page-header">
          <h1 className="page-header__title">Examens</h1>
        </div>
        <div className="card card--message">
          <p>Erreur: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      {/* Header */}
      <div className="page-header exam-browser__header">
        <h1 className="page-header__title">📝 Examens Nationaux</h1>
        <p className="page-header__subtitle">
          {summary.exams} examens • {summary.totalQ.toLocaleString()} questions •{' '}
          {summary.gradable.toLocaleString()} auto-corrigées
        </p>

        {/* Filters */}
        <div className="exam-browser__filters">
          {/* Level */}
          <select
            className="exam-browser__select"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">Tous les niveaux</option>
            {index.levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* Subject */}
          <select
            className="exam-browser__select"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option value="">Toutes les matières</option>
            {index.subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Year */}
          <select
            className="exam-browser__select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="">Toutes les années</option>
            {index.years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Search */}
          <div className="exam-browser__search-wrap">
            <svg className="exam-browser__search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="exam-browser__search"
              type="text"
              placeholder="Rechercher un examen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="card card--message">
          <p>Aucun examen trouvé. Essayez de modifier vos filtres.</p>
        </div>
      ) : (
        <div className="grid grid--exams">
          {filtered.map((exam) => (
            <ExamCard
              key={exam._idx}
              exam={exam}
              onClick={() => navigate(`/exams/${exam._idx}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Exam Card Component ──────────────────────────────────────────────────────

function ExamCard({ exam, onClick }) {
  const color = subjectColor(exam._subject);
  const stats = {
    total: exam._questionCount,
    gradable: exam._autoGradable,
  };

  // Top question types for this exam
  const topTypes = Object.entries(exam._typeCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <button className="card exam-card" onClick={onClick} type="button">
      <div className="exam-card__header">
        <span
          className="exam-card__subject-badge"
          style={{ background: color + '18', color }}
        >
          {exam._subject}
        </span>
        {exam._year && <span className="exam-card__year">{exam._year}</span>}
      </div>

      <h3 className="exam-card__title">{exam.exam_title || 'Examen'}</h3>

      <div className="exam-card__meta">
        <span className="exam-card__level">{exam._level}</span>
        {exam.duration_minutes && (
          <span className="exam-card__duration">⏱ {exam.duration_minutes} min</span>
        )}
        {exam.language && (
          <span className="exam-card__lang">{exam.language === 'fr' ? '🇫🇷' : exam.language === 'ht' ? '🇭🇹' : '🇬🇧'}</span>
        )}
      </div>

      <div className="exam-card__stats">
        <span>{stats.total} question{stats.total !== 1 ? 's' : ''}</span>
        {stats.gradable > 0 && (
          <span className="exam-card__gradable">
            ✓ {stats.gradable} auto-corrigée{stats.gradable !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="exam-card__types">
        {topTypes.map(([type, count]) => {
          const meta = QUESTION_TYPE_META[type] || QUESTION_TYPE_META.unknown;
          return (
            <span key={type} className="exam-card__type-chip">
              {meta.icon} {meta.label} ({count})
            </span>
          );
        })}
      </div>

      <div className="exam-card__cta">
        <span className="button button--primary button--sm">
          Commencer →
        </span>
      </div>
    </button>
  );
}

export default ExamBrowser;
