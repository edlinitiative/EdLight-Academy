import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, LogIn, School as SchoolIcon, Users, Copy, Share2, Plus } from '../icons';
import useStore from '../../contexts/store';
import SchoolField from './SchoolField';
import SchoolBuilding from './SchoolBuilding';
import { setMySchool } from '../../services/triviaService';
import { inviteRef, schoolInviteMessage, sendInvite, canNativeShare } from '../../utils/schoolInvite';
import { trackEvent } from '../../utils/telemetry';
import { TEAM_SIZE } from '../../../shared/leaderboardAgg';

/**
 * « Rejoins l'Arène » — the whole way in, on the Arène itself:
 *
 *   1  sign in            (points only count for a signed-in student)
 *   2  pick your school   (the same SchoolField + setMySchool the first-run
 *                          modal uses, inline — no detour through a modal)
 *   3  complete the team  (a school enters the board with five players; the
 *                          seats are the real count, the invite is the same
 *                          message and telemetry as everywhere else)
 *
 * Shown until the team has its five. Every number is read from the board.
 */
export default function ArenaJoin({
  signedIn, uid, school, members, isCreole, onSignIn,
}: {
  signedIn: boolean;
  uid: string | null;
  school: string | null;
  /** Students of this school on the board (all-time). */
  members: number;
  isCreole: boolean;
  onSignIn: () => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const queryClient = useQueryClient();
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const [picked, setPicked] = useState<{ key: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ref, setRef] = useState<{ code: string | null; link: string } | null>(null);

  // Dev-only QA switch (?join=school|team) to see steps 2–3 without an
  // account; compiled out of production builds.
  const preview = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('join') : null;
  if (preview === 'team' && !school) { school = 'Collège Dominique Savio'; members = 2; }
  const step = preview === 'school' ? 2 : preview === 'team' ? 3 : !signedIn ? 1 : (!school || changing) ? 2 : 3;
  const seated = Math.min(members, TEAM_SIZE);
  const missing = Math.max(0, TEAM_SIZE - members);

  useEffect(() => {
    if (step !== 3) return undefined;
    let live = true;
    inviteRef().then((r) => { if (live) setRef(r); });
    return () => { live = false; };
  }, [step]);

  const save = async (chosen: { key: string; label: string; departement?: string | null } | null) => {
    setPicked(chosen);
    if (!chosen || !uid) return;
    setSaving(true);
    try {
      await setMySchool(uid, { school: chosen.label, ...(chosen.departement ? { department: chosen.departement } : {}) });
      queryClient.invalidateQueries({ queryKey: ['trivia-profile', uid] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-collectives'] });
      setSchoolChosen(true);
      setChanging(false);
      trackEvent('school_step_saved', { where: 'arena' });
    } finally {
      setSaving(false);
    }
  };

  const message = school ? schoolInviteMessage(school, ref?.code || null, ref?.link || 'https://academy.edlight.org', isCreole) : '';
  const share = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    const didCopy = await sendInvite(channel, message, 'arena');
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  const steps = [
    { n: 1, label: t('Connecte-toi', 'Konekte'), icon: <LogIn size={18} aria-hidden="true" /> },
    { n: 2, label: t('Choisis ton école', 'Chwazi lekòl ou'), icon: <SchoolIcon size={18} aria-hidden="true" /> },
    { n: 3, label: t(`Forme l’équipe de ${TEAM_SIZE}`, `Fòme ekip ${TEAM_SIZE} la`), icon: <Users size={18} aria-hidden="true" /> },
  ];

  return (
    <section id="ah-team" className="aj" aria-labelledby="aj-title">
      <div className="container">
        <div className="aj-card">
          <header className="aj-head">
            <div>
              <p className="aj-over">{t('Rejoins l’Arène', 'Antre nan Arèn nan')}</p>
              <h2 id="aj-title" className="aj-title">
                {step === 3
                  ? t(`Encore ${missing} pour que ${school} entre au classement`, `Ankò ${missing} pou ${school} antre nan klasman an`)
                  : t('Ton école dans la course, en trois étapes', 'Lekòl ou nan kous la, an twa etap')}
              </h2>
            </div>
            <ol className="aj-steps" aria-label={t('Étapes', 'Etap yo')}>
              {steps.map((s) => (
                <li key={s.n} className={`aj-step${step > s.n ? ' is-done' : ''}${step === s.n ? ' is-now' : ''}`} aria-current={step === s.n ? 'step' : undefined}>
                  <span className="aj-step__n">{step > s.n ? <Check size={16} aria-hidden="true" /> : s.n}</span>
                  <span className="aj-step__label">{s.label}</span>
                </li>
              ))}
            </ol>
          </header>

          {step === 1 && (
            <div className="aj-body aj-body--row">
              <div className="aj-copy">
                <p>{t('Tu peux jouer sans compte. Pour que tes points montent ton école dans la ville, connecte-toi : ça prend dix secondes avec Google.', 'Ou ka jwe san kont. Pou pwen ou fè lekòl ou monte nan vil la, konekte : sa pran dis segonn ak Google.')}</p>
              </div>
              <button type="button" className="aj-go" onClick={onSignIn}>
                <LogIn size={18} aria-hidden="true" /> {t('Se connecter', 'Konekte')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="aj-body aj-body--pick">
              <div className="aj-copy">
                <p>{t('Cherche ton école. Si elle n’y est pas encore, ajoute-la : son bâtiment apparaîtra dans la ville.', 'Chèche lekòl ou. Si l poko la, ajoute l : batiman l ap parèt nan vil la.')}</p>
                {saving && <p className="aj-saving">{t('Enregistrement…', 'N ap anrejistre…')}</p>}
                {changing && school && (
                  <button type="button" className="aj-link" onClick={() => setChanging(false)}>{t(`Garder ${school}`, `Kenbe ${school}`)}</button>
                )}
              </div>
              <div className="aj-field">
                <SchoolField picked={picked} onPick={save} isCreole={isCreole} signedIn={signedIn} variant="onboarding" />
              </div>
            </div>
          )}

          {step === 3 && school && (
            <div className="aj-body aj-body--team">
              <div className="aj-school">
                <SchoolBuilding name={school} cell={5} night />
                <div>
                  <p className="aj-school__label">{t('Ton école', 'Lekòl ou')}</p>
                  <strong>{school}</strong>
                  <button type="button" className="aj-link" onClick={() => setChanging(true)}>{t('Changer d’école', 'Chanje lekòl')}</button>
                </div>
              </div>
              <div className="aj-team">
                <ol className="aj-seats" aria-label={t(`${seated} joueurs sur ${TEAM_SIZE}`, `${seated} jwè sou ${TEAM_SIZE}`)}>
                  {Array.from({ length: TEAM_SIZE }, (_, i) => (
                    <li key={i} className={`aj-seat${i < seated ? ' is-on' : ''}`}>
                      {i < seated ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
                <p className="aj-team__line">
                  {members === 0
                    ? t('Tes points comptent dès ta première partie. Invite tes camarades : il faut cinq élèves pour que l’école soit classée.', 'Pwen ou konte depi premye pati ou. Envite kamarad ou yo : fò gen senk elèv pou lekòl la klase.')
                    : t(`${seated} sur ${TEAM_SIZE} déjà là. Les cinq meilleurs de l’école forment son score.`, `${seated} sou ${TEAM_SIZE} deja la. Senk pi bon nan lekòl la fè nòt li.`)}
                </p>
                <div className="aj-share">
                  <button type="button" className="aj-go" onClick={() => share('whatsapp')}>
                    <Share2 size={18} aria-hidden="true" /> {t('Inviter sur WhatsApp', 'Envite sou WhatsApp')}
                  </button>
                  {canNativeShare() && (
                    <button type="button" className="aj-ghost" onClick={() => share('native')}>
                      <Share2 size={16} aria-hidden="true" /> {t('Partager', 'Pataje')}
                    </button>
                  )}
                  <button type="button" className="aj-ghost" onClick={() => share('copy')}>
                    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? t('Copié', 'Kopye') : t('Copier le lien', 'Kopye lyen an')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
