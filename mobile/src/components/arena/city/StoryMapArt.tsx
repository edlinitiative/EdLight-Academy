import React, { useMemo } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import { STORY_CHAPTERS, chapterCleared, isUnlocked, nextStage, type StoryProgress } from '../../../../../shared/arenaStory';
import { departmentCentroid, departmentPath, MAP_HEIGHT, MAP_WIDTH } from '../../../../../shared/geo/haitiDepartments';

/**
 * Mode Histoire's map — the real département outlines the web map and the
 * broadcast draw (shared/geo/haitiDepartments), lit by the student's
 * progress: locked in shadow, open in green, conquered in gold; the road
 * travelled solid, the road ahead dotted, the next chapter's pin larger.
 *
 * Pure art (decorative to screen readers — the chapter list beside it carries
 * the same information as text). Memoized on the progress object.
 */
const PAD = 36;
const VIEW = `${-PAD} ${-PAD} ${MAP_WIDTH + PAD * 2} ${MAP_HEIGHT + PAD * 2}`;
const GEO = STORY_CHAPTERS.map((c) => ({
  d: departmentPath(c.dept) || '',
  at: departmentCentroid(c.dept) || { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
}));
const ISLAND = GEO.map((g) => g.d).join('');

export const STORY_MAP_RATIO = (MAP_HEIGHT + PAD * 2) / (MAP_WIDTH + PAD * 2);

function StoryMapArt({ progress, selected = null, width }: { progress: StoryProgress; selected?: number | null; width: number }) {
  const state = useMemo(() => {
    const next = nextStage(progress);
    const travelled = (next?.chapter ?? STORY_CHAPTERS.length - 1) + 1;
    return {
      next,
      travelled,
      depts: STORY_CHAPTERS.map((_, i) => ({ open: isUnlocked(progress, i, 0), done: chapterCleared(progress, i) })),
    };
  }, [progress]);
  const pts = (from: number, to: number) => GEO.slice(from, to).map((g) => `${g.at.x},${g.at.y}`).join(' ');

  return (
    <Svg
      width={width}
      height={Math.round(width * STORY_MAP_RATIO)}
      viewBox={VIEW}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="smOpen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2FD18C" />
          <Stop offset="1" stopColor="#11895C" />
        </LinearGradient>
        <LinearGradient id="smDone" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE08A" />
          <Stop offset="1" stopColor="#E9A21C" />
        </LinearGradient>
      </Defs>
      <Path d={ISLAND} fill="none" stroke="#5EA2FF" strokeOpacity={0.25} strokeWidth={14} strokeLinejoin="round" />
      {GEO.map((g, i) => {
        const st = state.depts[i];
        return (
          <Path
            key={i}
            d={g.d}
            fill={st.done ? 'url(#smDone)' : st.open ? 'url(#smOpen)' : '#1C3254'}
            stroke={i === selected ? '#F1F5FF' : '#050B1A'}
            strokeWidth={i === selected ? 5 : 2}
            strokeLinejoin="round"
          />
        );
      })}
      {state.travelled < STORY_CHAPTERS.length ? (
        <Polyline points={pts(state.travelled - 1, STORY_CHAPTERS.length)} fill="none" stroke="#A3B5DC" strokeOpacity={0.6} strokeWidth={4} strokeDasharray="4 12" strokeLinecap="round" />
      ) : null}
      {state.travelled > 1 ? (
        <Polyline points={pts(0, state.travelled)} fill="none" stroke="#FFC24A" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {GEO.map((g, i) => {
        const isNext = state.next?.chapter === i;
        const st = state.depts[i];
        return (
          <Circle
            key={`p${i}`}
            cx={g.at.x}
            cy={g.at.y}
            r={isNext ? 20 : 11}
            fill={isNext ? '#FF6A45' : st.done ? '#FFC24A' : st.open ? '#F1F5FF' : '#3A4E74'}
            stroke="#050B1A"
            strokeWidth={4}
          />
        );
      })}
    </Svg>
  );
}

export default React.memo(StoryMapArt);
