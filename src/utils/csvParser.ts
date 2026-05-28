/**
 * Parse CSV text into an array of objects using header row as keys
 * @param {string} text - Raw CSV text
 * @returns {Object[]} Array of objects with header row values as keys
 */
export function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  
  while (i <= text.length) {
    const c = text[i] || '\n';
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { 
          field += '"'; 
          i++; 
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (field.length || row.length) {
          row.push(field);
          rows.push(row.map(s => s.trim()));
        }
        field = '';
        row = [];
        if (c === '\r' && text[i+1] === '\n') i++;
      } else {
        field += c;
      }
    }
    i++;
  }

  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h,idx) => [h, r[idx] ?? ''])));
}

/**
 * Load and parse a CSV file
 * @param {string} url - URL to CSV file
 * @returns {Promise<Object[]>} Parsed CSV data
 */
export async function loadCSV(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    const text = await res.text();
    return parseCSV(text);
  } catch (err) {
    console.error(`Error loading CSV from ${url}:`, err);
    throw err;
  }
}

/**
 * Group array items by a key
 * @param {Object[]} arr - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} Grouped object
 */
export const groupBy = (arr, key) => 
  arr.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});