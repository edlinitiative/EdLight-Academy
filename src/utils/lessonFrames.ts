/**
 * The best still of each lesson video, for previews (Home's resume row, the
 * course page's resume card). Audit 2026-10-17 #4.
 *
 * YouTube keeps four stills per video: its chosen one (`sddefault`) and three
 * automatic mid-video frames (`sd1`–`sd3`, 640×480 with the 16:9 picture
 * letterboxed in the middle). Every frame of every catalogue lesson was
 * scored in a browser (amount of writing, writing cut at the sides, the
 * iPad ink palette open) and the weak ones checked by eye.
 *
 *   BEST_FRAME  videos whose best still is NOT YouTube's default one.
 *   NO_GOOD_FRAME  videos where every still is weak (palette or app chrome
 *               open, blank board, end card, text unreadable at card size).
 *               They get no photo — the subject-tinted media block instead —
 *               rather than a frame that looks broken. Listed for production
 *               work in the audit fix notes.
 *
 * A video not listed (a new upload) uses YouTube's default still.
 * Regenerate after new uploads; do not hand-edit single entries blind.
 */
import { getYouTubeVideoId } from '../components/YouTubePlayer';

type Still = 'sd1' | 'sd2' | 'sd3';

const BEST_FRAME: Record<string, Still> = {
  "6oKYUnJMdOw": 'sd3',
  "9Cbr0NuDSEI": 'sd2',
  "nJ8geRJ_whY": 'sd3',
  "P7mgnA4Kgtw": 'sd2',
  "FoILoav0CX0": 'sd1',
  "xLmpDTFfCmU": 'sd2',
  "1MvFGSiILgs": 'sd3',
  "SCqSMxGGlrE": 'sd2',
  "BAHyx_5dqyI": 'sd3',
  "s8V74XR5BcY": 'sd2',
  "HNOuKpOp1AE": 'sd3',
  "nSjSOnL-BGA": 'sd3',
  "Ru6mK7Bwf7o": 'sd2',
  "oO9lz70LmMg": 'sd3',
  "2GFAwLHfCU4": 'sd3',
  "YhvDoP6lXv4": 'sd3',
  "Uclw0D-6QlQ": 'sd1',
  "XQdsqomjkOc": 'sd3',
  "InrXiIA0-qU": 'sd2',
  "1KzRkUq-Dl4": 'sd3',
  "5j7CHytEjg8": 'sd3',
  "8u9FMK8e7kg": 'sd3',
  "sX7zA3nKt6o": 'sd3',
  "2QFZutgiakE": 'sd2',
  "ew24do9vKf8": 'sd2',
  "3WBlKZgga9w": 'sd3',
  "xmLTel0GA38": 'sd2',
  "gav4rdZAnqw": 'sd2',
  "pONbpl-iSzw": 'sd3',
  "BePNgqPtwl0": 'sd1',
  "Qvq4366TYxk": 'sd1',
  "rpGV9-tT-O8": 'sd3',
  "atLhkGa8VKA": 'sd3',
  "7Ajmf9jnYIs": 'sd3',
  "q2-ciauzO5E": 'sd3',
  "dwO_0MXDimg": 'sd3',
  "7Y9lGPpmQq0": 'sd3',
  "yOf4LEJ6XkA": 'sd2',
  "orSiA_0YbiI": 'sd2',
  "dCdsDtgZlEc": 'sd3',
  "kaIF9vzIkGM": 'sd1',
  "XruWjh-STHk": 'sd3',
  "K8l7SAjK6rg": 'sd3',
  "MiqI6WgsAs4": 'sd3',
  "E9r3YBArpfg": 'sd3',
  "zy68zhmLVS0": 'sd3',
  "18akutlFr-s": 'sd3',
  "3urtcnCIhTk": 'sd3',
  "I9V-oz492dY": 'sd3',
  "aDJZWqdDJCo": 'sd3',
  "2EYev6UQShk": 'sd3',
  "ZQ2CdhN7lgg": 'sd3',
  "khQKjuH0giU": 'sd3',
  "1oinZ_7ezoQ": 'sd3',
  "I3J0FvtXp0M": 'sd3',
  "7vC6MoIGwr4": 'sd3',
  "GjYomfSclRM": 'sd3',
  "U8Ndprsy8gU": 'sd1',
  "9D-G9Lp1nDk": 'sd3',
  "Qidzeo_KusQ": 'sd3',
  "Mh4Q7nft8RU": 'sd2',
  "jAWajjcOjVY": 'sd3',
  "2YO8TklPcQk": 'sd2',
  "c_NLf-ghwpk": 'sd3',
  "jQPKaAG-CGg": 'sd3',
  "3LrgjDcjMr4": 'sd3',
  "7CoBZ5MFN6E": 'sd1',
  "gEc5tfmnYas": 'sd3',
  "NSqABCxs7l8": 'sd3',
  "kIj3dkw4T7g": 'sd2',
  "MdB4DBpKCMM": 'sd2',
  "tRzQ0h--Hds": 'sd3',
  "Fg-9zDyfJRQ": 'sd3',
  "t6xDuk6G05k": 'sd3',
  "fQjfPyOYK48": 'sd3',
  "-doTXLOHpBY": 'sd3',
  "7ntWvvypBZE": 'sd2',
  "Gp6dMriKzs4": 'sd3',
  "y9JCJ6QhtrQ": 'sd2',
  "bh8l5kXnXkU": 'sd1',
  "DgQLO2je2nA": 'sd3',
  "_IIg22sux_k": 'sd3',
  "JnTwk41ofPM": 'sd2',
  "X0qdKiI6Hks": 'sd2',
  "8x1KhTPWffk": 'sd3',
  "lEpkylojNHw": 'sd3',
  "MSZEx0CDO7E": 'sd2',
  "u0H-mexyiA0": 'sd3',
  "yrPGANAryy4": 'sd2',
  "d8uqpAqLWmQ": 'sd2',
  "WYh0gGdcK5A": 'sd1',
  "1RECQ788v4Q": 'sd3',
  "I40RDHMwH_Q": 'sd3',
  "9DFkRn1ha8w": 'sd2',
  "dQ0m5151QPc": 'sd2',
  "f9gUorUqpmE": 'sd3',
  "PiXxEMSbdv0": 'sd2',
  "CTq_Ovfe-cQ": 'sd2',
  "Azpzy1iFFNw": 'sd1',
  "Zi97HlCJEi8": 'sd3',
  "_9Siq5gyviM": 'sd2',
  "UOoYFgAfIbA": 'sd1',
  "_CQfghkYPNA": 'sd3',
  "L6ZboFcdxvo": 'sd1',
  "Y6o_ma2iSWk": 'sd2',
  "GO6lvAwvJ4w": 'sd1',
  "GY_Vv7dvh0g": 'sd3',
  "gB7ULFTzIBU": 'sd3',
  "1hNy43Qla1g": 'sd1',
  "TtsdEVQb33U": 'sd3',
  "d8zrnduv0Gc": 'sd1',
  "zE69XD4-ze8": 'sd3',
  "AyDB5ugRhSg": 'sd3',
  "UtNgdDDzwfY": 'sd3',
  "LSnEnbM7Ryo": 'sd3',
  "GJ3W0AKMH_g": 'sd1',
  "6WdTVzMOCFI": 'sd1',
  "yZ5aoeO72TY": 'sd3',
  "mn28Yjm4TVY": 'sd3',
  "wXx_Wonpuis": 'sd3',
  "dpE2rNs9nYc": 'sd3',
  "DLkqGgwDq_I": 'sd1',
  "YtlKVjTgzoY": 'sd2',
  "sPPJXZcghjo": 'sd3',
  "Itydqa5MvM0": 'sd1',
  "eu9kLoTuun0": 'sd1',
  "dRYZNWU21yI": 'sd3',
  "H18Q10Nm3A8": 'sd3',
  "-QU38-p-ZiA": 'sd3',
  "JH_sSDwehqo": 'sd3',
  "-G6_sKgt1BE": 'sd3',
  "a-w05kOjZYU": 'sd2',
  "5Y5825cB-sA": 'sd3',
  "nQFngrYPKMo": 'sd1',
  "2UTyVY1N7oM": 'sd1',
  "glz9OW0vI9Y": 'sd3',
};

