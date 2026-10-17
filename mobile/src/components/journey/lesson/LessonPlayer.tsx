import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { PlayCircle, WifiOff, RotateCcw } from 'lucide-react-native';
import VideoCover from '../../ui/VideoCover';
import PressableScale from '../../ui/PressableScale';
import { typeScale, fonts } from '../../../theme/theme';
import { extractYouTubeId, lessonVideoThumbs, youTubeEmbedUrl } from '../../../utils/videoThumb';

/** Opaque night pill for the duration chip, readable in both themes. */
const PILL_BG = '#12213A';
/** The player's own ground (letterbox, offline, failure): marine, not pure black. */
const PLAYER_BG = '#0F1E38';
export const PLAYER_RADIUS = 20;

/**
 * The lesson player (DIRECTION §5.3): an inline 16:9 box at radius 20.
 *
 * Facade first — the lesson's real ytimg still plus the EdLight play disc.
 * The WebView (YouTube's chrome, cookies, red button) mounts only after the
 * tap, and always on youtube-nocookie.com/embed (memory: academy-video-url-
 * format). `autoStart` skips the facade when the student already pressed play
 * somewhere else (the course cover).
 *
 * Video is the one part of a lesson that ALWAYS needs the network: offline it
 * says so and the outline/progress stay on screen; a failure keeps the lesson
 * in place with a retry. Coming back online retries a player that failed.
 */
export default function LessonPlayer({
  videoUrl, thumbnail, isCreole, offline, durationLabel, autoStart = false,
}: {
  videoUrl: string;
  thumbnail?: string | null;
  isCreole?: boolean;
  offline: boolean;
  /** "14 min" — only a real duration; omitted when unknown. */
  durationLabel?: string | null;
  autoStart?: boolean;
}) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(autoStart);
  const [attempt, setAttempt] = useState(0);
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && !offline) { setFailed(false); setAttempt((n) => n + 1); }
    wasOffline.current = offline;
  }, [offline]);
  useEffect(() => { setFailed(false); setStarted(autoStart); }, [videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const ytId = extractYouTubeId(videoUrl);
  const embedUrl = ytId ? youTubeEmbedUrl(ytId, { autoplay: true }) : videoUrl;
  const stills = useMemo(() => lessonVideoThumbs(videoUrl, thumbnail), [videoUrl, thumbnail]);

  // Embed via an HTML shell with baseUrl set to the web app's origin: many
  // course videos are embed-restricted by domain, and YouTube rejects players
  // with no/unknown referrer ("Error 153"). WKWebView ignores custom Referer
  // headers, but baseUrl makes the iframe's parent document — and therefore
  // the referrer YouTube sees — the EdLight origin, same as the PWA.
  const html = `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}</style>
    </head><body>
    <iframe src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    </body></html>`;

  const box = { width: '100%' as const, aspectRatio: 16 / 9, borderRadius: PLAYER_RADIUS, overflow: 'hidden' as const, backgroundColor: PLAYER_BG };

  if (offline || failed) {
    return (
      <View accessibilityLiveRegion="polite" style={[box, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 }]}>
        {offline ? <WifiOff color="#C9D4E8" size={30} /> : <PlayCircle color="#C9D4E8" size={32} />}
        <Text style={[typeScale.bodyMd, { color: '#ffffff', textAlign: 'center' }]}>
          {offline
            ? t("La vidéo a besoin d'une connexion internet.", 'Videyo a bezwen koneksyon entènèt.')
            : t("La vidéo ne s'est pas chargée.", 'Videyo a pa chaje.')}
        </Text>
        <Text style={[typeScale.caption, { color: '#C9D4E8', textAlign: 'center' }]}>
          {offline
            ? t('Le plan du cours et ta progression enregistrée restent disponibles.', 'Plan kou a ak pwogrè ou anrejistre yo rete disponib.')
            : t('Ta leçon reste ouverte ici.', 'Leson ou an rete louvri la a.')}
        </Text>
        {!offline ? (
          <PressableScale
            onPress={() => { setFailed(false); setAttempt((n) => n + 1); }}
            accessibilityRole="button"
            accessibilityLabel={t('Réessayer la vidéo', 'Eseye videyo a ankò')}
            style={{ marginTop: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#1C3254' }}
          >
            <RotateCcw color="#ffffff" size={16} />
            <Text style={[typeScale.action, { color: '#ffffff' }]}>{t('Réessayer', 'Eseye ankò')}</Text>
          </PressableScale>
        ) : null}
      </View>
    );
  }

  if (!started) {
    return (
      <VideoCover
        uris={stills}
        playPosition="center"
        radiusTop={PLAYER_RADIUS}
        radiusBottom={PLAYER_RADIUS}
        onPress={() => setStarted(true)}
        accessibilityLabel={`${t('Lire la vidéo', 'Jwe videyo a')}${durationLabel ? `, ${durationLabel}` : ''}`}
      >
        {durationLabel ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: PILL_BG, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}
          >
            <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: '#ffffff' }}>
              {durationLabel}
            </Text>
          </View>
        ) : null}
      </VideoCover>
    );
  }

  return (
    <View style={box}>
      <WebView
        key={attempt}
        source={{ html, baseUrl: 'https://edlight-academy.web.app' }}
        allowsFullscreenVideo
        // Inline playback inside the 16:9 box (playsinline=1 needs this on iOS).
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        style={{ flex: 1, backgroundColor: '#000000' }}
        containerStyle={{ flex: 1 }}
        originWhitelist={['*']}
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' }}>
            <ActivityIndicator color="#ffffff" />
          </View>
        )}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
    </View>
  );
}
