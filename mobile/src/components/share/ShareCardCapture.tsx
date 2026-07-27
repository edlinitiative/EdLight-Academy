import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import useStore from '../../contexts/store';
import { getReferralCode } from '../../services/referralService';
import ShareCard, { type ShareCardData } from './ShareCard';

/**
 * Imperative handle for sharing a premium score/rank card as a 1080×1920 PNG to
 * the native share sheet (Instagram Stories, WhatsApp status, …).
 *
 * Usage: keep one <ShareCardCapture ref={ref} /> mounted on a screen (it renders
 * nothing visible), then call `ref.current.share({ mode:'score', … })`.
 *
 * The card renders OFF-SCREEN at its true 1080-wide size, waits for the logo to
 * load (ShareCard.onReady), then captures at exactly 1080×1920 so the exported
 * image is crisp on Instagram — no upscaling, no mockup.
 */
export interface ShareCardCaptureHandle {
  share: (data: ShareCardData) => Promise<void>;
  /** True while a capture/share is in flight (drives a button spinner). */
}

const ShareCardCapture = forwardRef<ShareCardCaptureHandle>(function ShareCardCapture(_props, ref) {
  const language = useStore((s) => s.language);
  const lang: 'fr' | 'ht' = language === 'ht' ? 'ht' : 'fr';

  const [data, setData] = useState<ShareCardData | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const shotRef = useRef<ViewShot>(null);
  const resolveRef = useRef<(() => void) | null>(null);
  const capturedRef = useRef(false);

  const finish = useCallback(() => {
    setData(null);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  // Fired by ShareCard once it's laid out + the logo has loaded.
  const onReady = useCallback(async () => {
    if (capturedRef.current || !shotRef.current) return;
    capturedRef.current = true;
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: lang === 'ht' ? 'Pataje nòt ou' : 'Partager ton score',
        });
      }
    } catch {
      /* capture/share failed or user cancelled — fail silently */
    } finally {
      finish();
    }
  }, [finish, lang]);

  useImperativeHandle(ref, () => ({
    share: (d: ShareCardData) =>
      new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        capturedRef.current = false;
        // Fetch the referral code (best-effort) so the CTA chip is an invite,
        // then mount the off-screen card; onReady drives the capture.
        getReferralCode()
          .then((r) => setCode(r?.code ?? null))
          .catch(() => setCode(null))
          .finally(() => setData(d));
      }),
  }));

  if (!data) return null;

  return (
    // Rendered off-screen (far left) at full opacity so view-shot captures a
    // fully-painted card. collapsable=false keeps the node alive on Android.
    <View
      pointerEvents="none"
      collapsable={false}
      style={{ position: 'absolute', left: -4000, top: 0, width: 1080, height: 1920 }}
    >
      <ViewShot ref={shotRef} style={{ width: 1080, height: 1920 }}>
        <ShareCard data={data} lang={lang} code={code} onReady={onReady} />
      </ViewShot>
    </View>
  );
});

export default ShareCardCapture;
