import React, { useCallback, useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useKatex, renderWithKatex } from '../utils/shared';

/**
 * Math symbol groups — inspired by Khan Academy's Perseus button sets.
 * Each button inserts a LaTeX template at the cursor position.
 */
const SYMBOL_GROUPS = [
  {
    id: 'basic',
    label: 'Opérations',
    symbols: [
      { display: '+', insert: '+', title: 'Addition' },
      { display: '−', insert: '-', title: 'Soustraction' },
      { display: '×', insert: '\\times ', title: 'Multiplication' },
      { display: '÷', insert: '\\div ', title: 'Division' },
      { display: '=', insert: '=', title: 'Égal' },
      { display: '≠', insert: '\\neq ', title: 'Différent' },
      { display: '±', insert: '\\pm ', title: 'Plus ou moins' },
    ],
  },
  {
    id: 'fractions',
    label: 'Fractions',
    symbols: [
      { display: '▫/▫', insert: '\\frac{▫}{▫}', title: 'Fraction', cursor: 6 },
      { display: 'ˣ/ᵧ', insert: '\\frac{▫}{▫}', title: 'Fraction', cursor: 6 },
    ],
  },
  {
    id: 'powers',
    label: 'Puissances',
    symbols: [
      { display: 'x²', insert: '^{2}', title: 'Au carré' },
      { display: 'xⁿ', insert: '^{▫}', title: 'Puissance', cursor: 2 },
      { display: '√', insert: '\\sqrt{▫}', title: 'Racine carrée', cursor: 6 },
      { display: 'ⁿ√', insert: '\\sqrt[▫]{▫}', title: 'Racine n-ième', cursor: 6 },
      { display: 'x₁', insert: '_{▫}', title: 'Indice', cursor: 2 },
    ],
  },
  {
    id: 'comparisons',
    label: 'Comparaisons',
    symbols: [
      { display: '<', insert: '<', title: 'Inférieur' },
      { display: '>', insert: '>', title: 'Supérieur' },
      { display: '≤', insert: '\\leq ', title: 'Inférieur ou égal' },
      { display: '≥', insert: '\\geq ', title: 'Supérieur ou égal' },
      { display: '≈', insert: '\\approx ', title: 'Environ égal' },
    ],
  },
  {
    id: 'greek',
    label: 'Lettres',
    symbols: [
      { display: 'α', insert: '\\alpha ', title: 'Alpha' },
      { display: 'β', insert: '\\beta ', title: 'Beta' },
      { display: 'γ', insert: '\\gamma ', title: 'Gamma' },
      { display: 'δ', insert: '\\delta ', title: 'Delta' },
      { display: 'π', insert: '\\pi ', title: 'Pi' },
      { display: 'σ', insert: '\\sigma ', title: 'Sigma' },
      { display: 'θ', insert: '\\theta ', title: 'Theta' },
      { display: 'λ', insert: '\\lambda ', title: 'Lambda' },
      { display: 'μ', insert: '\\mu ', title: 'Mu' },
      { display: '∞', insert: '\\infty ', title: 'Infini' },
    ],
  },
  {
    id: 'sets',
    label: 'Ensembles',
    symbols: [
      { display: '∈', insert: '\\in ', title: 'Appartient' },
      { display: '∉', insert: '\\notin ', title: 'N\'appartient pas' },
      { display: '⊂', insert: '\\subset ', title: 'Sous-ensemble' },
      { display: '∪', insert: '\\cup ', title: 'Union' },
      { display: '∩', insert: '\\cap ', title: 'Intersection' },
      { display: 'ℝ', insert: '\\mathbb{R}', title: 'Réels' },
      { display: 'ℕ', insert: '\\mathbb{N}', title: 'Naturels' },
      { display: 'ℤ', insert: '\\mathbb{Z}', title: 'Entiers' },
    ],
  },
  {
    id: 'trig',
    label: 'Fonctions',
    symbols: [
      { display: 'sin', insert: '\\sin(▫)', title: 'Sinus', cursor: 5 },
      { display: 'cos', insert: '\\cos(▫)', title: 'Cosinus', cursor: 5 },
      { display: 'tan', insert: '\\tan(▫)', title: 'Tangente', cursor: 5 },
      { display: 'ln', insert: '\\ln(▫)', title: 'Logarithme naturel', cursor: 4 },
      { display: 'log', insert: '\\log(▫)', title: 'Logarithme', cursor: 5 },
      { display: 'lim', insert: '\\lim_{▫}', title: 'Limite', cursor: 5 },
      { display: '∑', insert: '\\sum_{▫}^{▫}', title: 'Somme', cursor: 5 },
      { display: '∫', insert: '\\int_{▫}^{▫}', title: 'Intégrale', cursor: 5 },
    ],
  },
  {
    id: 'arrows',
    label: 'Flèches',
    symbols: [
      { display: '→', insert: '\\rightarrow ', title: 'Flèche droite' },
      { display: '←', insert: '\\leftarrow ', title: 'Flèche gauche' },
      { display: '⇒', insert: '\\Rightarrow ', title: 'Implique' },
      { display: '⇔', insert: '\\Leftrightarrow ', title: 'Équivalent' },
    ],
  },
  {
    id: 'misc',
    label: 'Divers',
    symbols: [
      { display: '()', insert: '(▫)', title: 'Parenthèses', cursor: 1 },
      { display: '||', insert: '|▫|', title: 'Valeur absolue', cursor: 1 },
      { display: '…', insert: '\\ldots ', title: 'Points de suspension' },
      { display: '∀', insert: '\\forall ', title: 'Pour tout' },
      { display: '∃', insert: '\\exists ', title: 'Il existe' },
    ],
  },
];

