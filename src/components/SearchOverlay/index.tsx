import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, BookOpen, PlayCircle, ClipboardList, Gamepad2, Compass, Sparkles, MessageCircle,
} from 'lucide-react';
import useStore from '../../contexts/store';
import {
  getSearchIndex, searchItems, type SearchItem, type SearchResult, type SearchItemType,
} from '../../services/searchIndex';
import './SearchOverlay.css';

/**
 * SearchOverlay — the search front door (navbar icon / Cmd+K / Ctrl+K).
 *
 * Two layers by design: keystrokes stay LOCAL (instant, free, 2G-friendly)
 * over the session index of courses, lessons, exams, games and pages; the AI
 * layer is the pinned "Ask Sandra" row, which hands the raw query to the
 * existing Sandra brain (RAG + study-plan tools) only on an explicit tap.
 */

const TYPE_ICONS: Record<SearchItemType, typeof Search> = {
  course: BookOpen,
  lesson: PlayCircle,
  exam: ClipboardList,
  game: Gamepad2,
  page: Compass,
  action: Sparkles,
};

const GROUP_ORDER: SearchItemType[] = ['action', 'page', 'course', 'lesson', 'exam', 'game'];
const GROUP_LIMIT: Record<SearchItemType, number> = {
  action: 3, page: 4, course: 4, lesson: 4, exam: 5, game: 3,
};

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
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+K opens; Esc closes (Esc handled on the input + overlay).
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

  // Build the index lazily on first open (and when the language flips).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    getSearchIndex(ht ? 'ht' : 'fr').then((items) => {
      if (alive) setIndex(items);
    });
    inputRef.current?.focus();
    setQuery('');
    setActive(0);
    return () => { alive = false; };
  }, [open, ht]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const ranked = searchItems(index, query, 60);
    // Group, cap per group, then flatten in display order.
    const grouped = new Map<SearchItemType, SearchResult[]>();
    for (const r of ranked) {
      const bucket = grouped.get(r.type) || [];
      if (bucket.length < GROUP_LIMIT[r.type]) bucket.push(r);
      grouped.set(r.type, bucket);
    }
    return GROUP_ORDER.flatMap((type) => grouped.get(type) || []);
  }, [index, query]);

  // The flat keyboard list = results + the Sandra row (last).
  const rowCount = results.length + (query.trim() ? 1 : 0);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const go = (item: SearchItem) => {
    close();
    navigate(item.to);
  };

  const askSandra = () => {
    const q = query.trim();
    if (!q) return;
    close();
    setSandraAsk(q);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (rowCount === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % rowCount); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + rowCount) % rowCount); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < results.length) go(results[active]);
      else askSandra();
    }
  };

  const groupLabel = (type: SearchItemType): string => ({
    action: L('Actions', 'Aksyon'),
    page: L('Pages', 'Paj'),
    course: L('Cours', 'Kou'),
    lesson: L('Leçons', 'Leson'),
    exam: L('Examens', 'Egzamen'),
    game: L('Jeux', 'Jwèt'),
  })[type];

  // Precompute group boundaries for section eyebrows.
  let lastType: SearchItemType | null = null;

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label={L('Recherche', 'Rechèch')} onClick={close}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="search-panel__bar">
          <Search size={19} aria-hidden />
          <input
            ref={inputRef}
            className="search-panel__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L('Cours, leçons, examens, jeux…', 'Kou, leson, egzamen, jwèt…')}
            aria-label={L('Rechercher', 'Chèche')}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="button" className="search-panel__close" onClick={close} aria-label={L('Fermer', 'Fèmen')}>
            <X size={17} aria-hidden />
          </button>
        </div>

        <div className="search-panel__body" ref={listRef}>
          {!query.trim() ? (
            <div className="search-panel__hints">
              <p className="search-panel__hint-title">{L('Suggestions', 'Sijesyon')}</p>
              <div className="search-panel__chips">
                {[
                  { label: L('Créer mon plan d’étude', 'Kreye plan etid mwen'), to: '/study-plan' },
                  { label: L('Examens du Bac', 'Egzamen Bak'), to: '/exams' },
                  { label: L('Jeux', 'Jwèt'), to: '/jeux' },
                  { label: L('Cours', 'Kou'), to: '/courses' },
                ].map((c) => (
                  <button key={c.to} type="button" className="search-chip" onClick={() => go({ type: 'page', title: c.label, to: c.to })}>
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="search-panel__hint-sandra">
                <MessageCircle size={14} aria-hidden />
                {L(
                  'Astuce : tapez une question et demandez-la à Sandra — elle peut aussi créer votre plan d’étude.',
                  'Ti konsèy : ekri yon kesyon epi mande Sandra li — li ka kreye plan etid ou tou.'
                )}
              </p>
            </div>
          ) : (
            <>
              {results.length === 0 && (
                <p className="search-panel__none">
                  {L('Aucun résultat local pour', 'Pa gen rezilta lokal pou')} « {query.trim()} »
                </p>
              )}
              <ul className="search-panel__list" role="listbox" aria-label={L('Résultats', 'Rezilta')}>
                {results.map((r, i) => {
                  const Icon = TYPE_ICONS[r.type];
                  const showEyebrow = r.type !== lastType;
                  lastType = r.type;
                  return (
                    <React.Fragment key={`${r.to}-${i}`}>
                      {showEyebrow && <li className="search-panel__eyebrow" aria-hidden>{groupLabel(r.type)}</li>}
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === active}
                          className={`search-row${i === active ? ' is-active' : ''}`}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(r)}
                        >
                          <span className="search-row__icon"><Icon size={16} /></span>
                          <span className="search-row__text">
                            <span className="search-row__title">{r.title}</span>
                            {r.subtitle && <span className="search-row__sub">{r.subtitle}</span>}
                          </span>
                        </button>
                      </li>
                    </React.Fragment>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {query.trim() && (
          <button
            type="button"
            className={`search-sandra${active === results.length ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(results.length)}
            onClick={askSandra}
          >
            <span className="search-sandra__icon"><MessageCircle size={17} aria-hidden /></span>
            <span className="search-sandra__text">
              {L('Demander à Sandra :', 'Mande Sandra :')} <strong>« {query.trim()} »</strong>
            </span>
            <span className="search-sandra__kbd" aria-hidden>↵</span>
          </button>
        )}
      </div>
    </div>
  );
}
