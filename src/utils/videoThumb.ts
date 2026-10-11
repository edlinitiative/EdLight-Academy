import { getYouTubeVideoId } from '../components/YouTubePlayer';

/**
 * The still frame YouTube already hosts for every lesson video.
 *
 * ~300 lessons are real YouTube videos and, until this helper, not one frame
 * of them appeared anywhere outside the player — catalogue, course page and
 * workspace were all text and numbers. `i.ytimg.com` is already allowed by the
 * CSP's img-src.
 *
 * `mqdefault` (320×180, 16:9) exists for every public/unlisted video, unlike
 * `maxresdefault`, which 404s on older uploads. `hq` (480×360) is letterboxed
 * 4:3, so it is only worth asking for at hero size with object-fit: cover.
 *
 * Returns null for the `embed/placeholder` rows dataService fills in for
 * lessons whose video is not uploaded yet — a grey YouTube "unavailable"
 * frame is worse than no frame.
 */
export function videoThumb(url?: string | null, size: 'mq' | 'hq' = 'mq'): string | null {
  if (!url) return null;
  let id: string | null = null;
  try {
    id = getYouTubeVideoId(url);
  } catch {
    id = null;
  }
  if (!id || id === 'placeholder' || !/^[\w-]{6,}$/.test(id)) return null;
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}

/** First lesson in a list that has a real video frame, with its index. */
export function firstThumb(
  lessons: Array<{ videoUrl?: string | null }> | null | undefined,
  size: 'mq' | 'hq' = 'mq',
): { src: string; index: number } | null {
  if (!Array.isArray(lessons)) return null;
  for (let i = 0; i < lessons.length; i += 1) {
    const src = videoThumb(lessons[i]?.videoUrl, size);
    if (src) return { src, index: i };
  }
  return null;
}
