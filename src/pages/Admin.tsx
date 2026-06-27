import React, { useState } from 'react';
import { Film, HelpCircle, Users } from 'lucide-react';
import { loadCSV } from '../utils/csvParser';
import './Admin.css';
import { toCSV, remapRow } from '../utils/csvStringify';
import { updateVideo, updateQuiz, updateUser, deleteVideo, deleteQuiz, deleteUser, deleteAllQuizzes, db } from '../services/firebase';
import { collection, getDocs } from 'firebase/firestore';

// Helper to load data from Firestore
async function loadFromFirestore(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  const data = [];
  snapshot.forEach((doc) => {
    data.push({ id: doc.id, ...doc.data() });
  });
  return data;
}

// Expected column orders
const VIDEO_COLUMNS = [
  'id','subject_code','unit_no','unit_title','lesson_no','video_title','learning_objectives','language','duration_min','video_url','thumbnail_url','tags'
];

const QUIZ_COLUMNS = [
  'id','subject_code','subject','level','unit','Chapter_Number','video_title','Subchapter_Number','question_type','question','options','correct_answer','hint','good_response','wrong_response','language','difficulty','tags','source_doc','created_at'
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
        console.log('[Admin] Parsed CSV rows:', rows.length, 'Sample:', rows[0]);
        const mapped = rows.map((r) => remapRow(r, columns));
        console.log('[Admin] Mapped to columns:', columns);
        console.log('[Admin] Sample mapped row:', mapped[0]);
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
      <label className="button button--secondary" style={{ cursor: 'pointer' }}>
        {label}
        <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {error && <div className="form-message form-message--error" style={{ marginTop: '0.5rem' }}>{error}</div>}
    </div>
  );
}

