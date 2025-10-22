/**
 * Convert an array of objects to CSV text with a fixed column order.
 * - Values are quoted if they contain comma, quote, or newline.
 * - Quotes inside values are doubled per RFC4180.
 * @param {Object[]} rows
 * @param {string[]} columns
 */
export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = columns.join(',');
  const body = (rows || []).map((r) => columns.map((c) => esc(r[c])).join(',')).join('\n');
  return header + '\n' + body + (body ? '\n' : '');
}

/**
 * Normalize keys: trim, lowercase, replace spaces/dashes with underscores
 * @param {string} k
 */
export function normKey(k) {
  return String(k || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

/**
 * Map input object keys to a target column set using normalization
 * @param {Object} row
 * @param {string[]} columns
 */
export function remapRow(row, columns) {
  const map = new Map(Object.keys(row).map((k) => [normKey(k), k]));
  const out = {};
  for (const col of columns) {
    const nk = normKey(col);
    const src = map.get(nk);
    out[col] = src != null ? row[src] : '';
  }
  return out;
}
