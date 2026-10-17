import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, X, BookOpen, PlayCircle, ClipboardList, Gamepad2, Compass, Sparkles, MessageCircle,
  RotateCcw, AlertTriangle,
} from '../icons';
import useStore from '../../contexts/store';
import {
  getSearchIndex, __resetSearchIndex, type SearchItem, type SearchItemType,
} from '../../services/searchIndex';
import {
  rankResults, rowContext, typeTag, indexHealth, readableCourseMeta,
  type IndexStatus, type RankedGroup, type RankedRow,
} from './rank';
import './SearchOverlay.css';

/**
 * SearchOverlay — the search front door (navbar icon / Cmd+K / Ctrl+K).
 *
 * Two layers by design: keystrokes stay LOCAL (instant, free, 2G-friendly)
 * over the session index of courses, lessons, exams, games and pages; the AI
 * layer is the pinned "Ask Sandra" row, which hands the raw query to the
 * existing Sandra brain (RAG + study-plan tools) only on an explicit choice.
 *
 * Accessibility (audit #16, PRD LJ-11) — W3C APG modal dialog + combobox:
 *   • The dialog is portalled to <body>; while it is open every other child of
 *     <body> (the app root included) gets `inert`, so nothing behind it can be
 *     focused, clicked or read.
 *   • Tab / Shift+Tab cycle inside the panel; Escape closes from anywhere.
 *   • Focus returns to whatever opened the dialog (the navbar button, or the
 *     element that had focus when Cmd+K was pressed).
 *   • The input is a combobox. Focus never leaves it while browsing results:
 *     arrows move `aria-activedescendant` over the listbox options, so screen
 *     readers announce the active option, and that option is scrolled into
 *     view. The Sandra row is the last option (owned by the listbox).
 *   • A polite live region states loading, failure, result count, no result.
 */

const TYPE_ICONS: Record<SearchItemType, typeof Search> = {
  course: BookOpen,
  lesson: PlayCircle,
  exam: ClipboardList,
  game: Gamepad2,
  page: Compass,
  action: Sparkles,
};

