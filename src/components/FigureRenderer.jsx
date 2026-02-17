import React, { useMemo, useEffect, useRef, useState } from 'react';

// ─── Lazy KaTeX ─────────────────────────────────────────────────────────────
let katexModule = null;
let katexLoading = false;
const katexCallbacks = [];

function ensureKaTeX(cb) {
  if (katexModule) return cb(katexModule);
  katexCallbacks.push(cb);
  if (katexLoading) return;
  katexLoading = true;

  // inject KaTeX CSS from CDN once
  if (!document.getElementById('katex-css')) {
    const link = document.createElement('link');
    link.id = 'katex-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    document.head.appendChild(link);
  }

  import('katex').then((mod) => {
    katexModule = mod.default || mod;
    katexCallbacks.forEach((fn) => fn(katexModule));
    katexCallbacks.length = 0;
  });
}

// ─── Classification ─────────────────────────────────────────────────────────

const FIGURE_TYPES = {
  TABLE: 'table',
  GRAPH: 'graph',
  CIRCUIT: 'circuit',
  DIAGRAM: 'diagram',
  GEOMETRY: 'geometry',
  EQUATION: 'equation',
  CHEMISTRY: 'chemistry',
  TEXT: 'text',
  IMAGE: 'image',
};

function classifyFigure(desc) {
  const d = (desc || '').toLowerCase();

  // Tables
  if (/\btable(?:au)?\b/.test(d) || /colonnes?\b/.test(d) || /\brignes?\b/.test(d) ||
      /\brows?\b/.test(d) || /\bcolumns?\b/.test(d)) {
    return FIGURE_TYPES.TABLE;
  }

  // Electrical circuits
  if (/circuit|résistance|condensateur|capacit|bobine|voltmètre|ampèremètre|dipôle|générateur/.test(d) ||
      /\b(resistor|capacitor|inductor|lamp|battery|voltmeter)\b/.test(d)) {
    return FIGURE_TYPES.CIRCUIT;
  }

  // Graphs and charts
  if (/graphique|courbe|axe\s+(horizontal|vertical)|diagramme.*(bar|cercle|bâton)|graphe\b/.test(d) ||
      /\b(graph|chart|plot|axis|curve)\b/.test(d)) {
    return FIGURE_TYPES.GRAPH;
  }

  // Chemistry
  if (/benzène|cycle aromatique|molécule|formule (topologique|semi-développée|développée)|substitué|chaîne (principale|carbonée)|group|amine|carbonyle|carboxyle/.test(d) ||
      /\b(zigzag chain|carbon atoms|functional group|chemical structure|organic)\b/.test(d)) {
    return FIGURE_TYPES.CHEMISTRY;
  }

  // Geometry / physics diagrams
  if (/pendule|triangle|rectangle|cercle|carré|parallélogramme|angle|repère orthonorm|vecteur|plan (cartésien|orthonormé)|géométri/.test(d) ||
      /concentri|rayon|diamètre|sommet/.test(d)) {
    return FIGURE_TYPES.GEOMETRY;
  }

  // Pure equation figures
  if (/^\$[^$]+\$$/.test(desc.trim()) || /équation|formule mathématique|expression algébrique/.test(d)) {
    return FIGURE_TYPES.EQUATION;
  }

  // Anatomical / image-based (photos, paintings, histological)
  if (/photograph|painting|image montrant|photo|coupe histologique|anatomie|schéma.*(anatomique|biologique)/.test(d)) {
    return FIGURE_TYPES.IMAGE;
  }

  // Schéma / diagram fallback
  if (/schéma|diagramme|représentation|figure/.test(d)) {
    return FIGURE_TYPES.DIAGRAM;
  }

  // Default to text
  return FIGURE_TYPES.TEXT;
}

// ─── Utility: render inline math ────────────────────────────────────────────

function InlineMath({ text }) {
  const ref = useRef(null);
  const [, setReady] = useState(false);

  useEffect(() => {
    ensureKaTeX(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ref.current || !katexModule) return;
    // Split text on $...$ and render math segments
    const parts = text.split(/(\$[^$]+\$)/g);
    ref.current.innerHTML = '';
    parts.forEach((part) => {
      if (part.startsWith('$') && part.endsWith('$')) {
        const span = document.createElement('span');
        try {
          katexModule.render(part.slice(1, -1), span, { throwOnError: false, displayMode: false });
        } catch {
          span.textContent = part;
        }
        ref.current.appendChild(span);
      } else {
        ref.current.appendChild(document.createTextNode(part));
      }
    });
  }, [text, katexModule]);

  return <span ref={ref}>{text.replace(/\$[^$]+\$/g, '…')}</span>;
}

// ─── Table Renderer ─────────────────────────────────────────────────────────

