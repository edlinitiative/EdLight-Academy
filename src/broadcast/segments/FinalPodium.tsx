import React from 'react';
import SceneFrame from '../SceneFrame';
import ProvisionalNotice from '../ProvisionalNotice';
import PlayerFace from '../PlayerFace';
import SchoolCrest from '../../arena-art/crest/SchoolCrest';
import type { StageData } from '../sceneContract';
import type { IndividualStanding } from '../../../shared/arena/events';
import { staggerStyle } from '../finaleLogic';
import './finalPodium.css';

/**
 * The final's opening beat: the champion school, then the three best students
 * on a 2 · 1 · 3 podium with their faces. Everything comes from the final
 * standings; a podium step with nobody on it is simply not drawn, and the
 * provisional line stays until the result is `final`.
 */
const STEP = { 1: 'is-first', 2: 'is-second', 3: 'is-third' } as const;

export default function FinalPodium({ data, reduceMotion, t }: {
  data: StageData;
  reduceMotion: boolean;
  t: (fr: string, ht: string) => string;
}) {
  const school = data.standings?.schools?.find((s) => s.qualified && s.rank === 1) ?? null;
  const top = (data.standings?.individuals || [])
    .filter((p) => p.rank >= 1 && p.rank <= 3)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  // Stage order: second on the left, first in the middle, third on the right.
  const order = [top.find((p) => p.rank === 2), top.find((p) => p.rank === 1), top.find((p) => p.rank === 3)]
    .filter(Boolean) as IndividualStanding[];
  const rankWord = (r: number) => (r === 1 ? t('1re place', '1ye plas') : t(`${r}e place`, `${r}yèm plas`));

  return (
    <SceneFrame
      key="postgame-podium"
      className="fp"
      reduceMotion={reduceMotion}
      tone="gold"
      overline={t('LES CHAMPIONS', 'CHANPYON YO')}
      figure={school ? (
        <span className="fp-school">
          <SchoolCrest name={school.label} size={96} />
          <span>{school.shortName || school.label}</span>
        </span>
      ) : t('Podium', 'Podyòm')}
      support={school ? t(`École championne · moyenne ${Math.round(school.teamAvg)}`, `Lekòl chanpyon · mwayèn ${Math.round(school.teamAvg)}`) : undefined}
    >
      {order.length > 0 ? (
        <ol className="fp-stage" aria-label={t('Podium individuel', 'Podyòm endividyèl')}>
          {order.map((p) => (
            <li key={p.uid} className={`fp-step ${STEP[p.rank as 1 | 2 | 3]}`} style={staggerStyle(4 - p.rank, reduceMotion)}>
              <PlayerFace uid={p.uid} schoolKey={p.schoolKey} schoolName={p.schoolShort} standings={data.standings} mood="celebrating" size={p.rank === 1 ? 128 : 100} still={reduceMotion} />
              <span className="fp-name">{p.displayName}</span>
              <span className="fp-meta">{`${Math.round(p.score)} pts · ${p.schoolShort}`}</span>
              <span className="fp-block"><span className="fp-rank">{p.rank}</span><span className="fp-rank-word">{rankWord(p.rank)}</span></span>
            </li>
          ))}
        </ol>
      ) : null}
      <ProvisionalNotice state={data.tournament?.state} t={t} />
    </SceneFrame>
  );
}
