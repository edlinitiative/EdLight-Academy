/**
 * Tables inside exam text. 78 exams carry them in two shapes, and no screen
 * drew either: students read raw pipes and dashes.
 *
 *   Markdown:   "| Prix | Quantité |\n|---|---|\n| 30$ | 5 |"
 *   Bracketed:  "[Table: \n| $x_i$ | 1 | 2 |\n|---|---|---|\n| p | a | b |\n]"
 *               (the "\n" there is often a literal backslash-n)
 *
 * `splitTables` cuts a text into prose and table blocks; a table is rows of
 * cell strings (still raw: each cell is rendered like any other exam text).
 */
export type TextBlock =
  | { kind: 'text'; text: string }
  | { kind: 'table'; header: string[] | null; rows: string[][] }
  | { kind: 'code'; text: string };

const ROW = /^\s*\|.*\|\s*$/;
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/** Rows of a pipe table; null when the lines are not one. */
function parseRows(lines: string[]): { header: string[] | null; rows: string[][] } | null {
  const body = lines.filter((l) => l.trim());
  if (body.length < 2 || !body.every((l) => ROW.test(l) || RULE.test(l))) return null;
  const ruleAt = body.findIndex((l) => RULE.test(l));
  const rows = body.filter((l) => !RULE.test(l)).map(cells);
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  if (ruleAt === 1) return { header: pad(rows[0]), rows: rows.slice(1).map(pad) };
  return { header: null, rows: rows.map(pad) };
}

/**
 * A table written out in words, as the catalog's OCR described some of them:
 *   "Première ligne $x_i$ avec valeurs -5, 0, 5, 10. Deuxième ligne $p(x_i)$ avec valeurs a, 0,3, b"
 *   "Notes | Effectifs. Notes: 3, 5, 6. Effectifs: 6, 4, 13"
 *   "x_i values: 8, 10, 12; y_i values: 4, 5, 7"
 * One row per labelled list; null unless at least two rows come out.
 */
export function describedTable(inner: string): string[][] | null {
  const rows: string[][] = [];
  const re = /(?:(?:Premi[eè]re|Deuxi[eè]me|Troisi[eè]me|Quatri[eè]me)\s+ligne\s*)?(?:'([^']+)'|"([^"]+)"|\(([^)]+)\)|([^.;:|\[\]]+?))\s*(?:avec (?:les )?valeurs\s*:?|values\s*:?|:)\s*((?:\[[^\[\]]*[\[\]]|\][^\[\]]*[\[\]]|[^.;\[\]]|\.(?=\d)|;(?=[^;]*[\[\]]))+?)(?=\s*(?:[.;](?:\s+[A-ZÀ-Ý]|\s*$)|$))/gi;
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    const label = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
      .trim()
      .replace(/^(?:\w+ lignes?, \w+ colonnes?\.\s*)/i, '')
      .replace(/^(?:Premi[eè]re|Deuxi[eè]me|Troisi[eè]me|Quatri[eè]me)\s+ligne\s*/i, '')
      .replace(/^(['"(])(.*)(['")])$/, (w, a, mid, b) => ((a === '(' ? ')' : a) === b ? mid : w))
      .trim();
    // Values split on ", " — except inside an interval "[0 ; 4[" or "]2 ; 5]".
    const values = (m[5].match(/[\[\]][^\[\]]*?[\[\]]|(?:[^,;\s]|,(?!\s))+(?:[ \t]+(?:[^,;\s]|,(?!\s))+)*/g) ?? []).map((v) => v.trim()).filter(Boolean);
    if (label && values.length >= 2) rows.push([label, ...values]);
  }
  return rows.length >= 2 ? rows : null;
}

export function hasTable(text: string): boolean {
  const s = String(text ?? '');
  return /\[Table:/i.test(s) || /```/.test(s)
    || (/^\s*\|.*\|\s*$/m.test(s) && /^\s*\|?\s*:?-{2,}/m.test(s))
    || /^[^\n|]+\|[^\n]*\n\s*\|?\s*:?-{2,}:?\s*\|/m.test(s);
}

export function splitTables(text: string): TextBlock[] {
  let s = String(text ?? '');
  if (!hasTable(s)) return [{ kind: 'text', text: s }];
  // Bracketed tables become plain markdown tables on their own lines; one
  // described in words is rebuilt as pipes first.
  s = s.replace(/\[Table:\s*([\s\S]*?)\s*\](?=\s*(?:[.,;:!?]|\n|$|[A-ZÀ-Ý]|(?:et|puis|Trouve|Calcule)\b))/gi, (whole, inner: string) => {
    const unescaped = inner.replace(/\\n/g, '\n').trim();
    if (/^\s*\|/m.test(unescaped)) return `\n${unescaped}\n`;
    const rows = describedTable(unescaped);
    return rows ? `\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n` : unescaped;
  });
  // A fenced block (a structural formula drawn in characters) is kept as is,
  // in a monospaced box.
  const fences: string[] = [];
  s = s.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_, body: string) => { fences.push(body.replace(/\s+$/, '')); return `\n\u0000${fences.length - 1}\u0000\n`; });
  const out: TextBlock[] = [];
  const lines = s.split('\n');
  let prose: string[] = [];
  const flush = () => {
    let t = prose.join('\n').replace(/^\n+|\n+$/g, '');
    // Text that resumes after a table drops what the sentence left behind
    // ("]. a) Combien…" → "a) Combien…").
    if (out.length && out[out.length - 1].kind !== 'text') t = t.replace(/^[\s.,;:]+/, '');
    if (t.trim()) out.push({ kind: 'text', text: t });
    prose = [];
  };
  for (let i = 0; i < lines.length;) {
    const fence = /^\u0000(\d+)\u0000$/.exec(lines[i]);
    if (fence) {
      flush();
      out.push({ kind: 'code', text: fences[Number(fence[1])] });
      i += 1;
      continue;
    }
    // A table may drop its outer pipes: "Zeus | Poseidon" over "-----|-----".
    if (!ROW.test(lines[i]) && /\|/.test(lines[i]) && RULE.test(lines[i + 1] ?? '') && /\|/.test(lines[i + 1] ?? '')) {
      let j = i;
      while (j < lines.length && /\|/.test(lines[j])) j += 1;
      const table = parseRows(lines.slice(i, j).map((l) => (RULE.test(l) ? l : `|${l.trim().replace(/^\||\|$/g, '')}|`)));
      if (table) {
        flush();
        out.push({ kind: 'table', ...table });
        i = j;
        continue;
      }
    }
    if (ROW.test(lines[i])) {
      let j = i;
      while (j < lines.length && (ROW.test(lines[j]) || RULE.test(lines[j]))) j += 1;
      const table = parseRows(lines.slice(i, j));
      if (table) {
        flush();
        out.push({ kind: 'table', ...table });
        i = j;
        continue;
      }
    }
    prose.push(lines[i]);
    i += 1;
  }
  flush();
  return out.length ? out : [{ kind: 'text', text: s }];
}