/** How long a first index build may take before we call it failed. */
const INDEX_TIMEOUT_MS = 15000;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function SearchOverlay() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const setSandraAsk = useStore((s) => s.setSandraAsk);
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState<IndexStatus>('loading');
  const [missing, setMissing] = useState<{ courses: boolean; exams: boolean }>({ courses: false, exams: false });
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const skipRestoreRef = useRef(false);

  const uid = useId().replace(/:/g, '');
  const listboxId = `search-listbox-${uid}`;
  const optionId = (i: number) => `search-opt-${uid}-${i}`;
  const sandraId = `search-sandra-${uid}`;

  // Cmd/Ctrl+K toggles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useStore.getState().searchOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // Open: remember the trigger, make the background inert, focus the input.
  // Close (cleanup): lift inert FIRST, then hand focus back — focus cannot
  // land on an element that is still inside an inert subtree.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    returnFocusRef.current = prev instanceof HTMLElement && prev !== document.body ? prev : null;
    skipRestoreRef.current = false;

    const madeInert: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === overlayRef.current || el.hasAttribute('inert')) continue;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      el.setAttribute('inert', '');
      madeInert.push(el);
    }
    inputRef.current?.focus();

    return () => {
      madeInert.forEach((el) => el.removeAttribute('inert'));
      const back = returnFocusRef.current;
      if (!skipRestoreRef.current && back && back.isConnected) {
        try { back.focus({ preventScroll: true }); } catch { back.focus(); }
      }
    };
  }, [open]);

  // Escape closes wherever focus is; a stray focus outside (a browser without
  // `inert`) is pulled back into the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && e.target instanceof Node && !panel.contains(e.target)) inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, setOpen]);

  // Reset the query each time the dialog opens.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); }
  }, [open]);

  // Build (or reuse) the index on open, on language change, and on retry.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setStatus('loading');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('search-index-timeout')), INDEX_TIMEOUT_MS);
    });
    Promise.race([getSearchIndex(ht ? 'ht' : 'fr'), timeout])
      .then((items) => {
        if (!alive) return;
        const h = indexHealth(items);
        setIndex(items);
        setMissing({ courses: h.missingCourses, exams: h.missingExams });
        setStatus(h.ok ? 'ready' : 'failed');
        // The index memoises what it built, failures included; forget it so
        // the next open (or Réessayer) fetches again.
        if (!h.ok) __resetSearchIndex();
      })
      .catch(() => {
        if (!alive) return;
        setMissing({ courses: true, exams: true });
        setStatus('failed');
        __resetSearchIndex();
      })
      .finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); };
  }, [open, ht, attempt]);

  const groups: RankedGroup[] = useMemo(() => rankResults(index, query), [index, query]);
  const flat: RankedRow[] = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const hasQuery = !!query.trim();
  // The flat keyboard list = results + the Sandra row (last).
  const rowCount = flat.length + (hasQuery ? 1 : 0);
  const activeIdx = rowCount ? Math.min(active, rowCount - 1) : -1;
  const activeId = activeIdx < 0 ? undefined : activeIdx < flat.length ? optionId(activeIdx) : sandraId;

  useEffect(() => setActive(0), [query]);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (!open || !activeId) return;
    const el = document.getElementById(activeId) as (HTMLElement & { scrollIntoView?: (o?: any) => void }) | null;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeId]);

  // Subjects that actually exist in the index — offered when nothing matched.
  const subjectSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const it of index) {
      if (it.type !== 'course') continue;
      const subject = readableCourseMeta(it.subtitle, ht).split(' · ')[0];
      if (subject) seen.add(subject);
    }
    return Array.from(seen).slice(0, 5);
  }, [index, ht]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const go = (to: string) => {
    close();
    navigate(to);
  };

  const askSandra = () => {
    const q = query.trim();
    if (!q) return;
    // Sandra's panel takes focus; do not pull it back to the trigger.
    skipRestoreRef.current = true;
    close();
    setSandraAsk(q);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (rowCount === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIdx + 1) % rowCount); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIdx - 1 + rowCount) % rowCount); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(rowCount - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx < flat.length) go(flat[activeIdx].to);
      else askSandra();
    }
  };

  // Focus trap: Tab and Shift+Tab wrap inside the panel.
  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((n) => !n.hasAttribute('inert') && n.getAttribute('aria-hidden') !== 'true');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const current = document.activeElement;
    if (e.shiftKey && (current === first || !panelRef.current.contains(current))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (current === last || !panelRef.current.contains(current))) {
      e.preventDefault();
      first.focus();
    }
  };

  const groupLabel = (key: RankedGroup['key']): string => ({
    best: L('Meilleurs résultats', 'Pi bon rezilta yo'),
    action: L('Actions', 'Aksyon'),
    page: L('Pages', 'Paj'),
    course: L('Cours', 'Kou'),
    lesson: L('Leçons', 'Leson'),
    exam: L('Examens', 'Egzamen'),
    game: L('Jeux', 'Jwèt'),
  })[key];

  const loading = status === 'loading';
  const failed = status === 'failed';
  const noResults = hasQuery && !loading && flat.length === 0;

  const failedText = missing.courses
    ? L(
      'Les cours et les leçons n’ont pas pu être chargés : les résultats sont incomplets.',
      'Nou pa t ka chaje kou ak leson yo : rezilta yo pa konplè.',
    )
    : L(
      'Les examens n’ont pas pu être chargés : les résultats sont incomplets.',
      'Nou pa t ka chaje egzamen yo : rezilta yo pa konplè.',
    );

  // One sentence for assistive tech; the visible UI says the same thing.
  const liveText = loading
    ? L('Chargement des cours, leçons et examens…', 'Ap chaje kou, leson ak egzamen…')
    : failed
      ? failedText
      : !hasQuery
        ? ''
        : flat.length === 0
          ? L(`Aucun résultat pour « ${query.trim()} ».`, `Pa gen rezilta pou « ${query.trim()} ».`)
          : L(
            `${flat.length} résultat${flat.length > 1 ? 's' : ''}. Flèches haut et bas pour parcourir, Entrée pour ouvrir.`,
            `${flat.length} rezilta. Flèch anwo ak anba pou pase, Antre pou louvri.`,
          );

  let optionIndex = -1;

  const overlay = (
    <div
      ref={overlayRef}
      className="search-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        ref={panelRef}
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label={L('Recherche', 'Rechèch')}
        onKeyDown={onPanelKeyDown}
      >
        <div className="search-panel__bar">
          <Search size={19} aria-hidden />
          <input
            ref={inputRef}
            className="search-panel__input"
            type="text"
            role="combobox"
            aria-expanded={hasQuery}
            aria-controls={hasQuery ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={hasQuery ? activeId : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={L('Cours, leçons, examens, jeux…', 'Kou, leson, egzamen, jwèt…')}
            aria-label={L('Rechercher', 'Chèche')}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className="search-panel__close" onClick={close} aria-label={L('Fermer la recherche', 'Fèmen rechèch la')}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="search-sr-only" role="status" aria-live="polite">{liveText}</p>

        <div className="search-panel__body">
          {failed && (
            <div className="search-notice search-notice--failed">
              <AlertTriangle size={17} aria-hidden />
              <span className="search-notice__text">{failedText}</span>
              <button
                type="button"
                className="button button--ghost button--sm search-notice__retry"
                onClick={() => { setAttempt((a) => a + 1); inputRef.current?.focus(); }}
              >
                <RotateCcw size={15} aria-hidden /> {L('Réessayer', 'Eseye ankò')}
              </button>
            </div>
          )}

          {loading && (
            <p className="search-notice search-notice--loading">
              {L('Chargement des cours, leçons et examens…', 'Ap chaje kou, leson ak egzamen…')}
            </p>
          )}

          {!hasQuery ? (
            <div className="search-panel__hints">
              <p className="search-panel__hint-title">{L('Raccourcis', 'Rakousi')}</p>
              <div className="search-panel__chips">
                {[
                  { label: L('Tous les cours', 'Tout kou yo'), to: '/courses' },
                  { label: L('Examens du Bac', 'Egzamen Bak'), to: '/exams' },
                  { label: L('Créer mon plan d’étude', 'Kreye plan etid mwen'), to: '/study-plan' },
                  { label: L('Jeux', 'Jwèt'), to: '/jeux' },
                ].map((c) => (
                  <button key={c.to} type="button" className="search-chip" onClick={() => go(c.to)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="search-panel__hint-sandra">
                <MessageCircle size={16} aria-hidden />
                {L(
                  'Astuce : tapez une question et demandez-la à Sandra — elle peut aussi créer votre plan d’étude.',
                  'Ti konsèy : ekri yon kesyon epi mande Sandra li — li ka kreye plan etid ou tou.'
                )}
              </p>
            </div>
          ) : noResults ? (
            <div className="search-empty">
              <p className="search-empty__title">
                {L('Aucun résultat pour', 'Pa gen rezilta pou')} « {query.trim()} »
              </p>
              <p className="search-empty__tip">
                {L(
                  'Vérifie l’orthographe, essaie un mot plus court ou le nom d’une matière.',
                  'Verifye òtograf la, eseye yon mo pi kout oswa non yon matyè.',
                )}
              </p>
              {subjectSuggestions.length > 0 && (
                <div className="search-panel__chips" aria-label={L('Essayer une matière', 'Eseye yon matyè')} role="group">
                  {subjectSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="search-chip"
                      onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <p className="search-empty__links">
                <Link to="/courses" onClick={close}>{L('Parcourir tous les cours', 'Gade tout kou yo')}</Link>
                <Link to="/exams" onClick={close}>{L('Voir les examens', 'Gade egzamen yo')}</Link>
              </p>
            </div>
          ) : null}

          {hasQuery && (
            <div
              id={listboxId}
              className="search-panel__list"
              role="listbox"
              aria-label={L('Résultats', 'Rezilta')}
              aria-owns={sandraId}
            >
              {groups.map((g) => {
                const headId = `search-group-${uid}-${g.key}`;
                return (
                  <div key={g.key} role="group" aria-labelledby={headId} className={`search-group search-group--${g.key}`}>
                    <div id={headId} className="search-panel__eyebrow">{groupLabel(g.key)}</div>
                    {g.rows.map((r) => {
                      optionIndex += 1;
                      const i = optionIndex;
                      const Icon = TYPE_ICONS[r.type];
                      const context = rowContext(r, ht);
                      return (
                        <div
                          key={`${g.key}-${r.to}`}
                          id={optionId(i)}
                          role="option"
                          aria-selected={i === activeIdx}
                          className={`search-row${i === activeIdx ? ' is-active' : ''}`}
                          onMouseMove={() => { if (i !== activeIdx) setActive(i); }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => go(r.to)}
                        >
                          <span className="search-row__icon" aria-hidden><Icon size={17} /></span>
                          <span className="search-row__text">
                            <span className="search-row__title">{r.title}</span>
                            {context && <span className="search-row__sub">{context}</span>}
                          </span>
                          {g.key === 'best' && <span className="search-row__tag">{typeTag(r.type, ht)}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hasQuery && (
          <div
            id={sandraId}
            role="option"
            aria-selected={activeIdx === flat.length}
            className={`search-sandra${activeIdx === flat.length ? ' is-active' : ''}`}
            onMouseMove={() => { if (activeIdx !== flat.length) setActive(flat.length); }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={askSandra}
          >
            <span className="search-sandra__icon" aria-hidden><MessageCircle size={17} /></span>
            <span className="search-sandra__text">
              {L('Demander à Sandra :', 'Mande Sandra :')} <strong>« {query.trim()} »</strong>
            </span>
            <span className="search-sandra__kbd" aria-hidden>↵</span>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
