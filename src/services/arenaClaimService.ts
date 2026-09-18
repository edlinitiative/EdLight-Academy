/**
 * arenaClaimService — what a winner's browser is allowed to do.
 *
 * Three calls and one upload. The shape is deliberately lopsided: the student
 * can READ their own claim from Firestore (the rules allow exactly that, their
 * own row and nobody else's) but every WRITE goes through `/api/arena/claim`,
 * because a claim a claimant can edit is not evidence of anything.
 *
 * The consent form is the one exception to "nothing leaves the browser except
 * JSON": it uploads straight to Cloud Storage. That is not a shortcut around
 * the API — `storage.rules` pins the path to the uploader's own uid and denies
 * every read, including theirs — it is just the only sane way to move eight
 * megabytes. The API is told afterwards, and checks that the object is really
 * there and really theirs before it records anything.
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { db, auth, authedFetch } from './firebase';

export type ClaimState = 'open' | 'claimed' | 'verified' | 'rejected' | 'expired';

export interface ConsentFile {
  path: string;
  size: number;
  contentType: string;
  uploadedAt: number;
}

export interface MyClaim {
  uid: string;
  rank: number;
  finishRank: number | null;
  prizeCents: number;
  state: ClaimState;
  contact: string | null;
  isMinor: boolean | null;
  guardian: { name: string; contact: string; relationship: string | null } | null;
  claimedAt: number;
  expiresAt: number;
  consent: ConsentFile | null;
  reviewNote: string | null;
  rolledDownFrom: number | null;
}

export class ClaimError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || code);
    this.name = 'ClaimError';
    this.code = code;
  }
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function millis(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

function readConsent(v: any): ConsentFile | null {
  if (!v || typeof v.path !== 'string') return null;
  return {
    path: v.path,
    size: num(v.size),
    contentType: str(v.contentType) || '',
    uploadedAt: millis(v.uploadedAt),
  };
}

/**
 * Watch my own claim.
 *
 * A listener rather than a fetch because the state changes underneath the
 * student without them doing anything: an admin verifies, the sweep expires an
 * untouched window, a roll-down hands them a prize they were not offered an
 * hour ago. A page that only reads once shows a stale answer at exactly the
 * moment the answer matters.
 */
export function watchMyClaim(
  tid: string,
  onClaim: (claim: MyClaim | null) => void,
  onError?: (e: Error) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { onClaim(null); return () => undefined; }

  return onSnapshot(
    doc(db, 'tournaments', tid, 'claims', uid),
    (snap) => {
      const d = snap.data() as any;
      if (!d) { onClaim(null); return; }
      onClaim({
        uid,
        rank: num(d.rank),
        finishRank: typeof d.finishRank === 'number' ? d.finishRank : null,
        prizeCents: num(d.prizeCents),
        state: (str(d.state) || 'open') as ClaimState,
        contact: str(d.contact),
        isMinor: typeof d.isMinor === 'boolean' ? d.isMinor : null,
        guardian: d.guardian && typeof d.guardian === 'object' ? {
          name: String(d.guardian.name || ''),
          contact: String(d.guardian.contact || ''),
          relationship: str(d.guardian.relationship),
        } : null,
        claimedAt: millis(d.claimedAt),
        expiresAt: millis(d.expiresAt),
        consent: readConsent(d.consent),
        reviewNote: str(d.reviewNote),
        rolledDownFrom: typeof d.rolledDownFrom === 'number' ? d.rolledDownFrom : null,
      });
    },
    (e) => onError?.(e as Error),
  );
}

async function post(body: Record<string, unknown>): Promise<any> {
  const res = await authedFetch('/api/arena/claim', body);
  let payload: any = {};
  try { payload = await res.json(); } catch { /* an empty body is still an error code */ }
  if (!res.ok) throw new ClaimError(String(payload.error || `http_${res.status}`), str(payload.message) || undefined);
  return payload;
}

export interface ClaimSubmission {
  contact: string;
  isMinor: boolean;
  guardian?: { name: string; contact: string; relationship?: string } | null;
  /** Which language the guardian email should be written in. */
  lang: 'fr' | 'ht';
}

/** Submit the claim. The prize rank is decided server-side, never sent. */
export async function submitClaim(tid: string, submission: ClaimSubmission): Promise<{
  rank: number;
  prizeCents: number;
  expiresAt: number;
  consentRequired: boolean;
  consentEmail: { sent: boolean; to?: string[]; error?: string } | null;
}> {
  const body = await post({
    action: 'claim',
    tournamentId: tid,
    contact: submission.contact,
    isMinor: submission.isMinor,
    guardian: submission.guardian ?? null,
    lang: submission.lang,
  });
  return {
    rank: num(body.rank),
    prizeCents: num(body.prizeCents),
    expiresAt: num(body.expiresAt),
    consentRequired: body.consentRequired === true,
    consentEmail: body.consentEmail ?? null,
  };
}

/** What a parent can produce: a signed PDF, a scan, or a phone photo. */
export const CONSENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp';
export const CONSENT_MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
};

/**
 * Upload the signed form, then tell the API where it is.
 *
 * The filename carries a timestamp because `storage.rules` denies `update` and
 * `delete`: a corrected form lands beside the first one rather than replacing
 * it, so a form an admin has already looked at cannot be swapped underneath
 * them. The claim points at the latest; the trail keeps the rest.
 *
 * Size and type are checked here AND in the rules AND on the server. Three
 * copies sounds redundant until you notice each one catches a different
 * mistake: this one gives the family a sentence they can act on instead of a
 * silent failure at the end of a slow upload on a phone connection.
 */
export async function uploadConsentForm(tid: string, file: File): Promise<ConsentFile> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new ClaimError('not_signed_in');

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) throw new ClaimError('unsupported_type');
  if (file.size > CONSENT_MAX_BYTES) throw new ClaimError('file_too_large');
  if (file.size === 0) throw new ClaimError('file_empty');

  const path = `arena-consent/${tid}/${uid}/consent-${Date.now()}.${ext}`;

  try {
    await uploadBytes(ref(getStorage(), path), file, { contentType: file.type });
  } catch (err) {
    // A rules refusal and a dead network look identical from here, so the code
    // stays generic and the page says "try again" rather than guessing.
    console.error('[arenaClaim] consent upload failed:', err);
    throw new ClaimError('upload_failed');
  }

  const body = await post({ action: 'consent', tournamentId: tid, path });
  return {
    path: String(body.path || path),
    size: num(body.size, file.size),
    contentType: String(body.contentType || file.type),
    uploadedAt: Date.now(),
  };
}
