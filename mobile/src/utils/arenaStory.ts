/**
 * The phone's match story (audit X3): what changed between two standings
 * snapshots, told as one director-style moment.
 *
 * The web broadcast's director (shared/arena/director.ts) consumes typed
 * events from the server. The app does not subscribe to that feed; it already
 * receives the public standings document every spectator reads, which the
 * server rewrites at each question close. So the moments are derived here
 * from two successive snapshots, using the director's own vocabulary and
 * priorities (shared/arena/events.ts):
 *
 *  - LEAD_CHANGE           a different school is now 1st (priority 10)
 *  - SCHOOL_ENTERS_TOP_5   a school climbed into the top five (8)
 *  - SCHOOL_OVERTAKE       a school climbed places (8)
 *  - PLAYER_ENTERS_TOP_5   a student climbed into the individual top five (8)
 *
 * The director's composition rule applies: two moments about one school are
 * one story (a lead change subsumes its own overtake; entering the five
 * subsumes the climb that did it).
 *
 * Honest by construction: the first snapshot is the baseline and tells
 * nothing (a viewer who arrives mid-match is not shown the past as news), a
 * snapshot that is not newer tells nothing, and only qualified, ranked
 * schools move — an unqualified school has no place to climb from or to.
 * Pure: no React, no clock.
 */
import { ARENA_EVENT_PRIORITY } from '../../../shared/arena/events';

type T = (fr: string, ht: string) => string;

export interface StorySchool {
  key: string;
  label: string;
  shortName: string;
  rank: number;
  qualified: boolean;
}

export interface StoryPlayer {
  uid: string;
  displayName: string;
  schoolKey: string;
  rank: number;
}

export interface StorySnapshot {
  seq: number;
  schools: StorySchool[];
  individuals?: StoryPlayer[];
}

export type WatchStoryKind = 'LEAD_CHANGE' | 'SCHOOL_ENTERS_TOP_5' | 'SCHOOL_OVERTAKE' | 'PLAYER_ENTERS_TOP_5';

export interface StoryRef { key: string; name: string }

export interface WatchStory {
  kind: WatchStoryKind;
  seq: number;
  priority: number;
  /** The school the story is about (the player's school for a player story). */
  school: StoryRef;
  /** The school displaced from 1st, for a lead change; null for a first leader. */
  displaced?: StoryRef | null;
  /** Previous rank (0 = was not ranked). */
  from?: number;
  to?: number;
  player?: { uid: string; name: string };
  /** About the school the viewer follows. */
  followed: boolean;
}

const TOP = 5;
const nameOf = (s: StorySchool): string => s.shortName || s.label || s.key;
const ranked = (s: StorySchool): boolean => s.qualified && s.rank > 0;

