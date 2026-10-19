import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scale } from '../../components/icons';
import { getIdToken } from '../../services/firebase';
import {
  CALIBRATION_MAX_ROWS,
  CALIBRATION_SAMPLE_CSV,
  CALIBRATION_TARGET,
  calibrationCsv,
  calibrationMetrics,
  itemPair,
  parseCalibrationUpload,
  type CalibrationInput,
  type CalibrationItem,
  type GradedPair,
  type RowError,
} from '../../../shared/essayCalibration';

/**
 * AdminEssayCalibration — Contenu → « Calibration des dissertations ».
 *
 * Upload teacher-graded copies (CSV or JSON, template below), and the server
 * grades each one with the SAME grader students get, a few at a time
 * (/api/essay-calibration `step`, rate-limited, resumable: closing the tab and
 * coming back continues where it stopped; re-uploading the same file reopens
 * the same run). Then: MAE, agreement, Pearson r, quadratic-weighted kappa on
 * 0–20 and per rubric criterion, confusion matrices, worst disagreements, CSV.
 *
 * Upload anonymized copies only (a reference like "copie-014", never a name).
 */

interface RunRow {
  runId: string;
  name: string;
  createdAt: number;
  createdByName?: string | null;
  total: number;
  graded: number;
  failed: number;
  status: 'running' | 'complete';
}

