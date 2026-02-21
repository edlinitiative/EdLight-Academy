import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getLessonIcon(type) {
  switch (type) {
    case 'quiz':    return '';
    case 'reading': return '📖';
    case 'video':
    default:        return '';
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
  const { t } = useTranslation();
  const [expandedModules, setExpandedModules] = useState(() => loadExpanded(courseId));
  const activeLessonRef = useRef(null);
  const listRef = useRef(null);

  // Reload persisted expansion when course changes
  useEffect(() => {
    setExpandedModules(loadExpanded(courseId));
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

  const renderRows = modules.map((module, idx) => ({
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
    <>
      <div
        className={`lesson-sidebar__backdrop ${isOpen ? 'lesson-sidebar__backdrop--visible' : ''}`}
        aria-hidden={!isOpen}
        onClick={() => onOpenChange(false)}
      />

      <aside className={`lesson-sidebar ${isOpen ? 'lesson-sidebar--visible' : ''}`}>
        <div className="lesson-sidebar__header">
          <div>
            <h3 className="lesson-sidebar__heading">{t('courses.courseContent', 'Contenu du cours')}</h3>

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
                {t('courses.lessonsCompletedProgress', '{{completed}} sur {{total}} leçons terminées', {
                  completed: completedCount,
                  total: totalLessons,
                })}
              </span>
            </div>
          )}
          </div>
          <button
            className="lesson-sidebar__close"
            onClick={() => onOpenChange(false)}
            type="button"
            aria-label={t('courses.closeSidebar', 'Fermer le menu')}
          >
            ✕
          </button>
        </div>

        <div className="lesson-list" ref={listRef} onKeyDown={handleKeyDown}>
          {renderRows.length > 0 ? (
            renderRows.map(({ module, idx, isExpanded, lessonsToShow }) => {
              const isActiveModule = idx === activeModule;
              const hasLessons = Array.isArray(module.lessons) && module.lessons.length > 0;
              const childrenId = `module-lessons-${module.id ?? idx}`;

              return (
                <div key={module.id ?? idx} className="lesson-list__group">
                  <button
                    data-nav
                    className={`lesson-list__item lesson-list__item--module ${isActiveModule ? 'lesson-list__item--active' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                    aria-expanded={hasLessons ? isExpanded : undefined}
                    aria-controls={hasLessons ? childrenId : undefined}
                    onClick={() => {
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
                  </button>

                  {lessonsToShow && (
                    <div className="lesson-list__children" id={childrenId}>
                      {lessonsToShow.map(({ lsn, lidx }) => {
                        const isActiveLesson = isActiveModule && lidx === activeLesson;
                        const isCompleted = progress?.completedLessons?.includes(lsn.id) || false;
                        const icon = getLessonIcon(lsn.type);
                        return (
                          <button
                            key={lsn.id ?? `${idx}-${lidx}`}
                            data-nav
                            ref={isActiveLesson ? activeLessonRef : null}
                            type="button"
                            className={`lesson-list__item lesson-list__item--lesson ${isActiveLesson ? 'lesson-list__item--active' : ''} ${isCompleted ? 'lesson-list__item--completed' : ''}`}
                            onClick={() => {
                              onSelectLesson(idx, lidx);
                              onOpenChange(false);
                            }}
                          >
                            <span className="lesson-list__index">
                              {isCompleted ? '✓' : `${idx + 1}.${lidx + 1}`}
                            </span>
                            <span className="lesson-list__meta">
                              {icon ? (
                                <span className="lesson-list__type-icon" aria-hidden>
                                  {icon}
                                </span>
                              ) : null}
                              <span className="lesson-list__title">{lsn.title}</span>
                            </span>
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
              {t('courses.sidebarEmpty', 'Les modules de ce cours apparaîtront ici bientôt.')}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
