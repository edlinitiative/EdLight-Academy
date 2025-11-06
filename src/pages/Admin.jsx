import React, { useMemo, useState } from 'react';
import { loadCSV } from '../utils/csvParser';
import { toCSV, remapRow } from '../utils/csvStringify';
import { updateVideo, updateQuiz, deleteVideo, deleteQuiz } from '../services/firebase';

// Expected column orders
const VIDEO_COLUMNS = [
  'id','subject_code','unit_no','unit_title','lesson_no','video_title','learning_objectives','language','duration_min','video_url','thumbnail_url','tags'
];

const QUIZ_COLUMNS = [
  'quiz_id','video_id','question','option_a','option_b','option_c','option_d','correct_option','explanation'
];

const USER_COLUMNS = [
  'user_id','name','email','role','enrolled_courses','created_at','last_seen'
];

// Lazy import xlsx to avoid heavy bundle cost until admin uses it
let XLSXPromise;
function getXLSX() {
  if (!XLSXPromise) {
    XLSXPromise = import('xlsx');
  }
  return XLSXPromise;
}

function FilePicker({ onData, columns, label }) {
  const [error, setError] = useState('');

  async function handleFiles(files) {
    setError('');
    const file = files?.[0];
    if (!file) return;
    try {
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        // Simple CSV parse: split lines by header and commas respecting quotes handled by our csv parser already used by dataService
        const rows = await loadCSVFromText(text);
        const mapped = rows.map((r) => remapRow(r, columns));
        onData(mapped, { sourceName: file.name, type: 'csv' });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const arr = new Uint8Array(await file.arrayBuffer());
        const XLSX = (await getXLSX()).default || (await getXLSX());
        const wb = XLSX.read(arr, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const mapped = json.map((r) => remapRow(r, columns));
        onData(mapped, { sourceName: file.name, type: 'xlsx' });
      } else {
        setError('Unsupported file type. Please upload a .csv or .xlsx file.');
      }
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to parse file');
    }
  }

  // Reuse existing parseCSV via loadCSV(text) would fetch; create a local variant:
  async function loadCSVFromText(text) {
    // We don't export a direct parser with header argument, but we have parseCSV in csvParser.js; dynamic import it
    const mod = await import('../utils/csvParser');
    return mod.parseCSV(text);
  }

  return (
    <div>
      <label className="button button--secondary button--pill" style={{ cursor: 'pointer' }}>
        {label}
        <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {error && <div className="form-message form-message--error" style={{ marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}

function DataTable({ rows, columns, onEdit }) {
  if (!rows?.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e5e7eb' }}>{c}</th>
            ))}
            <th style={{ padding: '8px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              {columns.map((c) => (
                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[c]}</td>
              ))}
              <td style={{ padding: '8px' }}>
                <button className="button button--ghost button--pill" onClick={() => onEdit(idx)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditForm({ row, columns, onSave, onCancel }) {
  const [form, setForm] = useState(row || {});
  return (
    <div className="card" style={{ padding: '1rem', marginTop: '0.75rem' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {columns.map((c) => (
          <div key={c} className="form-field">
            <label className="form-label">{c}</label>
            <input className="form-input" value={form[c] ?? ''} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button className="button button--primary button--pill" onClick={() => onSave(form)}>Save</button>
        <button className="button button--ghost button--pill" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Section({ title, columns, sourceUrl, idKey, collectionType }) {
  const [rows, setRows] = useState([]);
  const [sourceName, setSourceName] = useState('');
  const [mode, setMode] = useState('replace'); // replace | merge
  const [editIdx, setEditIdx] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const hasData = rows && rows.length > 0;

  async function handleLoadCurrent() {
    const data = await loadCSV(sourceUrl);
    // Ensure column order
    const mapped = data.map((r) => remapRow(r, columns));
    setRows(mapped);
    setSourceName(sourceUrl);
  }

  function handleUpload(parsed, meta) {
    if (mode === 'replace' || !rows.length) {
      setRows(parsed);
    } else {
      // merge: upsert by idKey
      const byId = new Map(rows.map((r) => [r[idKey], r]));
      for (const r of parsed) byId.set(r[idKey], { ...(byId.get(r[idKey]) || {}), ...r });
      setRows(Array.from(byId.values()));
    }
    setSourceName(meta?.sourceName || 'Uploaded');
  }

  function handleDownload() {
    const csv = toCSV(rows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sourceUrl.split('/').pop() || 'export'}`.replace('.csv', '.updated.csv');
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSyncToFirebase() {
    setSyncing(true);
    setSyncStatus({ type: 'info', message: 'Syncing to Firebase...' });
    
    try {
      let successCount = 0;
      let errorCount = 0;
      
      for (const row of rows) {
        try {
          const id = row[idKey];
          if (!id) {
            console.warn('Skipping row without ID:', row);
            errorCount++;
            continue;
          }

          // Determine which Firebase function to use
          if (collectionType === 'videos') {
            await updateVideo(id, row);
          } else if (collectionType === 'quizzes') {
            await updateQuiz(id, row);
          }
          successCount++;
        } catch (err) {
          console.error(`Error syncing ${row[idKey]}:`, err);
          errorCount++;
        }
      }

      if (errorCount === 0) {
        setSyncStatus({ type: 'success', message: `✅ Successfully synced ${successCount} items to Firebase!` });
      } else {
        setSyncStatus({ type: 'warning', message: `⚠️ Synced ${successCount} items. ${errorCount} failed.` });
      }
    } catch (err) {
      setSyncStatus({ type: 'error', message: `❌ Sync failed: ${err.message}` });
    } finally {
      setSyncing(false);
      // Clear status after 5 seconds
      setTimeout(() => setSyncStatus(null), 5000);
    }
  }

  function handleEditSave(updated) {
    const clone = rows.slice();
    clone[editIdx] = remapRow(updated, columns);
    setRows(clone);
    setEditIdx(null);
  }

  function handleAddNew() {
    setRows([Object.fromEntries(columns.map((c) => [c, ''])), ...rows]);
    setEditIdx(0);
  }

  return (
    <section className="section" style={{ paddingTop: '1.5rem' }}>
      <div className="container">
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <div>
            <span className="page-header__eyebrow">Admin</span>
            <h2>{title}</h2>
            <p className="text-muted">Columns: {columns.join(', ')}</p>
          </div>
          <div className="page-header__actions" style={{ alignItems: 'center' }}>
            <div className="chip">Mode:</div>
            <label className="chip" style={{ cursor: 'pointer' }}>
              <input type="radio" name={`${title}-mode`} checked={mode==='replace'} onChange={() => setMode('replace')} /> Replace
            </label>
            <label className="chip" style={{ cursor: 'pointer' }}>
              <input type="radio" name={`${title}-mode`} checked={mode==='merge'} onChange={() => setMode('merge')} /> Merge
            </label>
            <FilePicker onData={handleUpload} columns={columns} label={`Upload ${title}`} />
            <button className="button button--ghost button--pill" onClick={handleLoadCurrent}>Load current</button>
            <button className="button button--secondary button--pill" onClick={handleAddNew}>Add new</button>
            {collectionType && (
              <button 
                className="button button--primary button--pill" 
                onClick={handleSyncToFirebase} 
                disabled={!hasData || syncing}
              >
                {syncing ? 'Syncing...' : '💾 Save to Firebase'}
              </button>
            )}
            <button className="button button--ghost button--pill" onClick={handleDownload} disabled={!hasData}>Download CSV</button>
          </div>
        </div>

        {syncStatus && (
          <div 
            className={`form-message form-message--${syncStatus.type === 'success' ? 'success' : syncStatus.type === 'error' ? 'error' : 'info'}`}
            style={{ marginBottom: '1rem' }}
          >
            {syncStatus.message}
          </div>
        )}

        {hasData ? (
          <div className="card" style={{ padding: '1rem' }}>
            <div className="text-muted" style={{ marginBottom: '0.5rem' }}>Source: {sourceName || '—'} • {rows.length} rows</div>
            <DataTable rows={rows} columns={columns} onEdit={(idx) => setEditIdx(idx)} />
            {editIdx != null && (
              <EditForm
                row={rows[editIdx]}
                columns={columns}
                onSave={handleEditSave}
                onCancel={() => setEditIdx(null)}
              />
            )}
          </div>
        ) : (
          <div className="card card--compact" style={{ padding: '1rem' }}>
            <p className="text-muted">No data loaded yet. Upload a file or click "Load current" to fetch {sourceUrl}.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Admin() {
  return (
    <>
      <Section title="Courses (Videos CSV)" columns={VIDEO_COLUMNS} sourceUrl="/data/edlight_videos.csv" idKey="id" collectionType="videos" />
      <Section title="Quizzes" columns={QUIZ_COLUMNS} sourceUrl="/data/edlight_quizzes.csv" idKey="quiz_id" collectionType="quizzes" />
      <Section title="Users" columns={USER_COLUMNS} sourceUrl="/api/users/export" idKey="user_id" />
    </>
  );
}
