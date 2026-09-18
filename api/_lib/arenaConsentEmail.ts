/**
 * The email a winning minor's family receives.
 *
 * Section M's verification is a short call. This is the piece that comes
 * before it: a prize won by a child is released to a parent, and the parent
 * has to actually agree, in writing, before anybody sends money. So the moment
 * a claim is submitted with `isMinor: true`, this goes out — to the student
 * and, when the guardian contact is an email address, to the guardian too.
 *
 * Both recipients get the SAME message. A parent who receives an email their
 * child cannot see has no way to check what their child was told, and a child
 * who is the only recipient becomes the messenger for a document about
 * themselves. One text, both inboxes, nothing to reconcile later.
 *
 * WHAT THIS EMAIL NEVER ASKS FOR: a photograph of an identity document, a
 * document number, a bank detail, or a payment. Those are the phrases a scam
 * built on top of this tournament would use, so the email says plainly that we
 * will never ask for them — a family that has read this once has a test they
 * can apply to the next message they get.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'EdLight Academy <sandra@edlight.org>';
const APP_URL = 'https://academy.edlight.org';

const AZURE = '#1B6FE0';
const INK = '#141A21';
const MUTED = '#5B6572';

export type ConsentEmailLang = 'fr' | 'ht';

export interface ConsentEmailArgs {
  to: string[];
  lang: ConsentEmailLang;
  /** The winner's display name, as the podium showed it. */
  playerName: string;
  guardianName: string;
  tournamentTitle: string;
  rank: number;
  prizeCents: number;
  /** Epoch ms — the published deadline, stated as a date, not a countdown. */
  expiresAt: number;
  tournamentId: string;
}

const money = (cents: number): string => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