/** Placeholder character in templates — cursor will be placed here */
const PLACEHOLDER = '▫';

/**
 * MathKeyboard — a math symbol toolbar + input field + live KaTeX preview.
 *
 * Props:
 *  - value: string (the current LaTeX string)
 *  - onChange: (newValue: string) => void
 *  - onFocus / onBlur: optional callbacks
 *  - placeholder: string
 *  - id: string (for label association)
 *  - ariaLabel: string
 *  - disabled: boolean
 *  - className: string (additional class on the wrapper)
 *  - compact: boolean (smaller toolbar, default false)
 *
 * Ref: exposes { focus() } to parent for programmatic focus.
 */
const MathKeyboard = forwardRef(function MathKeyboard({
  value = '',
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  placeholder = 'Votre réponse',
  id,
  ariaLabel,
  disabled = false,
  className = '',
  compact = false,
}, ref) {
  const katexReady = useKatex();
  const inputRef = useRef(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [activeGroup, setActiveGroup] = useState('basic');
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef(null);

  // Expose focus() to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }), []);

  // Close toolbar when clicking outside
  useEffect(() => {
    if (!showToolbar) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowToolbar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showToolbar]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback((e) => {
    // Don't blur if clicking inside the toolbar
    if (wrapperRef.current?.contains(e.relatedTarget)) return;
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  const insertSymbol = useCallback((sym) => {
    const input = inputRef.current;
    if (!input) return;

    const text = sym.insert;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const before = value.slice(0, start);
    const after = value.slice(end);

    // Find the first placeholder in the template
    const placeholderIdx = text.indexOf(PLACEHOLDER);
    let newValue;
    let cursorPos;

    if (placeholderIdx >= 0) {
      // Replace placeholder with empty string, position cursor there
      const cleanText = text.replace(PLACEHOLDER, '');
      newValue = before + cleanText + after;
      cursorPos = start + placeholderIdx;
    } else {
      newValue = before + text + after;
      cursorPos = start + text.length;
    }

    onChange(newValue);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(cursorPos, cursorPos);
    });
  }, [value, onChange]);

  // Check if value looks like it contains LaTeX
  const hasLatex = value && (/\\[a-zA-Z]/.test(value) || /\^|_|\{|\}/.test(value));

  // Get current symbol group
  const currentGroup = SYMBOL_GROUPS.find(g => g.id === activeGroup) || SYMBOL_GROUPS[0];

  // In compact mode, show a condensed set of most useful symbols
  const COMPACT_SYMBOLS = compact ? SYMBOL_GROUPS.flatMap(g => g.symbols).filter(s =>
    ['\\frac{▫}{▫}', '^{2}', '\\sqrt{▫}', '\\pi ', '\\times ', '\\leq ', '\\geq ', '\\rightarrow ', '\\alpha '].includes(s.insert)
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className={`math-kb ${isFocused ? 'math-kb--focused' : ''} ${showToolbar ? 'math-kb--toolbar-open' : ''} ${className}`}
    >
      {/* Input row */}
      <div className="math-kb__input-row">
        <input
          ref={inputRef}
          id={id}
          className="math-kb__input"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          aria-label={ariaLabel || placeholder}
          disabled={disabled}
        />
        <button
          className={`math-kb__toggle ${showToolbar ? 'math-kb__toggle--active' : ''}`}
          onClick={() => { setShowToolbar(t => !t); inputRef.current?.focus(); }}
          type="button"
          tabIndex={-1}
          aria-label={showToolbar ? 'Masquer les symboles' : 'Afficher les symboles mathématiques'}
          title="Symboles mathématiques"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 003 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444 3.17a.5.5 0 00.91 0l1.444-3.17M8 15h4M16.5 8v7m-2-3.5h4" />
          </svg>
        </button>
      </div>

      {/* Live KaTeX preview — shows rendered math below input */}
      {hasLatex && katexReady && (
        <div className="math-kb__preview">
          <span dangerouslySetInnerHTML={renderWithKatex(`$${value}$`, katexReady)} />
        </div>
      )}

      {/* Toolbar — expandable symbol palette */}
      {showToolbar && (
        <div className="math-kb__toolbar">
          {/* Group tabs */}
          {!compact && (
            <div className="math-kb__tabs">
              {SYMBOL_GROUPS.map(g => (
                <button
                  key={g.id}
                  className={`math-kb__tab ${activeGroup === g.id ? 'math-kb__tab--active' : ''}`}
                  onClick={() => setActiveGroup(g.id)}
                  type="button"
                  tabIndex={-1}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          {/* Symbol buttons */}
          <div className="math-kb__symbols">
            {(compact ? COMPACT_SYMBOLS : currentGroup.symbols).map((sym, i) => (
              <button
                key={`${sym.insert}-${i}`}
                className="math-kb__sym-btn"
                onClick={() => insertSymbol(sym)}
                title={sym.title}
                type="button"
                tabIndex={-1}
              >
                {sym.display}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default MathKeyboard;