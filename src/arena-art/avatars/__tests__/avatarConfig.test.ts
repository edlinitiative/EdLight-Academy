/**
 * The avatar model (avatarConfig.ts) + the shared drawing (avatarScene.ts).
 * The same suite runs on the app (mobile/src/components/arena/art/__tests__/
 * avatarConfig.test.ts) so web and phone can never drift apart.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AVATAR_HAIRS, PRESENTATIONS, SERIALIZED_LENGTH, UNIFORM_CUTS, cleanAvatar, defaultConfigFor, parseConfig,
  randomConfig, sanitizeConfig, serializeConfig, type AvatarConfig,
} from '../avatarConfig';
import { buildAvatarScene } from '../avatarScene';
import * as twin from '../../../../mobile/src/components/arena/art/avatars/avatarConfig';
import * as twinScene from '../../../../mobile/src/components/arena/art/avatars/avatarScene';

const WEB = join(__dirname, '..');
const APP = join(__dirname, '../../../../mobile/src/components/arena/art/avatars');

function lcg(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

describe('avatarConfig', () => {
  it('sanitize rejects junk', () => {
    for (const junk of [null, undefined, 42, true, [], ['1'], '', '<script>', '1', '2000000000000000000', '1zzzzzzzzzzzzzzzz', '10000000000000000x', '1000000000000000']) {
      expect(sanitizeConfig(junk)).toBeNull();
      expect(cleanAvatar(junk)).toBeNull();
    }
    // An object keeps only whitelisted, valid values; bad fields fall back.
    const c = sanitizeConfig({ hair: '<img onerror>', skin: 999, glasses: 'round', earrings: 'yes', __proto__x: 1, evil: 'x' }) as AvatarConfig;
    expect(c.hair).toBe('crop');
    expect(c.skin).toBe(4);
    expect(c.glasses).toBe('round');
    expect(c.earrings).toBe(false);
    expect(Object.keys(c).sort()).toEqual(Object.keys(defaultConfigFor('x')).sort());
  });

  it('gives a stable default per seed (pinned — saved faces must not move)', () => {
    expect(serializeConfig(defaultConfigFor('u-1'))).toBe('12362000011003200');
    expect(serializeConfig(defaultConfigFor('abc'))).toBe('12820000001001300');
    expect(serializeConfig(defaultConfigFor('Jean-Marc Pierre'))).toBe('12732000000000200');
    for (let i = 0; i < 200; i++) expect(defaultConfigFor(`s-${i}`)).toEqual(defaultConfigFor(`s-${i}`));
  });

  it('serializes in ≤ 64 chars and round-trips every option', () => {
    const rand = lcg(11);
    for (let i = 0; i < 500; i++) {
      const c = randomConfig(PRESENTATIONS[i % 3], rand);
      const s = serializeConfig(c);
      expect(s.length).toBe(SERIALIZED_LENGTH);
      expect(s.length).toBeLessThanOrEqual(64);
      expect(parseConfig(s)).toEqual(c);
      expect(sanitizeConfig(c)).toEqual(c);
    }
    const base = defaultConfigFor('x');
    for (const hair of AVATAR_HAIRS) expect(parseConfig(serializeConfig({ ...base, hair }))?.hair).toBe(hair);
    for (const uniform of UNIFORM_CUTS) expect(parseConfig(serializeConfig({ ...base, uniform }))?.uniform).toBe(uniform);
  });

  it('draws the explicit config over the seeded traits', () => {
    const seeded = buildAvatarScene({ seed: 'u-1', config: defaultConfigFor('u-1'), mood: 'idle', small: false });
    const chosen = buildAvatarScene({ seed: 'u-1', config: { ...defaultConfigFor('u-1'), skin: 0, hair: 'bantu', shirt: 'bordeaux' }, mood: 'idle', small: false });
    const a = JSON.stringify(seeded.nodes);
    const b = JSON.stringify(chosen.nodes);
    expect(b).not.toBe(a);
    expect(b).toContain('#2E1A13'); // skin 0
    expect(b).toContain('#6D1F2C'); // bordeaux shirt
  });

  it('web and app copies are byte-identical and serialize identically', () => {
    for (const f of ['avatarConfig.ts', 'avatarScene.ts', 'traits.ts']) {
      expect(readFileSync(join(APP, f), 'utf8')).toBe(readFileSync(join(WEB, f), 'utf8'));
    }
    const rand = lcg(5);
    for (let i = 0; i < 200; i++) {
      const c = randomConfig(PRESENTATIONS[i % 3], rand);
      expect(twin.serializeConfig(c)).toBe(serializeConfig(c));
      expect(twin.defaultConfigFor(`p-${i}`)).toEqual(defaultConfigFor(`p-${i}`));
      expect(JSON.stringify(twinScene.buildAvatarScene({ seed: `p-${i}`, config: c, mood: 'ready', small: false })))
        .toBe(JSON.stringify(buildAvatarScene({ seed: `p-${i}`, config: c, mood: 'ready', small: false })));
    }
  });
});
