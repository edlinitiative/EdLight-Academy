import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLessonIcon(type) {
  switch (type) {
    case 'quiz':    return '📝';
    case 'reading': return '📖';
    case 'video':
    default:        return '▶';
  }
}

const STORAGE_KEY = (courseId) => `sidebar-expanded:${courseId}`;

function loadExpanded(courseId) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(courseId));
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set([0]);
}

function saveExpanded(courseId, set) {
  try {
    sessionStorage.setItem(STORAGE_KEY(courseId), JSON.stringify([...set]));
  } catch {}
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CourseSidebar({
  courseId,
  modules = [],
  activeModule,
  activeLesson,
  progress,
  isEnrolled,
  isOpen,
  onOpenChange,
  onSelectLesson,
}) {
  const [expandedModules, setExpandedModules] = useState(() => loadExpanded(courseId));
  const [query, setQuery] = useState('');
  const activeLessonRef = useRef(null);
  const listRef = useRef(null);

  // Reload persisted expansion + clear search when course changes
  useEffect(() => {
    setExpandedModules(loadExpanded(courseId));
    setQuery('');
  }, [courseId]);

  // Always keep the active module expanded when it changes
  useEffect(() => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.add(activeModule);
      return next;
    });
  }, [activeModule]);

  // Persist expansion state to sessionStorage
  useEffect(() => {
    if (courseId) saveExpanded(courseId, expandedModules);
  }, [courseId, expandedModules]);

  // Auto-scroll the active lesson into view whenever the active lesson changes
  useEffect(() => {
    activeLessonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeModule, activeLesson]);

  // Overall progress stats for the header bar
  const totalLessons = modules.reduce((sum, m) => sum + (m.lessons?.length || 0), 0);
  const completedCount = progress?.completedLessons?.length || 0;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // ─── Search filter ──────────────────────────────────────────────────────
  const lowerQuery = query.toLowerCase().trim();

  const renderRows = lowerQuery
    ? modules
        .map((module, idx) => {
          const titleMatches = module.title?.toLowerCase().includes(lowerQuery);
          const matchingLessons = (module.lessons || [])
            .map((lsn, lidx) => ({ lsn, lidx }))
            .filter(({ lsn }) => lsn.title?.toLowerCase().includes(lowerQuery));
          if (!titleMatches && matchingLessons.length === 0) return null;
          return {
            module,
            idx,
            isExpanded: true,
            lessonsToShow: titleMatches
              ? (module.lessons || []).map((lsn, lidx) => ({ lsn, lidx }))
              : matchingLessons,
          };
        })
        .filter(Boolean)
    : modules.map((module, idx) => ({
        module,
        idx,
        isExpanded: expandedModules.has(idx),
        lessonsToShow:
          expandedModules.has(idx) && Array.isArray(module.lessons)
            ? module.lessons.map((lsn, lidx) => ({ lsn, lidx }))
            : null,
      }));

  // ─── Keyboard navigation ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(listRef.current?.querySelectorAll('button[data-nav]') ?? []);
    const current = buttons.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? buttons[current + 1] : buttons[current - 1];
    next?.focus();
  }, []);

  return (
    <aside className={`lesson-sidebar ${isOpen ? 'lesson-sidebar--visible' : ''}`}>
      <div className="lesson-sidebar__header">
        <div>
          <h3 className="lesson-sidebar__heading">Course Content</h3>

          {/* Overall progress bar — enrolled users with at least one completed lesson */}
          {isEnrolled && progress && completedCount > 0 && (
            <div className="lesson-sidebar__progress">
              <div className="lesson-sidebar__progress-bar">
                <div
                  className="lesson-sidebar__progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="lesson-sidebar__progress-label text-muted">
                {completedCount} of {totalLessons} lessons completed
              </span>
            </div>
          )}

          <p className="text-muted lesson-sidebar__description">
            {isEnrolled
              ? 'Track your progress across each module and revisit lessons anytime.'
              : 'Preview the modules covered in this course. Enroll to unlock full lessons.'}
          </p>
        </div>
        <button
          className="lesson-sidebar__close"
          onClick={() => onOpenChange(false)}
          type="button"
          aria-label="Close sidebar"
        >
          ✕
        </button>
      </div>

      {/* Search filter */}
      <div className="lesson-sidebar__search">
        <span className="lesson-sidebar__search-icon" aria-hidden>🔍</span>
        <input
          className="lesson-sidebar__search-input"
          type="search"
          placeholder="Search lessons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search lessons"
        />
        {query && (
          <button
            className="lesson-sidebar__search-clear"
            onClick={() => setQuery('')}
            type="button"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="lesson-list" ref={listRef} onKeyDown={handleKeyDown}>
        {renderRows.length > 0 ? (
          renderRows.map(({ module, idx, isExpanded, lessonsToShow }) => {
            const isActiveModule = idx === activeModule;
            const hasLessons = Array.isArray(module.lessons) && module.lessons.length > 0;
            const moduleLessonCount = module.lessons?.length || 0;
            const moduleCompletedCount =
              isEnrolled && progress
                ? (module.lessons || []).filter((lsn) =>
                    progress?.completedLessons?.includes(lsn.id)
                  ).length
                : null;

            return (
              <div key={module.id ?? idx} className="lesson-list__group">
                <button
                  data-nav
                  className={`lesson-list__item ${isActiveModule ? 'lesson-list__item--active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                  onClick={() => {
                    if (lowerQuery) {
                      // In search mode navigate to the module's first lesson
                      onSelectLesson(idx, 0);
                      return;
                    }
                    if (isActiveModule) {
                      setExpandedModules((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    } else {
                      onSelectLesson(idx, 0);
                      setExpandedModules((prev) => {
                        const next = new Set(prev);
                        next.add(idx);
                        return next;
                      });
                    }
                  }}
                  type="button"
                >
                  <span className="lesson-list__index">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="lesson-list__meta">
                    <span className="lesson-list__title">{module.title}</span>
                  </span>
                  <span className="lesson-list__duration">
                    {module.duration
                      ? `${module.duration} min`
                      : module.readingTime
                        ? `${module.readingTime} min read`
                        : moduleCompletedCount !== null && moduleLessonCount > 0
                          ? `${moduleCompletedCount} / ${moduleLessonCount}`
                          : moduleLessonCount > 0
                            ? `${moduleLessonCount} lesson${moduleLessonCount === 1 ? '' : 's'}`
                            : 'Coming soon'}
                  </span>
                  {isActiveModule && (!isExpanded || !hasLessons) && (
                    <span className="chip chip--ghost">Current</span>
                  )}
                  <span className="lesson-list__chevron" aria-hidden>▸</span>
                </button>

                {lessonsToShow && (
                  <div className="lesson-list__children">
                    {lessonsToShow.map(({ lsn, lidx }) => {
                      const isActiveLesson = isActiveModule && lidx === activeLesson;
                      const isCompleted = progress?.completedLessons?.includes(lsn.id) || false;
                      return (
                        <button
                          key={lsn.id ?? `${idx}-${lidx}`}
                          data-nav
                          ref={isActiveLesson ? activeLessonRef : null}
                          type="button"
                          className={`lesson-list__item ${isActiveLesson ? 'lesson-list__item--active' : ''} ${isCompleted ? 'lesson-list__item--completed' : ''}`}
                          onClick={() => {
                            onSelectLesson(idx, lidx);
                            onOpenChange(false);
                          }}
                        >
                          <span className="lesson-list__index">
                            {isCompleted ? '✓' : `${idx + 1}.${lidx + 1}`}
                          </span>
                          <span className="lesson-list__meta">
                            <span className="lesson-list__type-icon" aria-hidden>
                              {getLessonIcon(lsn.type)}
                            </span>
                            <span className="lesson-list__title">{lsn.title}</span>
                          </span>
                          <span className="lesson-list__duration">
                            {lsn.duration
                              ? `${lsn.duration} min`
                              : lsn.readingTime
                                ? `${lsn.readingTime} min read`
                                : ''}
                          </span>
                          {isActiveLesson && <span className="chip chip--ghost">Current</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="lesson-list__empty">
            {lowerQuery
              ? 'No lessons match your search.'
              : 'Modules for this course will appear here shortly.'}
          </div>
        )}
      </div>
    </aside>
  );
}
