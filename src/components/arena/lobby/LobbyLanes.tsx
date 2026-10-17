import React from 'react';
import { Link } from 'react-router-dom';
import { Swords, Users, Trophy, ChevronRight, Clock, Gift, CalendarCheck } from '../../icons';
import SchoolCrest from '../../../arena-art/crest/SchoolCrest';
import { DUEL_ROUND } from '../../../utils/duels';
import { TEAM_SIZE } from '../../../../shared/leaderboardAgg';
import type { OpenArena } from '../../../hooks/useOpenArena';
import { DUEL_SECONDS_PER_QUESTION, DUEL_TIE_XP, DUEL_TTL_DAYS, DUEL_WIN_XP, type WeeklyEntry } from './rival';
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
  const Key = ({ n }: { n: number }) => <kbd className="ah-key" aria-hidden="true">{n}</kbd>;

  return (
    <section className="lb-lanes" aria-labelledby="lb-lanes-title">
      <div className="container">
        <h2 id="lb-lanes-title" className="lb-lanes__title">{t('Trois façons de gagner', 'Twa fason pou genyen')}</h2>
        <div className="lb-lanes__grid">
          {/* 1 · Défier un ami */}
          <article className="lb-lane lb-lane--duel">
            <p className="lb-lane__over"><Key n={1} /> <Swords size={18} aria-hidden="true" /> {t('1 contre 1', '1 kont 1')}</p>
            <h3>{t('Défier un ami', 'Defye yon zanmi')}</h3>
            <ul className="lb-facts">
              <li><Clock size={16} aria-hidden="true" /> {t(`${DUEL_ROUND} questions, ${DUEL_SECONDS_PER_QUESTION} s chacune · ${duelMinutes} min`, `${DUEL_ROUND} kesyon, ${DUEL_SECONDS_PER_QUESTION} s chak · ${duelMinutes} min`)}</li>
              <li><Gift size={16} aria-hidden="true" /> {t(`Le gagnant prend +${DUEL_WIN_XP} XP · égalité +${DUEL_TIE_XP} chacun`, `Gayan an pran +${DUEL_WIN_XP} XP · egalego +${DUEL_TIE_XP} chak`)}</li>
              <li><CalendarCheck size={16} aria-hidden="true" /> {t(`Ton ami a ${DUEL_TTL_DAYS} jours pour répondre`, `Zanmi ou gen ${DUEL_TTL_DAYS} jou pou reponn`)}</li>
            </ul>
            <p className="lb-lane__text">{t('Tu joues d’abord, puis tu envoies le lien : mêmes questions, un seul essai chacun.', 'Ou jwe anvan, apre w voye lyen an : menm kesyon yo, yon sèl chans chak.')}</p>
            <Link to={targets.duel.to} state={targets.duel.state} className="ah-cta ah-cta--btn lb-lane__go">
              {t('Lancer un défi', 'Lanse yon defi')} <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </article>

          {/* 2 · Dans mon école */}
          <article className="lb-lane lb-lane--school">
            <p className="lb-lane__over"><Key n={2} /> <Users size={18} aria-hidden="true" /> {t('Ton école', 'Lekòl ou')}</p>
            <h3>{t('Dans mon école', 'Nan lekòl mwen')}</h3>
            <ul className="lb-facts">
              <li><Clock size={16} aria-hidden="true" /> {t('Chaque partie compte · remis à zéro le lundi', 'Chak pati konte · rekòmanse chak lendi')}</li>
              <li><Gift size={16} aria-hidden="true" /> {t(`Les ${TEAM_SIZE} meilleurs font le score de l’école`, `${TEAM_SIZE} pi bon yo fè nòt lekòl la`)}</li>
            </ul>
            {school ? (
              shown.length > 0 ? (
                <ol className="lb-ladder" aria-label={t(`Cette semaine à ${school.name}`, `Semèn sa a nan ${school.name}`)}>
                  {shown.map((e) => (
                    <li key={e.id} className={e.id === uid ? 'is-me' : ''}>
                      <span className="lb-ladder__n">{ladder.indexOf(e) + 1}</span>
                      <span className="lb-ladder__name">{e.id === uid ? t('Toi', 'Ou') : e.displayName}</span>
                      <span className="lb-ladder__xp">{nf(e.xp)} XP</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="lb-lane__text">{t(`Personne de ${school.name} n’a encore joué cette semaine. Sois le premier.`, `Pèsonn nan ${school.name} poko jwe semèn sa a. Se ou ki pou premye.`)}</p>
              )
            ) : (
              <p className="lb-lane__text">{t('Choisis ton école pour voir ton classement face à tes camarades.', 'Chwazi lekòl ou pou wè klasman ou devan kamarad ou yo.')}</p>
            )}
            <Link to={targets.school.to} state={targets.school.state} className="ah-cta ah-cta--btn lb-lane__go">
              {t('Le classement', 'Klasman an')} <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </article>

          {/* 3 · Représenter mon école */}
          <article className={`lb-lane lb-lane--champ${open ? ' is-open' : ''}`}>
            <p className="lb-lane__over">
              <Key n={3} /> <Trophy size={18} aria-hidden="true" />
              {open ? <><span className="ah-live" aria-hidden="true" />{t('Championnat ouvert', 'Chanpyona ouvè')}</> : t('National', 'Nasyonal')}
            </p>
            <h3>{t('Représenter mon école', 'Reprezante lekòl mwen')}</h3>
            <ul className="lb-facts">
              <li><CalendarCheck size={16} aria-hidden="true" /> {champLine}</li>
              {open && open.schools > 0 && (
                <li><Users size={16} aria-hidden="true" /> {t(`${open.schools} école${open.schools > 1 ? 's' : ''} inscrite${open.schools > 1 ? 's' : ''}`, `${open.schools} lekòl enskri`)}{open.players > 0 ? ` · ${open.players} ${t('joueurs', 'jwè')}` : ''}</li>
              )}
              <li><Gift size={16} aria-hidden="true" /> {t(`Les ${TEAM_SIZE} meilleurs élèves portent l’école dans la course`, `${TEAM_SIZE} pi bon elèv yo pote lekòl la nan kous la`)}</li>
            </ul>
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
