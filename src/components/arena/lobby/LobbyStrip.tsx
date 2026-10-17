import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Swords, Share2, Check, LogIn, ChevronRight, Users } from '../../icons';
import PlayerCard from '../../../arena-art/cards/PlayerCard';
import SchoolCrest from '../../../arena-art/crest/SchoolCrest';
import Avatar from '../../../arena-art/avatars/Avatar';
import { schoolColors } from '../../../arena-art/crest/SchoolCrest';
import { inviteRef, schoolInviteMessage, sendInvite, canNativeShare } from '../../../utils/schoolInvite';
import { trackEvent } from '../../../utils/telemetry';
import type { RivalPick } from './rival';
import { TEAM_SIZE } from '../../../../shared/leaderboardAgg';

/**
 * The lobby strip — "Ton école. Ton rival. Ta prochaine victoire."
 *
 * The first thing on /arena. One primary action (Jouer une partie, a real
 * 10-question round that needs no account), the student's identity and real
 * standings, and the rival from rival.ts. A guest gets Play first and a quiet
 * way to sign in; the school/pseudo asks wait until after a game (#8).
 */

export interface LobbySchool {
  name: string;
  /** Place in the school race (useSchoolRace), when the school is on it. */
  place: number | null;
  total: number;
  qualified: boolean;
  needed: number;
}

export const PLAY_TO = '/jeux/trivia';
export const PLAY_STATE = { startCategory: 'mixed' };
export const DUEL_STATE = { duelPick: true };
/** Where "Dans mon école" goes — the same target as the lobby's lane 2. */
export const SCHOOL_TO = '/classement';