function DataTable({ rows, columns, onEdit }) {
  if (!rows?.length) return null;
  
  const handleEditClick = (idx) => {
    console.log('Edit clicked for index:', idx, 'Row:', rows[idx]);
    onEdit(idx);
  };
  
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
                <button className="button button--ghost" onClick={() => handleEditClick(idx)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COLLECTION_LABELS = { videos: 'Course', quizzes: 'Quiz', users: 'User' };

function EditForm({ row, columns, onSave, onCancel, collectionType = '' }) {
  const [form, setForm] = useState(() => {
    // Initialize form with row data, converting any complex types to strings
    const initialForm = {};
    columns.forEach(col => {
      const value = row?.[col];
      // Handle various data types from Firebase
      if (value === null || value === undefined) {
        initialForm[col] = '';
      } else if (typeof value === 'object') {
        // Convert objects/timestamps to JSON string for editing
        initialForm[col] = JSON.stringify(value);
      } else {
        initialForm[col] = String(value);
      }
    });
    return initialForm;
  });

  // Fields that should use textarea instead of input
  const longTextFields = ['question', 'learning_objectives', 'options', 'hint', 'good_response', 'wrong_response', 'tags'];
  
  // Fields that should be full-width
  const fullWidthFields = ['video_url', 'thumbnail_url', 'question', 'options', 'learning_objectives', 'email'];

  const renderField = (col) => {
    const value = form[col] ?? '';
    const isLongText = longTextFields.includes(col);
    const isFullWidth = fullWidthFields.includes(col);
    const isReadOnly = col === 'id' || col === 'user_id' || col === 'created_at';

    return (
      <div 
        key={col} 
        className="form-field"
        style={isFullWidth ? { gridColumn: '1 / -1' } : {}}
      >
        <label className="form-label" style={{ 
          fontWeight: 500, 
          marginBottom: '0.5rem',
          display: 'block',
          color: 'var(--color-text)',
          fontSize: '0.875rem'
        }}>
          {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          {isReadOnly && <span style={{ color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>(read-only)</span>}
        </label>
        {isLongText ? (
          <textarea
            className="form-input"
            value={value}
            onChange={(e) => setForm({ ...form, [col]: e.target.value })}
            rows={4}
            disabled={isReadOnly}
            style={{ 
              resize: 'vertical',
              minHeight: '80px',
              fontFamily: 'inherit'
            }}
          />
        ) : (
          <input 
            className="form-input" 
            value={value} 
            onChange={(e) => setForm({ ...form, [col]: e.target.value })}
            disabled={isReadOnly}
            style={isReadOnly ? { 
              backgroundColor: 'var(--color-bg-tertiary)', 
              cursor: 'not-allowed',
              opacity: 0.7
            } : {}}
          />
        )}
      </div>
    );
  };

  return (
    <div className="modal modal--active" onClick={onCancel}>
      <div 
        className="modal__content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '1000px', 
          maxHeight: 'calc(var(--vvh, 1vh) * 90)', 
          width: '95vw',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="modal__header" style={{ 
          borderBottom: '1px solid var(--color-border)',
          padding: '1.5rem',
          flexShrink: 0
        }}>
          <h3 className="modal__title" style={{ fontSize: '1.5rem', margin: 0 }}>Edit {COLLECTION_LABELS[collectionType] || 'Record'}</h3>
          <button className="modal__close" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="modal__body" style={{ 
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem'
        }}>
          <div style={{ 
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            alignItems: 'start'
          }}>
            {columns.map(renderField)}
          </div>
        </div>
        <div className="modal__footer" style={{ 
          borderTop: '1px solid var(--color-border)',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '1rem',
          flexShrink: 0,
          backgroundColor: 'var(--color-bg-secondary)'
        }}>
          <button className="button button--ghost" onClick={onCancel}>Cancel</button>
          <button className="button button--primary" onClick={() => onSave(form)}>Save Changes</button>
        </div>
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
  // Inline confirmation state for destructive delete-all action
  const [deleteConfirm, setDeleteConfirm] = useState<{ count: number; backupData: any[] } | null>(null);

  const hasData = rows && rows.length > 0;

  async function handleConfirmedDelete() {
    if (!deleteConfirm) return;
    const { count, backupData } = deleteConfirm;
    setDeleteConfirm(null);
    setSyncing(true);
    try {
      setSyncStatus({ type: 'info', message: `📥 Creating backup of ${count} quizzes...` });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const backupFilename = `quizzes_backup_${timestamp}.csv`;
      const mapped = backupData.map((r) => remapRow(r, columns));
      const csv = toCSV(mapped, columns);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFilename;
      a.click();
      URL.revokeObjectURL(url);
      await new Promise(resolve => setTimeout(resolve, 500));
      setSyncStatus({ type: 'info', message: `🗑️ Deleting ${count} quizzes...` });
      const res = await deleteAllQuizzes();
      setRows([]);
      setSyncStatus({ type: 'success', message: `✅ Backup saved as "${backupFilename}". Deleted ${res.deleted || 0} quizzes.` });
    } catch (err) {
      console.error(err);
      setSyncStatus({ type: 'error', message: `❌ Failed: ${err.message}` });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncStatus(null), 8000);
    }
  }

  // Helper function to convert Firebase Timestamps to readable strings
  function convertTimestamps(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const converted = { ...obj };
    for (const key in converted) {
      const val = converted[key];
      // Check if it's a Firebase Timestamp (has seconds and nanoseconds)
      if (val && typeof val === 'object' && 'seconds' in val && 'nanoseconds' in val) {
        // Convert to ISO string for readability
        converted[key] = new Date(val.seconds * 1000).toISOString();
      } else if (Array.isArray(val)) {
        // Handle arrays
        converted[key] = val.map(item => 
          (item && typeof item === 'object' && 'seconds' in item) 
            ? new Date(item.seconds * 1000).toISOString() 
            : item
        );
      }
    }
    return converted;
  }

  async function handleLoadCurrent() {
    try {
      setSyncStatus({ type: 'info', message: 'Loading from Firebase...' });
      setRows([]); // Clear existing rows while loading
      
      if (collectionType === 'videos') {
        const videosRef = collection(db, 'videos');
        const snapshot = await getDocs(videosRef);
        const data = [];
        snapshot.forEach((doc) => {
          data.push(convertTimestamps({ id: doc.id, ...doc.data() }));
        });
        console.log(`Loaded ${data.length} videos from Firebase`);
        const mapped = data.map((r) => remapRow(r, columns));
        setRows(mapped);
        setSourceName('Firebase (videos collection)');
        setSyncStatus({ type: 'success', message: `✅ Loaded ${data.length} videos from Firebase` });
      } else if (collectionType === 'quizzes') {
        const quizzesRef = collection(db, 'quizzes');
        const snapshot = await getDocs(quizzesRef);
        const data = [];
        snapshot.forEach((doc) => {
          data.push(convertTimestamps({ id: doc.id, ...doc.data() }));
        });
        console.log(`Loaded ${data.length} quizzes from Firebase`, data.length > 0 ? data[0] : 'No data');
        const mapped = data.map((r) => remapRow(r, columns));
        setRows(mapped);
        setSourceName('Firebase (quizzes collection)');
        setSyncStatus({ type: 'success', message: `✅ Loaded ${data.length} quizzes from Firebase` });
      } else if (collectionType === 'users') {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        const data = [];
        snapshot.forEach((doc) => {
          data.push(convertTimestamps({ user_id: doc.id, ...doc.data() }));
        });
        console.log(`Loaded ${data.length} users from Firebase`, data.length > 0 ? data[0] : 'No data');
        const mapped = data.map((r) => remapRow(r, columns));
        setRows(mapped);
        setSourceName('Firebase (users collection)');
        setSyncStatus({ type: 'success', message: `✅ Loaded ${data.length} users from Firebase` });
      } else if (!sourceUrl) {
        // No CSV source - load directly from Firestore
        const data = await loadFromFirestore(collectionType);
        const mapped = data.map((r) => remapRow(r, columns));
        setRows(mapped);
        setSourceName(`Firestore (${collectionType} collection)`);
        setSyncStatus({ type: 'success', message: `✅ Loaded ${data.length} items from Firestore` });
      } else {
        // Fallback to CSV for other collections
        const data = await loadCSV(sourceUrl);
        const mapped = data.map((r) => remapRow(r, columns));
        setRows(mapped);
        setSourceName(sourceUrl);
        setSyncStatus({ type: 'success', message: `✅ Loaded from ${sourceUrl}` });
      }
      
      setTimeout(() => setSyncStatus(null), 3000);
    } catch (error) {
      console.error('Error loading data:', error);
      setSyncStatus({ type: 'error', message: `❌ Failed to load: ${error.message}` });
      setTimeout(() => setSyncStatus(null), 5000);
    }
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
    
    // Show success message with reminder to sync
    if (collectionType) {
      setSyncStatus({ 
        type: 'info', 
        message: `✅ Loaded ${parsed.length} items from ${meta?.sourceName || 'file'}. Click "💾 Save to Firebase" to sync changes.` 
      });
      setTimeout(() => setSyncStatus(null), 8000);
    }
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
      const errors = [];
      
      for (const row of rows) {
        try {
          const id = row[idKey];
          if (!id) {
            console.warn('Skipping row without ID:', row);
            errorCount++;
            errors.push(`Row missing ${idKey}`);
            continue;
          }

          // Sanitize ID: Firebase document IDs cannot contain forward slashes
          const sanitizedId = String(id).replace(/\//g, '_');
          
          // Store the sanitized ID back in the row so it's saved to Firebase
          const sanitizedRow = {
            ...row,
            [idKey]: sanitizedId
          };
          
          // Remove undefined/null values
          Object.keys(sanitizedRow).forEach(key => {
            const value = sanitizedRow[key];
            if (value === undefined || value === null) {
              sanitizedRow[key] = '';
            }
          });

          // Determine which Firebase function to use
          if (collectionType === 'videos') {
            await updateVideo(sanitizedId, sanitizedRow);
          } else if (collectionType === 'quizzes') {
            await updateQuiz(sanitizedId, sanitizedRow);
          } else if (collectionType === 'users') {
            await updateUser(sanitizedId, sanitizedRow);
          }
          successCount++;
        } catch (err) {
          console.error(`Error syncing ${row[idKey]}:`, err);
          errorCount++;
          errors.push(`${row[idKey]}: ${err.message}`);
        }
      }

      if (errorCount === 0) {
        setSyncStatus({ type: 'success', message: `✅ Successfully synced ${successCount} items to Firebase!` });
      } else {
        console.error('Sync errors:', errors);
        setSyncStatus({ type: 'warning', message: `⚠️ Synced ${successCount} items. ${errorCount} failed. Check console for details.` });
      }
    } catch (err) {
      console.error('Sync failed with error:', err);
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
    <div>
      <div className="admin-section-header">
        <div className="admin-section-header__meta">
          <h2>{title}</h2>
          <p className="text-muted">Colonnes : {columns.join(', ')}</p>
        </div>
        <div className="admin-section-actions">
          <div className="admin-mode-group">
            <span>Mode :</span>
            <label>
              <input type="radio" name={`${title}-mode`} checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace
            </label>
            <label>
              <input type="radio" name={`${title}-mode`} checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge
            </label>
          </div>
          <FilePicker onData={handleUpload} columns={columns} label={`Importer`} />
          <button type="button" className="button button--ghost" onClick={handleLoadCurrent}>Charger actuel</button>
          <button type="button" className="button button--secondary" onClick={handleAddNew}>Ajouter</button>
          {collectionType && (
            <button
              type="button"
              className="button button--primary"
              onClick={handleSyncToFirebase}
              disabled={!hasData || syncing}
            >
              {syncing ? 'Sync…' : '💾 Sauvegarder'}
            </button>
          )}
          {collectionType === 'quizzes' && (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={async () => {
                  try {
                    setSyncing(true);
                    setSyncStatus({ type: 'info', message: 'Vérification de la base de données...' });
                    const quizzesRef = collection(db, 'quizzes');
                    const snapshot = await getDocs(quizzesRef);
                    setSyncStatus({
                      type: 'info',
                      message: `📊 ${snapshot.size} quiz dans la base. Cliquez "Vider" pour les supprimer (avec sauvegarde automatique).`,
                    });
                  } catch (err) {
                    setSyncStatus({ type: 'error', message: `❌ Échec : ${err.message}` });
                  } finally {
                    setSyncing(false);
                    setTimeout(() => setSyncStatus(null), 10000);
                  }
                }}
                disabled={syncing}
              >
                🔍 Aperçu
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={async () => {
                  try {
                    setSyncing(true);
                    setSyncStatus({ type: 'info', message: 'Chargement pour sauvegarde...' });
                    const quizzesRef = collection(db, 'quizzes');
                    const snapshot = await getDocs(quizzesRef);
                    const backupData = [];
                    snapshot.forEach((doc) => {
                      const data: Record<string, any> = { id: doc.id, ...doc.data() };
                      if (data.created_at?.seconds) data.created_at = new Date(data.created_at.seconds * 1000).toISOString();
                      if (data.updated_at?.seconds) data.updated_at = new Date(data.updated_at.seconds * 1000).toISOString();
                      backupData.push(data);
                    });
                    if (backupData.length === 0) {
                      setSyncStatus({ type: 'info', message: 'Aucun quiz à supprimer.' });
                      setSyncing(false);
                      setTimeout(() => setSyncStatus(null), 3000);
                      return;
                    }
                    setSyncing(false);
                    setDeleteConfirm({ count: backupData.length, backupData });
                  } catch (err) {
                    setSyncStatus({ type: 'error', message: `❌ Échec : ${err.message}` });
                    setSyncing(false);
                    setTimeout(() => setSyncStatus(null), 8000);
                  }
                }}
                disabled={syncing}
              >
                🧹 Vider
              </button>
            </>
          )}
          <button type="button" className="button button--ghost" onClick={handleDownload} disabled={!hasData}>Exporter CSV</button>
        </div>
      </div>

      {deleteConfirm && (
        <div className="admin-delete-confirm">
          <strong>⚠️ Confirmer la suppression</strong>
          <p>
            Cette action va exporter {deleteConfirm.count} quiz en CSV (sauvegarde automatique) puis
            les supprimer définitivement de Firestore. Continuer ?
          </p>
          <div className="admin-delete-confirm__actions">
            <button type="button" className="button button--danger" onClick={handleConfirmedDelete}>
              Oui, supprimer {deleteConfirm.count} quiz
            </button>
            <button type="button" className="button button--ghost" onClick={() => setDeleteConfirm(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {syncStatus && (
        <div className={`admin-status admin-status--${syncStatus.type === 'success' ? 'success' : syncStatus.type === 'error' ? 'error' : syncStatus.type === 'warning' ? 'warning' : 'info'}`}>
          {syncStatus.message}
        </div>
      )}

      {hasData ? (
        <div className="admin-data-card">
          <p className="admin-data-card__meta text-muted">
            Source : {sourceName || '—'} · {rows.length} lignes
          </p>
          <DataTable rows={rows} columns={columns} onEdit={(idx) => setEditIdx(idx)} />
        </div>
      ) : (
        <div className="admin-data-card admin-data-card--empty">
          <p className="text-muted">Aucune donnée. Importez un fichier ou cliquez "Charger actuel".</p>
        </div>
      )}

      {editIdx !== null && (
        <EditForm
          key={editIdx}
          row={rows[editIdx]}
          columns={columns}
          collectionType={collectionType}
          onSave={handleEditSave}
          onCancel={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

const TABS = [
  { id: 'videos',  label: 'Vidéos',        Icon: Film },
  { id: 'quizzes', label: 'Quiz',           Icon: HelpCircle },
  { id: 'users',   label: 'Utilisateurs',   Icon: Users },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<TabId>('videos');

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1>Gestion du contenu</h1>
        <p className="text-muted">Importez, éditez et synchronisez le contenu vers Firebase</p>
      </div>

      <div className="admin-tabs-bar">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`admin-tab${activeTab === id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'videos' && (
        <Section title="Vidéos" columns={VIDEO_COLUMNS} sourceUrl="/data/edlight_videos.csv" idKey="id" collectionType="videos" />
      )}
      {activeTab === 'quizzes' && (
        <Section title="Quiz" columns={QUIZ_COLUMNS} sourceUrl={null} idKey="id" collectionType="quizzes" />
      )}
      {activeTab === 'users' && (
        <Section title="Utilisateurs" columns={USER_COLUMNS} sourceUrl="/api/users/export" idKey="user_id" collectionType="users" />
      )}
    </div>
  );
}
