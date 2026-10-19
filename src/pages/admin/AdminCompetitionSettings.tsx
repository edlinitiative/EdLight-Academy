import React, { useCallback, useEffect, useState } from 'react';
import { Trophy } from '../../components/icons';
import { getIdToken } from '../../services/firebase';
import type {
  CompetitionFlagAudit,
  CompetitionFlagKey,
  CompetitionFlagsState,
} from '../../../shared/competition/flags';

/**
 * AdminCompetitionSettings — "Compétitions" switches.
 *
 * Reads and writes `platformConfig/competition` through the admin-only
 * actions `platform-config` / `platform-config-set` of POST /api/competition
 * (api/_lib/platformConfig.ts). A flag set here overrides its Vercel env
 * default; "Revenir à la valeur par défaut" removes the override. Every change
 * leaves an audit record (platformConfigAudit). Clients pick the new value up
 * on their next fetch; other server instances within ~30 s.
 */

export interface CompetitionConfigResponse {
  flags: CompetitionFlagsState;
  audit: CompetitionFlagAudit[];
  people: Record<string, { name: string }>;
}

async function call(
  action: 'platform-config' | 'platform-config-set',
  extra: Record<string, unknown> = {},
): Promise<CompetitionConfigResponse> {
  const token = await getIdToken();
  const res = await fetch('/api/competition', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `competition_config_${res.status}`);
  return body as CompetitionConfigResponse;
}

export const fetchCompetitionConfig = () => call('platform-config');
export const saveCompetitionFlags = (changes: Partial<Record<CompetitionFlagKey, boolean | null>>) =>
  call('platform-config-set', { changes });

const FLAGS: Array<{ key: CompetitionFlagKey; title: string; body: string; risky: boolean }> = [
  {
    key: 'creationEnabled',
    title: "Création d'événements",
    body:
      "Permet de créer des équipes, des événements et des ligues. Désactivée, les créations sont refusées ; " +
      'les événements existants continuent normalement.',
    risky: true,
  },
  {
    key: 'discoveryEnabled',
    title: 'Découverte publique',
    body:
      "Affiche les événements et les ligues publics dans l'annuaire des compétitions. " +
      "Désactivée, l'annuaire n'en liste plus aucun.",
    risky: false,
  },
  {
    key: 'teamModesEnabled',
    title: "Modes d'équipe (réponse partagée, relais)",
    body:
      'Autorise les modes « réponse partagée » et « relais » pour les équipes nommées. ' +
      'Nécessite la création : sans elle, ces modes restent indisponibles.',
    risky: true,
  },
];

const titleOf = (key: string) => FLAGS.find((f) => f.key === key)?.title ?? key;
const valueLabel = (v: boolean | null) =>
  v === null ? 'valeur par défaut' : v ? 'activé' : 'désactivé';
const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

export default function AdminCompetitionSettings() {
  const [data, setData] = useState<CompetitionConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CompetitionFlagKey | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchCompetitionConfig());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'competition_config_failed');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const apply = async (key: CompetitionFlagKey, value: boolean | null) => {
    const flag = FLAGS.find((f) => f.key === key)!;
    const enabling = value === true || (value === null && data?.flags.defaults[key] === true);
    if (flag.risky && enabling) {
      const ok = window.confirm(
        `Activer « ${flag.title} » ?\n\n` +
          'Le registre de publication des compétitions est toujours BLOQUÉ : ' +
          'ce réglage est réservé au pilote. Les élèves verront le changement à leur prochain chargement.',
      );
      if (!ok) return;
    }
    setBusy(key);
    setError(null);
    try {
      setData(await saveCompetitionFlags({ [key]: value }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'competition_config_failed');
    } finally {
      setBusy(null);
    }
  };

  const flags = data?.flags;
  const nameOf = (uid: string | null) => (uid ? data?.people[uid]?.name || uid : '—');

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Trophy size={13} aria-hidden="true" />
          DONNÉES
        </div>
        <h1 className="admin-page__title">Compétitions</h1>
        <p className="admin-page__subtitle">
          Interrupteurs des compétitions, appliqués par le serveur sans redéploiement. Un réglage défini
          ici remplace la valeur par défaut du serveur (variable Vercel) ; il atteint toutes les
          instances en 30 secondes environ.
        </p>
      </div>

      {error && (
        <div className="admin-card admin-empty" role="alert" style={{ marginBottom: 16 }}>
          Action impossible ({error}).
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        {!flags ? (
          <div className="admin-empty">{error ? 'Réglages indisponibles.' : 'Chargement…'}</div>
        ) : (
          FLAGS.map((f) => {
            const effective = flags.effective[f.key];
            const own = flags.own[f.key];
            const fromConfig = flags.source[f.key] === 'config';
            const blockedByCreation = f.key === 'teamModesEnabled' && own && !flags.effective.creationEnabled;
            return (
              <div key={f.key} className="admin-flag">
                <div className="admin-flag__text">
                  <div className="admin-flag__title">{f.title}</div>
                  <p className="admin-flag__body">{f.body}</p>
                  <div className="admin-flag__meta">
                    <span className={`admin-role-pill${effective ? ' admin-role-pill--admin' : ''}`}>
                      {effective ? 'Actif' : 'Inactif'}
                    </span>
                    <span>{fromConfig ? 'défini ici' : 'valeur par défaut du serveur'}</span>
                    {blockedByCreation && <span>· en attente de la création</span>}
                    {fromConfig && (
                      <button
                        type="button"
                        className="admin-flag__reset"
                        disabled={busy !== null}
                        onClick={() => void apply(f.key, null)}
                      >
                        Revenir à la valeur par défaut ({flags.defaults[f.key] ? 'activé' : 'désactivé'})
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={own}
                  aria-label={f.title}
                  className="admin-switch"
                  disabled={busy !== null}
                  onClick={() => void apply(f.key, !own)}
                >
                  <span className="admin-switch__knob" aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {flags && (
        <p style={{ fontSize: 13, opacity: 0.75, margin: '0 0 16px' }}>
          Dernière modification : {flags.updatedAt ? `${nameOf(flags.updatedBy)} · ${when(flags.updatedAt)}` : 'aucune (valeurs par défaut du serveur)'}
        </p>
      )}

      <div className="admin-card">
        {!data ? (
          <div className="admin-empty">{error ? '—' : 'Chargement…'}</div>
        ) : data.audit.length === 0 ? (
          <div className="admin-empty">Aucun changement enregistré.</div>
        ) : (
          <div className="admin-table__scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Réglage</th>
                  <th>Changement</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.id}>
                    <td>{when(a.at)}</td>
                    <td>{titleOf(a.flag)}</td>
                    <td>{valueLabel(a.from)} → {valueLabel(a.to)}</td>
                    <td>{nameOf(a.by)}</td>
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