async function api(method: 'GET' | 'POST', query = '', body?: unknown): Promise<any> {
  const token = await getIdToken();
  const res = await fetch(`/api/essay-calibration${query}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `http_${res.status}`) as Error & { status?: number; data?: any };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`);
const dec = (v: number | null, d = 2) => (v == null ? '—' : v.toFixed(d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Metrics({ items }: { items: CalibrationItem[] }) {
  const pairs = useMemo(() => items.map(itemPair).filter(Boolean) as GradedPair[], [items]);
  const m = useMemo(() => calibrationMetrics(pairs), [pairs]);
  if (!pairs.length) return <div className="admin-empty">Aucune copie corrigée pour l’instant.</div>;
  const tiles: Array<[string, string]> = [
    ['Copies comparées', String(m.n)],
    ['QWK (0–20)', dec(m.qwk)],
    [`|écart| ≤ ${CALIBRATION_TARGET.tolerance20}/20`, pct(m.within2Share)],
    ['Erreur moyenne (MAE)', m.mae == null ? '—' : `${dec(m.mae)} / 20`],
    ['Biais (IA − enseignant)', m.bias == null ? '—' : `${m.bias > 0 ? '+' : ''}${dec(m.bias)}`],
    ['Pearson r', dec(m.pearson)],
    ['Accord exact (au point)', pct(m.exactShare)],
    ['Accord adjacent (±1)', pct(m.adjacentShare)],
  ];
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        className="admin-card"
        role="status"
        style={{ background: m.meetsTarget ? 'color-mix(in srgb, var(--success-500, #16a34a) 12%, var(--surface))' : 'var(--surface-muted)' }}
      >
        <strong>{m.meetsTarget ? 'Objectif atteint' : 'Objectif non atteint'}</strong>
        {' : '}QWK ≥ {CALIBRATION_TARGET.qwk} et |écart| ≤ {CALIBRATION_TARGET.tolerance20}/20 sur au moins {Math.round(CALIBRATION_TARGET.within2Share * 100)} % des copies.
        {m.n < 20 ? ' Moins de 20 copies : les chiffres sont encore fragiles.' : ''}
      </div>
      <div className="admin-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="admin-card admin-tile">
            <div className="admin-tile__label">{label}</div>
            <div className="admin-tile__value">{value}</div>
          </div>
        ))}
      </div>

      {m.criteria.length > 0 && (
        <div className="admin-card">
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Par critère (niveaux 0 / 1 / 2)</h2>
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr><th>Critère</th><th style={{ textAlign: 'right' }}>Copies</th><th style={{ textAlign: 'right' }}>Accord exact</th><th style={{ textAlign: 'right' }}>QWK</th><th>Confusion (lignes : enseignant, colonnes : IA)</th></tr>
              </thead>
              <tbody>
                {m.criteria.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td>
                    <td style={{ textAlign: 'right' }}>{c.n}</td>
                    <td style={{ textAlign: 'right' }}>{pct(c.exact)}</td>
                    <td style={{ textAlign: 'right' }}>{dec(c.qwk)}</td>
                    <td>
                      <table aria-label={`Confusion ${c.label}`} style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead><tr><th />{[0, 1, 2].map((j) => <th key={j} style={{ padding: '0 6px' }}>IA {j}</th>)}</tr></thead>
                        <tbody>
                          {c.confusion.map((row, i) => (
                            <tr key={i}>
                              <th style={{ padding: '0 6px', textAlign: 'left' }}>Ens. {i}</th>
                              {row.map((v, j) => (
                                <td key={j} style={{ padding: '2px 6px', textAlign: 'center', fontWeight: i === j ? 700 : 400 }}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Plus grands désaccords</h2>
        <div className="admin-table__scroll">
          <table className="admin-table">
            <thead><tr><th>Ligne</th><th>Référence</th><th style={{ textAlign: 'right' }}>Enseignant /20</th><th style={{ textAlign: 'right' }}>IA /20</th><th style={{ textAlign: 'right' }}>Écart</th></tr></thead>
            <tbody>
              {m.worst.map((w) => (
                <tr key={w.index}>
                  <td>{w.index + 1}</td>
                  <td>{w.ref || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{w.teacher20}</td>
                  <td style={{ textAlign: 'right' }}>{w.ai20}</td>
                  <td style={{ textAlign: 'right' }}>{w.error > 0 ? '+' : ''}{w.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminEssayCalibration() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [parsed, setParsed] = useState<{ rows: CalibrationInput[]; errors: RowError[] } | null>(null);
  const [active, setActive] = useState<{ run: RunRow; items: CalibrationItem[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const stopRef = useRef(false);

  const loadRuns = useCallback(async () => {
    setListError(null);
    try {
      setRuns((await api('GET')).runs || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'load_failed');
      setRuns([]);
    }
  }, []);
  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => () => { stopRef.current = true; }, []);

  const openRun = useCallback(async (runId: string) => {
    const data = await api('GET', `?runId=${encodeURIComponent(runId)}`);
    setActive({ run: data.run, items: data.items || [] });
    return data.run as RunRow;
  }, []);

  /** Step the run until it completes, the admin stops, or a limit is hit. Resumable. */
  const runToEnd = useCallback(async (runId: string) => {
    setRunning(true);
    stopRef.current = false;
    setMessage(null);
    try {
      for (;;) {
        if (stopRef.current) { setMessage('En pause. « Reprendre » continue là où la correction s’est arrêtée.'); break; }
        let step: any;
        try {
          step = await api('POST', '', { action: 'step', runId });
        } catch (e: any) {
          if (e?.status === 409) { await sleep(5000); continue; }
          if (e?.status === 429) { setMessage('Limite horaire atteinte. Reprends plus tard : rien n’est perdu.'); break; }
          throw e;
        }
        await openRun(runId);
        if (step.complete) { setMessage('Correction terminée.'); break; }
        if (!step.processed) await sleep(3000);
      }
    } catch (e) {
      setMessage(`Erreur : ${e instanceof Error ? e.message : 'step_failed'}. « Reprendre » relance.`);
    } finally {
      setRunning(false);
      void loadRuns();
    }
  }, [openRun, loadRuns]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setParsed(parseCalibrationUpload(await file.text()));
    if (!name) setName(file.name.replace(/\.(csv|json)$/i, ''));
  };

  const start = async () => {
    if (!parsed?.rows.length) return;
    try {
      const { runId, existing } = await api('POST', '', { action: 'create', name, rows: parsed.rows });
      setMessage(existing ? 'Ce fichier a déjà été importé sous ce nom : reprise de la même calibration. Change le nom pour corriger à nouveau.' : null);
      await openRun(runId);
      setParsed(null);
      void loadRuns();
      void runToEnd(runId);
    } catch (e) {
      setMessage(`Import refusé : ${e instanceof Error ? e.message : 'create_failed'}`);
    }
  };

  const remove = async (runId: string) => {
    if (!window.confirm('Supprimer cette calibration et toutes ses copies ?')) return;
    await api('POST', '', { action: 'delete', runId });
    if (active?.run.runId === runId) setActive(null);
    void loadRuns();
  };

  const done = active ? active.run.graded + active.run.failed : 0;

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Scale size={13} aria-hidden="true" />
          CONTENU
        </div>
        <h1 className="admin-page__title">Calibration des dissertations</h1>
        <p className="admin-page__subtitle">
          Compare la note du correcteur automatique à celle d’enseignants sur des copies réelles et
          anonymisées. Chaque copie passe par exactement le même correcteur que les élèves. Objectif :
          QWK ≥ {CALIBRATION_TARGET.qwk} sur 0–20 et un écart d’au plus {CALIBRATION_TARGET.tolerance20}/20
          sur {Math.round(CALIBRATION_TARGET.within2Share * 100)} % des copies.
        </p>
      </div>

      <div className="admin-card" style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Nouvelle calibration</h2>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          CSV (virgule ou point-virgule) ou JSON, {CALIBRATION_MAX_ROWS} copies au maximum. Colonnes :
          <code> ref</code>, <code>examId</code> + <code>questionIndex</code> (index dans l’examen, à partir de 0)
          ou <code>prompt</code>, <code>subject</code>, <code>level</code>, <code>studentText</code>,
          <code> teacherScore</code>, <code>maxScore</code> (20 par défaut), et facultativement
          <code> crit:&lt;critère&gt;</code> = 0, 1 ou 2. Aucun nom d’élève.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => download('modele-calibration.csv', CALIBRATION_SAMPLE_CSV)}>
            Télécharger le modèle
          </button>
          <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => void onFile(e.target.files?.[0])} aria-label="Fichier de copies" />
          <input className="admin-input" style={{ width: 240 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la calibration" aria-label="Nom" />
        </div>
        {parsed && (
          <div style={{ fontSize: 13 }}>
            <div>{parsed.rows.length} copie(s) valide(s){parsed.errors.length ? `, ${parsed.errors.length} ligne(s) refusée(s)` : ''}.</div>
            {parsed.errors.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {parsed.errors.slice(0, 10).map((e) => <li key={`${e.row}-${e.message}`}>Ligne {e.row} : {e.message}</li>)}
              </ul>
            )}
            <button type="button" className="admin-btn" style={{ marginTop: 8 }} disabled={!parsed.rows.length || running} onClick={() => void start()}>
              Lancer la correction
            </button>
          </div>
        )}
        {message ? <div role="status" style={{ fontSize: 13 }}>{message}</div> : null}
      </div>

      {active && (
        <div className="admin-card" style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{active.run.name}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {running ? (
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { stopRef.current = true; }}>Mettre en pause</button>
              ) : active.run.status !== 'complete' ? (
                <button type="button" className="admin-btn" onClick={() => void runToEnd(active.run.runId)}>Reprendre</button>
              ) : null}
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => download(`${active.run.runId}.csv`, calibrationCsv(active.items))}
              >
                Exporter en CSV
              </button>
            </div>
          </div>
          <div aria-live="polite" style={{ fontSize: 13 }}>
            {done} / {active.run.total} copies traitées ({active.run.graded} corrigées, {active.run.failed} en échec)
            {running ? ' · correction en cours…' : ''}
          </div>
          <progress max={active.run.total || 1} value={done} style={{ width: '100%' }} />
          <Metrics items={active.items} />
        </div>
      )}

      <div className="admin-card">
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Calibrations</h2>
        {runs == null ? (
          <div className="admin-empty">Chargement…</div>
        ) : listError ? (
          <div className="admin-empty" role="alert">Impossible de charger les calibrations ({listError}).</div>
        ) : runs.length === 0 ? (
          <div className="admin-empty">Aucune calibration pour l’instant.</div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead><tr><th>Nom</th><th>Créée</th><th style={{ textAlign: 'right' }}>Avancement</th><th /></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.runId}>
                    <td>{r.name}</td>
                    <td>{new Date(r.createdAt).toLocaleDateString('fr-FR')}{r.createdByName ? ` · ${r.createdByName}` : ''}</td>
                    <td style={{ textAlign: 'right' }}>{r.graded + r.failed} / {r.total}{r.status === 'complete' ? ' (terminée)' : ''}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" className="admin-btn admin-btn--ghost" disabled={running} onClick={() => void openRun(r.runId)}>Ouvrir</button>{' '}
                      <button type="button" className="admin-btn admin-btn--danger" disabled={running} onClick={() => void remove(r.runId)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