/** Every moment between two snapshots, unsorted. */
export function deriveStories(
  prev: StorySnapshot | null,
  next: StorySnapshot | null,
  followKey: string | null,
): WatchStory[] {
  if (!prev || !next || !(next.seq > prev.seq)) return [];
  const out: WatchStory[] = [];
  const prevRank = new Map<string, number>();
  for (const s of prev.schools) prevRank.set(s.key, ranked(s) ? s.rank : 0);

  const leaderOf = (snap: StorySnapshot) => snap.schools.find((s) => ranked(s) && s.rank === 1) ?? null;
  const oldLeader = leaderOf(prev);
  const newLeader = leaderOf(next);
  const leadChanged = !!newLeader && newLeader.key !== oldLeader?.key;

  if (leadChanged && newLeader) {
    out.push({
      kind: 'LEAD_CHANGE',
      seq: next.seq,
      priority: ARENA_EVENT_PRIORITY.LEAD_CHANGE,
      school: { key: newLeader.key, name: nameOf(newLeader) },
      displaced: oldLeader ? { key: oldLeader.key, name: nameOf(oldLeader) } : null,
      from: prevRank.get(newLeader.key) ?? 0,
      to: 1,
      followed: newLeader.key === followKey,
    });
  }

  for (const s of next.schools) {
    if (!ranked(s)) continue;
    if (leadChanged && s.key === newLeader?.key) continue; // composed into the lead change
    const from = prevRank.get(s.key) ?? 0;
    const to = s.rank;
    const enteredTop = to <= TOP && (from === 0 || from > TOP);
    const climbed = from > 0 && to < from;
    if (!enteredTop && !climbed) continue;
    out.push({
      kind: enteredTop ? 'SCHOOL_ENTERS_TOP_5' : 'SCHOOL_OVERTAKE',
      seq: next.seq,
      priority: enteredTop ? ARENA_EVENT_PRIORITY.PLAYER_ENTERS_TOP_5 : ARENA_EVENT_PRIORITY.SCHOOL_OVERTAKE,
      school: { key: s.key, name: nameOf(s) },
      from,
      to,
      followed: s.key === followKey,
    });
  }

  const prevPlayers = new Map<string, number>();
  for (const p of prev.individuals ?? []) prevPlayers.set(p.uid, p.rank);
  const schoolByKey = new Map(next.schools.map((s) => [s.key, s] as const));
  for (const p of next.individuals ?? []) {
    if (!p.displayName || !(p.rank > 0) || p.rank > TOP) continue;
    const before = prevPlayers.get(p.uid) ?? 0;
    if (before > 0 && before <= TOP) continue;
    const school = schoolByKey.get(p.schoolKey);
    out.push({
      kind: 'PLAYER_ENTERS_TOP_5',
      seq: next.seq,
      priority: ARENA_EVENT_PRIORITY.PLAYER_ENTERS_TOP_5,
      school: { key: p.schoolKey, name: school ? nameOf(school) : '' },
      from: before,
      to: p.rank,
      player: { uid: p.uid, name: p.displayName },
      followed: p.schoolKey === followKey,
    });
  }
  return out;
}

/**
 * The one moment worth the strip: highest priority, then the followed
 * school's, then the biggest climb, then the better final place.
 */
export function pickStory(stories: WatchStory[]): WatchStory | null {
  if (stories.length === 0) return null;
  const climb = (s: WatchStory) => (s.from && s.to ? s.from - s.to : 0);
  return [...stories].sort((a, b) =>
    b.priority - a.priority
    || Number(b.followed) - Number(a.followed)
    || climb(b) - climb(a)
    || (a.to ?? 99) - (b.to ?? 99),
  )[0];
}

const ord = (n: number, t: T) => (n === 1 ? t('1re', '1ye') : t(`${n}e`, `${n}yèm`));

/** The strip's two lines, FR/HT. */
export function storyText(story: WatchStory, t: T): { title: string; line: string } {
  const a = story.school.name;
  switch (story.kind) {
    case 'LEAD_CHANGE':
      return {
        title: t('Changement en tête', 'Chanjman nan tèt'),
        line: story.displaced
          ? t(`${a} passe devant ${story.displaced.name} et prend la 1re place`, `${a} pase devan ${story.displaced.name} e li pran 1ye plas la`)
          : t(`${a} prend la tête`, `${a} pran tèt la`),
      };
    case 'SCHOOL_ENTERS_TOP_5':
      return {
        title: t('Dans le top 5', 'Nan top 5 la'),
        line: t(`${a} entre dans le top 5, ${ord(story.to ?? 0, t)} place`, `${a} antre nan top 5 la, ${ord(story.to ?? 0, t)} plas`),
      };
    case 'SCHOOL_OVERTAKE':
      return {
        title: t('Remontée', 'Remonte'),
        line: t(
          `${a} passe de la ${ord(story.from ?? 0, t)} à la ${ord(story.to ?? 0, t)} place`,
          `${a} soti ${ord(story.from ?? 0, t)} rive ${ord(story.to ?? 0, t)} plas`,
        ),
      };
    case 'PLAYER_ENTERS_TOP_5': {
      const who = story.player?.name ?? '';
      return {
        title: t('Top 5 des joueurs', 'Top 5 jwè yo'),
        line: a
          ? t(`${who} (${a}) entre dans le top 5`, `${who} (${a}) antre nan top 5 la`)
          : t(`${who} entre dans le top 5`, `${who} antre nan top 5 la`),
      };
    }
    default:
      return { title: '', line: '' };
  }
}
