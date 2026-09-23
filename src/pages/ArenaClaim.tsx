import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trophy, Upload, CheckCircle2, Clock, FileText, AlertTriangle } from '../components/icons';
import useStore from '../contexts/store';
import {
  CONSENT_ACCEPT,
  CONSENT_MAX_BYTES,
  ClaimError,
  submitClaim,
  uploadConsentForm,
  watchMyClaim,
  type MyClaim,
} from '../services/arenaClaimService';

/**
 * Where a winner claims their prize.
 *
 * The page is built around one fact that everything else follows from: the
 * deadline was published BEFORE the tournament, and a prize that is not claimed
 * inside it rolls down to the next finisher. That is only defensible if the
 * person it applies to can see it, in plain language, from the first second
 * they land here — so the deadline is the first thing on the page, stated as a
 * date and a countdown, not as small print under a form.
 *
 * Two shapes, decided by one question. An adult gives a contact and waits for
 * the call. A minor's family has a second step: a parent signs the
 * authorisation and the file is uploaded here. The second step is shown as a
 * step, with its own state, because a family that thinks they are finished when
 * they are not is a family that finds out at the deadline.
 *
 * NOTHING ON THIS PAGE ASKS FOR AN IDENTITY DOCUMENT. `FORBIDDEN_CLAIM_FIELDS`
 * on the server rejects those fields at the door; this page says out loud that
 * we never ask, which is the half of that protection a family can actually use.
 */

