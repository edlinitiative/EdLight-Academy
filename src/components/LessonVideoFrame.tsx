import React, { useEffect, useState } from 'react';
import { getYouTubeVideoId } from './YouTubePlayer';
import { RotateCcw, WifiOff } from './icons';

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
 * Failure states (PRD §13 "video failure"): the lesson keeps its identity —
 * its title stays on the frame — and offers a retry. Offline, the frame says
 * the video needs a connection instead of starting a player that cannot load.
 * Once playing, a quiet "Recharger la vidéo" and the provider's own page are
 * the supported fallbacks; we never imply an offline or custom player.
 *
 * Non-YouTube URLs, and any URL we can't read an id from, go straight to the
 * plain iframe as before.
 */
export default function LessonVideoFrame({
  src,
  title,
  isCreole = false,
  offline = false,
  onRetry,
  onPlayingChange,
  minutes = 0,
}: {
  src: string;
  title: string;
  isCreole?: boolean;
  offline?: boolean;
  /** Remount the frame (the parent bumps its key). */
  onRetry?: () => void;
  /** Told when the real player is on screen, so the page can offer its
   *  fallbacks BELOW the player — never on top of the provider's controls. */
  onPlayingChange?: (playing: boolean) => void;
  /** Real length in minutes for the duration chip; 0 (unknown or the
   *  catalogue's placeholder) shows no chip. */
  minutes?: number;
}) {
  const L = (fr: string, ht: string) => (isCreole ? ht : fr);
  const id = safeId(src);
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState(id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : '');
  const [posterFailed, setPosterFailed] = useState(false);

  // A new lesson starts framed again.
  useEffect(() => {
    setPlaying(false);
    setPosterFailed(false);
    setPoster(id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : '');
  }, [id]);

  const live = !!id && playing && !offline;
  useEffect(() => { onPlayingChange?.(live); }, [live, onPlayingChange]);

  const fallbackPoster = () => {
    const hq = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    if (poster !== hq) setPoster(hq);
    else setPosterFailed(true);
  };

  if (!id || (playing && !offline)) {
    return (
      <>
        <iframe
          key={src}
          src={id ? withParams(src) : src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </>
    );
  }

  if (offline) {
    return (
      <div className="lesson-frame lesson-frame--state" role="status">
        <span className="lesson-frame__state">
          <WifiOff size={26} aria-hidden="true" />
          <strong>{L('La vidéo a besoin d’une connexion', 'Videyo a bezwen koneksyon')}</strong>
          <span className="lesson-frame__state-title">{title}</span>
          <span>{L('Elle se chargera quand tu seras de nouveau en ligne.', 'L ap chaje lè ou gen entènèt ankò.')}</span>
          {onRetry && (
            <button type="button" className="button button--ghost button--sm lesson-frame__retry" onClick={onRetry}>
              <RotateCcw size={15} aria-hidden="true" /> {L('Réessayer', 'Eseye ankò')}
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`lesson-frame${posterFailed ? ' lesson-frame--noposter' : ''}`}
      onClick={() => setPlaying(true)}
      aria-label={`${L('Lancer la vidéo', 'Lanse videyo a')} : ${title}`}
    >
      {!posterFailed && (
        <img
          className="lesson-frame__img"
          src={poster}
          alt=""
          decoding="async"
          // maxresdefault 404s on older uploads; YouTube then serves a 120×90
          // grey placeholder (200 OK), so check the natural size too.
          onLoad={(e) => {
            if ((e.currentTarget as HTMLImageElement).naturalWidth <= 120) fallbackPoster();
          }}
          onError={fallbackPoster}
        />
      )}
      {/* No still to show: the lesson's name holds the frame instead. */}
      {posterFailed && <span className="lesson-frame__name" aria-hidden="true">{title}</span>}
      <span className="lesson-frame__shade" aria-hidden="true" />
      {/* EdLight's play disc: solid white, azure triangle, no halo. */}
      <span className="lesson-frame__play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" fill="currentColor" /></svg>
      </span>
      {minutes > 0 && <span className="lesson-frame__duration">{minutes} min</span>}
    </button>
  );
}

/** The provider's own page for a lesson video — the supported fallback. */
export function lessonVideoWatchUrl(src: string): string | null {
  const id = safeId(src);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
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
