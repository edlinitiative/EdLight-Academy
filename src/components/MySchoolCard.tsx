/**
 * MySchoolCard — "Ton classement": where the student stands this week, where
 * their school stands in the race, and the invite that moves the second.
 *
 * Ted (2026-10-17): "a student can't really see their leaderboard … in their
 * dashboard or profile they should see their position and their school." So
 * the card now leads with two places — yours (weekly, national) and your
 * school's (the shared best-five race, `useSchoolRace`) — each with the one
 * gap or missing-player count that says what to do next.
 *
 * Earlier note, still true:
 *
 * Ted: "use that information to tell them 'you are the first person from your
 * school' and invite them … everything on the platform becomes a tool to grow
 * users". So the card leads with the one fact that makes inviting rational —
 * where the school stands and who is missing — and puts the invite next to it.
 *
 *   no school yet   → one button that reopens the sign-in school step
 *   alone           → "you are the only one from X here" + invite
 *   with classmates → rank among schools, members, the gap to the school above
 *
 * Every number comes from the same all-time school board the ranking shows
 * (`useCollectives('school','all')`), so the card never disagrees with the
 * list underneath it. While that board is loading nothing is claimed.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Share2, Copy, Check, Plus, ChevronRight, Shield } from './icons';
import SchoolCrest from '../arena-art/crest/SchoolCrest';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useSchoolRace } from '../hooks/useSchoolRace';
import { normalizeName, TEAM_SIZE } from '../../shared/leaderboardAgg';
import { isValidAlias } from '../services/leaderboardService';
import { schoolInviteMessage, inviteRef, sendInvite, canNativeShare } from '../utils/schoolInvite';
import './MySchoolCard.css';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

/** French ordinal: 1re / 2e (HT: 1e / 2e). */
const ord = (n: number, isCreole: boolean) => `${n}${n === 1 && !isCreole ? 're' : 'e'}`;

/**
 * Dev-only fixture for the /profile?preview= harness. When set, the card reads
 * these instead of the live boards (the hooks still run, as hooks must).
 */
export type MySchoolPreview = {
  uid: string;
  profile: any;
  race: any[];
  entries: any[];
  myRank: number | null;
  myEntry: any;
};

