/**
 * examNaming — human names for exam sessions.
 *
 * The catalog's official titles ("EXAMENS DE FIN D'ÉTUDES SECONDAIRES
 * BACCALAURÉAT RÉGULIER - JUILLET 2025") and raw type labels ("Bac
 * permanent", "Quartile") read like a records office, not a learning
 * product. Rows on the subject page lead with what a student actually
 * scans for — the session and year — and demote the administrative type
 * to a subtitle.
 */

import { sessionLabel, examTypeLabel } from './examUtils';
import { TRACK_BY_CODE } from '../config/trackConfig';

export interface SessionName {
  title: string;
  subtitle: string;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Name one exam row shown under a subject heading (subject + level are
 * already on the page, so neither is repeated here).
 *
 *   "juillet 2025" + régulier → "Session de juillet 2025" / "Épreuve régulière"
 *   topic "Probabilités"      → "Probabilités" / "Session de mars 2021"
 *   nothing but a year        → "Épreuve officielle 2019" / ""
 */
export function sessionRowName(exam: any, lang: 'fr' | 'ht' = 'fr'): SessionName {
  const ht = lang === 'ht';
  const year = exam?.year ? String(exam.year) : '';
  const session = exam?._session || '';
  const topic = (exam?._topic || '').trim();
  const typeRaw = exam?._examType || '';
  const typeLbl = examTypeLabel(typeRaw);

  // Administrative type, demoted and humanized for the subtitle.
  const typeSub = (() => {
    if (!typeLbl) return '';
    if (/permanent/i.test(typeLbl)) return ht ? 'Sesyon pèmanan' : 'Session permanente';
    if (/régulier/i.test(typeLbl)) return ht ? 'Sesyon regilye' : 'Session régulière';
    if (/rappel/i.test(typeLbl)) return ht ? 'Sesyon rapèl' : 'Session des rappels';
    if (/sujet type|modèle/i.test(typeLbl)) return ht ? 'Sijè modèl' : 'Sujet type';
    return typeLbl;
  })();

  const sess = sessionLabel(session); // "Session de juillet" | ''
  const sessHt = sess ? sess.replace(/^Session (de |d')/, 'Sesyon ') : '';

  // Filière marker — the ONLY thing distinguishing same-session papers
  // (the 2025 Bac has one maths paper per track). Leads the subtitle.
  const tracks = (Array.isArray(exam?.tracks) ? exam.tracks : [])
    .filter((tr: string) => tr && tr !== 'ALL')
    .map((tr: string) => (TRACK_BY_CODE as any)[tr]?.shortLabel || tr);
  const trackStr = tracks.length ? tracks.join(' · ') : '';
  const withTrack = (sub: string) => [trackStr, sub].filter(Boolean).join(' · ');

  if (topic) {
    const sub = sess ? `${ht ? sessHt : sess} ${year}`.trim() : typeSub;
    return { title: capitalize(topic), subtitle: withTrack(sub) };
  }

  if (sess) {
    return { title: `${ht ? sessHt : sess} ${year}`.trim(), subtitle: withTrack(typeSub) };
  }

  if (/sujet type|modèle/i.test(typeLbl)) {
    return { title: ht ? `Sijè modèl ${year}`.trim() : `Sujet type ${year}`.trim(), subtitle: withTrack('') };
  }

  const generic = ht ? 'Egzamen ofisyèl' : 'Épreuve officielle';
  return { title: `${generic} ${year}`.trim(), subtitle: withTrack(typeSub) };
}

/** Year range of a set of exams — "2003 – 2025", or just "2025". */
export function yearRange(exams: any[]): string {
  let min = Infinity;
  let max = 0;
  for (const e of exams || []) {
    const y = parseInt(e?.year, 10);
    if (Number.isFinite(y)) {
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
  }
  if (!max) return '';
  return min === max ? String(max) : `${min} – ${max}`;
}
