// Returns the latest Users CSV from GitHub main branch so Admin sees up-to-date data without redeploy.

const OWNER = 'edlinitiative';
const REPO = 'EdLight-Academy';
const PATH = 'public/data/edlight_users.csv';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  try {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${PATH}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'upstream_fetch_failed', details: text });
    }
    const csv = await resp.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  } catch (e) {
    console.error('users/export error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
};