export default function MySchoolCard({ where, variant = 'full', solid = false, preview = null, onChangeSchool }: {
  where: string;
  /** 'profile': the compact side card (crest, two lines, "Voir le classement"). */
  variant?: 'full' | 'profile';
  /** Profile on a phone: "Voir le classement" is that screen's one solid button. */
  solid?: boolean;
  preview?: MySchoolPreview | null;
  /** Profile only: opens the school field of the Informations form. */
  onChangeSchool?: () => void;
}) {
  const language = useStore((s) => s.language);
  const storeUser = useStore((s) => s.user);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const trivia = useTrivia();
  const profile = preview ? preview.profile : trivia.profile;
  const profileLoading = preview ? false : trivia.isLoading;
  const user = preview ? { uid: preview.uid } : storeUser;
  const school: string | null = profile?.leaderboard?.school || null;
  const liveRace = useSchoolRace(!!school && !preview);
  const race = preview ? preview.race : liveRace.race;
  const boardLoading = preview ? false : liveRace.isLoading;
  const week = useLeaderboard(50);
  const weekEntries = preview ? preview.entries : week.entries;
  const myRank = preview ? preview.myRank : week.myRank;
  const myEntry = preview ? preview.myEntry : week.myEntry;
  const weekLoading = preview ? false : week.isLoading;

  const [ref, setRef] = useState<{ code: string | null; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    let live = true;
    inviteRef().then((r) => { if (live) setRef(r); });
    return () => { live = false; };
  }, [user?.uid]);

  if (!user?.uid || profileLoading) return null;

  const hasAlias = isValidAlias(profile?.leaderboard?.displayName || '');
  const ahead = myRank && myRank > 1 ? weekEntries[myRank - 2] || null : null;
  const myXp = myEntry?.xp || 0;

  if (variant === 'profile') {
    return (
      <ProfileStanding
        t={t}
        isCreole={isCreole}
        solid={solid}
        school={school}
        race={race}
        boardLoading={boardLoading}
        weekLoading={weekLoading}
        weekEntries={weekEntries}
        uid={user.uid}
        myRank={myRank}
        myXp={myXp}
        hasAlias={hasAlias}
        onAddSchool={() => setSchoolChosen(false)}
        onChangeSchool={onChangeSchool}
        inviteReady={!!ref && !!school}
        onInvite={async () => {
          if (!ref || !school) return;
          const k = normalizeName(school);
          const label = race.find((g) => g.key === k)?.label || school;
          await sendInvite('whatsapp', schoolInviteMessage(label, ref.code, ref.link, isCreole), where);
        }}
      />
    );
  }

  /** You, this week, nationally — or the one step that puts you on the board. */
  const meBlock = (
    <div className="myschool__place">
      <span className="myschool__eyebrow">{t('Toi, cette semaine', 'Ou menm, semèn sa a')}</span>
      {weekLoading ? (
        <p className="myschool__line">{t('Chargement…', 'N ap chaje…')}</p>
      ) : myRank ? (
        <>
          <div className="myschool__big"><strong>#{myRank}</strong><span>{t('au national', 'nan peyi a')}</span></div>
          <p className="myschool__line">
            {ahead
              ? t(`${nf(myXp)} XP · ${nf(Math.max(0, (ahead.xp || 0) - myXp))} XP derrière ${ahead.displayName}`,
                `${nf(myXp)} XP · ${nf(Math.max(0, (ahead.xp || 0) - myXp))} XP dèyè ${ahead.displayName}`)
              : t(`${nf(myXp)} XP · 1ʳᵉ place — garde-la jusqu’à dimanche.`, `${nf(myXp)} XP · premye plas — kenbe l jiska dimanch.`)}
          </p>
        </>
      ) : !hasAlias ? (
        <p className="myschool__line">
          <Link to="/profile#reglages" className="myschool__link">{t('Choisis un pseudo', 'Chwazi yon pseudo')}</Link>
          {t(' pour apparaître au classement.', ' pou parèt nan klasman an.')}
        </p>
      ) : (
        <p className="myschool__line">
          <Link to="/jeux" className="myschool__link">{t('Joue une partie', 'Jwe yon pati')}</Link>
          {t(' cette semaine pour entrer au classement.', ' semèn sa a pou antre nan klasman an.')}
        </p>
      )}
    </div>
  );

  if (!school) {
    return (
      <section className="myschool" aria-label={t('Ton classement', 'Klasman ou')}>
        <div className="myschool__top">
          <h2 className="myschool__heading">{t('Ton classement', 'Klasman ou')}</h2>
          <Link to="/classement" className="myschool__all">{t('Classement', 'Klasman')} <ChevronRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="myschool__places">
          {meBlock}
          <div className="myschool__place">
            <span className="myschool__eyebrow">{t('Ton école', 'Lekòl ou')}</span>
            <p className="myschool__line">
              {t('Ajoute ton école : chaque partie la fait monter dans la course.', 'Ajoute lekòl ou : chak pati fè l monte nan kous la.')}
            </p>
            <button type="button" className="myschool__cta myschool__cta--inline" onClick={() => setSchoolChosen(false)}>
              <Plus size={16} aria-hidden="true" /> {t('Ajouter mon école', 'Ajoute lekòl mwen')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const key = normalizeName(school);
  const mine = race.find((g) => g.key === key) || null;
  const above = mine && mine.place > 1 ? race[mine.place - 2] || null : null;
  // Members counts me when I have an entry; "alone" means nobody ELSE.
  const others = mine ? Math.max(0, mine.members - 1) : 0;
  const alone = !boardLoading && others === 0;

  const message = ref ? schoolInviteMessage(mine?.label || school, ref.code, ref.link, isCreole) : '';
  const invite = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    const didCopy = await sendInvite(channel, message, where);
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  const schoolLine = boardLoading
    ? t('Chargement…', 'N ap chaje…')
    : !mine
      ? t('Ton école entre dans la course dès ta prochaine partie.', 'Lekòl ou antre nan kous la depi pwochen pati ou.')
      : !mine.qualified
        ? t(`${Math.min(mine.members, TEAM_SIZE)}/${TEAM_SIZE} joueurs — il en manque ${mine.needed} pour être classée.`,
          `${Math.min(mine.members, TEAM_SIZE)}/${TEAM_SIZE} jwè — li manke ${mine.needed} pou l kalifye.`)
        : above
          ? t(`${nf(above.teamXp - mine.teamXp)} XP derrière ${above.label}.`, `${nf(above.teamXp - mine.teamXp)} XP dèyè ${above.label}.`)
          : t('En tête de la course — défendez la place.', 'An tèt kous la — defann plas la.');

  return (
    <section className="myschool" aria-label={t('Ton classement', 'Klasman ou')}>
      <div className="myschool__top">
        <h2 className="myschool__heading">{t('Ton classement', 'Klasman ou')}</h2>
        <Link to="/classement" className="myschool__all">{t('Classement', 'Klasman')} <ChevronRight size={14} aria-hidden="true" /></Link>
      </div>

      <div className="myschool__places">
        {meBlock}
        <div className="myschool__place">
          <span className="myschool__eyebrow">{t('Ton école', 'Lekòl ou')}</span>
          {mine ? (
            <div className="myschool__big">
              <strong>{mine.place}<sup>{mine.place === 1 ? t('re', 'e') : t('e', 'e')}</sup></strong>
              <span>{t(`sur ${race.length} écoles`, `sou ${race.length} lekòl`)}</span>
            </div>
          ) : null}
          <p className="myschool__school"><SchoolCrest name={mine?.label || school} size={28} /> <span>{mine?.label || school}</span></p>
          <p className="myschool__line">
            {alone && mine ? t('Tu es le seul élève de ton école ici. Invite ta classe.', 'Se ou sèl elèv lekòl ou isit la. Envite klas ou.') : schoolLine}
          </p>
        </div>
      </div>

      <div className="myschool__actions">
        <button type="button" className="myschool__cta" disabled={!ref} onClick={() => invite('whatsapp')}>
          {t('Inviter sur WhatsApp', 'Envite sou WhatsApp')}
        </button>
        <button
          type="button"
          className="myschool__ghost"
          disabled={!ref}
          onClick={() => invite(canNativeShare() ? 'native' : 'copy')}
          aria-label={canNativeShare() ? t('Partager', 'Pataje') : t('Copier le lien', 'Kopye lyen an')}
        >
          {copied ? <Check size={16} aria-hidden="true" /> : canNativeShare() ? <Share2 size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span>{copied ? t('Copié', 'Kopye') : canNativeShare() ? t('Partager', 'Pataje') : t('Copier', 'Kopye')}</span>
        </button>
      </div>
    </section>
  );
}

/**
 * The profile's "Ton classement" (Stitch 07/08): the school crest, where the
 * school stands in the race, where you stand inside it and nationally this
 * week, and the way to the full board. The weekly-rank figure that used to sit
 * in the profile's stat strip lives here now. Every number comes from the same
 * two boards as the full card; when one is missing the honest state is shown.
 */
function ProfileStanding({
  t, isCreole, solid, school, race, boardLoading, weekLoading, weekEntries, uid, myRank, myXp, hasAlias, onAddSchool, onChangeSchool, inviteReady, onInvite,
}: {
  t: (fr: string, ht: string) => string;
  isCreole: boolean;
  solid: boolean;
  school: string | null;
  race: any[];
  boardLoading: boolean;
  weekLoading: boolean;
  weekEntries: any[];
  uid: string;
  myRank: number | null;
  myXp: number;
  hasAlias: boolean;
  onAddSchool: () => void;
  onChangeSchool?: () => void;
  inviteReady: boolean;
  onInvite: () => void;
}) {
  const key = school ? normalizeName(school) : '';
  const mine = school ? race.find((g) => g.key === key) || null : null;
  const label = mine?.label || school || '';
  const schoolmates = school ? (weekEntries || []).filter((e: any) => e?.school && normalizeName(e.school) === key) : [];
  const inSchoolIdx = schoolmates.findIndex((e: any) => e.id === uid);
  const inSchool = inSchoolIdx >= 0 ? inSchoolIdx + 1 : null;

  const schoolLine = !school ? null
    : boardLoading ? t('Chargement…', 'N ap chaje…')
      : !mine ? t('Ton école entre dans la course dès ta prochaine partie.', 'Lekòl ou antre nan kous la depi pwochen pati ou.')
        : !mine.qualified
          ? t(`Pas encore classée : ${Math.min(mine.members, TEAM_SIZE)}/${TEAM_SIZE} joueurs, il en manque ${mine.needed}.`,
            `Poko klase : ${Math.min(mine.members, TEAM_SIZE)}/${TEAM_SIZE} jwè, li manke ${mine.needed}.`)
          : null;

  const meLine = weekLoading
    ? t('Chargement…', 'N ap chaje…')
    : myRank
      ? [
        inSchool ? t(`${ord(inSchool, false)} de ton école`, `${ord(inSchool, true)} nan lekòl ou`) : null,
        t(`${ord(myRank, false)} au national cette semaine`, `${ord(myRank, true)} nan peyi a semèn sa a`),
        `${nf(myXp)} XP`,
      ].filter(Boolean).join(' · ')
      : null;

  return (
    <section className="myschool myschool--profile" aria-labelledby="myschool-profile-title">
      <div className="myschool__id">
        {school
          ? <SchoolCrest name={label} size={48} />
          : <span className="myschool__shield" aria-hidden="true"><Shield size={24} /></span>}
        <div className="myschool__id-text">
          <h2 id="myschool-profile-title" className="myschool__heading">{t('Ton classement', 'Klasman ou')}</h2>
          <p className="myschool__school-name">{school ? label : t('Pas encore d’école', 'Poko gen lekòl')}</p>
        </div>
      </div>

      <div className="myschool__facts">
        {!school ? (
          <p className="myschool__fact">
            {t('Choisis ton école : chaque partie la fait monter dans la course.', 'Chwazi lekòl ou : chak pati fè l monte nan kous la.')}
          </p>
        ) : schoolLine ? (
          <p className="myschool__fact">{schoolLine}</p>
        ) : (
          <p className="myschool__fact">
            {t('Ton école est ', 'Lekòl ou ')}
            <strong className="myschool__num">{t(`${ord(mine!.place, false)} sur ${race.length}`, `${ord(mine!.place, true)} sou ${race.length}`)}</strong>
            {t(' dans la course des écoles', ' nan kous lekòl yo')}
          </p>
        )}
        <p className="myschool__fact">
          {meLine ? (
            <>{t('Toi : ', 'Ou menm : ')}{meLine}</>
          ) : !hasAlias ? (
            <><Link to="/profile#reglages" className="myschool__link">{t('Choisis un pseudo', 'Chwazi yon pseudo')}</Link>{t(' pour apparaître au classement.', ' pou parèt nan klasman an.')}</>
          ) : (
            <><Link to="/jeux" className="myschool__link">{t('Joue une partie', 'Jwe yon pati')}</Link>{t(' cette semaine pour entrer au classement.', ' semèn sa a pou antre nan klasman an.')}</>
          )}
        </p>
      </div>

      <div className="myschool__profile-actions">
        {!school ? (
          <button type="button" className={`myschool__btn${solid ? ' myschool__btn--solid' : ''}`} onClick={onAddSchool}>
            <Plus size={16} aria-hidden="true" /> {t('Choisir mon école', 'Chwazi lekòl mwen')}
          </button>
        ) : (
          <Link to="/classement" className={`myschool__btn${solid ? ' myschool__btn--solid' : ''}`}>
            {t('Voir le classement', 'Gade klasman an')}
          </Link>
        )}
        {school && (
          <button type="button" className="myschool__textbtn" disabled={!inviteReady} onClick={onInvite}>
            {t('Inviter ta classe sur WhatsApp', 'Envite klas ou sou WhatsApp')}
          </button>
        )}
        {school && onChangeSchool && (
          <button type="button" className="myschool__textbtn" onClick={onChangeSchool}>
            {t('Changer d’école', 'Chanje lekòl')}
          </button>
        )}
      </div>
    </section>
  );
}
