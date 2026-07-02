import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Renders an exam figure by loading the web app's FigureRenderer through the
 * /figure-embed page (the description travels in the URL hash). The page posts
 * its rendered content height back via postMessage so the WebView auto-sizes.
 * If the page can't load (offline, embed not deployed), we fall back to the
 * plain-text description in a neutral card.
 */

const PRIMARY = '#0857A6';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e8edf5';

const EMBED_BASE = 'https://edlight-academy.web.app/figure-embed';

const cardShadow = {
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
} as const;

const card = {
  backgroundColor: '#ffffff',
  borderWidth: 1,
  borderColor: BORDER,
  borderRadius: 16,
} as const;

interface ExamFigureProps {
  description: string;
}

export default function ExamFigure({ description }: ExamFigureProps) {
  const [height, setHeight] = useState(120);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // The description travels in the `d` query param — WKWebView mangles long
  // encoded hash fragments, which silently truncated multi-row figures. The
  // measured card width travels as ?w= so the page pins its viewport to
  // exactly this width before first paint.
  const uri = useMemo(
    () => `${EMBED_BASE}?d=${encodeURIComponent(String(description ?? ''))}${width > 0 ? `&w=${Math.round(width)}` : ''}`,
    [description, width],
  );

  // WKWebView can pick a wide legacy layout viewport and crop the page to the
  // left half. Pin the page's viewport to the WebView's measured width so the
  // figure lays out at exactly the card size, then re-report the height.
  const viewportFix = width > 0
    ? `(function(){
        var m = document.querySelector('meta[name=viewport]');
        if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
        m.setAttribute('content', 'width=${Math.round(width)}, initial-scale=1, maximum-scale=1');
        var post = function(){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(document.body.scrollHeight)); };
        setTimeout(post, 100); setTimeout(post, 400);
      })(); true;`
    : 'true;';

  return (
    <View style={{ marginTop: 14 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: MUTED,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 6,
        }}
      >
        Figure
      </Text>

      {failed ? (
        // Offline / embed unavailable → plain description, neutral card.
        <View style={[card, cardShadow, { padding: 14 }]}>
          <Text style={{ fontSize: 13, color: TEXT, lineHeight: 20 }}>
            {String(description ?? '')}
          </Text>
        </View>
      ) : (
        <View
          style={[card, cardShadow, { overflow: 'hidden' }]}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          <WebView
            key={width > 0 ? `w${Math.round(width)}` : 'init'}
            source={{ uri }}
            injectedJavaScript={viewportFix}
            style={{ height, backgroundColor: '#ffffff' }}
            onMessage={(e) => {
              const h = Number(e.nativeEvent?.data);
              if (Number.isFinite(h) && h > 0) {
                setHeight(Math.min(Math.max(h, 60), 900));
              }
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            originWhitelist={['*']}
          />
          {loading ? (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ffffff',
              }}
            >
              <ActivityIndicator size="small" color={PRIMARY} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
