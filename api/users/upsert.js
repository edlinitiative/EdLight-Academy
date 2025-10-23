// Upserts a user into public/data/edlight_users.csv by committing to GitHub using a token.
// Requires env GITHUB_TOKEN with repo scope.

const OWNER = 'edlinitiative';
const REPO = 'EdLight-Academy';
const PATH = 'public/data/edlight_users.csv';

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i <= text.length) {
    const c = text[i] || '\n';
    if (inQuotes) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else {
      if (c === '"') inQuotes = true; else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') { if (field.length || row.length) { row.push(field); rows.push(row.map(s=>s.trim())); } field=''; row=[]; if (c==='\r' && text[i+1]==='\n') i++; }
      else { field += c; }
    }
    i++;
  }
  if (!rows.length) return { header: [], data: [] };
  const [header, ...data] = rows;
  return { header, data: data.map(r => Object.fromEntries(header.map((h,idx)=>[h, r[idx] ?? '']))) };
}

function toCSV(rows, columns) {
  const esc = (v='') => {
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const header = columns.join(',');
  const lines = rows.map(r => columns.map(c => esc(r[c] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(501).json({ error: 'not_configured', message: 'Missing GITHUB_TOKEN env var on server. Add a repo-scoped token to enable user auto-population.' });
    }

    const bodyText = await new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => data += chunk);
      req.on('end', () => resolve(data));
    });
    const body = bodyText ? JSON.parse(bodyText) : {};
    const now = new Date().toISOString();
    const { name = 'Student', email = '', sub = '', picture = '' } = body || {};
    if (!email && !sub) return res.status(400).json({ error: 'invalid_request', message: 'Missing email or sub' });
    const user_id = sub ? `g_${sub}` : `email:${String(email).toLowerCase()}`;

    // Fetch the current file metadata to get sha
    const metaUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
    const metaResp = await fetch(metaUrl, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' }});
    if (!metaResp.ok) {
      const t = await metaResp.text();
      return res.status(metaResp.status).json({ error: 'github_meta_failed', details: t });
    }
    const meta = await metaResp.json();
    const sha = meta.sha;
    const contentBuf = Buffer.from(meta.content, 'base64');
    const currentCSV = contentBuf.toString('utf8');

    // Parse, upsert
    const columns = ['user_id','name','email','role','enrolled_courses','created_at','last_seen'];
    let { header, data } = parseCSV(currentCSV);
    if (!header || header.length === 0) header = columns;
    const byId = new Map();
    data.forEach(r => byId.set(r.user_id || r.email || '', r));
    const existing = byId.get(user_id) || Array.from(byId.values()).find(r => (r.email || '').toLowerCase() === String(email).toLowerCase());
    if (existing) {
      existing.name = name || existing.name || 'Student';
      existing.email = email || existing.email || '';
      existing.last_seen = now;
    } else {
      data.push({ user_id, name, email, role: 'student', enrolled_courses: '', created_at: now, last_seen: now });
    }

    const updatedCSV = toCSV(data, columns);

    // Commit back to GitHub
    const putResp = await fetch(metaUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Users: upsert ${email || user_id}`,
        content: Buffer.from(updatedCSV, 'utf8').toString('base64'),
        sha,
        branch: 'main'
      })
    });

    const putText = await putResp.text();
    if (!putResp.ok) {
      let details = putText; try { details = JSON.parse(putText); } catch {}
      return res.status(putResp.status).json({ error: 'github_commit_failed', details });
    }

    return res.status(200).json({ ok: true, user_id });
  } catch (e) {
    console.error('users/upsert error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
};
