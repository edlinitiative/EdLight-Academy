import React, { useRef, useState, useEffect } from 'react';

export default function VideoPlayer({ src, title, onTimeUpdate, onEnded }) {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Playback speed options
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (onTimeUpdate) {
        onTimeUpdate({
          currentTime: video.currentTime,
          duration: video.duration,
          playbackRate: video.playbackRate,
        });
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate, onEnded]);

  // Update playback rate when changed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = percent * video.duration;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const skipTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration, videoRef.current.currentTime + seconds));
    }
  };

  // Sync fullscreen state when user presses Esc or exits fullscreen externally
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // YouTube video detection and iframe handling
  const isYouTube = src?.includes('youtube.com') || src?.includes('youtu.be');

  if (isYouTube) {
    // Normalize to embed URL
    let embedUrl = src;
    try {
      const urlObj = new URL(src);
      if (urlObj.hostname.includes('youtu.be')) {
        const videoId = urlObj.pathname.slice(1);
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
      } else if (urlObj.searchParams.has('v')) {
        embedUrl = `https://www.youtube.com/embed/${urlObj.searchParams.get('v')}`;
      } else if (!urlObj.pathname.includes('/embed/')) {
        embedUrl = src; // leave as-is if we can't parse it
      }
    } catch {
      // leave as-is if URL parsing fails
    }
    // For YouTube, use iframe with speed controls in description
    return (
      <div className="video-player" ref={containerRef}>
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
        <div className="video-player__youtube-note">
          <small>💡 Tip: Use YouTube's playback speed controls (Settings → Playback speed)</small>
        </div>
      </div>
    );
  }

  // Custom video player for direct video files
  return (
    <div 
      className="video-player" 
      ref={containerRef}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(isPlaying ? false : true)}
    >
      <video
        ref={videoRef}
        src={src}
        onClick={togglePlay}
        className="video-player__video"
      >
        Your browser does not support the video tag.
      </video>

      {showControls && (
        <div className="video-player__controls">
          {/* Progress bar */}
          <div className="video-player__progress-container" onClick={handleSeek}>
            <div className="video-player__progress-bar">
              <div 
                className="video-player__progress-filled"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </div>

          {/* Control buttons */}
          <div className="video-player__controls-row">
            <div className="video-player__controls-left">
              {/* Play/Pause */}
              <button 
                className="video-player__button"
                onClick={togglePlay}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶️'}
              </button>

              {/* Skip buttons */}
              <button 
                className="video-player__button"
                onClick={() => skipTime(-10)}
                title="Rewind 10s"
              >
                ⏪
              </button>
              <button 
                className="video-player__button"
                onClick={() => skipTime(10)}
                title="Forward 10s"
              >
                ⏩
              </button>

              {/* Volume */}
              <button 
                className="video-player__button"
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-player__volume-slider"
              />

              {/* Time display */}
              <span className="video-player__time">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="video-player__controls-right">
              {/* Playback speed */}
              <div className="video-player__speed-control">
                <select 
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                  className="video-player__speed-select"
                  title="Playback speed"
                >
                  {speedOptions.map(speed => (
                    <option key={speed} value={speed}>
                      {speed}x
                    </option>
                  ))}
                </select>
              </div>

              {/* Fullscreen */}
              <button 
                className="video-player__button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? '✕' : '⛶'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