const NO_GOOD_FRAME = new Set<string>([
  "SHDKD0JbYM8", "v00Te_YA0t8", "3fRsbT8g6Os", "30mCdT37Cjk",
  "FNrikFcFAMg", "zRagWxcWpJM", "Q0HCvtmlSiI", "ucYteKGDm2k",
  "MYVNbhSsbfg", "risxMf3moCo", "hyu1-Ni5Re0", "v34EQYSplKI",
  "FMKX3ntvX5w", "Dmcef18KO1k", "SbLMxOuo_n4", "rIlShYAmkVA",
  "wj9zF60kr7Q", "yYjoNiyHEgQ", "_hGewmaRrhA", "Q31u4-HyoYc",
  "4IDBpPt0DMQ", "OUYm1Iox5iw", "AOSqnPS1XN0", "Cm5K2cUSZ5Q",
  "DvHFTd0x8ng", "_mX7_Qj0AW0", "bgWDLTQpFmU", "qzlzP1TeyRU",
  "bT803bdvYkY", "JiwhxpM2KU4", "lfeRLBMOW20", "6TeqrMtKbDo",
  "XH5Cc0WXgxE", "i3C_rmNaBic", "mk38qI6G_bU", "TbuXpz0bCqM",
  "VS8F72E6m8s", "rLzEaf7vmiA", "B44YHJW8_Fs", "UREITHnolgo",
  "ztUcXCU82pA", "jpdp5q7Z1UY", "kll66UyNnJU", "gGqb9Olbjtg",
  "IL6OyGrX8s4", "lhMTZcyyNog", "fn29m7kBRLM", "PNzc2MW8LYo",
  "0MlizklnEaw", "8UPe4mfLzcI", "-BLh7gNS1oE", "t45wca8376w",
  "lmOfrjnHS9s", "O0UhA4Klsnw", "wYZk6Rkjbws", "fSbp6DYzgV0",
  "lnRjHU6WVVE",
]);

function videoId(url?: string | null): string | null {
  if (!url) return null;
  let id: string | null = null;
  try { id = getYouTubeVideoId(url); } catch { id = null; }
  if (!id || id === 'placeholder' || !/^[\w-]{6,}$/.test(id)) return null;
  return id;
}

/** The lesson's own best still, or null when none of its stills is usable. */
export function lessonFrame(videoUrl?: string | null): string | null {
  const id = videoId(videoUrl);
  if (!id || NO_GOOD_FRAME.has(id)) return null;
  return `https://i.ytimg.com/vi/${id}/${BEST_FRAME[id] || 'sddefault'}.jpg`;
}

/**
 * True when a still URL is one of the curated weak frames (any of its four
 * YouTube stills), so a caller holding a raw thumbnail URL — not a video URL —
 * can still fall back to subject artwork. Non-YouTube URLs are never weak.
 */
export function isWeakStill(still?: string | null): boolean {
  if (!still) return false;
  const m = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]{6,})\//.exec(still);
  return !!m && NO_GOOD_FRAME.has(m[1]);
}

/** Exposed for tests. */
export const __lessonFrameTables = { BEST_FRAME, NO_GOOD_FRAME };
