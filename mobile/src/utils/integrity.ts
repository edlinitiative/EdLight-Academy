import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Application from 'expo-application';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Tournament integrity signals, gathered on the device.
 *
 * Everything here is EVIDENCE, never enforcement. Not one of these functions
 * blocks a student or changes a score — they annotate a submission so a human
 * reviewing a prize claim knows where to look. That is deliberate and it is the
 * rule from the design doc: disqualifying a real student live, on a stream,
 * over a false positive is far worse than catching a cheat in review two days
 * later. A notification, an incoming call and a low-battery alert all look
 * exactly like tabbing out to an AI.
 *
 * None of this is a substitute for the two things that actually work: the
 * answer key never leaving the server, and the speed tiers making a
 * screenshot-and-look-it-up round trip score half at best.
 */

/**
 * A stable-per-install identifier, used to notice one device registering many
 * accounts.
 *
 * Deliberately NOT a fingerprint. It is the OS-provided per-install id, which
 * resets when the app is reinstalled and never identifies a person or follows
 * them across apps. It exists to make "forty accounts from one phone" visible,
 * and it is worth being clear that the honest case for that is common here:
 * students share phones, and a shared phone is not cheating. That is exactly
 * why this flags rather than blocks.
 */
export async function deviceHash(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId() ?? null;
    }
    return await Application.getIosIdForVendorAsync();
  } catch {
    // A device that will not identify itself is not evidence of anything.
    return null;
  }
}

/**
 * Counts how often the app left the foreground during one question.
 *
 * iOS reports 'inactive' for the app switcher, Control Centre, a notification
 * banner being pulled down, and an incoming call — so this counts LEAVING, not
 * every state change, and the reviewer sees a count rather than a verdict.
 * Someone who left four times during a 25-question round and won is a different
 * conversation from someone who never left; neither is proof.
 */
export function useFocusLossCounter(active: boolean) {
  const losses = useRef(0);
  const awayMs = useRef(0);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        if (leftAt.current != null) {
          awayMs.current += Date.now() - leftAt.current;
          leftAt.current = null;
        }
        return;
      }
      // background or inactive
      if (leftAt.current == null) {
        leftAt.current = Date.now();
        losses.current += 1;
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [active]);

  /** Read and reset — called once per question, so each answer carries its own. */
  const takeReading = useCallback(() => {
    // A question answered while still away has an open interval; close it so the
    // time abroad is not silently lost.
    const openInterval = leftAt.current != null ? Date.now() - leftAt.current : 0;
    const reading = { focusLosses: losses.current, awayMs: awayMs.current + openInterval };
    losses.current = 0;
    awayMs.current = 0;
    leftAt.current = leftAt.current != null ? Date.now() : null;
    return reading;
  }, []);

  return takeReading;
}

/**
 * How suspicious a submission looks, from the device's side only.
 *
 * Returns reasons, not a verdict, and the caller sends them with the answer for
 * the server to record. The server applies its own checks on top — the device's
 * account of itself is the least trustworthy evidence there is, which is why
 * the timing that decides a score is measured server-side.
 */
export function localFlags(input: { focusLosses: number; awayMs: number }): string[] {
  const flags: string[] = [];
  // One glance at a notification is not a finding. Repeatedly leaving during a
  // single question is worth a reviewer's attention.
  if (input.focusLosses >= 2) flags.push('focus-loss-repeated');
  // Long enough to read a question elsewhere and come back.
  if (input.awayMs >= 8_000) flags.push('focus-loss-long');
  return flags;
}

/**
 * Blocks screenshots and screen recording while a tournament question is on
 * screen.
 *
 * Supported on BOTH platforms: Android via FLAG_SECURE, iOS for recordings
 * since 11 and screenshots since 13. The capture still happens — the file the
 * student gets is blank, which is the behaviour people recognise from banking
 * and messaging apps.
 *
 * Scoped to the live screen ONLY, and that scope is the point. Everyday play
 * must stay capturable, because students sharing their scores is the referral
 * loop this whole product depends on. Blocking capture app-wide would trade a
 * growth mechanic for an anti-cheat measure that a second phone defeats anyway.
 *
 * What this actually buys: it forces a cheat onto a second device, and
 * photographing a screen, typing it into an AI and reading the answer back does
 * not finish inside the 12-second full-points tier. The block is not the
 * defence; it is what makes the timer the defence.
 *
 * Requires a native build — this is the one part of the Arena that cannot ship
 * over the air.
 */
export function useBlockScreenCapture(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let released = false;
    ScreenCapture.preventScreenCaptureAsync('arena').catch(() => {
      // An older OS, or a platform that will not honour it. The tiers still
      // hold, so a failure here degrades the deterrent rather than the game.
    });
    return () => {
      if (released) return;
      released = true;
      ScreenCapture.allowScreenCaptureAsync('arena').catch(() => {});
    };
  }, [active]);
}

/**
 * Fires when the student takes a screenshot anyway, so the app can say so.
 *
 * On iOS the capture is already blank by the time this fires; the point is to
 * tell them why, rather than leaving them thinking the app is broken.
 */
export function useScreenshotNotice(active: boolean, onAttempt: () => void) {
  useEffect(() => {
    if (!active) return;
    const sub = ScreenCapture.addScreenshotListener(onAttempt);
    return () => sub.remove();
  }, [active, onAttempt]);
}
