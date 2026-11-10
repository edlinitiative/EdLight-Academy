import React from 'react';
import { Link } from 'react-router-dom';
import { Swords, Users, Trophy, ChevronRight } from '../../icons';
import SchoolCrest, { schoolColors } from '../../../arena-art/crest/SchoolCrest';
import Avatar from '../../../arena-art/avatars/Avatar';
import { DUEL_ROUND } from '../../../utils/duels';
import { TEAM_SIZE } from '../../../../shared/leaderboardAgg';
import type { OpenArena } from '../../../hooks/useOpenArena';
import { DUEL_SECONDS_PER_QUESTION, DUEL_WIN_XP, type WeeklyEntry } from './rival';
import type { LobbySchool } from './LobbyStrip';

/**
 * The three competition lanes (roadmap #2): Défier un ami · Dans mon école ·
 * Représenter mon école. Each states its format, its time and its reward
 * before entry, from the real config, and shows only real standings.
 * Keys 1–3 (the lobby's handler) open them in this order.
 */

export interface LaneTarget { to: string; state?: Record<string, unknown> }

export default function LobbyLanes({
  isCreole, uid, school, ladder, open, champLine, targets,
}: {
  isCreole: boolean;
  uid: string | null;
  school: LobbySchool | null;
  /** This week's board, restricted to the student's school (board order). */
  ladder: WeeklyEntry[];
  /** undefined while unknown, null when no official event is open. */
  open: OpenArena | null | undefined;
  champLine: string;
  targets: { duel: LaneTarget; school: LaneTarget; champ: LaneTarget };
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
  const duelMinutes = Math.ceil((DUEL_ROUND * DUEL_SECONDS_PER_QUESTION) / 60);
  const top = ladder.slice(0, 3);
  const meIdx = uid ? ladder.findIndex((e) => e.id === uid) : -1;
  const shown = meIdx >= 3 ? [...top, ladder[meIdx]] : top;

  return (
    <section className="lb-lanes" aria-labelledby="lb-lanes-title">
      <div className="container">
        <h2 id="lb-lanes-title" className="lb-lanes__title">{t('Trois façons de gagner', 'Twa fason pou genyen')}</h2>
        <div className="lb-lanes__grid">
          {/* 1 · Défier un ami */}
          <article className="lb-lane lb-lane--duel">
            <h3><Swords size={18} aria-hidden="true" /> {t('Défier un ami', 'Defye yon zanmi')}</h3>
            <p className="lb-lane__text">{t(`${DUEL_ROUND} questions · ${duelMinutes} min · +${DUEL_WIN_XP} XP au gagnant`, `${DUEL_ROUND} kesyon · ${duelMinutes} min · +${DUEL_WIN_XP} XP pou gayan an`)}</p>
            <Link to={targets.duel.to} state={targets.duel.state} className="ah-cta ah-cta--btn lb-lane__go">
              {t('Lancer un défi', 'Lanse yon defi')} <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </article>

          {/* 2 · Dans mon école */}
          <article className="lb-lane lb-lane--school">
            <h3><Users size={18} aria-hidden="true" /> {t('Dans mon école', 'Nan lekòl mwen')}</h3>
            {school ? (
              shown.length > 0 ? (
                <ol className="lb-ladder" aria-label={t(`Cette semaine à ${school.name}`, `Semèn sa a nan ${school.name}`)}>
                  {shown.map((e) => (
                    <li key={e.id} className={e.id === uid ? 'is-me' : ''}>
                      <span className="lb-ladder__n">{ladder.indexOf(e) + 1}</span>
                      <span className="lb-face lb-face--sm" aria-hidden="true"><Avatar seed={e.id} config={(e as { avatar?: string }).avatar} size={28} still colors={schoolColors(school.name)} /></span>
                      <span className="lb-ladder__name">{e.id === uid ? t('Toi', 'Ou') : e.displayName}</span>
                      <span className="lb-ladder__xp">{nf(e.xp)} XP</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="lb-lane__text">{t('Personne n’a encore joué cette semaine.', 'Pèsonn poko jwe semèn sa a.')}</p>
              )
            ) : (
              <p className="lb-lane__text">{t(`Les ${TEAM_SIZE} meilleurs font le score de l’école.`, `${TEAM_SIZE} pi bon yo fè nòt lekòl la.`)}</p>
            )}
            <Link to={targets.school.to} state={targets.school.state} className="ah-cta ah-cta--btn lb-lane__go">
              {t('Le classement', 'Klasman an')} <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </article>

          {/* 3 · Représenter mon école */}
          <article className={`lb-lane lb-lane--champ${open ? ' is-open' : ''}`}>
            <h3><Trophy size={18} aria-hidden="true" /> {t('Représenter mon école', 'Reprezante lekòl mwen')}</h3>
            <p className="lb-lane__text">
              {open ? <><span className="ah-live" aria-hidden="true" />{t('Championnat ouvert', 'Chanpyona ouvè')}{open.schools > 0 ? ` · ${t(`${open.schools} école${open.schools > 1 ? 's' : ''} inscrite${open.schools > 1 ? 's' : ''}`, `${open.schools} lekòl enskri`)}${open.players > 0 ? ` · ${open.players} ${t('joueurs', 'jwè')}` : ''}` : ''}</> : champLine}
            </p>
            {school && (
              <div className="lb-lane__school">
                <SchoolCrest name={school.name} size={36} />
                <span>
                  <strong>{school.name}</strong>
                  {school.place != null
                    ? ` · #${school.place} ${t(`sur ${school.total}`, `sou ${school.total}`)}`
                    : ` · ${t('pas encore dans la course', 'poko nan kous la')}`}
                </span>
              </div>
            )}
            <Link to={targets.champ.to} state={targets.champ.state} className="ah-cta ah-cta--btn lb-lane__go">
              {open?.state === 'doors'
                ? t('Entrer dans la salle', 'Antre nan sal la')
                : open ? t('Inscrire mon école', 'Enskri lekòl mwen') : t('Le championnat', 'Chanpyona a')}
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
