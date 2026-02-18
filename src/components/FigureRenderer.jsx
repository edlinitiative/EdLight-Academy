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
  MUSIC: 'music',
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

  // Electrochemistry (galvanic / voltaic cells) — before circuit check
  if (/pile\s*(voltaïque|galvanique|électrochimique)|galvanic\s+cell|voltaic\s+cell|pile.*électrode/.test(d)) {
    return FIGURE_TYPES.CHEMISTRY;
  }

  // Fresnel / phasor diagrams — before circuit check
  if (/fresnel|vecteurs?\s+tournants?/.test(d)) {
    return FIGURE_TYPES.DIAGRAM;
  }

  // Solenoid / electromagnet (not full circuit) — before circuit check
  if (/solénoïde|électro-?aimant/.test(d) && !/circuit/.test(d)) {
    return FIGURE_TYPES.DIAGRAM;
  }

  // Electrical circuits
  if (/circuit|résistance|condensateur|capacit|bobine|voltmètre|ampèremètre|dipôle|générateur/.test(d) ||
      /\b(resistor|capacitor|inductor|lamp|battery|voltmeter)\b/.test(d)) {
    return FIGURE_TYPES.CIRCUIT;
  }

  // Graphs and charts
  // "diagramme" only matches chart-type qualifiers immediately after (not "diagramme ... cercle" in geometry)
  if (/graphique|courbe|axe\s+(horizontal|vertical)|diagramme\s+(à\s+|en\s+|de\s+)?(barres?|bâtons?|cercle|circulaire|secteurs?)|graphe\b/.test(d) ||
      /\b(graph|chart|plot|axis|curve)\b/.test(d)) {
    return FIGURE_TYPES.GRAPH;
  }

  // Musical notation / staff figures
  if (/portée\s*musicale|musical\s+staff|clé\s+de\s+(sol|fa|ut)|treble\s+clef|bass\s+clef|mesures?\s+(contenant|de\s+musique)|accords?\s+(de|parfait|majeur|mineur)|notes?\s+(blanch|noir|croch|ronde|pointée)|quarter\s+note|eighth\s+note|whole\s+note|half\s+note|dièses?|bémols?|gamme|intervalle|solfège|partition|temps\s+signature|time\s+signature|\bstaff\b.*\bnotes?\b/.test(d)) {
    return FIGURE_TYPES.MUSIC;
  }

  // Chemistry — use specific group patterns to avoid matching "group of notes"
  if (/benzène|cycle aromatique|molécule|formule (topologique|semi-développée|développée)|substitué|chaîne (principale|carbonée)|groupe\s+(fonctionnel|hydroxyl|amino|nitro|méthyl|éthyl|carbonyl|carboxyl|aldéhyd)|amine|carbonyle|carboxyle/.test(d) ||
      /\b(zigzag chain|carbon atoms?|functional groups?|chemical structure|organic|skeletal (structure|formula)|cyclohex)\b/.test(d) ||
      /\b(aldehyde|hydroxyl|amino|nitro|methyl|ethyl|carbonyl|carboxyl)\s+groups?\b/.test(d)) {
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

  // Pedigree / family tree — check EARLY: descriptions contain "cercle" (female symbol)
  // but are really genetics diagrams, not geometry
  const isPedigree = /pedigree|arbre\s+généalogique|génération.*individu|individu.*génération/i.test(d);

  // Venn diagram — check EARLY: contains "cercle" but is a set diagram
  const isVenn = /venn|diagramme.*cercles?\s+(principaux|qui\s+se)/i.test(d)
    || (/cercles?\s+(principaux|chevauch)/i.test(d) && /patrimoine|ensemble/i.test(d));

  // Mirror / optics — check BEFORE triangle so "miroir + triangle" gets OpticsSVG
  const isMirror = /miroir|mirror|réflexion|rayon\s*lumineux|réfraction|lentille|optique/i.test(d);

  // Inclined plane (physics)
  const isInclinedPlane = /plan\s+incliné|inclined\s+plane/i.test(d);

  // Concentric circles: distinguish target/bullseye from math geometry
  const isConcentric = /concentric|concentri/.test(d);
  const isTarget = /cible|target|zones?\s*[:.]|points?\s+for|point.*zone/i.test(d)
    || (/concentric/.test(d) && /zone|point/i.test(d));
  const isTangentGeometry = isConcentric && /tangent|perpendiculaire|rayon.*[rR]|droit|AB|OA|OB/i.test(d);

  // Circle geometry (not concentric, not mirror) — circle with chord, tangent, inscribed angle, etc.
  const isCircle = /cercle|circle/i.test(d) && /centre|center|corde|chord|tangent|inscrit|rayon/i.test(d)
    && !isConcentric && !isMirror && !isTarget && !isPedigree && !isVenn;

  // Matrix (matrice carrée) — check before cube so "matrice carrée" doesn't match "carré" elsewhere
  const isMatrix = /matrice/i.test(d);

  // Parallelogram (not cube, not triangle)
  const isParallelogram = /parallélogramme/i.test(d) && !/cube|prisme/i.test(d);

  // Tree height surveying (arbre + jalon alignment)
  const isTreeHeight = /arbre.*jalon|jalon.*arbre/i.test(d);

  // Magnetic flux (surface + normale + champ magnétique)
  const isMagneticFlux = /surface.*normale.*champ|normale.*champ.*magnétique|flux.*magnétique/i.test(d)
    || (/surface\s+plane/i.test(d) && /champ\s+magnétique/i.test(d));

  // Non-triangle geometry that happens to contain the word "triangle"
  const isCube = /cube|parallélépipède/i.test(d);
  const isNet = /patron|net.*fold|dépli/i.test(d);

  // Triangle figures — only when it's primarily about a triangle
  const isTriangle = /triangle/.test(d) && !isConcentric && !isCube && !isNet && !isMirror;
  // Right triangle: match explicit "triangle rectangle", "angle droit", "droit en X"
  // Do NOT match "perpendiculaire" alone — that usually describes a height, not a right triangle
  const isRightTriangle = isTriangle && /triangle\s+rectangle|angle\s+droit|droit\s+en\s+[a-z]|right\s*angle|\b90[°\s]/i.test(d);

  if (isPedigree) return <PedigreeSVG description={description} />;
  if (isVenn) return <VennSVG description={description} />;
  if (isPendulum) return <PendulumSVG description={description} />;
  if (isCoordinate) return <CoordinateSVG description={description} />;
  if (isTangentGeometry) return <ConcentricTangentSVG description={description} />;
  if (isTarget) return <TargetSVG description={description} />;
  if (isMirror) return <OpticsSVG description={description} />;
  if (isInclinedPlane) return <InclinedPlaneSVG description={description} />;
  if (isCircle) return <CircleSVG description={description} />;
  if (isMatrix) return <MatrixSVG description={description} />;
  if (isParallelogram) return <ParallelogramSVG description={description} />;
  if (isTreeHeight) return <TreeHeightSVG description={description} />;
  if (isMagneticFlux) return <MagneticFluxSVG description={description} />;
  if (isCube || isNet) return <CubeSVG description={description} />;
  if (isRightTriangle) return <RightTriangleSVG description={description} />;
  if (isTriangle) return <TriangleSVG description={description} />;

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
  // Two concentric circles (center O), inner radius r, outer radius R.
  // Tangent line AB touches the inner circle at D.  OA = OB = R.
  // Triangle ODA is right-angled at D.
  const cx = 150, cy = 150;
  const R = 90, r = 50;

  // Place D at "10 o'clock" on the inner circle so the triangle ODA
  // is clearly visible as a proper right triangle (not a flat T-shape).
  // Direction from O to D in SVG coords (upper-left):
  const odx = -Math.sin(Math.PI / 3);   // ≈ -0.866
  const ody = -Math.cos(Math.PI / 3);   // ≈ -0.5

  // D on the inner circle
  const Dx = cx + r * odx;
  const Dy = cy + r * ody;

  // Tangent direction at D: perpendicular to OD, rotated 90° CW
  const tx = -ody;    // ≈ 0.5   (toward A, upper-right)
  const ty = odx;     // ≈ -0.866

  // Half-chord from D to each endpoint: sqrt(R² – r²)
  const half = Math.sqrt(R * R - r * r);

  // A (upper-right) and B (lower-left) on the outer circle
  const Ax = Dx + half * tx, Ay = Dy + half * ty;
  const Bx = Dx - half * tx, By = Dy - half * ty;

  // Right-angle mark at D between rays D→A and D→O
  const s = 10;
  const dox = -odx, doy = -ody;   // unit vector D → O
  const r1x = Dx + s * tx,  r1y = Dy + s * ty;
  const r2x = r1x + s * dox, r2y = r1y + s * doy;
  const r3x = Dx + s * dox,  r3y = Dy + s * doy;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 270" className="figure-render__geo-svg">
        {/* Outer circle */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#457b9d" strokeWidth="1.5" />
        {/* Inner circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e63946" strokeWidth="1.5" />

        {/* Highlight triangle ODA */}
        <polygon points={`${cx},${cy} ${Dx},${Dy} ${Ax},${Ay}`}
          fill="rgba(69,123,157,0.1)" stroke="none" />

        {/* Tangent line AB (extended slightly past A and B) */}
        <line x1={Bx - 15 * tx} y1={By - 15 * ty}
              x2={Ax + 15 * tx} y2={Ay + 15 * ty}
          stroke="#333" strokeWidth="1.5" />

        {/* Radius OA (dashed, hypotenuse of △ODA) */}
        <line x1={cx} y1={cy} x2={Ax} y2={Ay}
          stroke="#457b9d" strokeWidth="1.2" strokeDasharray="5,3" />
        {/* Radius OB (dashed) */}
        <line x1={cx} y1={cy} x2={Bx} y2={By}
          stroke="#457b9d" strokeWidth="1.2" strokeDasharray="5,3" />

        {/* Radius OD (solid) */}
        <line x1={cx} y1={cy} x2={Dx} y2={Dy}
          stroke="#e63946" strokeWidth="1.5" />

        {/* Right-angle mark at D */}
        <polyline points={`${r1x},${r1y} ${r2x},${r2y} ${r3x},${r3y}`}
          fill="none" stroke="#333" strokeWidth="1" />

        {/* Vertex dots */}
        <circle cx={cx} cy={cy} r="3" fill="#333" />
        <circle cx={Dx} cy={Dy} r="3" fill="#e63946" />
        <circle cx={Ax} cy={Ay} r="3" fill="#457b9d" />
        <circle cx={Bx} cy={By} r="3" fill="#457b9d" />

        {/* Labels */}
        <text x={cx + 8} y={cy + 16} fontSize="14" fontWeight="600" fill="#333">O</text>
        <text x={Dx - 18} y={Dy - 6} fontSize="14" fontWeight="600" fill="#e63946">D</text>
        <text x={Ax + 6} y={Ay - 8} fontSize="14" fontWeight="600" fill="#457b9d">A</text>
        <text x={Bx - 18} y={By + 16} fontSize="14" fontWeight="600" fill="#457b9d">B</text>

        {/* r label along OD */}
        <text x={(cx + Dx) / 2 - 14} y={(cy + Dy) / 2 - 4}
          fontSize="13" fill="#e63946" fontStyle="italic">r</text>
        {/* R label along OA */}
        <text x={(cx + Ax) / 2 + 6} y={(cy + Ay) / 2 - 8}
          fontSize="13" fill="#457b9d" fontStyle="italic">R</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Triangle SVG ───────────────────────────────────────────────────────────

function TriangleSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Extract vertex labels
  const labelMatch = d.match(/triangle\s+([a-z])([a-z])([a-z])/i);
  const [vA, vB, vC] = labelMatch
    ? [labelMatch[1].toUpperCase(), labelMatch[2].toUpperCase(), labelMatch[3].toUpperCase()]
    : ['A', 'B', 'C'];

  // Height / altitude detection
  const hasHeight = /hauteur|altitude|perpendiculaire.*à\s*[A-Z]{2}|height/i.test(d);
  const heightFromMatch = d.match(/(?:hauteur|altitude)\s*(?:issue\s*de\s*)?([a-z])/i);
  const heightFrom = heightFromMatch ? heightFromMatch[1].toUpperCase() : vC;   // vertex the height comes from
  const footMatch = d.match(/point\s+([a-z])\s+(?:est|sur)/i);
  const footLabel = footMatch ? footMatch[1].toUpperCase() : 'H';

  // Side labels (a, b, c)
  const hasSideLabels = /side.*labeled|côté.*étiqueté|labeled.*'[abc]'/i.test(d)
    || /\b[abc]'?\s*[,.]/.test(d) && /side|côté/i.test(d);

  // Angle labels
  const hasAlpha = /alpha|α/.test(d);
  const hasBeta = /beta|β/.test(d);
  const hasGamma = /gamma|γ/.test(d);

  // Triangle vertices — scalene with C offset right so height hits inside AB
  const Ax = 40, Ay = 190;
  const Bx = 260, By = 190;
  const Cx = 190, Cy = 40;

  // Compute foot of height H from C to AB
  // H = A + ((AC · AB) / (AB · AB)) * AB  (projection)
  const ABx = Bx - Ax, ABy = By - Ay;
  const ACx = Cx - Ax, ACy = Cy - Ay;
  const t = (ACx * ABx + ACy * ABy) / (ABx * ABx + ABy * ABy);
  const Hx = Ax + t * ABx, Hy = Ay + t * ABy;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Triangle fill */}
        <polygon
          points={`${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Height from C to H on AB */}
        {hasHeight && (
          <g>
            <line x1={Cx} y1={Cy} x2={Hx} y2={Hy}
              stroke="#e63946" strokeWidth="1.2" strokeDasharray="6,3" />
            {/* Right-angle mark at H */}
            <polyline
              points={`${Hx - 10},${Hy} ${Hx - 10},${Hy - 10} ${Hx},${Hy - 10}`}
              fill="none" stroke="#333" strokeWidth="1" />
            {/* H point */}
            <circle cx={Hx} cy={Hy} r="3" fill="#e63946" />
            <text x={Hx + 2} y={Hy + 16} fontSize="13" fontWeight="600" fill="#e63946">{footLabel}</text>
          </g>
        )}

        {/* Angle arcs */}
        {hasAlpha && (
          <g>
            <path d={`M${Ax + 30},${Ay} A30,30 0 0,0 ${Ax + 22},${Ay - 18}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Ax + 32} y={Ay - 8} fontSize="11" fill="#f59e0b">α</text>
          </g>
        )}
        {hasBeta && (
          <g>
            <path d={`M${Bx - 30},${By} A30,30 0 0,1 ${Bx - 18},${By - 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Bx - 38} y={By - 12} fontSize="11" fill="#f59e0b">β</text>
          </g>
        )}
        {hasGamma && (
          <g>
            <path d={`M${Cx - 12},${Cy + 25} A20,20 0 0,1 ${Cx + 8},${Cy + 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={Cx - 5} y={Cy + 38} fontSize="11" fill="#f59e0b">γ</text>
          </g>
        )}

        {/* Side labels */}
        {hasSideLabels && (
          <g>
            <text x={(Bx + Cx) / 2 + 8} y={(By + Cy) / 2} fontSize="12"
              fill="#457b9d" fontStyle="italic">a</text>
            <text x={(Ax + Cx) / 2 - 18} y={(Ay + Cy) / 2} fontSize="12"
              fill="#457b9d" fontStyle="italic">b</text>
            <text x={(Ax + Bx) / 2} y={Ay + 18} fontSize="12" textAnchor="middle"
              fill="#457b9d" fontStyle="italic">c</text>
          </g>
        )}

        {/* Vertex labels */}
        <text x={Ax - 16} y={Ay + 6} fontSize="14" fontWeight="600" fill="#333">{vA}</text>
        <text x={Bx + 6} y={By + 6} fontSize="14" fontWeight="600" fill="#333">{vB}</text>
        <text x={Cx + 6} y={Cy - 6} fontSize="14" fontWeight="600" fill="#333">{vC}</text>

        {/* Vertex dots */}
        <circle cx={Ax} cy={Ay} r="3" fill="#333" />
        <circle cx={Bx} cy={By} r="3" fill="#333" />
        <circle cx={Cx} cy={Cy} r="3" fill="#333" />
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Optics Renderer ────────────────────────────────────────────────────────

function OpticsSVG({ description }) {
  const d = (description || '').toLowerCase();

  const isTwoMirrors = /deux miroirs|two mirrors|miroirs.*inclinés|miroir.*vertical.*miroir.*incliné/i.test(d);
  const isRefraction = /réfract|lame\s+de\s+verre|glass\s+slab|réservoir|snell|indice.*milieu/i.test(d);
  const isLens = /lentille|lens|convergent|divergent/i.test(d);

  if (isTwoMirrors) return <TwoMirrorsSVG description={description} />;
  if (isRefraction) return <RefractionSVG description={description} />;
  if (isLens) return <LensSVG description={description} />;
  return <PlaneMirrorSVG description={description} />;
}

function PlaneMirrorSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Extract angle if mentioned
  const angleMatch = d.match(/(\d+)\s*[°o]\s*/);
  const angle = angleMatch ? angleMatch[1] + '°' : null;

  // Mirror line: vertical at center
  const mx = 150, my1 = 40, my2 = 200;
  // Incident ray: from upper-left to mirror mid-point
  const hitY = 120;
  const ix = 50, iy = 60;
  // Reflected ray: symmetric about normal
  const rx = 250, ry = 60;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 240" className="figure-render__geo-svg">
        {/* Mirror surface */}
        <line x1={mx} y1={my1} x2={mx} y2={my2}
          stroke="#333" strokeWidth="2.5" />
        {/* Hatching behind mirror */}
        {[0,1,2,3,4,5,6,7].map(i => {
          const y = my1 + i * 20;
          return <line key={i} x1={mx} y1={y} x2={mx + 10} y2={y + 14}
            stroke="#999" strokeWidth="1" />;
        })}

        {/* Normal line (dashed) */}
        <line x1={mx - 60} y1={hitY} x2={mx + 60} y2={hitY}
          stroke="#666" strokeWidth="0.8" strokeDasharray="5,3" />
        <text x={mx + 46} y={hitY - 6} fontSize="10" fill="#666"
          fontStyle="italic">N</text>

        {/* Incident ray */}
        <line x1={ix} y1={iy} x2={mx} y2={hitY}
          stroke="#e63946" strokeWidth="1.5" />
        <polygon points={`${mx - 2},${hitY} ${mx - 14},${hitY - 6} ${mx - 12},${hitY - 1}`}
          fill="#e63946" />

        {/* Reflected ray */}
        <line x1={mx} y1={hitY} x2={rx} y2={ry}
          stroke="#457b9d" strokeWidth="1.5" />
        <polygon points={`${rx},${ry} ${rx - 14},${ry + 2} ${rx - 11},${ry - 5}`}
          fill="#457b9d" />

        {/* Angle of incidence arc */}
        <path d={`M${mx - 30},${hitY} A30,30 0 0,0 ${mx - 18},${hitY - 24}`}
          fill="none" stroke="#e63946" strokeWidth="1.2" />
        <text x={mx - 46} y={hitY - 14} fontSize="11" fill="#e63946"
          fontWeight="600">θᵢ</text>

        {/* Angle of reflection arc */}
        <path d={`M${mx + 30},${hitY} A30,30 0 0,1 ${mx + 18},${hitY - 24}`}
          fill="none" stroke="#457b9d" strokeWidth="1.2" />
        <text x={mx + 30} y={hitY - 14} fontSize="11" fill="#457b9d"
          fontWeight="600">θᵣ</text>

        {/* Angle value if known */}
        {angle && (
          <text x={mx - 54} y={hitY + 18} fontSize="10" fill="#333">{angle}</text>
        )}

        {/* Labels */}
        <text x={ix - 4} y={iy - 6} fontSize="10" fill="#e63946">rayon incident</text>
        <text x={rx - 30} y={ry - 6} fontSize="10" fill="#457b9d">rayon réfléchi</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function TwoMirrorsSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Try to extract the angle between mirrors
  const angleBetweenMatch = d.match(/(\d+)\s*[°o\\^]/);
  const angleBetween = angleBetweenMatch ? angleBetweenMatch[1] + '°' : 'α';

  // Extract mirror labels
  const m1Match = d.match(/miroirs?\s*(?:inclinés?\s*,?\s*)?([A-Z]{1,2}'?)\s+et\s+([A-Z]{1,2}'?)/i)
    || d.match(/mirrors?\s+\$?([A-Z]_?\{?[12]?\}?)\$?\s+and\s+\$?([A-Z]_?\{?[12]?\}?)\$?/i);
  const m1Label = m1Match ? m1Match[1].replace(/\$/g, '') : 'M₁';
  const m2Label = m1Match ? m1Match[2].replace(/\$/g, '') : 'M₂';

  // Two mirrors meeting at an angle
  // M1: lower-left going up-right. M2: lower-right going up-left. They meet at bottom-center.
  const apex = { x: 150, y: 190 };
  const m1End = { x: 50, y: 80 };
  const m2End = { x: 250, y: 80 };

  // Ray path: enter from left, hit M1, bounce to M2, exit right
  const hit1 = { x: 95, y: 130 };
  const hit2 = { x: 205, y: 130 };

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Mirror M1 */}
        <line x1={m1End.x} y1={m1End.y} x2={apex.x} y2={apex.y}
          stroke="#333" strokeWidth="2.5" />
        {/* M1 hatching */}
        {[0,1,2,3,4].map(i => {
          const t = 0.15 + i * 0.18;
          const x = m1End.x + t * (apex.x - m1End.x);
          const y = m1End.y + t * (apex.y - m1End.y);
          return <line key={'m1'+i} x1={x - 4} y1={y - 10} x2={x + 6} y2={y}
            stroke="#999" strokeWidth="0.8" />;
        })}

        {/* Mirror M2 */}
        <line x1={apex.x} y1={apex.y} x2={m2End.x} y2={m2End.y}
          stroke="#333" strokeWidth="2.5" />
        {/* M2 hatching */}
        {[0,1,2,3,4].map(i => {
          const t = 0.15 + i * 0.18;
          const x = apex.x + t * (m2End.x - apex.x);
          const y = apex.y + t * (m2End.y - apex.y);
          return <line key={'m2'+i} x1={x - 6} y1={y} x2={x + 4} y2={y - 10}
            stroke="#999" strokeWidth="0.8" />;
        })}

        {/* Angle between mirrors at apex */}
        <path d={`M${apex.x - 22},${apex.y - 18} A28,28 0 0,1 ${apex.x + 22},${apex.y - 18}`}
          fill="none" stroke="#f59e0b" strokeWidth="1.2" />
        <text x={apex.x - 6} y={apex.y - 24} fontSize="11" fill="#f59e0b"
          fontWeight="600" textAnchor="middle">{angleBetween}</text>

        {/* Incident ray → hit1 on M1 */}
        <line x1={30} y1={90} x2={hit1.x} y2={hit1.y}
          stroke="#e63946" strokeWidth="1.5" />
        <polygon points={`${hit1.x},${hit1.y} ${hit1.x - 12},${hit1.y - 8} ${hit1.x - 8},${hit1.y - 1}`}
          fill="#e63946" />

        {/* Reflected from M1 to hit2 on M2 */}
        <line x1={hit1.x} y1={hit1.y} x2={hit2.x} y2={hit2.y}
          stroke="#2a9d8f" strokeWidth="1.5" />
        <polygon points={`${hit2.x},${hit2.y} ${hit2.x - 8},${hit2.y - 1} ${hit2.x - 12},${hit2.y + 8}`}
          fill="#2a9d8f" />

        {/* Reflected from M2 → exit */}
        <line x1={hit2.x} y1={hit2.y} x2={270} y2={90}
          stroke="#457b9d" strokeWidth="1.5" />
        <polygon points={`${270},${90} ${258},${92} ${260},${84}`}
          fill="#457b9d" />

        {/* Incidence points */}
        <circle cx={hit1.x} cy={hit1.y} r="2.5" fill="#333" />
        <circle cx={hit2.x} cy={hit2.y} r="2.5" fill="#333" />

        {/* Mirror labels */}
        <text x={m1End.x - 8} y={m1End.y - 6} fontSize="12" fontWeight="600" fill="#333">{m1Label}</text>
        <text x={m2End.x - 2} y={m2End.y - 6} fontSize="12" fontWeight="600" fill="#333">{m2Label}</text>

        {/* Ray labels */}
        <text x={22} y={82} fontSize="9" fill="#e63946">incident</text>
        <text x={246} y={82} fontSize="9" fill="#457b9d">émergent</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function RefractionSVG({ description }) {
  const d = (description || '').toLowerCase();

  const isGlassSlab = /lame\s+de\s+verre|glass\s+slab|lame\s+à\s+faces\s+parallèles/i.test(d);
  const isWater = /eau|water|réservoir|bassin|piscine/i.test(d);

  // Labels for media
  const topMedium = isWater ? 'Air' : 'Milieu 1';
  const bottomMedium = isWater ? 'Eau' : isGlassSlab ? 'Verre' : 'Milieu 2';

  if (isGlassSlab) {
    // Glass slab: two parallel surfaces
    const surfY1 = 80, surfY2 = 160;
    const entryX = 120, exitX = 150;

    return (
      <div className="figure-render figure-render--geometry">
        <svg viewBox="0 0 300 240" className="figure-render__geo-svg">
          {/* Glass slab */}
          <rect x={30} y={surfY1} width={240} height={surfY2 - surfY1}
            fill="rgba(69,123,157,0.12)" stroke="#333" strokeWidth="1.5" />

          {/* Normal lines (dashed) */}
          <line x1={entryX} y1={surfY1 - 30} x2={entryX} y2={surfY1 + 40}
            stroke="#666" strokeWidth="0.8" strokeDasharray="4,3" />
          <line x1={exitX} y1={surfY2 - 40} x2={exitX} y2={surfY2 + 30}
            stroke="#666" strokeWidth="0.8" strokeDasharray="4,3" />

          {/* Incident ray */}
          <line x1={60} y1={30} x2={entryX} y2={surfY1}
            stroke="#e63946" strokeWidth="1.5" />
          <polygon points={`${entryX},${surfY1} ${entryX - 12},${surfY1 - 8} ${entryX - 8},${surfY1 - 2}`}
            fill="#e63946" />

          {/* Ray inside glass */}
          <line x1={entryX} y1={surfY1} x2={exitX} y2={surfY2}
            stroke="#2a9d8f" strokeWidth="1.5" />

          {/* Emergent ray (parallel-shifted from incident) */}
          <line x1={exitX} y1={surfY2} x2={210} y2={surfY2 + 50}
            stroke="#457b9d" strokeWidth="1.5" />
          <polygon points={`${210},${surfY2 + 50} ${200},${surfY2 + 38} ${205},${surfY2 + 42}`}
            fill="#457b9d" />

          {/* Angle labels */}
          <text x={entryX - 40} y={surfY1 - 16} fontSize="10" fill="#e63946" fontWeight="600">θ₁</text>
          <text x={entryX + 8} y={surfY1 + 28} fontSize="10" fill="#2a9d8f" fontWeight="600">θ₂</text>
          <text x={exitX + 8} y={surfY2 + 26} fontSize="10" fill="#457b9d" fontWeight="600">θ₃</text>

          {/* Media labels */}
          <text x={240} y={surfY1 - 8} fontSize="10" fill="#333">Air</text>
          <text x={240} y={surfY1 + 20} fontSize="10" fill="#457b9d" fontWeight="600">{bottomMedium}</text>
          <text x={240} y={surfY2 + 18} fontSize="10" fill="#333">Air</text>

          {/* Lateral displacement indicator */}
          <line x1={entryX} y1={surfY2 + 10} x2={exitX} y2={surfY2 + 10}
            stroke="#f59e0b" strokeWidth="1" />
          <text x={(entryX + exitX) / 2 - 3} y={surfY2 + 24} fontSize="9"
            fill="#f59e0b" textAnchor="middle">d</text>
        </svg>
        <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
      </div>
    );
  }

  // Single surface refraction (water, glass, etc.)
  const surfY = 120;
  const hitX = 150;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 240" className="figure-render__geo-svg">
        {/* Lower medium fill */}
        <rect x={20} y={surfY} width={260} height={100}
          fill="rgba(69,123,157,0.08)" stroke="none" />

        {/* Surface line */}
        <line x1={20} y1={surfY} x2={280} y2={surfY}
          stroke="#333" strokeWidth="1.5" />

        {/* Normal line (dashed) */}
        <line x1={hitX} y1={surfY - 60} x2={hitX} y2={surfY + 70}
          stroke="#666" strokeWidth="0.8" strokeDasharray="5,3" />
        <text x={hitX + 4} y={surfY - 52} fontSize="10" fill="#666" fontStyle="italic">N</text>

        {/* Incident ray */}
        <line x1={70} y1={40} x2={hitX} y2={surfY}
          stroke="#e63946" strokeWidth="1.5" />
        <polygon points={`${hitX},${surfY} ${hitX - 14},${surfY - 8} ${hitX - 10},${surfY - 2}`}
          fill="#e63946" />

        {/* Refracted ray (bends toward normal in denser medium) */}
        <line x1={hitX} y1={surfY} x2={210} y2={surfY + 70}
          stroke="#457b9d" strokeWidth="1.5" />
        <polygon points={`${210},${surfY + 70} ${200},${surfY + 60} ${205},${surfY + 62}`}
          fill="#457b9d" />

        {/* Angle of incidence arc */}
        <path d={`M${hitX},${surfY - 30} A30,30 0 0,0 ${hitX - 22},${surfY - 20}`}
          fill="none" stroke="#e63946" strokeWidth="1.2" />
        <text x={hitX - 36} y={surfY - 24} fontSize="11" fill="#e63946" fontWeight="600">θ₁</text>

        {/* Angle of refraction arc */}
        <path d={`M${hitX},${surfY + 30} A30,30 0 0,1 ${hitX + 18},${surfY + 24}`}
          fill="none" stroke="#457b9d" strokeWidth="1.2" />
        <text x={hitX + 22} y={surfY + 30} fontSize="11" fill="#457b9d" fontWeight="600">θ₂</text>

        {/* Hit point */}
        <circle cx={hitX} cy={surfY} r="2.5" fill="#333" />

        {/* Media labels */}
        <text x={230} y={surfY - 14} fontSize="11" fill="#333" fontWeight="600">{topMedium}</text>
        <text x={230} y={surfY + 18} fontSize="11" fill="#457b9d" fontWeight="600">{bottomMedium}</text>

        {/* Ray labels */}
        <text x={52} y={36} fontSize="9" fill="#e63946">incident</text>
        <text x={198} y={surfY + 84} fontSize="9" fill="#457b9d">réfracté</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function LensSVG({ description }) {
  const d = (description || '').toLowerCase();
  const isDiverging = /divergent|concave/i.test(d);

  const cx = 150, cy = 110;
  const lensH = 80; // half-height
  const focalDist = 70;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 220" className="figure-render__geo-svg">
        {/* Principal axis */}
        <line x1={20} y1={cy} x2={280} y2={cy}
          stroke="#333" strokeWidth="1" />

        {/* Lens */}
        {isDiverging ? (
          <g>
            {/* Diverging lens: concave on both sides */}
            <path d={`M${cx},${cy - lensH} Q${cx + 12},${cy} ${cx},${cy + lensH}`}
              fill="none" stroke="#457b9d" strokeWidth="2.5" />
            <path d={`M${cx},${cy - lensH} Q${cx - 12},${cy} ${cx},${cy + lensH}`}
              fill="none" stroke="#457b9d" strokeWidth="2.5" />
            {/* Arrows pointing inward at tips */}
            <polygon points={`${cx - 6},${cy - lensH + 4} ${cx},${cy - lensH} ${cx + 6},${cy - lensH + 4}`}
              fill="#457b9d" />
            <polygon points={`${cx - 6},${cy + lensH - 4} ${cx},${cy + lensH} ${cx + 6},${cy + lensH - 4}`}
              fill="#457b9d" />
          </g>
        ) : (
          <g>
            {/* Converging lens: convex on both sides */}
            <path d={`M${cx},${cy - lensH} Q${cx + 16},${cy} ${cx},${cy + lensH}`}
              fill="rgba(69,123,157,0.08)" stroke="#457b9d" strokeWidth="2.5" />
            <path d={`M${cx},${cy - lensH} Q${cx - 16},${cy} ${cx},${cy + lensH}`}
              fill="rgba(69,123,157,0.08)" stroke="#457b9d" strokeWidth="2.5" />
            {/* Arrows pointing outward at tips */}
            <polygon points={`${cx - 6},${cy - lensH - 4} ${cx},${cy - lensH} ${cx + 6},${cy - lensH - 4}`}
              fill="#457b9d" />
            <polygon points={`${cx - 6},${cy + lensH + 4} ${cx},${cy + lensH} ${cx + 6},${cy + lensH + 4}`}
              fill="#457b9d" />
          </g>
        )}

        {/* Focal points */}
        <text x={cx - focalDist - 2} y={cy + 16} fontSize="11" fill="#e63946"
          textAnchor="middle" fontWeight="600">F</text>
        <circle cx={cx - focalDist} cy={cy} r="2.5" fill="#e63946" />
        <text x={cx + focalDist - 2} y={cy + 16} fontSize="11" fill="#e63946"
          textAnchor="middle" fontWeight="600">F'</text>
        <circle cx={cx + focalDist} cy={cy} r="2.5" fill="#e63946" />

        {/* Optical center */}
        <text x={cx} y={cy + 16} fontSize="11" fill="#333"
          textAnchor="middle" fontWeight="600">O</text>
        <circle cx={cx} cy={cy} r="2.5" fill="#333" />

        {/* Example rays for converging lens */}
        {!isDiverging && (
          <g>
            {/* Parallel ray → through F' */}
            <line x1={30} y1={cy - 35} x2={cx} y2={cy - 35}
              stroke="#2a9d8f" strokeWidth="1.2" />
            <line x1={cx} y1={cy - 35} x2={cx + focalDist + 40} y2={cy + 20}
              stroke="#2a9d8f" strokeWidth="1.2" />
            {/* Through center ray (undeviated) */}
            <line x1={50} y1={cy - 50} x2={250} y2={cy + 40}
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="5,3" />
          </g>
        )}
        {isDiverging && (
          <g>
            {/* Parallel ray → diverges as if from F */}
            <line x1={30} y1={cy - 35} x2={cx} y2={cy - 35}
              stroke="#2a9d8f" strokeWidth="1.2" />
            <line x1={cx} y1={cy - 35} x2={cx + focalDist + 40} y2={cy - 55}
              stroke="#2a9d8f" strokeWidth="1.2" />
            {/* Virtual extension back to F */}
            <line x1={cx} y1={cy - 35} x2={cx - focalDist} y2={cy}
              stroke="#2a9d8f" strokeWidth="0.8" strokeDasharray="4,3" />
          </g>
        )}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Inclined Plane (physics) ───────────────────────────────────────────────

function InclinedPlaneSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Extract angle value
  const angleMatch = d.match(/(\d+)\s*[°o^\\]|angle\s+(?:de\s+)?\$?\\?alpha\$?/);
  const angleLabel = angleMatch && /\d/.test(angleMatch[0])
    ? angleMatch[1] + '°'
    : 'α';

  // Has forces?
  const hasForces = /force|poids|weight|friction|frottement|normal|tension|câble/i.test(d);
  const hasFriction = /frottement|friction/i.test(d);

  // Ramp shape
  const Ax = 40, Ay = 200;   // bottom-left (ground level)
  const Bx = 260, By = 200;  // bottom-right
  const Cx = 260, Cy = 80;   // top of ramp

  // Object on the slope (small rectangle)
  const objT = 0.55; // position along slope
  const objCx = Ax + objT * (Cx - Ax);
  const objCy = Ay + objT * (Cy - Ay);

  // Slope direction unit vector
  const slopeLen = Math.sqrt((Cx - Ax) ** 2 + (Cy - Ay) ** 2);
  const sx = (Cx - Ax) / slopeLen;
  const sy = (Cy - Ay) / slopeLen;
  // Normal to slope (pointing away from surface)
  const nx = -sy, ny = sx;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 240" className="figure-render__geo-svg">
        {/* Ground */}
        <line x1={20} y1={By} x2={280} y2={By}
          stroke="#999" strokeWidth="1" strokeDasharray="4,3" />

        {/* Ramp surface */}
        <polygon points={`${Ax},${Ay} ${Bx},${By} ${Cx},${Cy}`}
          fill="rgba(69,123,157,0.06)" stroke="#333" strokeWidth="1.5"
          strokeLinejoin="round" />

        {/* Hatching on ramp */}
        {[0,1,2,3,4,5].map(i => {
          const x = Bx - 10 - i * 38;
          return <line key={i} x1={x} y1={By} x2={x + 8} y2={By + 8}
            stroke="#999" strokeWidth="0.8" />;
        })}

        {/* Angle arc at base */}
        <path d={`M${Bx - 40},${By} A40,40 0 0,1 ${Bx - 30},${By - 30}`}
          fill="none" stroke="#e63946" strokeWidth="1.3" />
        <text x={Bx - 52} y={By - 14} fontSize="12" fill="#e63946"
          fontWeight="600">{angleLabel}</text>

        {/* Object on slope (small box) */}
        <rect
          x={objCx - 14} y={objCy - 14} width={28} height={20}
          fill="rgba(230,57,70,0.15)" stroke="#e63946" strokeWidth="1.5"
          transform={`rotate(${Math.atan2(Cy - Ay, Cx - Ax) * 180 / Math.PI}, ${objCx}, ${objCy})`}
          rx="2"
        />
        <text x={objCx - 6} y={objCy + 3} fontSize="10" fill="#e63946"
          fontWeight="600"
          transform={`rotate(${Math.atan2(Cy - Ay, Cx - Ax) * 180 / Math.PI}, ${objCx}, ${objCy})`}>m</text>

        {/* Force vectors (if described) */}
        {hasForces && (
          <g>
            {/* Weight (downward) */}
            <line x1={objCx} y1={objCy} x2={objCx} y2={objCy + 45}
              stroke="#333" strokeWidth="1.5" />
            <polygon points={`${objCx},${objCy + 45} ${objCx - 4},${objCy + 38} ${objCx + 4},${objCy + 38}`}
              fill="#333" />
            <text x={objCx + 6} y={objCy + 44} fontSize="10" fill="#333" fontWeight="600">P⃗</text>

            {/* Normal force (perpendicular to slope, outward) */}
            <line x1={objCx} y1={objCy}
              x2={objCx + nx * 40} y2={objCy + ny * 40}
              stroke="#457b9d" strokeWidth="1.5" />
            <polygon points={`${objCx + nx * 40},${objCy + ny * 40} ${objCx + nx * 33 - ny * 4},${objCy + ny * 33 + nx * 4} ${objCx + nx * 33 + ny * 4},${objCy + ny * 33 - nx * 4}`}
              fill="#457b9d" />
            <text x={objCx + nx * 44} y={objCy + ny * 44 - 4} fontSize="10"
              fill="#457b9d" fontWeight="600">N⃗</text>

            {/* Friction (along slope, downhill) — only if mentioned */}
            {hasFriction && (
              <g>
                <line x1={objCx} y1={objCy}
                  x2={objCx - sx * 35} y2={objCy - sy * 35}
                  stroke="#f59e0b" strokeWidth="1.5" />
                <polygon points={`${objCx - sx * 35},${objCy - sy * 35} ${objCx - sx * 28 + sy * 4},${objCy - sy * 28 - sx * 4} ${objCx - sx * 28 - sy * 4},${objCy - sy * 28 + sx * 4}`}
                  fill="#f59e0b" />
                <text x={objCx - sx * 40 - 4} y={objCy - sy * 40} fontSize="10"
                  fill="#f59e0b" fontWeight="600">f⃗</text>
              </g>
            )}
          </g>
        )}

        {/* Labels */}
        <text x={Ax - 4} y={Ay + 16} fontSize="11" fill="#333" fontWeight="600">A</text>
        <text x={Cx + 4} y={Cy - 4} fontSize="11" fill="#333" fontWeight="600">B</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Circle Geometry ────────────────────────────────────────────────────────

function CircleSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Circle center and radius
  const cx = 150, cy = 115, r = 75;

  // Detect features
  const hasChord = /corde|chord/i.test(d);
  const hasTangent = /tangent/i.test(d);
  const hasInscribedAngle = /inscrit|inscribed/i.test(d);
  const hasDiameter = /diamètre|diameter/i.test(d);

  // Extract center label
  const centerMatch = d.match(/centre\s+([a-z])/i);
  const centerLabel = centerMatch ? centerMatch[1].toUpperCase() : 'O';

  // Extract point labels from description
  const pointsMatch = d.match(/points?\s+([a-z]),?\s*([a-z])(?:,?\s*([a-z]))?/i)
    || d.match(/([a-z]),\s*([a-z])(?:,?\s*([a-z]))?\s+(?:sont|sont des points|sur)/i);
  const p1Label = pointsMatch ? pointsMatch[1].toUpperCase() : 'A';
  const p2Label = pointsMatch ? pointsMatch[2].toUpperCase() : 'B';
  const p3Label = pointsMatch && pointsMatch[3] ? pointsMatch[3].toUpperCase() : 'C';

  // Point positions on circle
  const p1Angle = -30 * Math.PI / 180;
  const p2Angle = 210 * Math.PI / 180;
  const p3Angle = 100 * Math.PI / 180;
  const p1 = { x: cx + r * Math.cos(p1Angle), y: cy + r * Math.sin(p1Angle) };
  const p2 = { x: cx + r * Math.cos(p2Angle), y: cy + r * Math.sin(p2Angle) };
  const p3 = { x: cx + r * Math.cos(p3Angle), y: cy + r * Math.sin(p3Angle) };

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Circle */}
        <circle cx={cx} cy={cy} r={r}
          fill="rgba(69,123,157,0.06)" stroke="#333" strokeWidth="1.5" />

        {/* Center point */}
        <circle cx={cx} cy={cy} r="2.5" fill="#333" />
        <text x={cx + 6} y={cy - 6} fontSize="13" fontWeight="600" fill="#333">{centerLabel}</text>

        {/* Radius line */}
        <line x1={cx} y1={cy} x2={p1.x} y2={p1.y}
          stroke="#999" strokeWidth="0.8" strokeDasharray="4,3" />
        <text x={(cx + p1.x) / 2 + 4} y={(cy + p1.y) / 2 - 4}
          fontSize="10" fill="#999" fontStyle="italic">r</text>

        {/* Chord or diameter from P1 to P2 */}
        {(hasChord || hasDiameter) && (
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="#457b9d" strokeWidth="1.5" />
        )}

        {/* Tangent line at P1 */}
        {hasTangent && (
          <g>
            {/* Tangent is perpendicular to radius at P1 */}
            <line
              x1={p1.x - 50 * Math.sin(p1Angle)} y1={p1.y + 50 * Math.cos(p1Angle)}
              x2={p1.x + 50 * Math.sin(p1Angle)} y2={p1.y - 50 * Math.cos(p1Angle)}
              stroke="#e63946" strokeWidth="1.3" />
            {/* Right angle mark */}
            <rect x={p1.x - 5} y={p1.y - 5} width={8} height={8}
              fill="none" stroke="#333" strokeWidth="0.8"
              transform={`rotate(${p1Angle * 180 / Math.PI}, ${p1.x}, ${p1.y})`} />
          </g>
        )}

        {/* Third point on circle (for inscribed angles, etc.) */}
        <circle cx={p3.x} cy={p3.y} r="3" fill="#333" />
        <text x={p3.x - 14} y={p3.y - 6} fontSize="13" fontWeight="600" fill="#333">{p3Label}</text>

        {/* Lines from P3 to P1 and P2 (inscribed angle) */}
        {hasInscribedAngle && (
          <g>
            <line x1={p3.x} y1={p3.y} x2={p1.x} y2={p1.y}
              stroke="#2a9d8f" strokeWidth="1" />
            <line x1={p3.x} y1={p3.y} x2={p2.x} y2={p2.y}
              stroke="#2a9d8f" strokeWidth="1" />
          </g>
        )}

        {/* P1 and P2 points */}
        <circle cx={p1.x} cy={p1.y} r="3" fill="#333" />
        <text x={p1.x + 6} y={p1.y + 4} fontSize="13" fontWeight="600" fill="#333">{p1Label}</text>
        <circle cx={p2.x} cy={p2.y} r="3" fill="#333" />
        <text x={p2.x - 16} y={p2.y + 4} fontSize="13" fontWeight="600" fill="#333">{p2Label}</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

function RightTriangleSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Extract vertex labels
  const labelMatch = d.match(/triangle\s+(?:rectangle\s+)?([a-z])([a-z])([a-z])/i);
  const verts = labelMatch
    ? [labelMatch[1].toUpperCase(), labelMatch[2].toUpperCase(), labelMatch[3].toUpperCase()]
    : ['A', 'B', 'C'];

  // Detect which vertex has the right angle
  const rightAtMatch = d.match(/(?:rectangle|droit|right\s*angle)\s+(?:en|at|in)\s+([a-z])/i);
  const rightAt = rightAtMatch ? rightAtMatch[1].toUpperCase() : verts[2];

  // Assign positions: right-angle vertex at bottom-left corner
  const rightIdx = verts.indexOf(rightAt);
  const others = verts.filter((_, i) => i !== rightIdx);
  const labelBL = rightAt;           // bottom-left = right angle
  const labelBR = others[1] || others[0]; // bottom-right
  const labelTL = others[0] || others[1]; // top-left

  // Check for angle labels
  const hasAlpha = /alpha|α/.test(d);
  const hasBeta = /beta|β/.test(d);

  // Check for midpoints or special points
  const midpointMatches = [...d.matchAll(/point\s+([a-z])\s+(?:est\s+)?(?:le\s+)?milieu/gi)];
  const midpoints = midpointMatches.map(m => m[1].toUpperCase());

  // Coordinates
  const RVx = 40, RVy = 190;   // bottom-left (right angle)
  const BRx = 260, BRy = 190;  // bottom-right
  const TLx = 40, TLy = 40;    // top-left

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 230" className="figure-render__geo-svg">
        {/* Triangle */}
        <polygon
          points={`${RVx},${RVy} ${BRx},${BRy} ${TLx},${TLy}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Right angle mark */}
        <polyline points={`${RVx + 15},${RVy} ${RVx + 15},${RVy - 15} ${RVx},${RVy - 15}`}
          fill="none" stroke="#333" strokeWidth="1" />

        {/* Angle arcs */}
        {hasBeta && (
          <g>
            <path d={`M${BRx - 30},${BRy} A30,30 0 0,1 ${BRx - 18},${BRy - 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={BRx - 38} y={BRy - 12} fontSize="11" fill="#f59e0b">β</text>
          </g>
        )}
        {hasAlpha && (
          <g>
            <path d={`M${TLx},${TLy + 30} A30,30 0 0,0 ${TLx + 20},${TLy + 22}`}
              fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x={TLx + 16} y={TLy + 34} fontSize="11" fill="#f59e0b">α</text>
          </g>
        )}

        {/* Midpoint markers */}
        {midpoints.length >= 1 && (
          <g>
            <circle cx={(RVx + TLx) / 2} cy={(RVy + TLy) / 2} r="3" fill="#457b9d" />
            <text x={(RVx + TLx) / 2 - 16} y={(RVy + TLy) / 2 + 4}
              fontSize="12" fontWeight="600" fill="#457b9d">{midpoints[0]}</text>
          </g>
        )}
        {midpoints.length >= 2 && (
          <g>
            <circle cx={(TLx + BRx) / 2} cy={(TLy + BRy) / 2} r="3" fill="#457b9d" />
            <text x={(TLx + BRx) / 2 + 6} y={(TLy + BRy) / 2 - 4}
              fontSize="12" fontWeight="600" fill="#457b9d">{midpoints[1]}</text>
            <line x1={(RVx + TLx) / 2} y1={(RVy + TLy) / 2}
              x2={(TLx + BRx) / 2} y2={(TLy + BRy) / 2}
              stroke="#457b9d" strokeWidth="1" strokeDasharray="5,3" />
          </g>
        )}

        {/* Vertex labels */}
        <text x={RVx - 5} y={RVy + 18} fontSize="14" fontWeight="600" fill="#333">{labelBL}</text>
        <text x={BRx + 6} y={BRy + 6} fontSize="14" fontWeight="600" fill="#333">{labelBR}</text>
        <text x={TLx - 16} y={TLy - 6} fontSize="14" fontWeight="600" fill="#333">{labelTL}</text>

        {/* Vertex dots */}
        <circle cx={RVx} cy={RVy} r="3" fill="#333" />
        <circle cx={BRx} cy={BRy} r="3" fill="#333" />
        <circle cx={TLx} cy={TLy} r="3" fill="#333" />
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Cube / 3D Shape ────────────────────────────────────────────────────────

function CubeSVG({ description }) {
  const d = (description || '').toLowerCase();

  const isNet = /patron|net.*fold|dépli|cross.*shape/i.test(d);

  // Extract vertex labels (e.g. "cube ABCDEFGH")
  const vertMatch = description.match(/cube\s+(?:nommé\s+)?([A-Z])([A-Z])([A-Z])([A-Z])([A-Z])([A-Z])([A-Z])([A-Z])/i);
  const labels = vertMatch
    ? Array.from({ length: 8 }, (_, i) => vertMatch[i + 1].toUpperCase())
    : ['A','B','C','D','E','F','G','H'];

  if (isNet) {
    // Cross-shaped net of a cube
    const s = 50, ox = 80, oy = 20;
    return (
      <div className="figure-render figure-render--geometry">
        <svg viewBox="0 0 300 280" className="figure-render__geo-svg">
          {/* Top face */}
          <rect x={ox + s} y={oy} width={s} height={s} fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5" />
          {/* Middle row: 4 faces */}
          {[0,1,2,3].map(i => (
            <rect key={i} x={ox + i * s} y={oy + s} width={s} height={s}
              fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5" />
          ))}
          {/* Bottom face */}
          <rect x={ox + s} y={oy + 2 * s} width={s} height={s} fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5" />
          {/* Fold arrows */}
          {[0,1,2,3].map(i => (
            <text key={i} x={ox + s * i + s / 2} y={oy + s + s / 2 + 4} fontSize="16" textAnchor="middle" fill="#999">↻</text>
          ))}
        </svg>
        <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
      </div>
    );
  }

  // 3D cube projection
  const fx = 60, fy = 140, s = 90, dx = 40, dy = -35;
  const pts = [
    {x: fx, y: fy}, {x: fx+s, y: fy}, {x: fx+s, y: fy-s}, {x: fx, y: fy-s},           // front: A B C D
    {x: fx+dx, y: fy+dy}, {x: fx+s+dx, y: fy+dy}, {x: fx+s+dx, y: fy-s+dy}, {x: fx+dx, y: fy-s+dy} // back: E F G H
  ];
  const [A,B,C,D,E,F,G,H] = pts;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 260 190" className="figure-render__geo-svg">
        {/* Hidden edges (dashed) */}
        <line x1={A.x} y1={A.y} x2={E.x} y2={E.y} stroke="#999" strokeWidth="1" strokeDasharray="4,3" />
        <line x1={E.x} y1={E.y} x2={F.x} y2={F.y} stroke="#999" strokeWidth="1" strokeDasharray="4,3" />
        <line x1={E.x} y1={E.y} x2={H.x} y2={H.y} stroke="#999" strokeWidth="1" strokeDasharray="4,3" />
        {/* Front face */}
        <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5" />
        {/* Top face */}
        <polygon points={`${D.x},${D.y} ${C.x},${C.y} ${G.x},${G.y} ${H.x},${H.y}`}
          fill="rgba(69,123,157,0.04)" stroke="#333" strokeWidth="1.5" />
        {/* Right face */}
        <polygon points={`${B.x},${B.y} ${F.x},${F.y} ${G.x},${G.y} ${C.x},${C.y}`}
          fill="rgba(69,123,157,0.06)" stroke="#333" strokeWidth="1.5" />
        {/* Vertex labels */}
        {[[-14,14],[4,14],[6,4],[-14,4],[-14,-4],[6,-4],[6,-6],[-14,-6]].map(([ox,oy], i) => (
          <g key={i}>
            <circle cx={pts[i].x} cy={pts[i].y} r="2.5" fill={i >= 4 && i <= 5 ? "#999" : "#333"} />
            <text x={pts[i].x+ox} y={pts[i].y+oy} fontSize="12" fontWeight="600"
              fill={i >= 4 && i <= 5 ? "#999" : "#333"}>{labels[i]}</text>
          </g>
        ))}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Matrix SVG ─────────────────────────────────────────────────────────────

function MatrixSVG({ description }) {
  const d = description || '';

  // Parse matrix rows from description patterns like "première ligne (3, -2, a)"
  const rowMatches = [...d.matchAll(/(?:première|deuxième|troisième|quatrième|1[èe]re|2[èe]me|3[èe]me|4[èe]me)\s+ligne\s*(?:est\s*)?\(?([^)]+)\)?/gi)];

  let rows = [];
  if (rowMatches.length > 0) {
    rows = rowMatches.map(m => m[1].split(/[,;]\s*/).map(s => s.trim()));
  } else {
    // Try parenthesized groups: "(a, b) et (8, -8)"
    const parenMatches = [...d.matchAll(/\(([^)]+)\)/g)];
    if (parenMatches.length >= 2) {
      rows = parenMatches.map(m => m[1].split(/[,;]\s*/).map(s => s.trim()));
    }
  }
  if (rows.length === 0) rows = [['a','b'],['c','d']];

  const nRows = rows.length;
  const nCols = Math.max(...rows.map(r => r.length));
  const cellW = 44, cellH = 30;
  const matW = nCols * cellW;
  const matH = nRows * cellH;
  const ox = 60, oy = 20;

  // Extract matrix name
  const nameMatch = d.match(/matrice\s+(?:carrée\s+)?([A-Z])/i);
  const matName = nameMatch ? nameMatch[1] : 'M';

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox={`0 0 ${matW + 140} ${matH + 60}`} className="figure-render__geo-svg">
        {/* Matrix name */}
        <text x={ox - 30} y={oy + matH / 2 + 6} fontSize="16" fontWeight="700" fill="#457b9d" fontStyle="italic">{matName}</text>
        <text x={ox - 10} y={oy + matH / 2 + 6} fontSize="13" fill="#333">=</text>
        {/* Left bracket */}
        <path d={`M${ox + 12},${oy} L${ox + 2},${oy} L${ox + 2},${oy + matH} L${ox + 12},${oy + matH}`}
          fill="none" stroke="#333" strokeWidth="2" />
        {/* Right bracket */}
        <path d={`M${ox + matW + 8},${oy} L${ox + matW + 18},${oy} L${ox + matW + 18},${oy + matH} L${ox + matW + 8},${oy + matH}`}
          fill="none" stroke="#333" strokeWidth="2" />
        {/* Elements */}
        {rows.map((row, ri) =>
          row.map((val, ci) => (
            <text key={`${ri}-${ci}`}
              x={ox + 10 + ci * cellW + cellW / 2}
              y={oy + ri * cellH + cellH / 2 + 6}
              fontSize="14" textAnchor="middle" fill="#333"
              fontStyle={/^[a-z]$/i.test(val) ? 'italic' : 'normal'}>
              {val}
            </text>
          ))
        )}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Parallelogram SVG ──────────────────────────────────────────────────────

function ParallelogramSVG({ description }) {
  const d = (description || '');

  // Extract vertex labels
  const labelMatch = d.match(/parallélogramme\s+([A-Z])([A-Z])([A-Z])([A-Z])/i);
  const [vA, vB, vC, vD] = labelMatch
    ? [labelMatch[1].toUpperCase(), labelMatch[2].toUpperCase(), labelMatch[3].toUpperCase(), labelMatch[4].toUpperCase()]
    : ['A','B','C','D'];

  // Extract side lengths (AB = 6, AD = 4, etc.)
  const sideLabels = {};
  const sideMatches = [...d.matchAll(/([A-Z]{2})\s*=\s*(\d+)/gi)];
  sideMatches.forEach(m => { sideLabels[m[1].toUpperCase()] = m[2]; });

  const A = {x: 50, y: 160}, B = {x: 220, y: 160}, C = {x: 260, y: 50}, D = {x: 90, y: 50};

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 310 200" className="figure-render__geo-svg">
        <polygon points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y} ${D.x},${D.y}`}
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Diagonals (dashed) */}
        <line x1={A.x} y1={A.y} x2={C.x} y2={C.y} stroke="#999" strokeWidth="0.8" strokeDasharray="5,3" />
        <line x1={B.x} y1={B.y} x2={D.x} y2={D.y} stroke="#999" strokeWidth="0.8" strokeDasharray="5,3" />
        {/* Side labels */}
        {sideLabels[vA+vB] && (
          <text x={(A.x+B.x)/2} y={A.y+18} fontSize="11" textAnchor="middle" fill="#457b9d" fontWeight="600">
            {vA+vB} = {sideLabels[vA+vB]}
          </text>
        )}
        {sideLabels[vA+vD] && (
          <text x={(A.x+D.x)/2-20} y={(A.y+D.y)/2} fontSize="11" fill="#457b9d" fontWeight="600">
            {vA+vD} = {sideLabels[vA+vD]}
          </text>
        )}
        {/* Vertex labels and dots */}
        {[[A,-14,6],[B,4,6],[C,4,-4],[D,-14,-4]].map(([p,ox,oy], i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#333" />
            <text x={p.x+ox} y={p.y+oy} fontSize="14" fontWeight="600" fill="#333">
              {[vA,vB,vC,vD][i]}
            </text>
          </g>
        ))}
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Tree Height Surveying SVG ──────────────────────────────────────────────

function TreeHeightSVG({ description }) {
  const ground = 180;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 220" className="figure-render__geo-svg">
        {/* Ground line */}
        <line x1={20} y1={ground} x2={280} y2={ground} stroke="#999" strokeWidth="1" />

        {/* Tree AB */}
        <line x1={40} y1={ground} x2={40} y2={30} stroke="#2a9d8f" strokeWidth="3" />
        <ellipse cx={40} cy={22} rx="15" ry="12" fill="rgba(42,157,143,0.2)" stroke="#2a9d8f" strokeWidth="1" />
        <text x={26} y={ground+14} fontSize="11" fontWeight="600" fill="#333">A</text>
        <text x={26} y={26} fontSize="11" fontWeight="600" fill="#333">B</text>

        {/* Jalon 1 — CD */}
        <line x1={130} y1={ground} x2={130} y2={110} stroke="#e63946" strokeWidth="2" />
        <text x={126} y={ground+14} fontSize="11" fontWeight="600" fill="#333">C</text>
        <text x={134} y={106} fontSize="11" fontWeight="600" fill="#e63946">D</text>
        <text x={138} y={(ground+110)/2+4} fontSize="10" fill="#e63946" fontStyle="italic">h₁</text>

        {/* Jalon 2 — EF */}
        <line x1={210} y1={ground} x2={210} y2={130} stroke="#457b9d" strokeWidth="2" />
        <text x={206} y={ground+14} fontSize="11" fontWeight="600" fill="#333">E</text>
        <text x={214} y={126} fontSize="11" fontWeight="600" fill="#457b9d">F</text>
        <text x={218} y={(ground+130)/2+4} fontSize="10" fill="#457b9d" fontStyle="italic">h₂</text>

        {/* Sight line B-D-F (collinear alignment) */}
        <line x1={40} y1={30} x2={260} y2={150}
          stroke="#f59e0b" strokeWidth="1" strokeDasharray="6,3" />

        {/* Ground distances */}
        <line x1={40} y1={ground+6} x2={130} y2={ground+6} stroke="#333" strokeWidth="0.8" />
        <text x={85} y={ground+20} fontSize="10" textAnchor="middle" fill="#333" fontStyle="italic">d₂</text>
        <line x1={130} y1={ground+6} x2={210} y2={ground+6} stroke="#333" strokeWidth="0.8" />
        <text x={170} y={ground+20} fontSize="10" textAnchor="middle" fill="#333" fontStyle="italic">d₁</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Magnetic Flux (surface + B field) ──────────────────────────────────────

function MagneticFluxSVG({ description }) {
  const cx = 150, cy = 110;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 220" className="figure-render__geo-svg">
        {/* Surface (tilted parallelogram representing plane area S) */}
        <polygon points="60,160 200,160 240,80 100,80"
          fill="rgba(69,123,157,0.1)" stroke="#333" strokeWidth="1.5" />
        <text x={210} y={172} fontSize="12" fill="#333" fontWeight="600">S</text>

        {/* Center point O */}
        <circle cx={cx} cy={cy} r="2.5" fill="#333" />
        <text x={cx+6} y={cy+14} fontSize="11" fontWeight="600" fill="#333">O</text>

        {/* Normal vector ON (pointing up from surface) */}
        <line x1={cx} y1={cy} x2={cx+8} y2={cy-72} stroke="#457b9d" strokeWidth="1.8" />
        <polygon points={`${cx+8},${cy-72} ${cx+2},${cy-60} ${cx+14},${cy-60}`} fill="#457b9d" />
        <text x={cx+16} y={cy-64} fontSize="12" fontWeight="600" fill="#457b9d">N⃗</text>

        {/* B vector (at angle α from normal) */}
        <line x1={cx} y1={cy} x2={cx+52} y2={cy-56} stroke="#e63946" strokeWidth="1.8" />
        <polygon points={`${cx+52},${cy-56} ${cx+40},${cy-48} ${cx+48},${cy-42}`} fill="#e63946" />
        <text x={cx+56} y={cy-50} fontSize="13" fontWeight="700" fill="#e63946">B⃗</text>

        {/* Angle α arc between N and B */}
        <path d={`M${cx+5},${cy-36} A36,36 0 0,1 ${cx+26},${cy-28}`}
          fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        <text x={cx+20} y={cy-34} fontSize="12" fill="#f59e0b" fontWeight="600">α</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Pedigree (Genetic Family Tree) SVG ─────────────────────────────────────

function PedigreeSVG({ description }) {
  const d = (description || '').toLowerCase();

  // Parse generations from description — count how many generations mentioned
  const genMatches = [...d.matchAll(/génération\s+(i{1,3}v?)/gi)];
  const nGens = genMatches.length > 0 ? Math.max(...genMatches.map(m => m[1].length)) : 3;

  // Detect affected trait
  const hasDaltonism = /daltonisme|daltonien|color\s*blind/i.test(d);
  const traitLabel = hasDaltonism ? 'daltonisme' : 'trait';

  // Standard 3-generation pedigree layout
  // Gen I: 2 couples (4 individuals)
  // Gen II: 4-6 individuals
  // Gen III: 2-4 individuals
  const sz = 14; // symbol size (radius for circle, half-side for square)
  const rowH = 55;
  const cx = 160;

  // Generation I: founding couple
  const genI = [
    { x: cx - 30, y: 30, male: true, affected: false, label: '1' },
    { x: cx + 30, y: 30, male: false, affected: false, label: '2' },
  ];

  // Generation II: children
  const genII = [
    { x: cx - 70, y: 30 + rowH, male: true, affected: true, label: '3' },
    { x: cx - 30, y: 30 + rowH, male: false, affected: false, label: '4' },
    { x: cx + 10, y: 30 + rowH, male: true, affected: false, label: '5' },
    { x: cx + 50, y: 30 + rowH, male: false, affected: false, label: '6' },
    { x: cx + 90, y: 30 + rowH, male: false, affected: false, label: '7' },
  ];

  // Generation III: grandchildren
  const genIII = [
    { x: cx - 30, y: 30 + rowH * 2, male: true, affected: false, label: '8' },
    { x: cx + 10, y: 30 + rowH * 2, male: false, affected: true, label: '9' },
    { x: cx + 70, y: 30 + rowH * 2, male: true, affected: true, label: '10' },
  ];

  const allGens = [genI, genII, genIII];

  function renderIndividual(ind) {
    const fill = ind.affected ? '#999' : 'white';
    const stroke = '#333';
    if (ind.male) {
      return (
        <g key={ind.label}>
          <rect x={ind.x - sz} y={ind.y - sz} width={sz * 2} height={sz * 2}
            fill={fill} stroke={stroke} strokeWidth="1.5" />
          <text x={ind.x} y={ind.y + sz + 14} fontSize="9" textAnchor="middle" fill="#666">{ind.label}</text>
        </g>
      );
    }
    return (
      <g key={ind.label}>
        <circle cx={ind.x} cy={ind.y} r={sz}
          fill={fill} stroke={stroke} strokeWidth="1.5" />
        <text x={ind.x} y={ind.y + sz + 14} fontSize="9" textAnchor="middle" fill="#666">{ind.label}</text>
      </g>
    );
  }

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 320 230" className="figure-render__geo-svg">
        {/* Generation labels */}
        {['I', 'II', 'III'].map((g, i) => (
          <text key={g} x={12} y={34 + i * rowH} fontSize="12" fontWeight="700" fill="#457b9d">{g}</text>
        ))}

        {/* Mating lines Gen I */}
        <line x1={genI[0].x} y1={genI[0].y} x2={genI[1].x} y2={genI[1].y} stroke="#333" strokeWidth="1" />

        {/* Descent line from Gen I couple to Gen II */}
        <line x1={cx} y1={genI[0].y} x2={cx} y2={genI[0].y + 20} stroke="#333" strokeWidth="1" />
        <line x1={genII[0].x} y1={genI[0].y + 20} x2={genII[genII.length-1].x} y2={genI[0].y + 20} stroke="#333" strokeWidth="1" />
        {genII.map(ind => (
          <line key={`d-${ind.label}`} x1={ind.x} y1={genI[0].y + 20} x2={ind.x} y2={ind.y - sz} stroke="#333" strokeWidth="1" />
        ))}

        {/* Mating lines Gen II (couple: 4+5, 6+7 or similar) */}
        <line x1={genII[1].x} y1={genII[1].y} x2={genII[2].x} y2={genII[2].y} stroke="#333" strokeWidth="1" />
        <line x1={genII[3].x} y1={genII[3].y} x2={genII[4].x} y2={genII[4].y} stroke="#333" strokeWidth="1" />

        {/* Descent to Gen III */}
        {genIII.length > 0 && (
          <g>
            <line x1={(genII[1].x+genII[2].x)/2} y1={genII[1].y}
              x2={(genII[1].x+genII[2].x)/2} y2={genII[1].y + 16} stroke="#333" strokeWidth="1" />
            <line x1={genIII[0].x} y1={genII[1].y+16} x2={genIII[1].x} y2={genII[1].y+16} stroke="#333" strokeWidth="1" />
            {genIII.slice(0,2).map(ind => (
              <line key={`d3-${ind.label}`} x1={ind.x} y1={genII[1].y+16} x2={ind.x} y2={ind.y - sz} stroke="#333" strokeWidth="1" />
            ))}
            <line x1={(genII[3].x+genII[4].x)/2} y1={genII[3].y}
              x2={(genII[3].x+genII[4].x)/2} y2={genII[3].y + 16} stroke="#333" strokeWidth="1" />
            <line x1={genIII[2].x} y1={genII[3].y+16} x2={genIII[2].x} y2={genIII[2].y - sz} stroke="#333" strokeWidth="1" />
          </g>
        )}

        {/* Render all individuals */}
        {allGens.flat().map(renderIndividual)}

        {/* Legend */}
        <rect x={230} y={10} width={12} height={12} fill="white" stroke="#333" strokeWidth="1" />
        <text x={248} y={20} fontSize="9" fill="#333">♂ sain</text>
        <circle cx={236} cy={34} r={6} fill="white" stroke="#333" strokeWidth="1" />
        <text x={248} y={37} fontSize="9" fill="#333">♀ saine</text>
        <rect x={230} y={46} width={12} height={12} fill="#999" stroke="#333" strokeWidth="1" />
        <text x={248} y={56} fontSize="9" fill="#333">affecté(e)</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Venn Diagram SVG ───────────────────────────────────────────────────────

function VennSVG({ description }) {
  const d = description || '';

  // Try to extract circle labels from description
  const circleMatches = [...d.matchAll(/cercle\s+(?:contient|avec)\s+'([^']+)'/gi)];
  const labels = circleMatches.length >= 2
    ? circleMatches.map(m => m[1])
    : ['A', 'B', 'C'];

  // Extract title
  const titleMatch = d.match(/intitulé\s+'([^']+)'/i) || d.match(/titre\s+'([^']+)'/i);
  const title = titleMatch ? titleMatch[1] : '';

  const cx = 150, cy = 120, r = 55, spread = 35;
  const circles = [
    { x: cx - spread, y: cy - spread * 0.4, color: 'rgba(230,57,70,0.15)', stroke: '#e63946' },
    { x: cx + spread, y: cy - spread * 0.4, color: 'rgba(69,123,157,0.15)', stroke: '#457b9d' },
    { x: cx, y: cy + spread * 0.6, color: 'rgba(42,157,143,0.15)', stroke: '#2a9d8f' },
  ];

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 240" className="figure-render__geo-svg">
        {/* Title */}
        {title && (
          <text x={cx} y={18} fontSize="12" fontWeight="700" textAnchor="middle" fill="#333">{title}</text>
        )}
        {/* Circles */}
        {circles.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={r} fill={c.color} stroke={c.stroke} strokeWidth="1.5" />
            {/* Label outside circle */}
            <text
              x={i === 0 ? c.x - r - 4 : i === 1 ? c.x + r + 4 : c.x}
              y={i === 2 ? c.y + r + 14 : c.y - r - 4}
              fontSize="10" fontWeight="600" fill={c.stroke}
              textAnchor={i === 0 ? 'end' : i === 1 ? 'start' : 'middle'}>
              {labels[i] ? labels[i].substring(0, 20) : ''}
            </text>
          </g>
        ))}
        {/* Center intersection indicator */}
        <circle cx={cx} cy={cy} r="3" fill="#333" opacity="0.3" />
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

// ─── Diagram Sub-Router ─────────────────────────────────────────────────────

function DiagramFigure({ description }) {
  const d = (description || '').toLowerCase();

  const isSolenoid = /solénoïde|électro-?aimant|bobine.*noyau|noyau.*fer.*spire|spire.*noyau/i.test(d);
  const isFresnel = /fresnel|vecteurs?\s+tournants?/i.test(d);
  const isMagnet = /aimant(?!.*électro)|boussole|pôle\s+(nord|sud)|champ\s+magnétique\s+terrestre/i.test(d);
  const isRail = /barres?\s+parallèles?.*tige|tige.*barres?\s+parallèles?|rails?.*conductrice/i.test(d);

  if (isSolenoid) return <SolenoidSVG description={description} />;
  if (isFresnel) return <FresnelSVG description={description} />;
  if (isMagnet || isRail) return <MagnetSVG description={description} />;

  return <DescriptionCard description={description} icon="📊" label="Schéma" />;
}

// ─── Solenoid / Electromagnet SVG ───────────────────────────────────────────

function SolenoidSVG({ description }) {
  const d = (description || '').toLowerCase();
  const hasNails = /clou|nail|attir/i.test(d);
  const hasCore = /noyau|core|fer\s+doux/i.test(d);

  // Solenoid body dimensions
  const bodyX = 60, bodyY = 50, bodyW = 180, bodyH = 80;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 200" className="figure-render__geo-svg">
        {/* Solenoid body */}
        <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="4"
          fill="rgba(69,123,157,0.06)" stroke="#333" strokeWidth="1.5" />

        {/* Iron core (if present) */}
        {hasCore && (
          <rect x={bodyX+10} y={bodyY+20} width={bodyW-20} height={bodyH-40} rx="2"
            fill="rgba(153,153,153,0.15)" stroke="#999" strokeWidth="1" />
        )}

        {/* Coil windings (arcs on top) */}
        {Array.from({length: 7}, (_, i) => {
          const x = bodyX + 14 + i * 24;
          return (
            <path key={i}
              d={`M${x},${bodyY+bodyH} Q${x+6},${bodyY+bodyH+8} ${x+12},${bodyY+bodyH} M${x},${bodyY} Q${x+6},${bodyY-8} ${x+12},${bodyY}`}
              fill="none" stroke="#457b9d" strokeWidth="1.5" />
          );
        })}

        {/* Wire connections */}
        <line x1={bodyX} y1={bodyY+bodyH} x2={bodyX-20} y2={bodyY+bodyH} stroke="#e63946" strokeWidth="1.5" />
        <line x1={bodyX-20} y1={bodyY+bodyH} x2={bodyX-20} y2={bodyY+bodyH+20} stroke="#e63946" strokeWidth="1.5" />
        <line x1={bodyX+bodyW} y1={bodyY+bodyH} x2={bodyX+bodyW+20} y2={bodyY+bodyH} stroke="#e63946" strokeWidth="1.5" />
        <line x1={bodyX+bodyW+20} y1={bodyY+bodyH} x2={bodyX+bodyW+20} y2={bodyY+bodyH+20} stroke="#e63946" strokeWidth="1.5" />

        {/* Current direction */}
        <polygon points={`${bodyX-12},${bodyY+bodyH} ${bodyX-4},${bodyY+bodyH-3} ${bodyX-4},${bodyY+bodyH+3}`} fill="#e63946" />
        <text x={bodyX-24} y={bodyY+bodyH+36} fontSize="11" fill="#e63946" fontWeight="600">I</text>

        {/* Magnetic field lines inside (B vector) */}
        <line x1={bodyX+20} y1={bodyY+bodyH/2} x2={bodyX+bodyW-20} y2={bodyY+bodyH/2}
          stroke="#2a9d8f" strokeWidth="1.2" strokeDasharray="6,3" />
        <polygon points={`${bodyX+bodyW-20},${bodyY+bodyH/2} ${bodyX+bodyW-28},${bodyY+bodyH/2-4} ${bodyX+bodyW-28},${bodyY+bodyH/2+4}`}
          fill="#2a9d8f" />
        <text x={bodyX+bodyW/2-8} y={bodyY+bodyH/2-8} fontSize="11" fill="#2a9d8f" fontWeight="600">B⃗</text>

        {/* N and S pole labels */}
        <text x={bodyX+bodyW+4} y={bodyY+20} fontSize="14" fontWeight="700" fill="#e63946">N</text>
        <text x={bodyX-14} y={bodyY+20} fontSize="14" fontWeight="700" fill="#457b9d">S</text>

        {/* Nails attracted (if mentioned) */}
        {hasNails && (
          <g>
            {[0,1,2].map(i => (
              <g key={i}>
                <line x1={bodyX+bodyW+8+i*7} y1={bodyY+bodyH/2+10+i*10}
                  x2={bodyX+bodyW+14+i*7} y2={bodyY+bodyH/2-2+i*10}
                  stroke="#333" strokeWidth="1.5" strokeLinecap="round" />
              </g>
            ))}
            <text x={bodyX+bodyW+6} y={bodyY+bodyH+14} fontSize="9" fill="#666">clous</text>
          </g>
        )}

        <text x={bodyX+bodyW/2} y={bodyY+bodyH+36} fontSize="10" textAnchor="middle" fill="#666" fontStyle="italic">solénoïde</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Fresnel Phasor Diagram ─────────────────────────────────────────────────

function FresnelSVG({ description }) {
  const d = (description || '').toLowerCase();
  const cx = 150, cy = 110, radius = 70;

  // Detect which components are in the circuit
  const hasR = /résist|u_r|ohmique/i.test(d);
  const hasL = /induct|bobine|self|u_l/i.test(d);
  const hasC = /condensat|capacit|u_c/i.test(d);
  const isResonance = /résonance/i.test(d);

  // Phase angle φ for the total voltage
  const phi = isResonance ? 0 : (hasL && hasC) ? Math.PI / 6 : hasL ? Math.PI / 3 : hasC ? -Math.PI / 4 : 0;

  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 300 220" className="figure-render__geo-svg">
        {/* Reference circle */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />
        {/* Axes */}
        <line x1={cx-radius-15} y1={cy} x2={cx+radius+15} y2={cy} stroke="#999" strokeWidth="0.5" />
        <line x1={cx} y1={cy+radius+15} x2={cx} y2={cy-radius-15} stroke="#999" strokeWidth="0.5" />

        {/* Origin */}
        <circle cx={cx} cy={cy} r="2" fill="#333" />
        <text x={cx-12} y={cy+14} fontSize="10" fill="#333">O</text>

        {/* Current vector I (along +x) */}
        <line x1={cx} y1={cy} x2={cx+radius*0.75} y2={cy} stroke="#333" strokeWidth="2" />
        <polygon points={`${cx+radius*0.75},${cy} ${cx+radius*0.75-8},${cy-4} ${cx+radius*0.75-8},${cy+4}`} fill="#333" />
        <text x={cx+radius*0.75+6} y={cy+5} fontSize="12" fontWeight="700" fill="#333">I⃗</text>

        {/* U_R vector (in phase with I) */}
        {hasR && (
          <g>
            <line x1={cx} y1={cy} x2={cx+radius*0.55} y2={cy} stroke="#2a9d8f" strokeWidth="1.5" />
            <polygon points={`${cx+radius*0.55},${cy} ${cx+radius*0.55-7},${cy-3} ${cx+radius*0.55-7},${cy+3}`} fill="#2a9d8f" />
            <text x={cx+radius*0.55-12} y={cy+16} fontSize="10" fontWeight="600" fill="#2a9d8f">U⃗ᵣ</text>
          </g>
        )}

        {/* U_L vector (leads I by π/2, pointing up) */}
        {hasL && (
          <g>
            <line x1={cx} y1={cy} x2={cx} y2={cy-radius*0.65} stroke="#e63946" strokeWidth="1.5" />
            <polygon points={`${cx},${cy-radius*0.65} ${cx-3},${cy-radius*0.65+7} ${cx+3},${cy-radius*0.65+7}`} fill="#e63946" />
            <text x={cx+6} y={cy-radius*0.65+4} fontSize="10" fontWeight="600" fill="#e63946">U⃗ₗ</text>
          </g>
        )}

        {/* U_C vector (lags I by π/2, pointing down) */}
        {hasC && (
          <g>
            <line x1={cx} y1={cy} x2={cx} y2={cy+radius*0.5} stroke="#457b9d" strokeWidth="1.5" />
            <polygon points={`${cx},${cy+radius*0.5} ${cx-3},${cy+radius*0.5-7} ${cx+3},${cy+radius*0.5-7}`} fill="#457b9d" />
            <text x={cx+6} y={cy+radius*0.5+4} fontSize="10" fontWeight="600" fill="#457b9d">U⃗꜀</text>
          </g>
        )}

        {/* Total voltage U (at angle φ) */}
        {(() => {
          const uLen = radius * 0.85;
          const ux = cx + uLen * Math.cos(phi);
          const uy = cy - uLen * Math.sin(phi);
          return (
            <g>
              <line x1={cx} y1={cy} x2={ux} y2={uy} stroke="#f59e0b" strokeWidth="2" />
              <polygon points={`${ux},${uy} ${ux-8*Math.cos(phi)+4*Math.sin(phi)},${uy+8*Math.sin(phi)+4*Math.cos(phi)} ${ux-8*Math.cos(phi)-4*Math.sin(phi)},${uy+8*Math.sin(phi)-4*Math.cos(phi)}`}
                fill="#f59e0b" />
              <text x={ux+6} y={uy-6} fontSize="12" fontWeight="700" fill="#f59e0b">U⃗</text>
              {/* Phase angle arc */}
              {Math.abs(phi) > 0.01 && (
                <g>
                  <path d={`M${cx+28},${cy} A28,28 0 0,${phi > 0 ? 0 : 1} ${cx+28*Math.cos(phi)},${cy-28*Math.sin(phi)}`}
                    fill="none" stroke="#f59e0b" strokeWidth="1.2" />
                  <text x={cx+32} y={cy + (phi > 0 ? -6 : 14)} fontSize="10" fill="#f59e0b" fontWeight="600">φ</text>
                </g>
              )}
            </g>
          );
        })()}

        {/* Label */}
        <text x={cx} y={cy+radius+28} fontSize="10" textAnchor="middle" fill="#666" fontStyle="italic">Diagramme de Fresnel</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Magnet / Rail SVG ──────────────────────────────────────────────────────

function MagnetSVG({ description }) {
  const d = (description || '').toLowerCase();
  const isUMagnet = /aimant\s+en\s+u|fer\s+à\s+cheval|entrefer/i.test(d);
  const isCompass = /boussole|compass|champ.*terrestre|composante/i.test(d);
  const isRail = /barres?\s+parallèles?|rails?|tige\s+conductrice/i.test(d);

  if (isRail) {
    return (
      <div className="figure-render figure-render--geometry">
        <svg viewBox="0 0 300 200" className="figure-render__geo-svg">
          {/* Two parallel rails */}
          <line x1={40} y1={50} x2={260} y2={50} stroke="#333" strokeWidth="2.5" />
          <line x1={40} y1={140} x2={260} y2={140} stroke="#333" strokeWidth="2.5" />
          <text x={268} y={54} fontSize="11" fontWeight="600" fill="#333">M</text>
          <text x={268} y={144} fontSize="11" fontWeight="600" fill="#333">N</text>
          {/* Conducting rod */}
          <line x1={150} y1={46} x2={150} y2={144} stroke="#e63946" strokeWidth="3" />
          {/* B field (dots = out of page) */}
          {[0,1,2].map(i => (
            <g key={i}>
              <circle cx={80+i*60} cy={95} r="8" fill="none" stroke="#457b9d" strokeWidth="1" />
              <circle cx={80+i*60} cy={95} r="2" fill="#457b9d" />
            </g>
          ))}
          <text x={72} y={120} fontSize="10" fill="#457b9d" fontWeight="600">B⃗ ⊙</text>
          {/* Velocity arrow */}
          <line x1={155} y1={162} x2={205} y2={162} stroke="#2a9d8f" strokeWidth="1.5" />
          <polygon points="205,162 197,158 197,166" fill="#2a9d8f" />
          <text x={175} y={178} fontSize="10" fill="#2a9d8f" fontWeight="600">v⃗</text>
        </svg>
        <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
      </div>
    );
  }

  if (isCompass) {
    return (
      <div className="figure-render figure-render--geometry">
        <svg viewBox="0 0 260 220" className="figure-render__geo-svg">
          {/* Compass circle */}
          <circle cx={130} cy={100} r={60} fill="rgba(69,123,157,0.06)" stroke="#333" strokeWidth="1.5" />
          {/* N needle */}
          <line x1={130} y1={100} x2={130} y2={50} stroke="#e63946" strokeWidth="2" />
          <polygon points="130,50 126,62 134,62" fill="#e63946" />
          <text x={134} y={46} fontSize="11" fontWeight="700" fill="#e63946">N</text>
          {/* S needle */}
          <line x1={130} y1={100} x2={130} y2={150} stroke="#457b9d" strokeWidth="2" />
          <polygon points="130,150 126,138 134,138" fill="#457b9d" />
          <text x={134} y={158} fontSize="11" fontWeight="700" fill="#457b9d">S</text>
          {/* Horizontal component Bh */}
          <line x1={130} y1={100} x2={195} y2={100} stroke="#2a9d8f" strokeWidth="1.5" strokeDasharray="5,3" />
          <polygon points="195,100 187,96 187,104" fill="#2a9d8f" />
          <text x={198} y={104} fontSize="10" fill="#2a9d8f" fontWeight="600">Bₕ</text>
          {/* Vertical component Bv */}
          <line x1={130} y1={100} x2={130} y2={175} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,3" />
          <polygon points="130,175 126,167 134,167" fill="#f59e0b" />
          <text x={136} y={178} fontSize="10" fill="#f59e0b" fontWeight="600">Bᵥ</text>
          {/* Center */}
          <circle cx={130} cy={100} r="3" fill="#333" />
        </svg>
        <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
      </div>
    );
  }

  // Default: U-shaped magnet
  return (
    <div className="figure-render figure-render--geometry">
      <svg viewBox="0 0 260 200" className="figure-render__geo-svg">
        {/* U-magnet body */}
        <path d="M60,40 L60,140 Q60,170 90,170 L170,170 Q200,170 200,140 L200,40"
          fill="rgba(69,123,157,0.08)" stroke="#333" strokeWidth="2" />
        {/* Pole faces */}
        <rect x={50} y={28} width={20} height={16} fill="#457b9d" stroke="#333" strokeWidth="1" rx="1" />
        <rect x={190} y={28} width={20} height={16} fill="#e63946" stroke="#333" strokeWidth="1" rx="1" />
        {/* Pole labels */}
        <text x={56} y={22} fontSize="14" fontWeight="700" fill="#457b9d">S</text>
        <text x={196} y={22} fontSize="14" fontWeight="700" fill="#e63946">N</text>
        {/* Point A in gap */}
        <circle cx={130} cy={58} r="3" fill="#f59e0b" />
        <text x={136} y={62} fontSize="12" fontWeight="600" fill="#f59e0b">A</text>
        {/* Field lines */}
        {[0,1,2].map(i => (
          <line key={i} x1={75} y1={38+i*15} x2={185} y2={38+i*15}
            stroke="#2a9d8f" strokeWidth="0.8" strokeDasharray="4,3" />
        ))}
        <polygon points="185,38 179,34 179,42" fill="#2a9d8f" />
        <text x={125} y={80} fontSize="10" fill="#2a9d8f" fontWeight="600">B⃗</text>
      </svg>
      <div className="figure-render__geo-desc"><InlineMath text={description} /></div>
    </div>
  );
}

// ─── Music Notation Figure ──────────────────────────────────────────────────

function MusicFigure({ description }) {
  // Parse the description to extract structured musical info
  const d = (description || '').toLowerCase();

  // Detect key signature
  const clefMatch = d.match(/clé\s+de\s+(sol|fa|ut)|treble\s+clef|bass\s+clef/);
  const clef = clefMatch
    ? /sol|treble/.test(clefMatch[0]) ? '𝄞' : /fa|bass/.test(clefMatch[0]) ? '𝄢' : '𝄡'
    : null;

  // Detect time signature
  const timeMatch = d.match(/(\d+)\/(\d+)\s*(time\s+signature|mesure)|(mesure\s+en\s+)(\d+)\/(\d+)/);
  const timeSig = timeMatch
    ? (timeMatch[1] && timeMatch[2]) ? `${timeMatch[1]}/${timeMatch[2]}` : (timeMatch[5] && timeMatch[6]) ? `${timeMatch[5]}/${timeMatch[6]}` : null
    : null;

  // Detect number of measures
  const measureMatch = d.match(/(\d+)\s*mesures?|(\d+)\s*measures?/);
  const measureCount = measureMatch ? (measureMatch[1] || measureMatch[2]) : null;

  // Detect sharps/flats
  const sharpMatch = d.match(/(\d+)\s*dièses?|(\d+)\s*sharps?/);
  const flatMatch = d.match(/(\d+)\s*bémols?|(\d+)\s*flats?/);
  const sharps = sharpMatch ? (sharpMatch[1] || sharpMatch[2]) : null;
  const flats = flatMatch ? (flatMatch[1] || flatMatch[2]) : null;

  return (
    <div className="figure-render figure-render--music">
      <div className="figure-render__music-header">
        <span className="figure-render__music-icon">🎵</span>
        <span className="figure-render__music-label">Notation musicale</span>
        {clef && <span className="figure-render__music-clef">{clef}</span>}
        {timeSig && <span className="figure-render__music-badge">{timeSig}</span>}
        {measureCount && <span className="figure-render__music-badge">{measureCount} mesures</span>}
        {sharps && <span className="figure-render__music-badge">♯×{sharps}</span>}
        {flats && <span className="figure-render__music-badge">♭×{flats}</span>}
      </div>
      <div className="figure-render__music-staff">
        {/* Decorative 5-line staff */}
        <svg className="figure-render__music-lines" viewBox="0 0 400 60" preserveAspectRatio="none">
          {[12, 18, 24, 30, 36].map(y => (
            <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
          ))}
          {clef && (
            <text x="8" y="32" fontSize="28" fill="currentColor" opacity="0.25">{clef}</text>
          )}
        </svg>
      </div>
      <div className="figure-render__music-desc">
        <InlineMath text={description} />
      </div>
      <div className="figure-render__music-hint">
        <span>📝</span> Cette question fait référence à une partition musicale. Lisez attentivement la description ci-dessus.
      </div>
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
    case FIGURE_TYPES.MUSIC:
      content = <MusicFigure description={description} />;
      break;
    case FIGURE_TYPES.EQUATION:
      content = <EquationFigure description={description} />;
      break;
    case FIGURE_TYPES.IMAGE:
      content = <ImagePlaceholder description={description} />;
      break;
    case FIGURE_TYPES.DIAGRAM:
      content = <DiagramFigure description={description} />;
      break;
    case FIGURE_TYPES.TEXT:
    default:
      content = <DescriptionCard description={description} icon="📋" label="Figure" />;
      break;
  }

  return <div className={wrapCls}>{content}</div>;
}