function TableFigure({ description }) {
  const parsed = useMemo(() => parseTable(description), [description]);

  if (!parsed) {
    return <DescriptionCard description={description} icon="📊" label="Tableau" />;
  }

  return (
    <div className="figure-render figure-render--table">
      <div className="figure-render__table-wrap">
        <table className="figure-render__table">
          <thead>
            <tr>
              {parsed.headers.map((h, i) => (
                <th key={i}><InlineMath text={h} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}><InlineMath text={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseTable(desc) {
  const d = desc || '';

  // Pattern 1: "columns: A, B, C" or "colonnes: A, B, C"
  let headers = [];
  const colMatch = d.match(/(?:columns?|colonnes?)\s*[:=]\s*([^.]+)/i);
  if (colMatch) {
    headers = colMatch[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
  }

  // Pattern 2: first row / première ligne as headers
  if (headers.length === 0) {
    const firstRowMatch = d.match(/(?:première|first)\s+(?:ligne|row).*?(?:intitulée|is|est|:)\s*['"]?([^'"]+?)['"]?\s+(?:et |and |contient|avec|with|has|values?)/i);
    if (firstRowMatch) {
      // Try to extract from "La première ligne est intitulée 'X' et contient les valeurs"
    }
  }

  // Pattern 3: "Tableau à N lignes et M colonnes"
  // Try to extract data from row descriptions
  const rows = [];

  // Try to find row data patterns like "(30$, 5)" or "valeurs 1, 2, 3, 4"
  const rowPatterns = d.matchAll(/(?:(?:row|ligne|rangée)\s*\d*|deuxième ligne|troisième ligne|première ligne)[^.]*?(?:contient|has|avec|values?|valeurs?)\s*(?:les valeurs\s*)?[:=]?\s*([0-9$.,\s/\-a-zA-Zàéèêôùç]+?)(?:\.|$)/gi);

  for (const match of rowPatterns) {
    const vals = match[1].split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (vals.length > 0) rows.push(vals);
  }

  // Pattern: detect "intitulée 'X'" for row labels  
  const labelledRows = [...d.matchAll(/(?:ligne|row)[^.]*?intitulée\s*['"]([^'"]+)['"][^.]*?(?:contient|valeurs?|values?)\s*(?:les valeurs\s*)?[:=]?\s*([\d.,\s$%]+)/gi)];
  if (labelledRows.length > 0) {
    headers = [];
    const dataRows = [];
    for (const m of labelledRows) {
      const label = m[1].trim();
      const vals = m[2].split(/,\s*/).map(s => s.trim()).filter(Boolean);
      headers.push(label);
      dataRows.push(vals);
    }
    // Transpose: rows are currently [header -> values], make columns
    if (dataRows.length > 0) {
      const maxLen = Math.max(...dataRows.map(r => r.length));
      const transposed = [];
      for (let c = 0; c < maxLen; c++) {
        transposed.push(dataRows.map(r => r[c] || ''));
      }
      return { headers, rows: transposed };
    }
  }

  // Pattern for tabular data with "(price, qty)" pairs
  const pairPatterns = [...d.matchAll(/\(([^)]+)\)/g)];
  if (pairPatterns.length >= 2 && headers.length > 0) {
    for (const p of pairPatterns) {
      const vals = p[1].split(/,\s*/).map(s => s.trim());
      if (vals.length >= 2) rows.push(vals);
    }
  }

  // Pattern: "Pays X = 50 ans, Pays Y = 79 ans" style
  const comparisonMatch = d.match(/(?:Pays|Country)\s+\w+\s*=\s*[\d.]+/gi);
  if (comparisonMatch && comparisonMatch.length >= 2) {
    // Extract comparison table from text
    const indicators = [...d.matchAll(/([A-ZÀ-Ü][^(,:.]+?)\s*\((?:Pays|Country)\s+(\w+)\s*=\s*([^,)]+),?\s*(?:Pays|Country)\s+(\w+)\s*=\s*([^)]+)\)/gi)];
    if (indicators.length > 0) {
      const hdr1 = indicators[0][2];
      const hdr2 = indicators[0][4];
      headers = ['Indicateur', `Pays ${hdr1}`, `Pays ${hdr2}`];
      for (const ind of indicators) {
        rows.push([ind[1].trim(), ind[3].trim(), ind[5].trim()]);
      }
    }
  }

  // If we have some reasonable data
  if (headers.length > 0 && rows.length > 0) {
    // Pad rows to match header length
    const padded = rows.map(r => {
      while (r.length < headers.length) r.push('');
      return r.slice(0, headers.length);
    });
    return { headers, rows: padded };
  }

  // Simple fallback: try "X | Y | Z" or "X: val1, Y: val2" patterns
  if (headers.length > 0) {
    return { headers, rows };
  }

  return null;
}

// ─── Graph Renderer ─────────────────────────────────────────────────────────

function GraphFigure({ description }) {
  const d = description || '';
  const curves = [];
  const labels = { x: '', y: '', title: '' };

  // Extract axis labels
  const xMatch = d.match(/(?:axe|axis)\s+(?:horizontal|des x|des abscisses|X)[^.]*?(?:étiqueté|labeled|est|:)\s*['"]?([^'",.]+)/i);
  const yMatch = d.match(/(?:axe|axis)\s+(?:vertical|des y|des ordonnées|Y)[^.]*?(?:étiqueté|labeled|est|:)\s*['"]?([^'",.]+)/i);
  const titleMatch = d.match(/(?:intitulé|titled|title)\s*['"]?([^'",.]+)/i);

  if (xMatch) labels.x = xMatch[1].trim();
  if (yMatch) labels.y = yMatch[1].trim();
  if (titleMatch) labels.title = titleMatch[1].trim();

  // Extract curve descriptions
  const curveMatches = [...d.matchAll(/courbe\s+(?:étiquetée|nommée)?\s*['"]?([^'",.]+)|(?:curve|line)\s+(?:labeled|named)?\s*['"]?([^'",.]+)/gi)];
  for (const m of curveMatches) {
    const name = (m[1] || m[2] || '').trim();
    if (name) curves.push({ name, type: guessLineType(name, d) });
  }

  // Check for specific curve types
  if (curves.length === 0) {
    if (/croissante|increasing|ascending|monotone/.test(d)) curves.push({ name: 'f(x)', type: 'increasing' });
    if (/décroissante|decreasing|descending/.test(d)) curves.push({ name: 'g(x)', type: 'decreasing' });
    if (/verticale|vertical/.test(d)) curves.push({ name: '', type: 'vertical' });
  }

  return (
    <div className="figure-render figure-render--graph">
      {labels.title && <div className="figure-render__graph-title"><InlineMath text={labels.title} /></div>}
      <svg viewBox="0 0 300 220" className="figure-render__graph-svg">
        {/* Grid */}
        <defs>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x="40" y="10" width="240" height="180" fill="url(#grid)" />

        {/* Axes */}
        <line x1="40" y1="190" x2="280" y2="190" stroke="#333" strokeWidth="1.5" markerEnd="url(#arrowX)" />
        <line x1="40" y1="190" x2="40" y2="10" stroke="#333" strokeWidth="1.5" markerEnd="url(#arrowY)" />
        <defs>
          <marker id="arrowX" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6" fill="#333" />
          </marker>
          <marker id="arrowY" markerWidth="6" markerHeight="8" refX="3" refY="0" orient="auto">
            <path d="M0,8 L3,0 L6,8" fill="#333" />
          </marker>
        </defs>

        {/* Origin */}
        <text x="32" y="205" fontSize="11" textAnchor="end" fill="#666">O</text>

        {/* Axis labels */}
        {labels.x && <text x="270" y="210" fontSize="10" fill="#333" textAnchor="end">{labels.x}</text>}
        {labels.y && <text x="15" y="18" fontSize="10" fill="#333" textAnchor="start">{labels.y}</text>}

        {/* Curves */}
        {curves.length === 0 && (
          <path d="M50,170 C100,160 160,100 240,40" fill="none" stroke="var(--primary, #3b82f6)" strokeWidth="2" />
        )}
        {curves.map((curve, i) => {
          const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];
          const color = colors[i % colors.length];
          const path = getCurvePath(curve.type, i, curves.length);
          return (
            <g key={i}>
              <path d={path} fill="none" stroke={color} strokeWidth="2" />
              {curve.name && (
                <text x={250} y={30 + i * 18} fontSize="10" fill={color} fontWeight="600">{curve.name}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="figure-render__graph-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function guessLineType(name, desc) {
  const n = (name + ' ' + desc).toLowerCase();
  if (/vertical/.test(n)) return 'vertical';
  if (/décroissante|decreasing|demand|dg/.test(n)) return 'decreasing';
  if (/croissante|increasing|supply|og|offre/.test(n)) return 'increasing';
  if (/concave|diminue|production/.test(n)) return 'concave';
  if (/parabole|quadratic/.test(n)) return 'parabola';
  return 'increasing';
}

function getCurvePath(type, index, total) {
  switch (type) {
    case 'decreasing':
      return 'M50,40 C120,50 200,140 260,170';
    case 'vertical':
      return 'M160,20 L160,180';
    case 'concave':
      return 'M50,170 C90,90 150,55 260,40';
    case 'parabola':
      return 'M50,40 Q160,190 260,40';
    case 'increasing':
    default:
      return `M50,${170 - index * 15} C100,${155 - index * 15} 180,${80 - index * 10} 260,${30 + index * 10}`;
  }
}

// ─── Circuit Renderer ───────────────────────────────────────────────────────

function CircuitFigure({ description }) {
  const d = (description || '').toLowerCase();

  // Count components
  const resistors = (d.match(/résistance|resistor/g) || []).length || 0;
  const capacitors = (d.match(/condensateur|capacitor|capacité/g) || []).length || 0;
  const hasParallel = /parallèle|parallel/.test(d);
  const hasSeries = /série|series/.test(d);

  return (
    <div className="figure-render figure-render--circuit">
      <svg viewBox="0 0 320 180" className="figure-render__circuit-svg">
        {/* Simple circuit frame */}
        <line x1="30" y1="90" x2="70" y2="90" stroke="#333" strokeWidth="1.5" />
        
        {/* Generator */}
        <circle cx="30" cy="90" r="12" fill="none" stroke="#333" strokeWidth="1.5" />
        <text x="30" y="94" fontSize="10" textAnchor="middle" fill="#333">E</text>

        {/* Main branch */}
        <line x1="70" y1="90" x2="90" y2="90" stroke="#333" strokeWidth="1.5" />
        
        {resistors > 0 && (
          <g>
            {/* Resistor symbol (zigzag) */}
            <path d="M90,90 L100,80 L110,100 L120,80 L130,100 L140,90" fill="none" stroke="#e63946" strokeWidth="1.5" />
            <text x="115" y="72" fontSize="9" textAnchor="middle" fill="#e63946">R</text>
          </g>
        )}

        {capacitors > 0 && (
          <g>
            {/* Capacitor symbol */}
            <line x1="160" y1="90" x2="175" y2="90" stroke="#333" strokeWidth="1.5" />
            <line x1="175" y1="75" x2="175" y2="105" stroke="#457b9d" strokeWidth="2" />
            <line x1="182" y1="75" x2="182" y2="105" stroke="#457b9d" strokeWidth="2" />
            <line x1="182" y1="90" x2="197" y2="90" stroke="#333" strokeWidth="1.5" />
            <text x="178" y="70" fontSize="9" textAnchor="middle" fill="#457b9d">C</text>
          </g>
        )}

        {hasParallel && (
          <g>
            {/* Parallel branch lines */}
            <line x1="200" y1="90" x2="200" y2="55" stroke="#333" strokeWidth="1" />
            <line x1="200" y1="90" x2="200" y2="125" stroke="#333" strokeWidth="1" />
            <line x1="200" y1="55" x2="270" y2="55" stroke="#333" strokeWidth="1" />
            <line x1="200" y1="125" x2="270" y2="125" stroke="#333" strokeWidth="1" />
            <line x1="270" y1="55" x2="270" y2="125" stroke="#333" strokeWidth="1" />
            {/* R in top branch */}
            <path d="M220,55 L228,47 L236,63 L244,47 L252,55" fill="none" stroke="#e63946" strokeWidth="1.5" />
            <text x="236" y="42" fontSize="8" textAnchor="middle" fill="#e63946">R₁</text>
            {/* R in bottom branch */}
            <path d="M220,125 L228,117 L236,133 L244,117 L252,125" fill="none" stroke="#2a9d8f" strokeWidth="1.5" />
            <text x="236" y="142" fontSize="8" textAnchor="middle" fill="#2a9d8f">R₂</text>
          </g>
        )}

        {/* Return wire */}
        <line x1={(hasParallel ? 270 : capacitors > 0 ? 197 : 140)} y1="90" x2="290" y2="90" stroke="#333" strokeWidth="1.5" />
        <line x1="290" y1="90" x2="290" y2="150" stroke="#333" strokeWidth="1.5" />
        <line x1="290" y1="150" x2="30" y2="150" stroke="#333" strokeWidth="1.5" />
        <line x1="30" y1="150" x2="30" y2="102" stroke="#333" strokeWidth="1.5" />

        {/* Labels */}
        <circle cx="70" cy="90" r="2" fill="#333" />
        <text x="70" y="82" fontSize="9" textAnchor="middle" fill="#333">A</text>
        <circle cx="290" cy="90" r="2" fill="#333" />
        <text x="290" y="82" fontSize="9" textAnchor="middle" fill="#333">B</text>
      </svg>
      <div className="figure-render__circuit-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Geometry Renderer ──────────────────────────────────────────────────────

function GeometryFigure({ description }) {
  const d = (description || '').toLowerCase();

  // Detect specific geometry type — order matters (most specific first)
  const isPendulum = /pendule/.test(d);
  const isCoordinate = /repère|orthonorm|cartésien/.test(d);

  // Concentric circles: distinguish target/bullseye from math geometry
  const isConcentric = /concentric|concentri/.test(d);
  const isTarget = /cible|target|zones?\s*[:.]|points?\s+for|point.*zone/i.test(d)
    || (/concentric/.test(d) && /zone|point/i.test(d));
  const isTangentGeometry = isConcentric && /tangent|perpendiculaire|rayon.*[rR]|droit|AB|OA|OB/i.test(d);

  // Triangle figures
  const isTriangle = /triangle/.test(d) && !isConcentric;
  const isRightTriangle = isTriangle && /rectangle|droit|perpendiculaire|90|right\s*angle/i.test(d);

  // Mirror / optics diagrams
  const isMirror = /miroir|réflexion|rayon\s*lumineux|réfraction|lentille|optique/i.test(d);

  if (isPendulum) return <PendulumSVG description={description} />;
  if (isCoordinate) return <CoordinateSVG description={description} />;
  if (isTangentGeometry) return <ConcentricTangentSVG description={description} />;
  if (isTarget) return <TargetSVG description={description} />;
  if (isRightTriangle) return <RightTriangleSVG description={description} />;
  if (isTriangle) return <TriangleSVG description={description} />;
  if (isMirror) return <DescriptionCard description={description} icon="🔍" label="Optique" />;

  // For concentric figures that aren't targets or tangent geometry (e.g. Earth layers),
  // fall back to description card
  if (isConcentric) return <DescriptionCard description={description} icon="📐" label="Figure géométrique" />;

  return <DescriptionCard description={description} icon="📐" label="Figure géométrique" />;
}

function PendulumSVG({ description }) {
  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 200 220" className="figure-render__geo-svg">
        {/* Support */}
        <line x1="80" y1="10" x2="120" y2="10" stroke="#333" strokeWidth="2" />
        <line x1="90" y1="10" x2="85" y2="5" stroke="#333" strokeWidth="1" />
        <line x1="100" y1="10" x2="95" y2="5" stroke="#333" strokeWidth="1" />
        <line x1="110" y1="10" x2="105" y2="5" stroke="#333" strokeWidth="1" />

        {/* Pivot */}
        <circle cx="100" cy="12" r="3" fill="#333" />
        <text x="108" y="16" fontSize="10" fill="#333">O</text>

        {/* Vertical (dashed) */}
        <line x1="100" y1="12" x2="100" y2="180" stroke="#999" strokeWidth="1" strokeDasharray="4,3" />

        {/* String to equilibrium */}
        <line x1="100" y1="12" x2="100" y2="170" stroke="#333" strokeWidth="1.5" />
        <circle cx="100" cy="175" r="8" fill="#457b9d" stroke="#333" strokeWidth="1" />

        {/* Displaced position */}
        <line x1="100" y1="12" x2="145" y2="150" stroke="#e63946" strokeWidth="1" strokeDasharray="5,3" />
        <circle cx="148" cy="155" r="7" fill="none" stroke="#e63946" strokeWidth="1" strokeDasharray="3,2" />

        {/* Angle arc */}
        <path d="M100,60 A50,50 0 0,1 118,55" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="114" y="50" fontSize="10" fill="#f59e0b">α</text>

        {/* Labels */}
        <text x="82" y="100" fontSize="9" fill="#333">l</text>
        <text x="104" y="186" fontSize="9" fill="#457b9d">m</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function TargetSVG({ description }) {
  const colors = ['#fee2e2', '#fef3c7', '#dcfce7', '#ef4444'];
  const radii = [80, 60, 40, 20];
  const points = [1, 3, 5, 10];
  // Try to extract zone/point values from description
  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 200 200" className="figure-render__geo-svg">
        {radii.map((r, i) => (
          <g key={i}>
            <circle cx="100" cy="100" r={r} fill={colors[i]} stroke="#333" strokeWidth="1" />
            <text x={100 + r - 12} y="100" fontSize="9" fill="#333" fontWeight="600">{points[i]}pt</text>
          </g>
        ))}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function CoordinateSVG({ description }) {
  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 240 240" className="figure-render__geo-svg">
        {/* Grid */}
        {Array.from({ length: 9 }, (_, i) => (
          <g key={i}>
            <line x1={30 + i * 22} y1="20" x2={30 + i * 22} y2="220" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
            <line x1="20" y1={30 + i * 22} x2="220" y2={30 + i * 22} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
          </g>
        ))}
        {/* Axes */}
        <line x1="120" y1="220" x2="120" y2="15" stroke="#333" strokeWidth="1.5" />
        <line x1="15" y1="120" x2="225" y2="120" stroke="#333" strokeWidth="1.5" />
        {/* Arrows */}
        <polygon points="120,15 116,25 124,25" fill="#333" />
        <polygon points="225,120 215,116 215,124" fill="#333" />
        {/* Labels */}
        <text x="125" y="28" fontSize="10" fill="#333">ȳ</text>
        <text x="212" y="115" fontSize="10" fill="#333">x̄</text>
        <text x="108" y="134" fontSize="10" fill="#333">O</text>
        {/* Tick marks */}
        {[-3, -2, -1, 1, 2, 3].map(n => (
          <g key={n}>
            <line x1={120 + n * 22} y1="117" x2={120 + n * 22} y2="123" stroke="#333" strokeWidth="1" />
            <text x={120 + n * 22} y="135" fontSize="8" textAnchor="middle" fill="#666">{n}</text>
            <line x1="117" y1={120 - n * 22} x2="123" y2={120 - n * 22} stroke="#333" strokeWidth="1" />
            <text x="110" y={123 - n * 22} fontSize="8" textAnchor="end" fill="#666">{n}</text>
          </g>
        ))}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Concentric Circles with Tangent Line ───────────────────────────────────

function ConcentricTangentSVG({ description }) {
  // Two concentric circles (center O), inner radius r, outer radius R,
  // tangent line AB touching inner circle at D, with OA = OB = R.
  const cx = 150, cy = 130;
  const R = 90, r = 50;

  // D is the tangent point on the inner circle (top of inner circle)
  const Dx = cx, Dy = cy - r;

  // A and B are on the outer circle, on the tangent line through D.
  // Tangent at D is horizontal (perpendicular to OD which is vertical).
  // OA = R, DA² = R² - r² => DA = sqrt(R²-r²)
  const DA = Math.sqrt(R * R - r * r);
  const Ax = cx - DA, Ay = Dy;
  const Bx = cx + DA, By = Dy;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 270" className="figure-render__geo-svg">
        {/* Outer circle (C_R) */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#457b9d" strokeWidth="1.5" />
        {/* Inner circle (C_r) */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e63946" strokeWidth="1.5" />

        {/* Tangent line AB */}
        <line x1={Ax - 10} y1={Ay} x2={Bx + 10} y2={By} stroke="#333" strokeWidth="1.5" />

        {/* Radii OA, OB */}
        <line x1={cx} y1={cy} x2={Ax} y2={Ay} stroke="#457b9d" strokeWidth="1" strokeDasharray="5,3" />
        <line x1={cx} y1={cy} x2={Bx} y2={By} stroke="#457b9d" strokeWidth="1" strokeDasharray="5,3" />

        {/* Radius OD */}
        <line x1={cx} y1={cy} x2={Dx} y2={Dy} stroke="#e63946" strokeWidth="1.5" />

        {/* Right angle mark at D */}
        <polyline points={`${Dx + 8},${Dy} ${Dx + 8},${Dy + 8} ${Dx},${Dy + 8}`}
          fill="none" stroke="#333" strokeWidth="1" />

        {/* Points */}
        <circle cx={cx} cy={cy} r="3" fill="#333" />
        <circle cx={Ax} cy={Ay} r="3" fill="#457b9d" />
        <circle cx={Bx} cy={By} r="3" fill="#457b9d" />
        <circle cx={Dx} cy={Dy} r="3" fill="#e63946" />

        {/* Labels */}
        <text x={cx + 5} y={cy + 15} fontSize="13" fontWeight="600" fill="#333">O</text>
        <text x={Ax - 14} y={Ay - 8} fontSize="13" fontWeight="600" fill="#457b9d">A</text>
        <text x={Bx + 5} y={By - 8} fontSize="13" fontWeight="600" fill="#457b9d">B</text>
        <text x={Dx + 10} y={Dy - 5} fontSize="13" fontWeight="600" fill="#e63946">D</text>

        {/* Radius labels */}
        <text x={cx + 4} y={cy - r / 2 - 2} fontSize="11" fill="#e63946" fontStyle="italic">r</text>
        <text x={cx - DA / 2 - 2} y={cy - 5} fontSize="11" fill="#457b9d" fontStyle="italic">R</text>

        {/* Circle labels */}
        <text x={cx + R - 18} y={cy + R - 5} fontSize="10" fill="#457b9d">C(R)</text>
        <text x={cx + r + 3} y={cy + 12} fontSize="10" fill="#e63946">C(r)</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Triangle SVG ───────────────────────────────────────────────────────────

function TriangleSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Try to extract vertex labels from description
  const labelMatch = d.match(/triangle\s+([a-z])([a-z])([a-z])/i);
  const [vA, vB, vC] = labelMatch
    ? [labelMatch[1].toUpperCase(), labelMatch[2].toUpperCase(), labelMatch[3].toUpperCase()]
    : ['A', 'B', 'C'];

  // Check for a height / altitude
  const hasHeight = /hauteur|altitude|perpendiculaire|height/i.test(d);
  const heightMatch = d.match(/(?:hauteur|altitude)\s*(?:issue\s*de\s*)?([a-z])/i);
  const heightVertex = heightMatch ? heightMatch[1].toUpperCase() : 'C';

  // Standard scalene triangle coordinates
  const Ax = 40, Ay = 190;
  const Bx = 260, By = 190;
  const Cx = 180, Cy = 40;

  // Check for angle labels
  const hasAlpha = /alpha|α/.test(d);
  const hasBeta = /beta|β/.test(d);

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Triangle */}
        <polygon
          points={`${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Height from C to AB if described */}
        {hasHeight && (
          <g>
            <line x1={Cx} y1={Cy} x2={Cx} y2={By} stroke="#e63946" strokeWidth="1" strokeDasharray="5,3" />
            <text x={Cx + 5} y={By - 5} fontSize="11" fill="#e63946">H</text>
            <circle cx={Cx} cy={By} r="2.5" fill="#e63946" />
            {/* Right angle mark */}
            <polyline points={`${Cx - 8},${By} ${Cx - 8},${By - 8} ${Cx},${By - 8}`}
              fill="none" stroke="#333" strokeWidth="0.8" />
          </g>
        )}

        {/* Angle arcs */}
        {hasAlpha && (
          <g>
            <path d={`M${Ax + 30},${Ay} A30,30 0 0,0 ${Ax + 22},${Ay - 18}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Ax + 28} y={Ay - 10} fontSize="10" fill="#f59e0b">α</text>
          </g>
        )}
        {hasBeta && (
          <g>
            <path d={`M${Bx - 30},${By} A30,30 0 0,1 ${Bx - 18},${By - 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Bx - 35} y={By - 15} fontSize="10" fill="#f59e0b">β</text>
          </g>
        )}

        {/* Vertex labels */}
        <text x={Ax - 15} y={Ay + 5} fontSize="13" fontWeight="600" fill="#333">{vA}</text>
        <text x={Bx + 5} y={By + 5} fontSize="13" fontWeight="600" fill="#333">{vB}</text>
        <text x={Cx + 5} y={Cy - 5} fontSize="13" fontWeight="600" fill="#333">{vC}</text>

        {/* Vertex dots */}
        <circle cx={Ax} cy={Ay} r="3" fill="#333" />
        <circle cx={Bx} cy={By} r="3" fill="#333" />
        <circle cx={Cx} cy={Cy} r="3" fill="#333" />
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function RightTriangleSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Try to extract vertex labels
  const labelMatch = d.match(/triangle\s+(?:rectangle\s+)?([a-z])([a-z])([a-z])/i);
  const [vA, vB, vC] = labelMatch
    ? [labelMatch[1].toUpperCase(), labelMatch[2].toUpperCase(), labelMatch[3].toUpperCase()]
    : ['A', 'B', 'C'];

  // Detect which vertex has the right angle
  const rightAtMatch = d.match(/(?:rectangle|droit)\s+en\s+([a-z])/i);
  const rightAt = rightAtMatch ? rightAtMatch[1].toUpperCase() : vC;

  // Check for angle labels
  const hasAlpha = /alpha|α/.test(d);
  const hasBeta = /beta|β/.test(d);

  // Place right angle at bottom-left for clearest visual
  const Ax = 40, Ay = 190;   // bottom-left (right angle vertex)
  const Bx = 260, By = 190;  // bottom-right
  const Cx = 40, Cy = 40;    // top-left

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Triangle */}
        <polygon
          points={`${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Right angle mark */}
        <polyline points={`${Ax + 15},${Ay} ${Ax + 15},${Ay - 15} ${Ax},${Ay - 15}`}
          fill="none" stroke="#333" strokeWidth="1" />

        {/* Angle arcs */}
        {hasBeta && (
          <g>
            <path d={`M${Bx - 30},${By} A30,30 0 0,1 ${Bx - 18},${By - 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Bx - 38} y={By - 12} fontSize="10" fill="#f59e0b">β</text>
          </g>
        )}
        {hasAlpha && (
          <g>
            <path d={`M${Cx},${Cy + 30} A30,30 0 0,0 ${Cx + 20},${Cy + 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Cx + 14} y={Cy + 32} fontSize="10" fill="#f59e0b">α</text>
          </g>
        )}

        {/* Vertex labels */}
        <text x={Ax - 5} y={Ay + 18} fontSize="13" fontWeight="600" fill="#333">{rightAt}</text>
        <text x={Bx + 5} y={By + 5} fontSize="13" fontWeight="600" fill="#333">
          {rightAt === vA ? vB : rightAt === vB ? vC : vB}
        </text>
        <text x={Cx - 15} y={Cy - 5} fontSize="13" fontWeight="600" fill="#333">
          {rightAt === vA ? vC : rightAt === vC ? vA : vA}
        </text>

        {/* Vertex dots */}
        <circle cx={Ax} cy={Ay} r="3" fill="#333" />
        <circle cx={Bx} cy={By} r="3" fill="#333" />
        <circle cx={Cx} cy={Cy} r="3" fill="#333" />
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Chemistry Renderer ─────────────────────────────────────────────────────

function ChemistryFigure({ description }) {
  const d = (description || '').toLowerCase();
  const isBenzene = /benzène|aromatique|hexagone.*cercle|aromatic/.test(d);
  const isChain = /chaîne|chain|zigzag|carbone/.test(d);

  if (isBenzene) return <BenzeneSVG description={description} />;
  if (isChain) return <CarbonChainSVG description={description} />;

  return <DescriptionCard description={description} icon="🧪" label="Structure chimique" />;
}

function BenzeneSVG({ description }) {
  const d = (description || '').toLowerCase();
  // Detect substituent
  const substituent = d.match(/group[e]?\s+(?:nitro|amino|hydroxyl|méthyl)/i)?.[0] || '';
  const subLabel = /nitro/.test(d) ? 'NO₂' : /amino/.test(d) ? 'NH₂' : /hydroxyl/.test(d) ? 'OH' : /méthyl/.test(d) ? 'CH₃' : '';

  const cx = 120, cy = 100, r = 40;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });

  return (
    <div className="figure-render figure-render--chemistry">
      <svg viewBox="0 0 240 200" className="figure-render__chem-svg">
        {/* Hexagon */}
        <polygon
          points={pts.map(p => p.join(',')).join(' ')}
          fill="none" stroke="#333" strokeWidth="1.5"
        />
        {/* Inner circle (aromaticity) */}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke="#333" strokeWidth="1" strokeDasharray="4,2" />

        {/* Substituent */}
        {subLabel && (
          <g>
            <line x1={pts[0][0]} y1={pts[0][1]} x2={pts[0][0]} y2={pts[0][1] - 25} stroke="#e63946" strokeWidth="1.5" />
            <text x={pts[0][0]} y={pts[0][1] - 30} fontSize="11" textAnchor="middle" fill="#e63946" fontWeight="600">{subLabel}</text>
          </g>
        )}
      </svg>
      <div className="figure-render__chem-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function CarbonChainSVG({ description }) {
  const d = (description || '');
  // Count carbons
  const carbonMatch = d.match(/(\d+)\s*carbon/i);
  const nCarbons = carbonMatch ? parseInt(carbonMatch[1]) : 4;
  const n = Math.min(Math.max(nCarbons, 2), 8);

  const points = [];
  const startX = 40;
  const step = 35;
  for (let i = 0; i < n; i++) {
    points.push([startX + i * step, i % 2 === 0 ? 80 : 50]);
  }

  return (
    <div className="figure-render figure-render--chemistry">
      <svg viewBox="0 0 340 140" className="figure-render__chem-svg">
        {/* Chain bonds */}
        {points.slice(0, -1).map((p, i) => (
          <line key={i} x1={p[0]} y1={p[1]} x2={points[i + 1][0]} y2={points[i + 1][1]} stroke="#333" strokeWidth="1.5" />
        ))}
        {/* Carbon labels */}
        {points.map((p, i) => (
          <text key={i} x={p[0]} y={p[1] + (i % 2 === 0 ? 18 : -8)} fontSize="10" textAnchor="middle" fill="#457b9d" fontWeight="600">
            C{i + 1}
          </text>
        ))}
      </svg>
      <div className="figure-render__chem-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Equation Renderer ──────────────────────────────────────────────────────

function EquationFigure({ description }) {
  const ref = useRef(null);
  const [, setReady] = useState(false);

  useEffect(() => {
    ensureKaTeX(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ref.current || !katexModule) return;
    // Extract LaTeX from $...$ wrappers
    const match = description.match(/\$([^$]+)\$/);
    const tex = match ? match[1] : description;
    try {
      katexModule.render(tex, ref.current, { throwOnError: false, displayMode: true });
    } catch {
      ref.current.textContent = description;
    }
  }, [description, katexModule]);

  return (
    <div className="figure-render figure-render--equation">
      <div ref={ref} className="figure-render__equation-display" />
    </div>
  );
}

// ─── Generic Description Card ───────────────────────────────────────────────

function DescriptionCard({ description, icon, label }) {
  return (
    <div className="figure-render figure-render--card">
      <div className="figure-render__card-header">
        <span className="figure-render__card-icon">{icon || '📋'}</span>
        <span className="figure-render__card-label">{label || 'Figure'}</span>
      </div>
      <div className="figure-render__card-body">
        <InlineMath text={description} />
      </div>
    </div>
  );
}

// ─── Image Placeholder ──────────────────────────────────────────────────────

function ImagePlaceholder({ description }) {
  return (
    <div className="figure-render figure-render--image">
      <div className="figure-render__image-placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span>Image décrite</span>
      </div>
      <div className="figure-render__image-desc">
        <InlineMath text={description} />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FigureRenderer({ description, compact = false }) {
  const type = useMemo(() => classifyFigure(description), [description]);

  if (!description) return null;

  const wrapCls = `figure-renderer ${compact ? 'figure-renderer--compact' : ''}`;

  let content;
  switch (type) {
    case FIGURE_TYPES.TABLE:
      content = <TableFigure description={description} />;
      break;
    case FIGURE_TYPES.GRAPH:
      content = <GraphFigure description={description} />;
      break;
    case FIGURE_TYPES.CIRCUIT:
      content = <CircuitFigure description={description} />;
      break;
    case FIGURE_TYPES.GEOMETRY:
      content = <GeometryFigure description={description} />;
      break;
    case FIGURE_TYPES.CHEMISTRY:
      content = <ChemistryFigure description={description} />;
      break;
    case FIGURE_TYPES.EQUATION:
      content = <EquationFigure description={description} />;
      break;
    case FIGURE_TYPES.IMAGE:
      content = <ImagePlaceholder description={description} />;
      break;
    case FIGURE_TYPES.DIAGRAM:
      content = <DescriptionCard description={description} icon="📊" label="Schéma" />;
      break;
    case FIGURE_TYPES.TEXT:
    default:
      content = <DescriptionCard description={description} icon="📋" label="Figure" />;
      break;
  }

  return <div className={wrapCls}>{content}</div>;
}