export default function LobbyStrip({
  isCreole, signedIn, uid, name, level, totalXp, weeklyRank, weeklyXp, school, rival, leader, onSignIn,
}: {
  isCreole: boolean;
  signedIn: boolean;
  uid: string | null;
  /** Public pseudo, or null when the student has none yet. */
  name: string | null;
  level: number;
  totalXp: number;
  weeklyRank: number | null;
  weeklyXp: number;
  school: LobbySchool | null;
  rival: RivalPick;
  /** The school leading the race, for a guest's context line. */
  leader: { name: string; qualified: boolean; teamXp: number; members: number } | null;
  onSignIn: () => void;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const ref = await inviteRef();
    const msg = schoolInviteMessage(school?.name || null, ref.code, ref.link, isCreole);
    const didCopy = await sendInvite(canNativeShare() ? 'native' : 'whatsapp', msg, 'arena-lobby');
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  const play = (
    <Link to={PLAY_TO} state={PLAY_STATE} className="ah-start lb-play" onClick={() => trackEvent('arena_lobby_play', { signedIn })}>
      <Play size={20} aria-hidden="true" /> {t('Jouer une partie', 'Jwe yon pati')}
    </Link>
  );
  const playMeta = (
    <p className="lb-play__meta">
      {t('10 questions de tous les thèmes', '10 kesyon nan tout tèm')}{signedIn ? '' : t(' · sans compte', ' · san kont')}
    </p>
  );

  /* The two social lanes, one tap from Play (audit W1): on a phone the lane
     cards sit below the city, so the friend challenge and the school race
     get a compact way in right here. Hidden on wider screens, where the
     lanes are already in the first view. */
  const quick = (
    <nav className="lb-quick" aria-label={t('Jouer avec les autres', 'Jwe ak lòt yo')}>
      <Link to={PLAY_TO} state={DUEL_STATE} className="lb-quick__go" onClick={() => trackEvent('duel_entry', { where: 'arena-lobby-quick' })}>
        <Swords size={18} aria-hidden="true" /> {t('Défier un ami', 'Defye yon zanmi')}
      </Link>
      <Link to={SCHOOL_TO} className="lb-quick__go">
        <Users size={18} aria-hidden="true" /> {t('Dans mon école', 'Nan lekòl mwen')}
      </Link>
    </nav>
  );

  /* ── Guest ── */
  if (!signedIn) {
    return (
      <div className="lb lb--guest" aria-label={t('Ton lobby', 'Lobi ou')} role="region">
        <div className="lb-main">
          <div className="lb-playbox">
            {play}
            {playMeta}
          </div>
          {quick}
          <button type="button" className="lb-quiet" onClick={onSignIn}>
            <LogIn size={18} aria-hidden="true" /> {t('Connecte-toi pour représenter ton école', 'Konekte pou reprezante lekòl ou')}
          </button>
        </div>
        {leader && (
          <div className="lb-side">
            <p className="lb-label">{t('En tête de la course', 'An tèt kous la')}</p>
            <div className="lb-school">
              <SchoolCrest name={leader.name} size={44} />
              <div>
                <strong>{leader.name}</strong>
                <span>{leader.qualified ? `${nf(leader.teamXp)} XP ${t('d’équipe', 'ekip')}` : `${Math.min(leader.members, TEAM_SIZE)}/${TEAM_SIZE} ${t('joueurs', 'jwè')}`}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Signed in ── */
  const rivalBox = (() => {
    if (rival.status === 'rival') {
      const r = rival.entry;
      const rName = r.displayName || t('Un élève', 'Yon elèv');
      return (
        <>
          <p className="lb-label">
            {t('Ton rival', 'Rival ou')} · {rival.scope === 'school' ? t('dans ton école', 'nan lekòl ou') : t('au national', 'nan tout peyi a')}
          </p>
          <div className="lb-rival__who">
            <span className="lb-face" aria-hidden="true"><Avatar seed={r.id} size={44} still colors={r.school ? schoolColors(r.school) : undefined} /></span>
            <div>
              <strong>{rName}</strong>
              <span data-testid="rival-gap">
                #{r.rank} · {rival.gap > 0
                  ? t(`${nf(rival.gap)} XP devant toi`, `${nf(rival.gap)} XP devan ou`)
                  : t('à égalité avec toi', 'egalego avè ou')}
              </span>
            </div>
          </div>
          <Link to={PLAY_TO} state={DUEL_STATE} className="ah-ghost lb-defy" onClick={() => trackEvent('duel_entry', { where: 'arena-rival' })}>
            <Swords size={18} aria-hidden="true" /> {t(`Défier ${rName}`, `Defye ${rName}`)}
          </Link>
        </>
      );
    }
    return (
      <>
        <p className="lb-label">{t('Ton rival', 'Rival ou')}</p>
        <p className="lb-rival__none" data-testid="rival-none">
          {rival.status === 'leader'
            ? t('Personne devant toi cette semaine. Tiens ta place.', 'Pèsonn devan ou semèn sa a. Kenbe plas ou.')
            : weeklyRank == null
              ? t('Joue une partie cette semaine : ton rival apparaîtra ici.', 'Jwe yon pati semèn sa a : rival ou ap parèt isit la.')
              : t('Ton rival apparaîtra quand tu seras dans le top 50 de la semaine.', 'Rival ou ap parèt lè w nan top 50 semèn nan.')}
        </p>
        {school ? (
          <button type="button" className="ah-ghost lb-defy" onClick={invite}>
            {copied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
            {copied ? t('Invitation copiée', 'Envitasyon kopye') : t('Inviter un camarade', 'Envite yon kamarad')}
          </button>
        ) : (
          <a href="#ah-team" className="ah-ghost lb-defy">{t('Choisir mon école', 'Chwazi lekòl mwen')} <ChevronRight size={18} aria-hidden="true" /></a>
        )}
      </>
    );
  })();

  return (
    <div className="lb" aria-label={t('Ton lobby', 'Lobi ou')} role="region">
      <div className="lb-main">
        <PlayerCard uid={uid || 'toi'} name={name || t('Toi', 'Ou')} school={school?.name || null} level={level} xp={totalXp} size="lg" />
        <dl className="lb-stats">
          <div>
            <dt>{t('Cette semaine', 'Semèn sa a')}</dt>
            <dd data-testid="weekly-place">
              {weeklyRank != null
                ? <><strong>#{weeklyRank}</strong> {t('au national', 'nan peyi a')} · {nf(weeklyXp)} XP</>
                : t('Pas encore classé', 'Poko klase')}
            </dd>
          </div>
          <div>
            <dt>{t('Ton école', 'Lekòl ou')}</dt>
            <dd data-testid="school-place">
              {school
                ? school.place != null
                  ? <><strong>#{school.place}</strong> {t(`sur ${school.total} écoles`, `sou ${school.total} lekòl`)}{!school.qualified && school.needed > 0
                    ? t(` · encore ${school.needed} joueur${school.needed > 1 ? 's' : ''}`, ` · ankò ${school.needed} jwè`)
                    : ''}</>
                  : t('Pas encore dans la course', 'Poko nan kous la')
                : <a href="#ah-team" className="lb-link">{t('Choisis ton école', 'Chwazi lekòl ou')}</a>}
            </dd>
          </div>
        </dl>
        {!name && <p className="lb-hint"><Link to="/classement" className="lb-link">{t('Choisis un pseudo', 'Chwazi yon psedo')}</Link> {t('pour apparaître au classement.', 'pou parèt nan klasman an.')}</p>}
        <div className="lb-playbox">
          {play}
          {playMeta}
        </div>
        {quick}
      </div>
      <div className="lb-side lb-rival">{rivalBox}</div>
    </div>
  );
}
