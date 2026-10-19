/**
 * OfflinePacksPanel — "Hors ligne / San entènèt" on the Exams landing.
 *
 * Lists the level's revision packs with their size BEFORE download, lets the
 * student download, update or remove each one, shows the storage used against
 * the budget, and offers "Wi-Fi seulement". Nothing is ever removed without a
 * tap; a pack that does not fit is refused with a message, never squeezed in
 * by evicting another. Collapsed by default (a native <details>) so the
 * landing still opens straight on the subjects.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatPackSize,
  packYearsLabel,
  PackError,
  type PackEntry,
  type PackManifest,
  type StoredPack,
} from '../../shared/offlinePacks';
import {
  downloadPack,
  getWifiOnly,
  loadPackManifest,
  packLibrary,
  packsSupported,
  removeAllPacks,
  removePack,
  setWifiOnly,
  WEB_PACK_BUDGET_BYTES,
} from '../services/offlinePacks';

type Props = { level: string; ht: boolean };

export function packTitle(p: Pick<PackEntry, 'subject' | 'title' | 'volume' | 'volumes' | 'years'>, ht: boolean): string {
  const years = packYearsLabel(p.years, ht ? 'ht' : 'fr');
  const part = p.volume && p.volumes ? (ht ? ` (pati ${p.volume} sou ${p.volumes})` : ` (partie ${p.volume} sur ${p.volumes})`) : '';
  return `${p.title || p.subject}${years ? ` · ${years}` : ''}${part}`;
}

export function packErrorMessage(err: unknown, ht: boolean): string {
  const code = err instanceof PackError ? err.code : 'network';
  const L = (fr: string, k: string) => (ht ? k : fr);
  switch (code) {
    case 'budget':
    case 'too_large':
      return L('Pas assez de place pour ce paquet. Supprime un paquet pour libérer de l’espace.', 'Pa gen ase plas pou pake sa a. Efase yon pake pou libere plas.');
    case 'offline':
      return L('Tu es hors ligne. Connecte-toi pour télécharger.', 'Ou pa sou entènèt. Konekte pou telechaje.');
    case 'wifi_required':
      return L('« Wi-Fi seulement » est activé : connecte-toi au Wi-Fi pour télécharger.', '« Wi-Fi sèlman » aktive : konekte sou Wi-Fi pou telechaje.');
    case 'storage':
      return L('Ce navigateur n’a pas pu enregistrer le paquet.', 'Navigatè sa a pa t ka anrejistre pake a.');
    default:
      return L('Le téléchargement a échoué. Réessaie.', 'Telechajman an echwe. Eseye ankò.');
  }
}

const OfflinePacksPanel: React.FC<Props> = ({ level, ht }) => {
  const L = (fr: string, k: string) => (ht ? k : fr);
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [stored, setStored] = useState<StoredPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [wifiOnly, setWifiOnlyState] = useState(getWifiOnly());
  const [open, setOpen] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const refresh = useCallback(async () => setStored(await packLibrary.list()), []);

  useEffect(() => {
    let alive = true;
    refresh();
    const off = packLibrary.subscribe((packs) => { if (alive) setStored(packs); });
    return () => { alive = false; off(); };
  }, [refresh]);

  // The manifest is fetched only once the student opens the section.
  useEffect(() => {
    if (!open || manifest) return;
    let alive = true;
    loadPackManifest().then(({ manifest: m }) => { if (alive) setManifest(m); });
    return () => { alive = false; };
  }, [open, manifest]);

  const levelPacks = useMemo(() => (manifest?.packs || []).filter((p) => p.level === level && p.kind === 'exam'), [manifest, level]);
  const retired = useMemo(() => packLibrary.retired(manifest, stored).filter((p) => p.level === level), [manifest, stored, level]);
  const used = stored.reduce((s, p) => s + p.sizeBytes, 0);

  if (!packsSupported) return null;

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setMessage(null);
    try {
      await fn();
      setMessage(done);
    } catch (err) {
      setMessage(packErrorMessage(err, ht));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="xp-section xp-offline" aria-labelledby="xp-offline-title">
      <details className="xp-card xp-offline__card" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="xp-offline__summary">
          <span className="xp-offline__summary-text">
            <span id="xp-offline-title" className="xp-card__title xp-offline__title">{L('Hors ligne', 'San entènèt')}</span>
            <span className="xp-meta">
              {stored.length
                ? L(`${stored.length} paquet${stored.length > 1 ? 's' : ''} sur cet appareil · ${formatPackSize(used)}`, `${stored.length} pake sou aparèy sa a · ${formatPackSize(used)}`)
                : L('Télécharge des sujets pour réviser sans connexion.', 'Telechaje sijè pou revize san entènèt.')}
            </span>
          </span>
        </summary>

        <div className="xp-offline__body">
          <p className="xp-meta">
            {L(
              'Les corrections automatiques marchent sans connexion. Tes résultats sont envoyés à ton compte dès que tu te reconnectes. Les scores hors ligne restent des entraînements : ils ne comptent ni pour l’Arène ni pour les classements.',
              'Koreksyon otomatik yo mache san entènèt. Rezilta ou yo ap voye sou kont ou depi ou rekonekte. Nòt san entènèt yo se pratik sèlman : yo pa konte pou Arèn nan ni pou klasman yo.',
            )}
          </p>

          <div className="xp-offline__controls">
            <span className="xp-meta" aria-live="polite">
              {L(`${formatPackSize(used)} utilisés sur ${formatPackSize(WEB_PACK_BUDGET_BYTES).replace('≈ ', '')}`, `${formatPackSize(used)} itilize sou ${formatPackSize(WEB_PACK_BUDGET_BYTES).replace('≈ ', '')}`)}
            </span>
            <label className="xp-offline__toggle">
              <input
                type="checkbox"
                role="switch"
                checked={wifiOnly}
                aria-checked={wifiOnly}
                onChange={(e) => { setWifiOnly(e.target.checked); setWifiOnlyState(e.target.checked); }}
              />
              <span>{L('Wi-Fi seulement', 'Wi-Fi sèlman')}</span>
            </label>
          </div>

          {message && <p className="xp-meta xp-offline__msg" role="status">{message}</p>}

          {!manifest && open && (
            <p className="xp-meta" role="status">{L('Liste des paquets indisponible pour l’instant.', 'Lis pake yo pa disponib kounye a.')}</p>
          )}

          {levelPacks.length > 0 && (
            <ul className="xp-rows">
              {levelPacks.map((p) => {
                const status = packLibrary.statusOf(p, stored);
                const label = packTitle(p, ht);
                const size = p.downloadBytes
                  ? L(`${formatPackSize(p.sizeBytes)} sur l’appareil · téléchargement ${formatPackSize(p.downloadBytes)}`, `${formatPackSize(p.sizeBytes)} sou aparèy la · telechajman ${formatPackSize(p.downloadBytes)}`)
                  : formatPackSize(p.sizeBytes);
                return (
                  <li key={p.id} className="xp-row xp-offline__row">
                    <span className="xp-row__body">
                      <span className="xp-row__title">{label}</span>
                      <span className="xp-row__meta">
                        {L(`${p.items} sujet${p.items > 1 ? 's' : ''}`, `${p.items} sijè`)} · {size}
                      </span>
                      {status !== 'absent' && (
                        <span className="xp-row__tags">
                          <span className={`xp-row__tag${status === 'current' ? ' xp-offline__tag--ok' : ' xp-offline__tag--update'}`}>
                            {status === 'current' ? L('Sur cet appareil', 'Sou aparèy sa a') : L('Mise à jour disponible', 'Mizajou disponib')}
                          </span>
                        </span>
                      )}
                    </span>
                    <span className="xp-row__end">
                      {status !== 'current' && (
                        <button
                          type="button"
                          className="button button--secondary button--sm"
                          disabled={busy !== null}
                          aria-label={`${status === 'update' ? L('Mettre à jour', 'Mete ajou') : L('Télécharger', 'Telechaje')} : ${label}`}
                          onClick={() => act(p.id, () => downloadPack(p), L('Paquet prêt hors ligne.', 'Pake a pare pou san entènèt.'))}
                        >
                          {busy === p.id ? L('Téléchargement…', 'Ap telechaje…') : status === 'update' ? L('Mettre à jour', 'Mete ajou') : L('Télécharger', 'Telechaje')}
                        </button>
                      )}
                      {status !== 'absent' && (
                        <button
                          type="button"
                          className="button button--ghost button--sm"
                          disabled={busy !== null}
                          aria-label={`${L('Supprimer', 'Efase')} : ${label}`}
                          onClick={() => act(p.id, () => removePack(p.id), L('Paquet supprimé.', 'Pake a efase.'))}
                        >
                          {L('Supprimer', 'Efase')}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {retired.length > 0 && (
            <ul className="xp-rows" aria-label={L('Paquets retirés du catalogue', 'Pake ki retire nan katalòg la')}>
              {retired.map((p) => (
                <li key={p.id} className="xp-row xp-offline__row">
                  <span className="xp-row__body">
                    <span className="xp-row__title">{packTitle(p, ht)}</span>
                    <span className="xp-row__meta">{L('N’est plus publié · gardé jusqu’à ce que tu le supprimes', 'Pa pibliye ankò · n ap kenbe l jiskaske ou efase l')} · {formatPackSize(p.sizeBytes)}</span>
                  </span>
                  <span className="xp-row__end">
                    <button type="button" className="button button--ghost button--sm" disabled={busy !== null}
                      aria-label={`${L('Supprimer', 'Efase')} : ${packTitle(p, ht)}`}
                      onClick={() => act(p.id, () => removePack(p.id), L('Paquet supprimé.', 'Pake a efase.'))}>
                      {L('Supprimer', 'Efase')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {stored.length > 0 && (
            <div className="xp-offline__controls">
              {confirmAll ? (
                <>
                  <span className="xp-meta">{L('Supprimer tous les paquets de cet appareil ?', 'Efase tout pake ki sou aparèy sa a?')}</span>
                  <button type="button" className="button button--danger button--sm" disabled={busy !== null}
                    onClick={() => { setConfirmAll(false); act('all', removeAllPacks, L('Tous les paquets sont supprimés.', 'Tout pake yo efase.')); }}>
                    {L('Oui, tout supprimer', 'Wi, efase tout')}
                  </button>
                  <button type="button" className="button button--ghost button--sm" onClick={() => setConfirmAll(false)}>
                    {L('Annuler', 'Anile')}
                  </button>
                </>
              ) : (
                <button type="button" className="button button--ghost button--sm" disabled={busy !== null} onClick={() => setConfirmAll(true)}>
                  {L('Tout supprimer', 'Efase tout')}
                </button>
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
};

export default OfflinePacksPanel;
