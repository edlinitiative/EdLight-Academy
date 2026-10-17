/**
 * Cover and preview stills stay honest (audit 2026-10-17 #4): each course
 * cover is a frame of one of that course's own lessons, and a lesson preview is
 * the lesson's own still — or nothing when none of its stills is usable.
 */
import fs from 'fs';
import path from 'path';
import { courseCover, courseCoverPosition, __courseCoverTable } from '../courseCovers';
import { lessonFrame, __lessonFrameTables } from '../lessonFrames';

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../public/catalog.json'), 'utf8'));
const visible = catalog.courses.filter((c: any) => !c.hidden && (c.units || []).some((u: any) => (u.lessons || []).some((l: any) => l.video_url)));
const videosOf = (c: any) => new Set<string>((c.units || []).flatMap((u: any) => (u.lessons || [])
  .map((l: any) => /embed\/([\w-]{11})/.exec(l.video_url || '')?.[1]).filter(Boolean)));

test('every course with videos has a curated cover taken from its own lessons', () => {
  for (const c of visible) {
    const entry = __courseCoverTable[c.id];
    expect(entry).toBeDefined();
    const [vid, still] = entry.frame.split('/');
    expect(videosOf(c).has(vid)).toBe(true);
    expect(['sddefault', 'sd1', 'sd2', 'sd3']).toContain(still);
    // A cover is never a still the curation judged unusable.
    expect(__lessonFrameTables.NO_GOOD_FRAME.has(vid)).toBe(false);
    expect(courseCover(c.id)).toBe(`https://i.ytimg.com/vi/${vid}/${still}.jpg`);
  }
  expect(courseCover('nope')).toBeNull();
  // Centred crops only: an offset would reveal the still's letterbox bars.
  for (const c of visible) expect(courseCoverPosition(c.id)).toBeUndefined();
});

test('the lesson tables only name catalogue videos', () => {
  const all = new Set<string>(visible.flatMap((c: any) => [...videosOf(c)]));
  for (const id of Object.keys(__lessonFrameTables.BEST_FRAME)) expect(all.has(id)).toBe(true);
  for (const id of __lessonFrameTables.NO_GOOD_FRAME) expect(all.has(id)).toBe(true);
});

test('lessonFrame: best still, default still, or null when no still is usable', () => {
  const [bestId, still] = Object.entries(__lessonFrameTables.BEST_FRAME)[0];
  expect(lessonFrame(`https://www.youtube-nocookie.com/embed/${bestId}`)).toBe(`https://i.ytimg.com/vi/${bestId}/${still}.jpg`);
  // The audit's resume lesson (CHEM-NSI-U1-L7): every still is tiny typed text.
  expect(lessonFrame('https://www.youtube-nocookie.com/embed/FNrikFcFAMg')).toBeNull();
  expect(lessonFrame('https://www.youtube-nocookie.com/embed/NEWUPLOAD01')).toBe('https://i.ytimg.com/vi/NEWUPLOAD01/sddefault.jpg');
  expect(lessonFrame('https://www.youtube-nocookie.com/embed/placeholder')).toBeNull();
  expect(lessonFrame(null)).toBeNull();
});
