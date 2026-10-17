import React, { useEffect, useRef, useState } from 'react';
import { Share2, Download, X } from '../../components/icons';
import { trackEvent } from '../../utils/telemetry';
import { drawResultCard, type ResultCardData } from './resultCard';

/**
 * "Partager" on a result: draws the card, then shows it before anything
 * leaves the device — the student sees exactly what they would post (their
 * pseudo and school only). Native share sends the PNG where the browser can
 * share files (phones); everywhere else the image downloads.
 */
export default function ResultShare({ card, where, className = 'an-ghost' }: { card: ResultCardData; where: string; className?: string }) {
  const t = (fr: string, ht: string) => (card.isCreole ? ht : fr);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setOpen(false); openerRef.current?.focus(); };

  const start = async () => {
    setOpen(true);
    setFailed(false);
    if (blob) return;
    setBusy(true);
    trackEvent('result_share_open', { where });
    const b = await drawResultCard(card).catch(() => null);
    setBusy(false);
    if (!b) { setFailed(true); return; }
    setBlob(b);
    setUrl(URL.createObjectURL(b));
  };

  const fileName = 'edlight-arene-resultat.png';
  const file = blob && typeof File !== 'undefined' ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShareFile = !!file && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    trackEvent('result_share', { where, channel: 'native' });
    try { await navigator.share({ files: [file], text: 'academy.edlight.org/jeux' }); } catch { /* dismissed */ }
  };

  return (
    <>
      <button ref={openerRef} type="button" className={className} onClick={start} aria-haspopup="dialog">
        <Share2 size={16} aria-hidden="true" /> {t('Partager', 'Pataje')}
      </button>
      {open && (
        <div className="mx-share" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="mx-share__sheet" role="dialog" aria-modal="true" aria-labelledby="mx-share-title" tabIndex={-1} ref={dialogRef}>
            <div className="mx-share__head">
              <h2 id="mx-share-title" className="mx-share__title">{t('Ta carte de résultat', 'Kat rezilta ou')}</h2>
              <button type="button" className="mx-close" onClick={close} aria-label={t('Fermer', 'Fèmen')}><X size={18} /></button>
            </div>
            <p className="mx-share__note">{t('Seuls ton pseudo et ton école apparaissent.', 'Se sèlman ti non ou ak lekòl ou ki parèt.')}</p>
            <div className="mx-share__preview">
              {busy && <p role="status">{t('Préparation de l’image…', 'N ap prepare imaj la…')}</p>}
              {failed && <p role="alert">{t('L’image n’a pas pu être créée sur cet appareil.', 'Nou pa t ka kreye imaj la sou aparèy sa a.')}</p>}
              {url && <img src={url} alt={t(`Carte : ${card.score} — ${card.headline}`, `Kat : ${card.score} — ${card.headline}`)} />}
            </div>
            {url && (
              <div className="mx-share__actions">
                {canShareFile && (
                  <button type="button" className="an-go" onClick={share}>
                    <Share2 size={16} aria-hidden="true" /> {t('Partager l’image', 'Pataje imaj la')}
                  </button>
                )}
                <a className={canShareFile ? 'an-ghost' : 'an-go'} href={url} download={fileName}
                  onClick={() => trackEvent('result_share', { where, channel: 'download' })}>
                  <Download size={16} aria-hidden="true" /> {t('Télécharger', 'Telechaje')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
