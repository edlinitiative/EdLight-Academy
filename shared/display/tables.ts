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
  // eslint-disable-next-line no-useless-escape
  const re = /(?:(?:Premi[eè]re|Deuxi[eè]me|Troisi[eè]me|Quatri[eè]me)\s+ligne\s*)?(?:'([^']+)'|"([^"]+)"|\(([^)]+)\)|([^.;:|\[\]]+?))\s*(?:avec (?:les )?valeurs\s*:?|values\s*:?|:)\s*((?:\[[^\[\]]*[\[\]]|\][^\[\]]*[\[\]]|[^.;\[\]]|\.(?=\d)|;(?=[^;]*[\[\]]))+?)(?=\s*(?:[.;](?:\s+[A-ZÀ-Ý]|\s*$)|$))/gi;
  for (let m = re.exec(inner); m; m = re.exec(inner)) {
    const label = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
      .trim()
      .replace(/^(?:\w+ lignes?, \w+ colonnes?\.\s*)/i, '')
      .replace(/^(?:Premi[eè]re|Deuxi[eè]me|Troisi[eè]me|Quatri[eè]me)\s+ligne\s*/i, '')
      .replace(/^(['"(])(.*)(['")])$/, (w, a, mid, b) => ((a === '(' ? ')' : a) === b ? mid : w))
      .trim();
    // Values split on ", " — except inside an interval "[0 ; 4[" or "]2 ; 5]".
    // eslint-disable-next-line no-useless-escape
    const values = (m[5].match(/[\[\]][^\[\]]*?[\[\]]|(?:[^,;\s]|,(?!\s))+(?:[ \t]+(?:[^,;\s]|,(?!\s))+)*/g) ?? []).map((v) => v.trim()).filter(Boolean);
    if (label && values.length >= 2) rows.push([label, ...values]);
  }
  return rows.length >= 2 ? rows : null;
}

export function hasTable(text: string): boolean {
  const s = String(text ?? '').replace(/\\n(?=\s*\|)/g, '\n');
  return /\[Table:/i.test(s) || /```/.test(s)
    || (/^\s*\|.*\|\s*$/m.test(s) && /^\s*\|?\s*:?-{2,}/m.test(s))
    || /^[^\n|]+\|[^\n]*\n\s*\|?\s*:?-{2,}:?\s*\|/m.test(s)
    || /^[^\n|]*(?:\|[^\n|]*){6,}$/m.test(s) && /\|\s+\|\s*[^|\s]|\|n\|-{2,}/.test(s);
}

/**
 * "[Table: …]" blocks become markdown pipe tables on their own lines. The
 * closing "]" is ambiguous: cells hold intervals ("[0 ; 4[") and notes
 * ("[valeur manquante]"). Every "]" after the opening is a candidate, the
 * farthest one that still parses as a table wins.
 */
function rebuildBracketedTables(src: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const at = src.slice(from).search(/\[Table:/i);
    if (at < 0) return out + src.slice(from);
    const open = from + at;
    const ends: number[] = [];
    for (let i = open + 7; i < Math.min(src.length, open + 2000); i += 1) if (src[i] === ']') ends.push(i);
    let chosen = -1;
    let body = '';
    // "[Table: Montant des impôts et Effectifs]" followed by a real pipe table
    // is only a caption: keep it as a line of text.
    const firstInner = ends.length ? src.slice(open + 7, ends[0]) : '';
    if (ends.length && !/\|/.test(firstInner) && firstInner.length < 140 && !describedTable(firstInner)) {
      out += `${src.slice(from, open)}${firstInner.trim()}\n`;
      from = ends[0] + 1;
      continue;
    }
    for (const end of ends.reverse()) {
      const inner = src.slice(open + 7, end).replace(/\\n/g, '\n').trim();
      if (/^\s*\|/m.test(inner)) { chosen = end; body = `\n${inner}\n`; break; }
      const rows = describedTable(inner);
      if (rows) { chosen = end; body = `\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`; break; }
    }
    if (chosen < 0) {
      // Not a table we can read: keep the words, drop the "[Table:" wrapper.
      const end = ends.length ? ends[0] : src.length;
      out += src.slice(from, open) + src.slice(open + 7, end).replace(/\\n/g, '\n').trim();
      from = Math.min(src.length, end + 1);
      continue;
    }
    out += src.slice(from, open) + body;
    from = chosen + 1;
  }
}

export function splitTables(text: string): TextBlock[] {
  let s = String(text ?? '').replace(/\\n(?=\s*\|)/g, '\n');
  if (!hasTable(s)) return [{ kind: 'text', text: s }];
  // Bracketed tables become plain markdown tables on their own lines; one
  // described in words is rebuilt as pipes first.
  // Line breaks lost to a bad escape ("suivant:n| x | 0 |n|---|---|n| y | …"):
  // an "n" glued between pipes in a line that is clearly a table.
  s = s.split('\n').map((line) => ((line.match(/\|/g) ?? []).length >= 6 && /\|n\|/.test(line) && /\|n\|-{2,}/.test(line)
    ? line.replace(/(?<=\|)n(?=\|)/g, '\n').replace(/:n(?=\|)/, ':\n')
    : line)).join('\n');
  s = rebuildBracketedTables(s);
  // A table written on one line inside a sentence, rows joined by "| |":
  // "… le tableau suivant : | $x_i$ | 10 | 11 | | $y_i$ | 5 | 6 | Le point …".
  s = s.split('\n').map((line) => {
    if (/^\s*\|/.test(line) || (line.match(/\|/g) ?? []).length < 6 || !/\|\s+\|/.test(line)) return line;
    const first = line.indexOf('|');
    const last = line.lastIndexOf('|');
    const rows = line.slice(first, last + 1).split(/\|\s+\|(?=\s*[^|\s])/).map((r) => `| ${r.replace(/^\s*\|?|\|?\s*$/g, '').trim()} |`);
    return `${line.slice(0, first).trimEnd()}\n${rows.join('\n')}\n${line.slice(last + 1).trim()}`;
  }).join('\n');
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
    // eslint-disable-next-line no-control-regex
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
      // Two tables back to back ("| Montant | … |" + rule, rows, then another
      // header + rule): stop before the second header.
      for (let k = i + 2; k < j - 1; k += 1) if (!RULE.test(lines[k]) && RULE.test(lines[k + 1])) { j = k; break; }
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