function deadline(ms: number, lang: ConsentEmailLang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ht' ? 'fr-HT' : 'fr-FR', {
      dateStyle: 'full', timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

const STRINGS = {
  fr: {
    subject: (title: string) => `Autorisation parentale — ${title}`,
    hello: (g: string) => `Bonjour ${g},`,
    won: (p: string, r: number, prize: string, title: string) =>
      `${p} a terminé ${r}<sup>${r === 1 ? 'er' : 'e'}</sup> au tournoi ${title} et a gagné ${prize}.`,
    because:
      'Comme ${p} a moins de 18 ans, le prix est remis à un parent ou tuteur. Il nous faut votre autorisation écrite.',
    steps: 'Trois étapes :',
    step1: 'Ouvrez le formulaire, il est déjà rempli avec les informations du tournoi.',
    step2: 'Imprimez-le et signez-le, ou signez-le sur écran et enregistrez-le en PDF.',
    step3: 'Reconnectez-vous sur la page de réclamation et déposez le formulaire signé.',
    cta: 'Ouvrir le formulaire',
    claimCta: 'Déposer le formulaire signé',
    deadline: (d: string) => `À faire avant le ${d}. Passé ce délai, le prix passe au concurrent suivant — c’est la règle annoncée avant le tournoi.`,
    never: 'Nous ne vous demanderons JAMAIS une photo de pièce d’identité, un numéro de document, des informations bancaires, ni un paiement. Si un message vous demande cela en notre nom, il ne vient pas de nous.',
    questions: 'Une question ? Répondez simplement à cet email.',
    signoff: 'L’équipe EdLight',
  },
  ht: {
    subject: (title: string) => `Otorizasyon paran — ${title}`,
    hello: (g: string) => `Bonjou ${g},`,
    won: (p: string, r: number, prize: string, title: string) =>
      `${p} fini nimewo ${r} nan tounwa ${title} epi li genyen ${prize}.`,
    because:
      'Paske ${p} poko gen 18 an, se yon paran oswa yon responsab ki resevwa pri a. Nou bezwen otorizasyon ou alekri.',
    steps: 'Twa etap :',
    step1: 'Louvri fòm nan, li deja ranpli ak enfòmasyon tounwa a.',
    step2: 'Enprime l epi siyen l, oswa siyen l sou ekran an epi anrejistre l an PDF.',
    step3: 'Rekonekte sou paj reklamasyon an epi depoze fòm ou siyen an.',
    cta: 'Louvri fòm nan',
    claimCta: 'Depoze fòm siyen an',
    deadline: (d: string) => `Fè sa anvan ${d}. Apre dat sa a, pri a pase bay moun ki vin apre a — se règ nou te anonse anvan tounwa a.`,
    never: 'Nou p ap JANM mande ou yon foto kat idantite, yon nimewo dokiman, enfòmasyon labank, ni yon peman. Si yon mesaj mande ou sa nan non nou, li pa soti nan men nou.',
    questions: 'Ou gen yon kesyon ? Reponn imel sa a.',
    signoff: 'Ekip EdLight',
  },
} as const;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildConsentEmailHtml(args: ConsentEmailArgs): string {
  const t = STRINGS[args.lang] || STRINGS.fr;
  const player = esc(args.playerName);
  const formUrl = `${APP_URL}/arena/autorisation?tid=${encodeURIComponent(args.tournamentId)}`;
  const claimUrl = `${APP_URL}/arena/reclamation?tid=${encodeURIComponent(args.tournamentId)}`;

  const button = (href: string, label: string, primary: boolean) => `
    <a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;
       background:${primary ? AZURE : '#ffffff'};color:${primary ? '#ffffff' : AZURE};
       border:1px solid ${AZURE};text-decoration:none;font-weight:700;font-size:14px;
       margin:0 8px 8px 0;">${esc(label)}</a>`;

  return `<!doctype html>
<html lang="${args.lang === 'ht' ? 'ht' : 'fr'}"><body style="margin:0;padding:24px;background:#F6F7F9;
  font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${INK};">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
    <p style="margin:0 0 16px;font-size:15px;">${esc(t.hello(args.guardianName))}</p>

    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">
      ${t.won(player, args.rank, money(args.prizeCents), esc(args.tournamentTitle))}
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">
      ${t.because.replace('${p}', player)}
    </p>

    <p style="margin:0 0 8px;font-size:14px;font-weight:700;">${esc(t.steps)}</p>
    <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7;color:${MUTED};">
      <li>${esc(t.step1)}</li>
      <li>${esc(t.step2)}</li>
      <li>${esc(t.step3)}</li>
    </ol>

    <div style="margin:0 0 20px;">
      ${button(formUrl, t.cta, true)}
      ${button(claimUrl, t.claimCta, false)}
    </div>

    <p style="margin:0 0 20px;font-size:14px;line-height:1.55;">
      ${esc(t.deadline(deadline(args.expiresAt, args.lang)))}
    </p>

    <p style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#FFF6E8;
       font-size:13px;line-height:1.55;">${esc(t.never)}</p>

    <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">${esc(t.questions)}</p>
    <p style="margin:0;font-size:13px;color:${MUTED};">${esc(t.signoff)}</p>
  </div>
</body></html>`;
}

/**
 * Send it. Never throws: a claim must not fail because an email did.
 *
 * The claim is already written by the time this runs, and the page the student
 * is looking at tells them the same three steps — so a bounced email costs a
 * reminder, not a prize. The failure is logged and returned, and the caller
 * records it on the claim so an admin chasing a silent winner can see that the
 * message never went out.
 */
export async function sendConsentEmail(
  args: ConsentEmailArgs,
): Promise<{ sent: true; to: string[] } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: 'email_not_configured' };

  const to = args.to.filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
  if (to.length === 0) return { error: 'no_email_recipient' };

  const t = STRINGS[args.lang] || STRINGS.fr;
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to,
        subject: t.subject(args.tournamentTitle),
        html: buildConsentEmailHtml(args),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[arenaConsentEmail] Resend ${res.status}: ${detail.slice(0, 300)}`);
      return { error: `resend_${res.status}` };
    }
    return { sent: true, to };
  } catch (err) {
    console.error('[arenaConsentEmail] request failed:', err);
    return { error: 'send_failed' };
  }
}