const money = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function useCountdown(target: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [target]);
  const left = Math.max(0, target - now);
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)} j ${hours % 24} h`;
  const mins = Math.floor((left % 3_600_000) / 60_000);
  return `${hours} h ${mins} min`;
}

export default function ArenaClaim() {
  const [params] = useSearchParams();
  const tid = params.get('tid') || '';
  const isCreole = useStore((s) => s.language) === 'ht';
  const user = useStore((s) => s.user);
  const t = useCallback((fr: string, ht: string) => (isCreole ? ht : fr), [isCreole]);

  const [claim, setClaim] = useState<MyClaim | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [contact, setContact] = useState('');
  const [isMinor, setIsMinor] = useState<boolean | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!tid || !user) { setLoaded(true); return undefined; }
    return watchMyClaim(tid, (c) => { setClaim(c); setLoaded(true); }, () => setLoaded(true));
  }, [tid, user]);

  // Pre-fill from the claim itself, so a family coming back to upload the form
  // is not asked to retype what they already told us.
  useEffect(() => {
    if (!claim) return;
    if (claim.contact) setContact((v) => v || claim.contact!);
    if (claim.isMinor !== null) setIsMinor((v) => (v === null ? claim.isMinor : v));
    if (claim.guardian) {
      setGuardianName((v) => v || claim.guardian!.name);
      setGuardianContact((v) => v || claim.guardian!.contact);
      setGuardianRelation((v) => v || claim.guardian!.relationship || '');
    }
  }, [claim]);

  const countdown = useCountdown(claim?.expiresAt || 0);
  const expired = !!claim && claim.expiresAt > 0 && Date.now() >= claim.expiresAt;
  const submitted = !!claim && claim.state !== 'open';
  const needsConsent = !!claim && claim.isMinor === true && !claim.consent;

  const deadlineText = useMemo(() => {
    if (!claim?.expiresAt) return '';
    try {
      return new Intl.DateTimeFormat(isCreole ? 'fr-HT' : 'fr-FR', {
        dateStyle: 'full', timeStyle: 'short',
      }).format(new Date(claim.expiresAt));
    } catch {
      return '';
    }
  }, [claim?.expiresAt, isCreole]);

  const errorText = useCallback((err: unknown): string => {
    const code = (err as ClaimError)?.code || '';
    const map: Record<string, [string, string]> = {
      not_a_winner: ['Ce compte n’a pas gagné de prix dans ce tournoi.', 'Kont sa a pa genyen okenn pri nan tounwa sa a.'],
      claim_expired: ['Le délai est passé. Le prix revient au concurrent suivant.', 'Delè a pase. Pri a pase bay moun ki vin apre a.'],
      claim_rejected: ['Cette réclamation a été refusée après vérification.', 'Yo refize reklamasyon sa a apre verifikasyon.'],
      wrong_state: ['Les réclamations ne sont pas ouvertes pour ce tournoi.', 'Reklamasyon yo pa louvri pou tounwa sa a.'],
      invalid_contact: ['Ce numéro ou cet email n’est pas valide.', 'Nimewo sa a oswa imel sa a pa bon.'],
      guardian_required: ['Il faut le nom et le contact d’un parent ou tuteur.', 'Fòk gen non ak kontak yon paran oswa yon responsab.'],
      invalid_guardian: ['Le nom ou le contact du parent n’est pas valide.', 'Non oswa kontak paran an pa bon.'],
      forbidden_field: ['Nous ne collectons aucune pièce d’identité.', 'Nou pa kolekte okenn kat idantite.'],
      unsupported_type: ['Format non accepté : PDF ou photo (JPG, PNG).', 'Fòma sa a pa aksepte : PDF oswa foto (JPG, PNG).'],
      file_too_large: ['Fichier trop lourd (8 Mo maximum).', 'Fichye a twò lou (8 Mo maksimòm).'],
      file_empty: ['Le fichier est vide.', 'Fichye a vid.'],
      upload_failed: ['L’envoi a échoué. Réessayez.', 'Voye a pa mache. Eseye ankò.'],
      consent_file_missing: ['Le fichier n’est pas arrivé. Réessayez.', 'Fichye a pa rive. Eseye ankò.'],
      storage_not_configured: ['Le dépôt de fichiers n’est pas encore activé. Écrivez-nous.', 'Depo fichye a poko aktive. Ekri nou.'],
      not_signed_in: ['Connectez-vous pour continuer.', 'Konekte pou ou kontinye.'],
    };
    const pair = map[code];
    return pair ? t(pair[0], pair[1]) : (err as Error)?.message || String(err);
  }, [t]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMinor === null) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await submitClaim(tid, {
        contact: contact.trim(),
        isMinor,
        guardian: isMinor
          ? { name: guardianName.trim(), contact: guardianContact.trim(), relationship: guardianRelation.trim() }
          : null,
        lang: isCreole ? 'ht' : 'fr',
      });
      setNote({
        type: 'success',
        text: result.consentRequired
          ? (result.consentEmail?.sent
            ? t(
                'Réclamation enregistrée. Le formulaire d’autorisation vient d’être envoyé par email.',
                'Reklamasyon an anrejistre. Nou fèk voye fòm otorizasyon an nan imel.',
              )
            : t(
                'Réclamation enregistrée. L’email n’est pas parti — ouvrez le formulaire ci-dessous directement.',
                'Reklamasyon an anrejistre. Imel la pa pati — louvri fòm nan anba a dirèkteman.',
              ))
          : t(
              'Réclamation enregistrée. Nous vous appellerons pour vérifier.',
              'Reklamasyon an anrejistre. N ap rele w pou verifye.',
            ),
      });
    } catch (err) {
      setNote({ type: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setNote(null);
    try {
      await uploadConsentForm(tid, file);
      setNote({
        type: 'success',
        text: t(
          'Formulaire reçu. Nous vous appellerons pour finir la vérification.',
          'Nou resevwa fòm nan. N ap rele w pou fini verifikasyon an.',
        ),
      });
    } catch (err) {
      setNote({ type: 'error', text: errorText(err) });
    } finally {
      setUploading(false);
    }
  };

  // ── Gates ─────────────────────────────────────────────────────────────────

  if (!tid) {
    return <Shell><p>{t('Lien incomplet.', 'Lyen an pa konplè.')}</p></Shell>;
  }
  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{t('Réclamer votre prix', 'Reklame pri ou')}</h1>
        <p style={{ color: '#5B6572' }}>
          {t(
            'Connectez-vous avec le compte qui a joué le tournoi. C’est celui-là qui a gagné, pas une adresse email.',
            'Konekte ak kont ki te jwe tounwa a. Se li ki genyen, pa yon adrès imel.',
          )}
        </p>
        <Link className="btn btn--primary" to="/login">{t('Se connecter', 'Konekte')}</Link>
      </Shell>
    );
  }
  if (!loaded) {
    return <Shell><p>{t('Chargement…', 'Ap chaje…')}</p></Shell>;
  }
  if (!claim) {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>{t('Aucun prix à réclamer', 'Pa gen pri pou reklame')}</h1>
        <p style={{ color: '#5B6572' }}>
          {t(
            'Ce compte n’a pas de prix en attente pour ce tournoi. Si vous pensez que c’est une erreur, écrivez-nous.',
            'Kont sa a pa gen okenn pri k ap tann pou tounwa sa a. Si ou panse se yon erè, ekri nou.',
          )}
        </p>
      </Shell>
    );
  }

  // ── The page ──────────────────────────────────────────────────────────────

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Trophy size={20} aria-hidden="true" />
        <h1 style={{ fontSize: 22, margin: 0 }}>
          {t(`${claim.rank}e place — ${money(claim.prizeCents)}`, `Plas nimewo ${claim.rank} — ${money(claim.prizeCents)}`)}
        </h1>
      </div>
      {claim.rolledDownFrom ? (
        <p style={{ fontSize: 13, color: '#5B6572', margin: '0 0 16px' }}>
          {t(
            'Ce prix vous revient parce qu’il n’a pas été réclamé à temps par le gagnant précédent.',
            'Pri sa a rive jwenn ou paske moun ki te genyen l anvan an pa t reklame l atan.',
          )}
        </p>
      ) : null}

      {/* The deadline, first, because it is the rule the whole page rests on. */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 16px',
        borderRadius: 12, background: expired ? '#FEF3F2' : '#F0F6FF', marginBottom: 22,
      }}>
        <Clock size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {expired
            ? t(
                'Le délai de 72 heures est passé. Le prix revient au concurrent suivant — la règle a été annoncée avant le tournoi.',
                'Delè 72 èdtan an pase. Pri a pase bay moun ki vin apre a — nou te anonse règ la anvan tounwa a.',
              )
            : t(
                `Il vous reste ${countdown} — jusqu’au ${deadlineText}. Passé ce délai, le prix revient au concurrent suivant.`,
                `Ou rete ${countdown} — jiska ${deadlineText}. Apre delè sa a, pri a pase bay moun ki vin apre a.`,
              )}
        </p>
      </div>

      {note ? (
        <p style={{
          padding: '12px 14px', borderRadius: 10, fontSize: 14, marginBottom: 20,
          background: note.type === 'error' ? '#FEF3F2' : '#ECFDF3',
          color: note.type === 'error' ? '#B42318' : '#067647',
        }}>{note.text}</p>
      ) : null}

      {claim.state === 'rejected' ? (
        <p style={{ fontSize: 14 }}>
          {t('Cette réclamation a été refusée après vérification.', 'Yo refize reklamasyon sa a apre verifikasyon.')}
          {claim.reviewNote ? ` ${claim.reviewNote}` : ''}
        </p>
      ) : claim.state === 'verified' ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 2, color: '#067647' }} />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            {t(
              'Vérifié. Nous vous contactons pour le versement.',
              'Verifye. N ap kontakte w pou peman an.',
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Step 1 — who you are and how to reach you. */}
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16, marginBottom: 28 }}>
            <Step n={1} done={submitted} label={t('Vos coordonnées', 'Kontak ou')} />

            <Labelled label={t('Téléphone ou email', 'Telefòn oswa imel')}>
              <input
                className="input"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+509 …"
                disabled={expired}
                style={inputStyle}
              />
            </Labelled>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {t('Avez-vous 18 ans ou plus ?', 'Èske ou gen 18 an oswa plis ?')}
              </legend>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  [false, t('Oui, j’ai 18 ans ou plus', 'Wi, mwen gen 18 an oswa plis')],
                  [true, t('Non, j’ai moins de 18 ans', 'Non, mwen poko gen 18 an')],
                ].map(([minor, label]) => (
                  <label key={String(minor)} style={{
                    display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px',
                    borderRadius: 10, fontSize: 13, cursor: expired ? 'default' : 'pointer',
                    border: `1px solid ${isMinor === minor ? '#1B6FE0' : '#d9dde3'}`,
                  }}>
                    <input
                      type="radio" name="minor" checked={isMinor === minor} disabled={expired}
                      onChange={() => setIsMinor(minor as boolean)}
                    />
                    {label as string}
                  </label>
                ))}
              </div>
            </fieldset>

            {isMinor === true ? (
              <div style={{ display: 'grid', gap: 12, padding: 16, borderRadius: 12, background: '#F7F8FA' }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#5B6572' }}>
                  {t(
                    'Le prix est remis à un parent ou tuteur. Donnez son nom et son contact : il recevra le formulaire d’autorisation par email.',
                    'Se yon paran oswa yon responsab ki resevwa pri a. Bay non l ak kontak li : l ap resevwa fòm otorizasyon an nan imel.',
                  )}
                </p>
                <Labelled label={t('Nom du parent ou tuteur', 'Non paran an oswa responsab la')}>
                  <input className="input" style={inputStyle} value={guardianName} disabled={expired}
                    onChange={(e) => setGuardianName(e.target.value)} />
                </Labelled>
                <Labelled label={t('Son email (ou téléphone)', 'Imel li (oswa telefòn)')}>
                  <input className="input" style={inputStyle} value={guardianContact} disabled={expired}
                    onChange={(e) => setGuardianContact(e.target.value)} />
                </Labelled>
                <Labelled label={t('Lien avec vous (facultatif)', 'Relasyon ak ou (si ou vle)')}>
                  <input className="input" style={inputStyle} value={guardianRelation} disabled={expired}
                    onChange={(e) => setGuardianRelation(e.target.value)}
                    placeholder={t('mère, oncle, directrice…', 'manman, tonton, direktris…')} />
                </Labelled>
              </div>
            ) : null}

            <div>
              <button type="submit" className="btn btn--primary" disabled={busy || expired || isMinor === null}>
                {busy
                  ? t('Envoi…', 'Ap voye…')
                  : submitted
                    ? t('Mettre à jour', 'Mete ajou')
                    : t('Envoyer', 'Voye')}
              </button>
            </div>
          </form>

          {/* Step 2 — the signed authorisation, for a minor only. */}
          {claim.isMinor === true || isMinor === true ? (
            <div style={{ display: 'grid', gap: 14, paddingTop: 22, borderTop: '1px solid #e7eaee' }}>
              <Step n={2} done={!!claim.consent} label={t('L’autorisation signée', 'Otorizasyon ki siyen an')} />

              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                {t(
                  'Ouvrez le formulaire, faites-le signer par le parent ou tuteur, puis déposez la photo ou le PDF ici.',
                  'Louvri fòm nan, fè paran an oswa responsab la siyen l, apre sa depoze foto a oswa PDF la isit la.',
                )}
              </p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link
                  className="btn"
                  to={`/arena/autorisation?tid=${encodeURIComponent(tid)}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <FileText size={15} aria-hidden="true" />
                  {t('Ouvrir le formulaire', 'Louvri fòm nan')}
                </Link>

                <label
                  className="btn btn--primary"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    cursor: uploading || expired || !submitted ? 'default' : 'pointer',
                    opacity: uploading || expired || !submitted ? 0.6 : 1,
                  }}
                >
                  <Upload size={15} aria-hidden="true" />
                  {uploading
                    ? t('Envoi…', 'Ap voye…')
                    : claim.consent
                      ? t('Remplacer le formulaire', 'Ranplase fòm nan')
                      : t('Déposer le formulaire signé', 'Depoze fòm ki siyen an')}
                  <input
                    type="file"
                    accept={CONSENT_ACCEPT}
                    hidden
                    disabled={uploading || expired || !submitted}
                    onChange={(e) => { void onUpload(e.target.files?.[0]); e.target.value = ''; }}
                  />
                </label>
              </div>

              {!submitted ? (
                <p style={{ margin: 0, fontSize: 13, color: '#5B6572' }}>
                  {t(
                    'Envoyez d’abord vos coordonnées ci-dessus.',
                    'Voye kontak ou anwo a anvan.',
                  )}
                </p>
              ) : null}

              {claim.consent ? (
                <p style={{ margin: 0, fontSize: 13, color: '#067647', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  {t('Formulaire reçu.', 'Nou resevwa fòm nan.')}
                </p>
              ) : needsConsent ? (
                <p style={{ margin: 0, fontSize: 13, color: '#B54708', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={15} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
                  {t(
                    'Tant que ce formulaire n’est pas déposé, la réclamation n’est pas complète.',
                    'Toutotan fòm sa a pa depoze, reklamasyon an poko konplè.',
                  )}
                </p>
              ) : null}

              <p style={{ margin: 0, fontSize: 12, color: '#5B6572' }}>
                {t(
                  `PDF ou photo, ${Math.round(CONSENT_MAX_BYTES / 1024 / 1024)} Mo maximum.`,
                  `PDF oswa foto, ${Math.round(CONSENT_MAX_BYTES / 1024 / 1024)} Mo maksimòm.`,
                )}
              </p>
            </div>
          ) : null}
        </>
      )}

      <p style={{
        marginTop: 32, padding: '12px 14px', borderRadius: 10, background: '#FFF6E8',
        fontSize: 13, lineHeight: 1.6,
      }}>
        {t(
          'Nous ne vous demanderons jamais une photo de pièce d’identité, un numéro de document, des informations bancaires, ni un paiement. Si un message vous demande cela en notre nom, il ne vient pas de nous.',
          'Nou p ap janm mande ou yon foto kat idantite, yon nimewo dokiman, enfòmasyon labank, ni yon peman. Si yon mesaj mande ou sa nan non nou, li pa soti nan men nou.',
        )}
      </p>
    </Shell>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #d9dde3', fontSize: 14, background: '#fff',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page" style={{ maxWidth: 620, margin: '0 auto', padding: '32px 20px 64px' }}>
      {children}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
      {label}
      <div style={{ marginTop: 5, fontWeight: 400 }}>{children}</div>
    </label>
  );
}

function Step({ n, done, label }: { n: number; done: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 700, flex: 'none',
        background: done ? '#067647' : '#1B6FE0', color: '#fff',
      }}>{done ? '✓' : n}</span>
      <strong style={{ fontSize: 14 }}>{label}</strong>
    </div>
  );
}
