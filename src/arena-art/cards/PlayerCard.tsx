import React from 'react';
import Avatar from '../avatars/Avatar';
import SchoolCrest, { schoolColors } from '../crest/SchoolCrest';
import RankEmblem, { emblemForLevel } from '../emblems/RankEmblem';
import useStore from '../../contexts/store';
import './cards.css';

/**
 * One reusable player card — avatar, pseudo, school crest and name, rank
 * emblem with tier and level, optional weekly place and earned title.
 * Public identity only: it renders the pseudo it is given and never an
 * email, real name or account detail.
 *
 *   lg — a vertical collectible, the school's colours as a matte band
 *   md — horizontal, for match introductions and profiles
 *   sm — a compact row, for lists and boards
 *
 * Every visual (crest, emblem) is repeated in text, so nothing depends on
 * reading a colour or a silhouette.
 */
export interface PlayerCardProps {
  uid: string;
  name: string;
  school?: string | null;
  level?: number;
  xp?: number;
  /** Weekly national place, when real. */
  rank?: number | null;
  /** An earned title, when real. */
  title?: string | null;
  size?: 'sm' | 'md' | 'lg';
  mood?: 'idle' | 'ready' | 'focused' | 'celebrating' | 'recovering';
  className?: string;
  /** The student's chosen avatar (wire string); absent → the seeded face. */
  avatar?: string | null;
}

type CardVars = React.CSSProperties & Record<'--pc-primary' | '--pc-secondary', string>;

export default function PlayerCard({
  uid, name, school, level = 1, xp, rank, title, size = 'md', mood = 'idle', className = '', avatar = null,
}: PlayerCardProps) {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const lvl = Math.max(1, Math.floor(level || 1));
  const tier = emblemForLevel(lvl);
  const tierName = isCreole ? tier.nameHt : tier.nameFr;
  const schoolName = (school || '').trim();
  const colors = schoolColors(schoolName);
  const pseudo = (name || '').trim() || t('Joueur', 'Jwè');
  const place = typeof rank === 'number' && rank > 0 ? Math.floor(rank) : null;
  const earned = (title || '').trim() || null;
  const levelText = `${t('Niv.', 'Nivo')} ${lvl}`;
  const xpText = typeof xp === 'number' && xp > 0 ? `${Math.round(xp).toLocaleString('fr-FR')} XP` : null;
  const placeText = t('cette semaine', 'semèn sa a');

  const summary = [
    pseudo,
    schoolName || null,
    `${tierName}, ${t('niveau', 'nivo')} ${lvl}`,
    place ? `${place}${t('e', 'yèm')} ${placeText}` : null,
    earned,
  ].filter(Boolean).join(' · ');

  const vars: CardVars = { '--pc-primary': colors.primary, '--pc-secondary': colors.secondary };
  const cls = `pcard pcard--${size} ${className}`.trim();

  if (size === 'sm') {
    return (
      <div className={cls} data-tier={tier.id} style={vars} aria-label={summary} role="group">
        <Avatar seed={uid || pseudo} config={avatar} mood={mood} size={36} colors={colors} still />
        <div className="pcard-main">
          <span className="pcard-name">{pseudo}</span>
          {schoolName && (
            <span className="pcard-school">
              <SchoolCrest name={schoolName} size={16} />
              <span className="pcard-school-name">{schoolName}</span>
            </span>
          )}
        </div>
        <span className="pcard-rankchip">
          <RankEmblem level={lvl} size={22} />
          <span className="pcard-level">{lvl}</span>
        </span>
        {place && <span className="pcard-place pcard-place--sm">#{place}</span>}
      </div>
    );
  }

  if (size === 'md') {
    return (
      <article className={cls} data-tier={tier.id} style={vars} aria-label={summary}>
        <div className="pcard-portrait">
          <Avatar seed={uid || pseudo} config={avatar} mood={mood} size={72} colors={colors} />
          {schoolName && <span className="pcard-portrait-crest"><SchoolCrest name={schoolName} size={30} /></span>}
        </div>
        <div className="pcard-main">
          <span className="pcard-name">{pseudo}</span>
          {earned && <span className="pcard-title">{earned}</span>}
          {schoolName && <span className="pcard-school"><span className="pcard-school-name">{schoolName}</span></span>}
          <span className="pcard-tier">
            <RankEmblem level={lvl} size={24} />
            <span>{tierName} · {levelText}</span>
          </span>
        </div>
        {place && (
          <div className="pcard-place">
            <span className="pcard-place-n">#{place}</span>
            <span className="pcard-place-l">{placeText}</span>
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={cls} data-tier={tier.id} style={vars} aria-label={summary}>
      <div className="pcard-band">
        <span className="pcard-band-weave" aria-hidden="true" />
        {schoolName && <span className="pcard-band-crest"><SchoolCrest name={schoolName} size={44} /></span>}
        {place && (
          <span className="pcard-band-place">#{place}<span className="pcard-band-place-l">{placeText}</span></span>
        )}
        <span className="pcard-avatar"><Avatar seed={uid || pseudo} config={avatar} mood={mood} size={104} colors={colors} /></span>
      </div>
      <div className="pcard-body">
        <span className="pcard-name">{pseudo}</span>
        {earned && <span className="pcard-title">{earned}</span>}
        {schoolName && (
          <span className="pcard-school">
            <SchoolCrest name={schoolName} size={20} />
            <span className="pcard-school-name">{schoolName}</span>
          </span>
        )}
        <div className="pcard-foot">
          <span className="pcard-tier">
            <RankEmblem level={lvl} size={44} />
            <span className="pcard-tier-text">
              <span className="pcard-tier-name">{tierName}</span>
              <span className="pcard-tier-level">{levelText}</span>
            </span>
          </span>
          {xpText && <span className="pcard-xp">{xpText}</span>}
        </div>
      </div>
    </article>
  );
}
