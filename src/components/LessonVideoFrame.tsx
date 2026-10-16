import React, { useEffect, useState } from 'react';
import { getYouTubeVideoId } from './YouTubePlayer';

/**
 * The lesson video, framed by EdLight until the student presses play.
 *
 * Every lesson is a youtube-nocookie embed, and a bare embed opens on
 * YouTube's own chrome: channel avatar, title bar, "Watch on YouTube". The
 * lesson page is where students spend most of their time, so it opens on the
 * lesson's real frame (i.ytimg.com, already allowed by the CSP's img-src)
 * with our play button and the lesson's name. The iframe is only created on
 * press — which also spares a phone on a slow connection the ~1 MB player
 * until it is actually wanted.
 *
 * Non-YouTube URLs, and any URL we can't read an id from, go straight to the
 * plain iframe as before.
 */
export default function LessonVideoFrame({
  src,
  title,
  playLabel,
}: {
  src: string;
  title: string;
  playLabel: string;
}) {
  const id = safeId(src);
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState(id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : '');

  // A new lesson starts framed again.
  useEffect(() => {
    setPlaying(false);
    setPoster(id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : '');
  }, [id]);

  if (!id || playing) {
    return (
      <iframe
        key={src}
        src={id ? withParams(src) : src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      className="lesson-frame"
      onClick={() => setPlaying(true)}
      aria-label={`${playLabel} : ${title}`}
    >
      <img
        className="lesson-frame__img"
        src={poster}
        alt=""
        decoding="async"
        // maxresdefault 404s on older uploads; YouTube then serves a 120×90
        // grey placeholder (200 OK), so check the natural size too.
        onLoad={(e) => {
          if ((e.currentTarget as HTMLImageElement).naturalWidth <= 120) setPoster(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
        }}
        onError={() => setPoster(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`)}
      />
      <span className="lesson-frame__shade" aria-hidden="true" />
      <span className="lesson-frame__play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="30" height="30"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" fill="currentColor" /></svg>
      </span>
    </button>
  );
}

function safeId(src: string): string | null {
  try {
    const id = getYouTubeVideoId(src);
    return id && id !== 'placeholder' && /^[\w-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The press already happened, so the player starts on load, without suggestions from other channels. */
function withParams(src: string): string {
  try {
    const u = new URL(src);
    u.searchParams.set('autoplay', '1');
    u.searchParams.set('rel', '0');
    u.searchParams.set('modestbranding', '1');
    u.searchParams.set('playsinline', '1');
    return u.toString();
  } catch {
    return src;
  }
}
