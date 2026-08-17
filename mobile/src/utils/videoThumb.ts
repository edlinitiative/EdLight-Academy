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

/** Thumbnail URL for a YouTube video id (hqdefault exists for every video). */
export const youTubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

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
