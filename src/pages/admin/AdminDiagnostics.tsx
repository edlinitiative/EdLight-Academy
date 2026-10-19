import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from '../../components/icons';
import { getIdToken } from '../../services/firebase';

/**
 * AdminDiagnostics — "Diagnostics / Erreurs".
 *
 * Recent production error signatures from web and app, read through the
 * admin-only GET /api/telemetry?view=errors (aggregates kept by
 * api/_lib/diagnosticsAggregate.ts: one doc per signature per UTC day).
 * A signature groups identical failures without ever storing the message:
 * error class + kind + top bundle frame + the build/update that sent it last.
 *
 * Fatal app crashes caught in JavaScript arrive as `js_fatal_crash` on the
 * NEXT launch (breadcrumb). Native crashes (e.g. SIGSEGV in a TurboModule)
 * never reach this page — they need a native crash reporter.
 *
 * `?sig=<signature>` (the link in crash alerts) highlights that row.
 */

interface ErrorRow {
  signature: string;
  eventName: string;
  errorName: string;
  errorKind: string | null;
  topFrame: string | null;
  screen: string | null;
  count: number;
  fatalCount: number;
  days: number;
  platforms: Record<string, number>;
  firstSeen: number;
  lastSeen: number;
  last: Record<string, unknown>;
  alerted: boolean;
}

const RANGES = [1, 7, 30];

export async function fetchErrorSummaries(days: number): Promise<ErrorRow[]> {
  const token = await getIdToken();
  const res = await fetch(`/api/telemetry?view=errors&days=${days}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`diagnostics_${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.errors) ? body.errors : [];
}

function ago(ms: number): string {
  if (!ms) return '—';
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** "ios 1.2.0 (61) · OTA 1a2b3c4d · web a1b2c3d" from the last report's context. */
export function versionLabel(last: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const parts: string[] = [];
  const head = [s(last.platform), s(last.appVersion), last.buildNumber != null ? `(${s(last.buildNumber)})` : '']
    .filter(Boolean).join(' ');
  if (head) parts.push(head);
  if (s(last.updateId)) parts.push(`OTA ${s(last.updateId).slice(0, 8)}`);
  if (s(last.runtimeVersion)) parts.push(`runtime ${s(last.runtimeVersion)}`);
  if (s(last.release)) parts.push(`commit ${s(last.release).slice(0, 7)}`);
  if (s(last.osVersion)) parts.push(`OS ${s(last.osVersion)}`);
  return parts.join(' · ') || '—';
}

export default function AdminDiagnostics() {
  const [params] = useSearchParams();
  const highlight = params.get('sig');
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<ErrorRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      setRows(await fetchErrorSummaries(days));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'diagnostics_failed');
      setRows([]);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const fatal = (rows || []).reduce((n, r) => n + r.fatalCount, 0);
  const total = (rows || []).reduce((n, r) => n + r.count, 0);

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <AlertTriangle size={13} aria-hidden="true" />
          DONNÉES
        </div>
        <h1 className="admin-page__title">Diagnostics / Erreurs</h1>
        <p className="admin-page__subtitle">
          Erreurs de production regroupées par signature (web et application). Aucun message,
          identifiant d’élève ni contenu n’est conservé : seulement la classe d’erreur, son type,
          l’emplacement dans le code et la version qui l’a envoyée. Les plantages natifs de
          l’application n’apparaissent pas ici.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {RANGES.map((d) => (
          <button
            key={d}
            type="button"
            className={`admin-btn${d === days ? '' : ' admin-btn--ghost'}`}
            aria-pressed={d === days}
            onClick={() => setDays(d)}
          >
            {d === 1 ? "Aujourd'hui" : `${d} jours`}
          </button>
        ))}
        <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void load()}>
          Actualiser
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div className="admin-tiles" style={{ marginBottom: 16 }}>
          {[
            ['Signatures', rows.length],
            ['Rapports', total],
            ['Plantages (fatal)', fatal],
          ].map(([label, value]) => (
            <div key={label} className="admin-card admin-tile">
              <div className="admin-tile__label">{label}</div>
              <div className="admin-tile__value">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-card">
        {rows == null ? (
          <div className="admin-empty">Chargement…</div>
        ) : error ? (
          <div className="admin-empty" role="alert">
            Impossible de charger les diagnostics ({error}).
          </div>
        ) : rows.length === 0 ? (
          <div className="admin-empty">Aucune erreur signalée sur la période.</div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Signature</th>
                  <th>Erreur</th>
                  <th>Écran</th>
                  <th>Plateformes</th>
                  <th>Dernière version</th>
                  <th style={{ textAlign: 'right' }}>Rapports</th>
                  <th>Dernière vue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.signature}
                    style={r.signature === highlight ? { background: 'var(--surface-muted, #EEF4FD)' } : undefined}
                    aria-current={r.signature === highlight ? 'true' : undefined}
                  >
                    <td>
                      <code>{r.signature}</code>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{r.eventName}</div>
                    </td>
                    <td>
                      {r.errorName}
                      {r.errorKind ? <div style={{ fontSize: 12, opacity: 0.75 }}>{r.errorKind}</div> : null}
                      {r.topFrame ? <div style={{ fontSize: 12, opacity: 0.75 }}><code>{r.topFrame}</code></div> : null}
                    </td>
                    <td>{r.screen || '—'}</td>
                    <td>
                      {Object.entries(r.platforms).map(([p, n]) => `${p} ${n}`).join(' · ') || '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{versionLabel(r.last)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.count}
                      {r.fatalCount > 0 ? (
                        <div>
                          <span className="admin-role-pill admin-role-pill--admin">{r.fatalCount} fatal</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {ago(r.lastSeen)}
                      {r.days > 1 ? <div style={{ fontSize: 12, opacity: 0.75 }}>{r.days} jours</div> : null}
                      {r.alerted ? <div style={{ fontSize: 12, opacity: 0.75 }}>alerte envoyée</div> : null}
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
