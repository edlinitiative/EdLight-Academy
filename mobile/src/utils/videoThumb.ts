/**
 * YouTube thumbnail derivation for course cards.
 *
 * Course lesson `videoUrl`s are YouTube embeds — canonically
 * `https://www.youtube-nocookie.com/embed/{id}` (the CSP-safe format the
 * catalog requires), sometimes plain `youtube.com/embed`, `youtu.be` or
 * `watch?v=`. YouTube serves a still for every video at a predictable URL,
 * so a card can show a real video thumbnail without any extra data.
 */

/** First captured group of any of the supported YouTube URL shapes. */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/youtube(?:-nocookie)?\.com\/embed\/([^?&/]+)/) ||
    url.match(/youtu\.be\/([^?&/]+)/) ||
    url.match(/youtube\.com\/watch\?v=([^&]+)/);
  return m?.[1] ?? null;
}

/**
 * Which still to ask YouTube for — the aspect ratio matters more than the size.
 *
 * YouTube's `default`/`hqdefault`/`sddefault` stills are 4:3 canvases with the
 * black letterbox bars *baked into the pixels* for a 16:9 video. Cards render
 * the still into a ~16:9 box with `resizeMode="cover"`, and the crop misses the
 * bar by a hair: `hqdefault` is 480x360 with 45px bars, so at a 200x112 box it
 * scales to 200x150 (bars 18.75pt) and crops 19pt off each edge — leaving the
 * ~1px dark line at the top the app owner reported. Only the true-16:9 variants
 * are safe, so we never request a 4:3 one:
 *
 *   - `mqdefault.jpg`  320x180   16:9, exists for EVERY video → the safe floor.
 *   - `hq720.jpg`      1280x720  16:9, exists whenever the upload had a 720p
 *                                rendition (true for the EdLight lesson
 *                                videos — spot-checked) but NOT universal.
 *   - `maxresdefault.jpg`        16:9 too, but rarer still, and pointless here:
 *                                a 200pt card is ~600px at 3x, so `hq720`
 *                                already oversamples it 2x. Extra 404 risk and
 *                                bytes for no visible gain, so it's left out.
 */
const YT_STILL = (id: string, variant: string) => `https://i.ytimg.com/vi/${id}/${variant}`;

/**
 * Candidate stills for a video id, sharpest first, all of them true 16:9.
 * For consumers that can retry on load failure: walk the list on `onError` and
 * only fall back to the icon placeholder once it's exhausted. The last entry is
 * always the universally-present `mqdefault`, so the walk can't dead-end.
 */
export const youTubeThumbUrls = (id: string): string[] => [
  YT_STILL(id, 'hq720.jpg'),
  YT_STILL(id, 'mqdefault.jpg'),
];

/**
 * Single thumbnail URL for a YouTube video id, for consumers that treat a
 * failed load as "no thumbnail". Deliberately the *always-present* 16:9 still
 * rather than the sharpest one: a `hq720` that 404s would degrade the card to a
 * generic icon, which is worse than a slightly soft real still. Sharper cards
 * want `youTubeThumbUrls` plus an onError walk.
 */
export const youTubeThumbUrl = (id: string) => YT_STILL(id, 'mqdefault.jpg');

/** The course's first video lesson → its ordered thumbnail candidates. */
function firstVideoLessonThumbs(course: any): string[] {
  for (const unit of course?.modules ?? []) {
    for (const lesson of unit?.lessons ?? []) {
      if (lesson?.type !== 'video') continue;
      const yt = extractYouTubeId(lesson.videoUrl);
      // `lesson.thumbnail` (hand-entered `thumbnail_url`) is unevenly populated,
      // so it trails the deterministic YouTube stills rather than leading them.
      const candidates = [...(yt ? youTubeThumbUrls(yt) : []), lesson.thumbnail];
      const usable = candidates.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
      if (usable.length > 0) return usable;
    }
  }
  return [];
}

/**
 * The course's first video lesson → its best available thumbnail URL.
 * Prefers the YouTube-derived still (deterministic — YouTube serves one for
 * every video); `lesson.thumbnail` (hand-entered `thumbnail_url`, unevenly
 * populated) is only a fallback when no video id can be extracted.
 */
export function courseVideoThumb(course: any): string | null {
  for (const unit of course?.modules ?? []) {
    for (const lesson of unit?.lessons ?? []) {
      if (lesson?.type !== 'video') continue;
      const yt = extractYouTubeId(lesson.videoUrl);
      if (yt) return youTubeThumbUrl(yt);
      if (lesson.thumbnail) return lesson.thumbnail;
    }
  }
  return null;
}

/**
 * Same pick as `courseVideoThumb`, but as the full ordered candidate list so a
 * card can try the sharp `hq720` still first and step down to the guaranteed
 * `mqdefault` on `onError` instead of dropping straight to the icon. Empty when
 * the course has no video lesson to derive a still from.
 */
export function courseVideoThumbs(course: any): string[] {
  return firstVideoLessonThumbs(course);
}
