/** Arène sound — pure audio analysis + 16-bit PCM WAV encoding (for review exports). */

export interface AudioStats {
  /** Max absolute sample value over all channels (1.0 = digital full scale). */
  peak: number;
  peakDb: number;
  /** RMS over the audible part. */
  rms: number;
  /** Seconds until the signal last exceeds −60 dBFS. */
  audibleDuration: number;
}

const toDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export function analyze(channels: Float32Array[], sampleRate: number, floorDb = -60): AudioStats {
  const floor = Math.pow(10, floorDb / 20);
  let peak = 0;
  let last = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
      if (a > floor && i > last) last = i;
    }
  }
  let sum = 0;
  let n = 0;
  for (const ch of channels) {
    for (let i = 0; i <= last && i < ch.length; i++) { sum += ch[i] * ch[i]; n++; }
  }
  const rms = n ? Math.sqrt(sum / n) : 0;
  return { peak, peakDb: toDb(peak), rms, audibleDuration: (last + 1) / sampleRate };
}

/** Interleaved 16-bit PCM WAV. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numCh = channels.length;
  const len = channels[0] ? channels[0].length : 0;
  const dataBytes = len * numCh * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * numCh * 2, true);
  dv.setUint16(32, numCh * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      dv.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}
