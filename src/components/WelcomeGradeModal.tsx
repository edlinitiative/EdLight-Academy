/**
 * WelcomeGradeModal (web) — the first minute after signing in.
 *
 * Three short steps, each skippable, each asked once:
 *
 *   1. "Quelle classe ?" — the grade drives adaptive content (gradeProfile /
 *      pickHomeSuggestion). Mirrors the mobile prompt.
 *   2. "Ton école ?" — Ted: "when somebody signs in, by default we should ask
 *      them to populate their school". The list is the same one the school
 *      board and /arena use (94 ESLP-applicant schools + every school students
 *      added); a missing school is added with its name, département, commune.
 *   3. The school, turned into a reason to invite: "you are the first from
 *      Collège X" or "N students from Collège X are already here". The count is
 *      read from the public all-time board — the same entries the school
 *      ranking is built from — and when that read fails the step says nothing
 *      about numbers rather than claiming "first".
 *
 * A learner whose profile already has a school never sees step 2.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap, School as SchoolIcon, Share2, Copy, Check, Trophy } from 'lucide-react';
import useStore from '../contexts/store';
import { GRADES } from '../config/trackConfig';
import SchoolField from './arena/SchoolField';
import { countSchoolmates } from '../services/schoolWebService';
import { loadTriviaProfile, setMySchool } from '../services/triviaService';
import { inviteRef, schoolInviteMessage, sendInvite, canNativeShare } from '../utils/schoolInvite';
import { trackEvent } from '../utils/telemetry';
import './WelcomeGradeModal.css';

type Picked = { key: string; label: string; departement?: string | null };

export default function WelcomeGradeModal() {
  const hydrated = useStore((s) => s.hydrated);
  const authConfirmed = useStore((s) => s.authConfirmed);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const user = useStore((s) => s.user);
  const gradeChosen = useStore((s) => s.gradeChosen);
  const schoolChosen = useStore((s) => s.schoolChosen);
  const language = useStore((s) => s.language);
  const setGrade = useStore((s) => s.setGrade);
  const setGradeChosen = useStore((s) => s.setGradeChosen);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const uid = user?.uid || null;
  const queryClient = useQueryClient();

  // null = not yet known whether the profile already carries a school.
  const [hasSchool, setHasSchool] = useState<boolean | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  // The invite step, once a school is saved: how many classmates are here.
  const [invite, setInvite] = useState<{ school: string; mates: number | null } | null>(null);
  const [ref, setRef] = useState<{ code: string | null; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const ready = hydrated && authConfirmed && isAuthenticated && !!uid;

  // QA: ?welcome=school or ?welcome=invite opens that step for an account
  // that would never see it (one that already has a school), so the screens
  // can be checked on the live site. It only opens the step; nothing is saved
  // unless the viewer saves their own school.
  const [preview, setPreview] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('welcome');
  });
  useEffect(() => {
    if (preview === 'invite' && !invite) setInvite({ school: 'Collège Dominique Savio', mates: 0 });
  }, [preview, invite]);

  // Only once the grade is settled and the school step is due: does this
  // account already have a school? If so the step is simply marked done.
  useEffect(() => {
    if (!ready || !gradeChosen || schoolChosen || hasSchool !== null) return;
    let live = true;
    loadTriviaProfile(uid)
      .then((p) => {
        if (!live) return;
        const has = !!p?.leaderboard?.school;
        setHasSchool(has);
        if (has) setSchoolChosen(true);
      })
      .catch(() => { if (live) setHasSchool(false); });
    return () => { live = false; };
  }, [ready, gradeChosen, schoolChosen, hasSchool, uid, setSchoolChosen]);

  const step: 'grade' | 'school' | 'invite' | null = !ready
    ? null
    : invite
      ? 'invite'
      : !gradeChosen
        ? 'grade'
        : (!schoolChosen && hasSchool === false) || preview === 'school'
          ? 'school'
          : null;

  const visible = step !== null;

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [visible]);

  // The referral link is fetched only when the invite step is on screen.
  useEffect(() => {
    if (step !== 'invite' || ref) return;
    let live = true;
    inviteRef().then((r) => { if (live) setRef(r); });
    return () => { live = false; };
  }, [step, ref]);

  const skip = () => {
    if (step === 'grade') setGradeChosen(true);
    else if (step === 'school') { setSchoolChosen(true); setPreview(null); trackEvent('school_step_skipped'); }
    else if (step === 'invite') { setInvite(null); setPreview(null); }
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!visible) return null;

  const chooseGrade = (code: string) => {
    setGrade(code);
    setGradeChosen(true);
  };

  const saveSchool = async () => {
    if (!picked || !uid) return;
    setSaving(true);
    await setMySchool(uid, { school: picked.label, ...(picked.departement ? { department: picked.departement } : {}) });
    const mates = await countSchoolmates(picked.label, uid);
    // The school card on Home and /arena reads these — refresh them now.
    queryClient.invalidateQueries({ queryKey: ['trivia-profile', uid] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard-collectives'] });
    setSaving(false);
    setSchoolChosen(true);
    setPreview(null);
    setInvite({ school: picked.label, mates });
    trackEvent('school_step_saved', { mates: mates ?? -1 });
  };

  const message = invite && ref ? schoolInviteMessage(invite.school, ref.code, ref.link, isCreole) : '';
  const share = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    const didCopy = await sendInvite(channel, message, 'signup');
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  const title = step === 'grade'
    ? t('Tu es en quelle classe ?', 'Ki klas ou ye ?')
    : step === 'school'
      ? t('Tu vas à quelle école ?', 'Ki lekòl ou ale ?')
      : invite?.mates === 0
        ? t(`Tu es le premier élève de ${invite.school} ici !`, `Se ou premye elèv ${invite.school} isit la !`)
        : invite?.mates
          ? t(
            `${invite.mates} élève${invite.mates === 1 ? '' : 's'} de ${invite.school} ${invite.mates === 1 ? 'est' : 'sont'} déjà là`,
            `${invite.mates} elèv ${invite.school} deja la`,
          )
          : t('Ton école est enregistrée', 'Lekòl ou anrejistre');

  return createPortal(
    <div className="grade-modal" role="dialog" aria-modal="true" aria-label={title} onClick={skip}>
      <div className="grade-modal__panel" onClick={(e) => e.stopPropagation()}>
        {step !== 'invite' && (
          <ol className="grade-modal__steps" aria-hidden="true">
            <li data-on={step === 'grade' || undefined} />
            <li data-on={step === 'school' || undefined} />
          </ol>
        )}

        <span className={`grade-modal__icon${step === 'invite' ? ' grade-modal__icon--win' : ''}`}>
          {step === 'grade' ? <GraduationCap size={30} /> : step === 'school' ? <SchoolIcon size={28} /> : <Trophy size={28} />}
        </span>

        <h2 className="grade-modal__title">{title}</h2>

        {step === 'grade' && (
          <>
            <p className="grade-modal__subtitle">{t('Pour te proposer le bon contenu.', 'Pou n ba w bon kontni an.')}</p>
            <div className="grade-modal__grid">
              {GRADES.map((g) => (
                <button
                  key={g.code}
                  type="button"
                  className="grade-modal__chip"
                  onClick={() => chooseGrade(g.code)}
                  aria-label={isCreole ? g.labelHt : g.label}
                >
                  {isCreole ? g.labelHt : g.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'school' && (
          <>
            <p className="grade-modal__subtitle">
              {t(
                'Chaque partie, quiz et examen fait monter ton école au classement des écoles.',
                'Chak pati, quiz ak egzamen fè lekòl ou monte nan klasman lekòl yo.',
              )}
            </p>
            <div className="grade-modal__school">
              <SchoolField
                picked={picked}
                onPick={setPicked}
                isCreole={isCreole}
                signedIn
                variant="onboarding"
                autoFocus
              />
            </div>
            <button
              type="button"
              className="grade-modal__primary"
              disabled={!picked || saving}
              onClick={saveSchool}
            >
              {saving ? t('Enregistrement…', 'N ap anrejistre…') : t('Continuer', 'Kontinye')}
            </button>
          </>
        )}

        {step === 'invite' && invite && (
          <>
            <p className="grade-modal__subtitle">
              {invite.mates === 0
                ? t(
                  `Invite tes camarades : plus vous êtes nombreux, plus ${invite.school} monte au classement des écoles et à l’Arène.`,
                  `Envite kanmarad ou yo : plis nou anpil, plis ${invite.school} monte nan klasman lekòl yo ak nan Arèn nan.`,
                )
                : t(
                  `Invite ta classe pour faire monter ${invite.school} au classement des écoles.`,
                  `Envite klas ou pou fè ${invite.school} monte nan klasman lekòl yo.`,
                )}
            </p>
            <div className="grade-modal__share">
              <button type="button" className="grade-modal__primary" disabled={!ref} onClick={() => share('whatsapp')}>
                {t('Inviter sur WhatsApp', 'Envite sou WhatsApp')}
              </button>
              <button
                type="button"
                className="grade-modal__secondary"
                disabled={!ref}
                onClick={() => share(canNativeShare() ? 'native' : 'copy')}
              >
                {copied
                  ? <><Check size={16} aria-hidden="true" /> {t('Lien copié', 'Lyen kopye')}</>
                  : canNativeShare()
                    ? <><Share2 size={16} aria-hidden="true" /> {t('Partager', 'Pataje')}</>
                    : <><Copy size={16} aria-hidden="true" /> {t('Copier le lien', 'Kopye lyen an')}</>}
              </button>
            </div>
          </>
        )}

        <button type="button" className="grade-modal__skip" onClick={skip}>
          {step === 'invite' ? t('Plus tard', 'Pita') : t('Passer', 'Sote')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
