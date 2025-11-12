import React, { useEffect, useRef, useState } from 'react';

export default function YouTubePlayer({ videoId, title, onTimeUpdate, onEnded }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const [player, setPlayer] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    } else {
      initPlayer();
    }

    return () => {
      if (player) {
        player.destroy();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [videoId]);

  const initPlayer = () => {
    if (!videoId || !containerRef.current) return;

    const newPlayer = new window.YT.Player(containerRef.current, {
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        rel: 0, // Show related videos from same channel only
        modestbranding: 1,
        iv_load_policy: 3, // Disable annotations
        fs: 1, // Allow fullscreen
        playsinline: 1,
        enablejsapi: 1,
      },
      events: {
        onReady: (event) => {
          setPlayer(event.target);
          startTracking(event.target);
        },
        onStateChange: (event) => {
          // When video ends, immediately restart or show custom end screen
          if (event.data === window.YT.PlayerState.ENDED) {
            if (onEnded) onEnded();
            // Optionally stop the video to prevent suggestions
            // event.target.stopVideo();
          }
          // When paused, we can't prevent suggestions but at least track it
          if (event.data === window.YT.PlayerState.PAUSED) {
            // Suggestions will show here - YouTube doesn't allow hiding them anymore
          }
        },
      },
    });
  };

  const startTracking = (playerInstance) => {
    // Track time updates
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (playerInstance && typeof playerInstance.getCurrentTime === 'function') {
        const currentTime = playerInstance.getCurrentTime();
        const duration = playerInstance.getDuration();
        
        if (onTimeUpdate && currentTime && duration) {
          onTimeUpdate({
            currentTime,
            duration,
            playbackRate: playerInstance.getPlaybackRate?.() || 1,
          });
        }
      }
    }, 1000); // Update every second
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div 
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

// Helper function to extract YouTube video ID from URL
export function getYouTubeVideoId(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Handle youtube.com/watch?v=xxx
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    }
    
    // Handle youtu.be/xxx
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1);
    }
    
    // Handle youtube.com/embed/xxx
    if (urlObj.pathname.includes('/embed/')) {
      return urlObj.pathname.split('/embed/')[1]?.split('?')[0];
    }
  } catch (e) {
    return null;
  }
  
  return null;
}
