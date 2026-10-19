import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { PlayCircle, WifiOff, RotateCcw } from 'lucide-react-native';
import VideoCover from '../../ui/VideoCover';
import PressableScale from '../../ui/PressableScale';
import { typeScale, fonts } from '../../../theme/theme';
import { extractYouTubeId, lessonVideoThumbs, youTubeEmbedUrl } from '../../../utils/videoThumb';
import { formatResume, resumeSecondsFor, saveVideoPosition } from '../../../utils/videoPositions';

/** The shell document's origin (baseUrl below) — also the jsapi `origin`. */
const SHELL_ORIGIN = 'https://edlight-academy.web.app';

/**
 * Inside the HTML shell: speak YouTube's iframe widget protocol (what
 * iframe_api does internally) to receive `infoDelivery` position reports, and
 * forward one to React Native at most every 5 s, plus at once on pause. Only
 * messages from the YouTube origins are read.
 */
const BRIDGE_JS = String.raw`(function(){
  var f=document.getElementById('yt'); if(!f) return;
  var got=false,last=0,dur=0;
  function listen(){try{f.contentWindow.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*');}catch(e){}}
  f.addEventListener('load',function(){listen();var n=0;var iv=setInterval(function(){if(got||++n>20){clearInterval(iv);return;}listen();},500);});
  window.addEventListener('message',function(e){
    if(!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(String(e.origin||''))) return;
    var d;try{d=typeof e.data==='string'?JSON.parse(e.data):e.data;}catch(x){return;}
    if(!d||d.event!=='infoDelivery'||!d.info) return; got=true;
    if(typeof d.info.duration==='number') dur=d.info.duration;
    var t=d.info.currentTime; if(typeof t!=='number') return;
    var now=Date.now(); var paused=d.info.playerState===2;
    if(!paused&&now-last<5000) return; last=now;
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'pos',t:t,d:dur}));
  });
})();`;

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
  videoUrl, thumbnail, isCreole, offline, durationLabel, autoStart = false, positionKey, uid,
}: {
  videoUrl: string;
  thumbnail?: string | null;
  isCreole?: boolean;
  offline: boolean;
  /** "14 min" — only a real duration; omitted when unknown. */
  durationLabel?: string | null;
  autoStart?: boolean;
  /** "<courseId>:<lessonId>" — enables resume (save + restore the position). */
  positionKey?: string;
  uid?: string | null;
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

  // Resume (CON-02): this lesson's saved position on this device, read before
  // the tap; it becomes the embed's `start=`. The WebView waits for this read
  // (one AsyncStorage get) so it never loads twice; the start is then locked
  // for this mount so later saves do not reload the playing video.
  const [resumeAt, setResumeAt] = useState(0);
  const [resumeLoaded, setResumeLoaded] = useState(!positionKey);
  useEffect(() => {
    let alive = true;
    setResumeAt(0);
    if (!positionKey) { setResumeLoaded(true); return undefined; }
    setResumeLoaded(false);
    resumeSecondsFor(uid, positionKey)
      .then((s) => { if (alive) setResumeAt(s); })
      .catch(() => undefined)
      .finally(() => { if (alive) setResumeLoaded(true); });
    return () => { alive = false; };
  }, [positionKey, uid]);
  const lockedStart = useRef<{ key: string; at: number } | null>(null);
  if (!started || !resumeLoaded) lockedStart.current = null;
  else if (!lockedStart.current || lockedStart.current.key !== (positionKey ?? '')) lockedStart.current = { key: positionKey ?? '', at: resumeAt };
  const startAt = lockedStart.current?.at ?? 0;

  const onBridgeMessage = (e: { nativeEvent: { data: string } }) => {
    if (!positionKey) return;
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!m || m.type !== 'pos' || typeof m.t !== 'number' || !Number.isFinite(m.t)) return;
    const d = typeof m.d === 'number' && Number.isFinite(m.d) && m.d > 0 ? m.d : undefined;
    void saveVideoPosition(uid, positionKey, m.t, d);
  };

  const ytId = extractYouTubeId(videoUrl);
  const embedUrl = ytId
    ? youTubeEmbedUrl(ytId, { autoplay: true, start: startAt, jsapiOrigin: positionKey ? SHELL_ORIGIN : undefined })
    : videoUrl;
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
    <iframe id="yt" src="${embedUrl}" style="position:absolute;inset:0;width:100%;height:100%;border:0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
    ${ytId && positionKey ? `<script>${BRIDGE_JS}</script>` : ''}
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
        accessibilityLabel={`${resumeAt > 0 ? t(`Reprendre la vidéo à ${formatResume(resumeAt)}`, `Kontinye videyo a nan ${formatResume(resumeAt)}`) : t('Lire la vidéo', 'Jwe videyo a')}${durationLabel ? `, ${durationLabel}` : ''}`}
      >
        {resumeAt > 0 ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 12, bottom: 12, backgroundColor: PILL_BG, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 }}
          >
            <Text maxFontSizeMultiplier={1.4} style={{ fontFamily: fonts.headingBold, fontSize: 14, lineHeight: 18, color: '#ffffff' }}>
              {t(`Reprendre à ${formatResume(resumeAt)}`, `Kontinye nan ${formatResume(resumeAt)}`)}
            </Text>
          </View>
        ) : null}
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

  if (!resumeLoaded) {
    // A few ms (one local read) so the player starts at the saved second.
    return (
      <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={box}>
      <WebView
        key={attempt}
        source={{ html, baseUrl: SHELL_ORIGIN }}
        onMessage={onBridgeMessage}
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
