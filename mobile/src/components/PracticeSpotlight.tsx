import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, Dimensions, StyleSheet, findNodeHandle, UIManager,
} from 'react-native';

const PRIMARY = '#0857A6';
const DIM = 'rgba(15,23,42,0.72)';
const { height: SCREEN_H } = Dimensions.get('window');
const PAD = 8;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * One-time coach mark that spotlights a specific on-screen element (measured via
 * its ref) and shows a tooltip explaining it. Used to point at the per-lesson
 * Flashcards / Exercices buttons the first time a lesson is opened.
 */
export default function PracticeSpotlight({
  visible, targetRef, onDismiss, title, body, cta,
}: {
  visible: boolean;
  targetRef: React.RefObject<any>;
  onDismiss: () => void;
  title: string;
  body: string;
  cta: string;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!visible) { setRect(null); return; }
    let tries = 0;
    const measure = () => {
      const node = targetRef.current && findNodeHandle(targetRef.current);
      if (!node) { if (tries++ < 10) setTimeout(measure, 60); return; }
      UIManager.measureInWindow(node, (x, y, width, height) => {
        if (width > 0 && height > 0) setRect({ x, y, width, height });
        else if (tries++ < 10) setTimeout(measure, 60);
      });
    };
    // Wait a frame so layout has settled.
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [visible, targetRef]);

  if (!visible || !rect) return null;

  const holeTop = rect.y - PAD;
  const holeBottom = rect.y + rect.height + PAD;
  const holeLeft = rect.x - PAD;
  const holeRight = rect.x + rect.width + PAD;
  // Tooltip sits above the highlighted row (buttons are mid-screen).
  const tipBottom = SCREEN_H - holeTop + 14;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={onDismiss}>
        {/* 4 dim panels leaving a clear "hole" over the target */}
        <View style={[styles.dim, { top: 0, left: 0, right: 0, height: holeTop }]} />
        <View style={[styles.dim, { top: holeBottom, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.dim, { top: holeTop, left: 0, width: holeLeft, height: rect.height + PAD * 2 }]} />
        <View style={[styles.dim, { top: holeTop, left: holeRight, right: 0, height: rect.height + PAD * 2 }]} />

        {/* Highlight ring around the hole */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: holeLeft, top: holeTop,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            borderRadius: 16, borderWidth: 2, borderColor: '#ffffff',
          }}
        />

        {/* Tooltip above the target */}
        <View style={[styles.tip, { bottom: tipBottom }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity style={styles.btn} onPress={onDismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>{cta}</Text>
          </TouchableOpacity>
          <View style={styles.arrow} />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  tip: {
    position: 'absolute', left: 20, right: 20,
    backgroundColor: '#ffffff', borderRadius: 18, padding: 18,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  body: { fontSize: 14.5, lineHeight: 21, color: '#475569', marginBottom: 14 },
  btn: { alignSelf: 'flex-start', backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  arrow: {
    position: 'absolute', bottom: -9, left: '50%', marginLeft: -9,
    width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#ffffff',
  },
});
