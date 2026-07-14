// Prerender static, crawlable HTML for the public routes.
//
// The app is a client-rendered SPA: every route used to serve the same
// ~44-word dist/index.html shell, which fails Google's "substantial and
// unique content" bar (Ad Grants, SEO, link previews). This script clones the
// built dist/index.html once per public route, swaps the #root fallback for
// real page content (sourced from the corresponding React pages in
// src/pages/*), and rewrites the head metadata (title, description,
// canonical, og/twitter tags). React replaces #root on mount, so real users
// still get the full app; crawlers get meaningful HTML on the first response.
//
// Runs automatically after `npm run build` (postbuild). Output:
// dist/<route>/index.html, served via explicit rewrites in vercel.json.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist', 'index.html');
const ORIGIN = 'https://academy.edlight.org';

const NAV = `
  <nav aria-label="Sections principales" style="display:flex;flex-wrap:wrap;gap:12px;margin:0 0 28px">
    <a href="/" style="color:#0A66C2;text-decoration:none">Accueil</a>
    <a href="/courses" style="color:#0A66C2;text-decoration:none">Cours</a>
    <a href="/exams" style="color:#0A66C2;text-decoration:none">Examens blancs</a>
    <a href="/quizzes" style="color:#0A66C2;text-decoration:none">Quiz</a>
    <a href="/about" style="color:#0A66C2;text-decoration:none">À propos</a>
    <a href="/faq" style="color:#0A66C2;text-decoration:none">FAQ</a>
    <a href="/contact" style="color:#0A66C2;text-decoration:none">Contact</a>
  </nav>`;

const FOOTER = `
  <footer style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e2;color:#8a8a86;font-size:0.85rem">
    <p style="margin:0 0 6px">EdLight Academy est un programme d’<a href="https://edlight.org" style="color:#0A66C2">EdLight Initiative</a>,
    organisation à but non lucratif enregistrée au Canada (n° de société 1376443-5), basée à Montréal (Québec).</p>
    <p style="margin:0"><a href="/privacy" style="color:#0A66C2">Politique de confidentialité</a> ·
    <a href="/terms" style="color:#0A66C2">Conditions d’utilisation</a> ·
    <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a></p>
    <p style="margin:12px 0 0">Chargement de l’application…</p>
  </footer>`;

const wrap = (body) => `
  <div style="max-width:760px;margin:0 auto;padding:40px 20px;font-family:Inter,system-ui,-apple-system,sans-serif;color:#232322;line-height:1.6">
    ${NAV}
    ${body}
    ${FOOTER}
  </div>`;

const h1 = (t) => `<h1 style="font-size:1.8rem;line-height:1.25;margin:0 0 14px">${t}</h1>`;
const h2 = (t) => `<h2 style="font-size:1.25rem;margin:28px 0 10px">${t}</h2>`;
const h3 = (t) => `<h3 style="font-size:1.05rem;margin:18px 0 6px">${t}</h3>`;
const p = (t) => `<p style="margin:0 0 12px;color:#4a4a48">${t}</p>`;
const li = (t) => `<li style="margin:0 0 8px;color:#4a4a48">${t}</li>`;
const ul = (items) => `<ul style="margin:0 0 12px;padding-left:22px">${items.map(li).join('')}</ul>`;

// ─── /exams gets real numbers from the exam catalog index ───────────────────
function examStats() {
  try {
    const idx = JSON.parse(readFileSync(join(root, 'public', 'exam_catalog_index.json'), 'utf8'));
    const bySubject = new Map();
    const byLevel = new Map();
    let minYear = Infinity, maxYear = 0;
    for (const e of idx) {
      if (e.subject) bySubject.set(e.subject, (bySubject.get(e.subject) || 0) + 1);
      if (e.level) byLevel.set(e.level, (byLevel.get(e.level) || 0) + 1);
      const y = parseInt(e.year, 10);
      if (Number.isFinite(y)) { minYear = Math.min(minYear, y); maxYear = Math.max(maxYear, y); }
    }
    return { total: idx.length, bySubject, byLevel, minYear, maxYear };
  } catch {
    return null;
  }
}

const LEVEL_LABELS = {
  baccalaureat: 'Baccalauréat',
  universite: 'Concours d’université',
  '9e': '9e année fondamentale',
  '9eme_af': '9e année fondamentale',
  neuvieme: '9e année fondamentale',
};

function examsBody() {
  const s = examStats();
  const statsHtml = s ? `
    ${p(`Notre banque d’examens compte <strong>${s.total} épreuves officielles</strong>` +
      (s.maxYear ? ` couvrant les années ${s.minYear} à ${s.maxYear}` : '') + ', avec correction automatique et explications détaillées.')}
    ${h2('Épreuves par niveau')}
    ${ul([...s.byLevel.entries()].map(([lvl, n]) => `${LEVEL_LABELS[lvl] || lvl} — ${n} épreuves`))}
    ${h2('Matières couvertes')}
    ${p([...s.bySubject.keys()].sort((a, b) => a.localeCompare(b, 'fr')).join(' · '))}`
    : p('Des annales officielles du MENFP (9e année, Baccalauréat, concours d’université) avec correction automatique et explications détaillées.');

  return wrap(`
    ${h1('Examens blancs — annales officielles du MENFP')}
    ${p('Entraînez-vous dans les conditions réelles de l’examen : passez de vraies épreuves officielles (9e année fondamentale, Baccalauréat, concours d’entrée à l’université) directement en ligne, gratuitement.')}
    ${statsHtml}
    ${h2('Comment ça marche')}
    ${ul([
      'Choisissez une épreuve par matière, niveau et année.',
      'Répondez dans les conditions de l’examen, avec ou sans chronomètre.',
      'Recevez une correction automatique, question par question, avec des explications complètes.',
      'Suivez vos résultats pour savoir exactement quoi réviser ensuite.',
    ])}
    ${p('<a href="/quizzes" style="color:#0A66C2">Continuez avec les quiz par unité</a> ou <a href="/courses" style="color:#0A66C2">explorez les cours</a> pour revoir les notions.')}`);
}

// ─── Route content (French text sourced from src/pages/*) ────────────────────
const ROUTES = {
  about: {
    title: 'À propos — EdLight Academy',
    description:
      "EdLight Academy : une éducation STEM gratuite et de qualité pour chaque élève haïtien. Cours structurés, examens officiels du MENFP, quiz et suivi de progression, en français et en créole haïtien.",
    body: wrap(`
      ${h1('Une éducation de qualité pour chaque élève haïtien')}
      ${p("EdLight construit l’infrastructure pour une éducation STEM accessible et de qualité en Haïti : des cours structurés, des exercices d’examens officiels et un suivi de progression en temps réel, le tout au même endroit — gratuit, en français et en créole haïtien (Kreyòl).")}
      ${h2('Comment ça marche')}
      ${ul([
        '<strong>Apprenez</strong> — regardez des leçons vidéo courtes, organisées par matière, niveau et unité.',
        '<strong>Pratiquez</strong> — renforcez chaque leçon avec des exercices ciblés et des indices progressifs.',
        '<strong>Évaluez-vous</strong> — passez de vrais examens officiels (9e, Bac, université) avec correction automatique.',
        '<strong>Progressez</strong> — suivez vos résultats en temps réel et voyez exactement quoi réviser ensuite.',
      ])}
      ${h2('Ce que vous obtenez')}
      ${ul([
        '<a href="/courses" style="color:#0A66C2"><strong>Cours structurés</strong></a> — des parcours complets en sciences et mathématiques, du fondamental au supérieur.',
        '<a href="/exams" style="color:#0A66C2"><strong>Examens officiels</strong></a> — la banque d’annales MENFP (9e, Baccalauréat, université) avec corrections détaillées.',
        '<a href="/quizzes" style="color:#0A66C2"><strong>Exercices et quiz</strong></a> — entraînez-vous par unité avec des indices, trois essais et des explications complètes.',
      ])}
      ${h2('Notre approche pédagogique')}
      ${ul([
        '<strong>Vidéos courtes et ciblées</strong> — chaque concept est expliqué dans une vidéo claire et concise, pour apprendre à votre rythme.',
        '<strong>Pratique après chaque leçon</strong> — des questions ciblées après chaque leçon pour vérifier et renforcer la compréhension.',
        '<strong>Suivi de progression personnalisé</strong> — voyez clairement où vous en êtes, par leçon, unité et matière.',
        '<strong>Contenu bilingue</strong> — des ressources en français et en kreyòl pour servir chaque élève haïtien.',
      ])}
      ${h2('Nos valeurs')}
      ${ul([
        '<strong>Accessibilité</strong> — l’éducation de qualité est un droit, pas un privilège.',
        '<strong>Excellence</strong> — nous visons les meilleurs standards pédagogiques haïtiens et mondiaux.',
        '<strong>Communauté</strong> — construit par et pour les élèves et enseignants haïtiens.',
      ])}
      ${h2('Notre équipe')}
      ${p('Nous sommes une équipe engagée d’enseignants, d’éducateurs et d’ingénieurs haïtiens, unis par une conviction : chaque élève mérite une expérience d’apprentissage de classe mondiale, quel que soit son lieu de vie.')}
      ${p('<a href="/courses" style="color:#0A66C2">Explorer les cours</a> · <a href="/exams" style="color:#0A66C2">Voir les examens</a>')}`),
  },

  faq: {
    title: 'FAQ — Foire aux questions — EdLight Academy',
    description:
      'Réponses aux questions fréquentes sur EdLight Academy : comment commencer, où trouver des questions de pratique, le support mathématique, et comment nous contacter.',
    body: wrap(`
      ${h1('Foire aux questions (FAQ)')}
      ${p('Réponses aux questions fréquentes sur les cours, la pratique et le démarrage.')}
      ${h3('Comment commencer à apprendre ?')}
      ${p('Cliquez sur « Commencer » sur la page d’accueil pour vous connecter, ou explorez les cours pour choisir une matière et un niveau NS. Ouvrez un cours pour suivre les unités et les leçons.')}
      ${h3('Où trouver des questions de pratique ?')}
      ${p('Ouvrez la page Quiz pour la pratique par cours, niveau (NS I–IV) et unité. Dans un cours, vous pouvez aussi faire un « Quiz d’unité, 10 questions » après le dernier sous-chapitre.')}
      ${h3('Pourquoi n’y a-t-il pas de questions pour mon unité ?')}
      ${p('Certaines unités sont encore en cours d’ajout. Essayez une autre unité du même cours ou un autre niveau. De nouvelles questions sont ajoutées régulièrement.')}
      ${h3('Est-ce que le format mathématique est pris en charge ?')}
      ${p('Oui. Les questions et explications s’affichent avec le support mathématique afin que les équations s’affichent correctement.')}
      ${h3('EdLight Academy est-il vraiment gratuit ?')}
      ${p('Oui. Tous les cours, vidéos, quiz et examens blancs sont entièrement gratuits pour tous les élèves. EdLight Academy est un programme de l’organisation à but non lucratif EdLight Initiative.')}
      ${h3('Comment signaler un problème ou suggérer du contenu ?')}
      ${p('Utilisez la page <a href="/contact" style="color:#0A66C2">Contact</a> pour nous envoyer un message. Indiquez le cours, l’unité et une brève description de ce dont vous avez besoin.')}`),
  },

  contact: {
    title: 'Contact — EdLight Academy',
    description:
      'Contactez l’équipe EdLight Academy : questions sur les cours, partenariats, retours. Nous répondons en 1 à 2 jours ouvrables. info@edlight.org',
    body: wrap(`
      ${h1('Contactez-nous')}
      ${p('Une question, une idée de partenariat ou un retour ? Envoyez-nous un message, nous vous répondrons. En général, nous répondons en 1 à 2 jours ouvrables.')}
      ${h2('Par e-mail')}
      ${p('Écrivez-nous à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a>. Si votre question concerne un cours ou un quiz, indiquez la matière, le niveau (NS I–IV) et l’unité concernée pour une réponse plus rapide.')}
      ${h2('Dans l’application')}
      ${p('Connectez-vous et ouvrez la page Contact pour utiliser le formulaire intégré : choisissez votre profil (élève, futur élève, enseignant, partenaire), posez votre question, et nous vous répondrons par e-mail.')}
      ${h2('Avant d’écrire')}
      ${p('Consultez la <a href="/faq" style="color:#0A66C2">Foire aux questions</a> — la réponse s’y trouve peut-être déjà.')}`),
  },

  privacy: {
    title: 'Politique de confidentialité — EdLight Academy',
    description:
      'Comment EdLight Academy collecte, utilise et protège vos données : informations de compte, données d’apprentissage, partage limité, droits des élèves et des parents.',
    body: wrap(`
      ${h1('Politique de confidentialité')}
      ${p('Nous respectons votre vie privée. Cette page explique quelles données EdLight Academy collecte, comment elles sont utilisées, avec qui elles sont partagées et quels sont vos droits.')}
      ${p('<em>Date d’entrée en vigueur : 7 juillet 2026</em>')}
      ${h2('Qui sommes-nous')}
      ${p('EdLight Academy est une plateforme éducative gratuite qui aide les élèves haïtiens à préparer le Baccalauréat, avec des cours, des vidéos, des quiz et des examens en français et en créole haïtien (Kreyòl). Pour toute question relative à cette politique ou à vos données, contactez-nous à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a> ou consultez <a href="https://edlight.org" style="color:#0A66C2">edlight.org</a>.')}
      ${h2('Données que nous collectons')}
      ${ul([
        '<strong>Informations de compte :</strong> votre adresse e-mail et votre nom, fournis lors de l’inscription ou de la connexion. La connexion est gérée par Firebase Authentication, y compris la connexion avec Google (Google Sign-In).',
        '<strong>Données d’apprentissage :</strong> votre progression dans les cours et les leçons, vos tentatives et scores aux quiz et aux examens, vos points d’expérience (XP) et votre série de jours consécutifs (streak).',
        '<strong>Contenu que vous publiez :</strong> les commentaires que vous laissez sous les leçons.',
        '<strong>Informations techniques de base :</strong> des données d’appareil et d’utilisation (type d’appareil, navigateur, identifiants techniques) nécessaires au bon fonctionnement du service et aux notifications.',
      ])}
      ${h2('Comment nous utilisons vos données')}
      ${ul([
        'Vous donner accès aux cours, aux leçons, aux quiz et aux examens.',
        'Suivre et afficher votre progression, vos scores, votre XP et votre série de jours.',
        'Établir les classements (leaderboards) entre les élèves.',
        'Vous envoyer des notifications et des rappels d’étude.',
        'Assurer le fonctionnement, la sécurité et l’amélioration de la plateforme.',
      ])}
      ${h2('Partage et prestataires tiers')}
      ${p('Nous <strong>ne vendons pas</strong> vos données personnelles. Nous faisons appel à un nombre limité de prestataires de services qui traitent des données pour notre compte : Google Firebase — authentification (Firebase Authentication), base de données (Firestore) et notifications (Cloud Messaging) ; YouTube — les vidéos des leçons sont intégrées via des lecteurs YouTube ; le visionnage d’une vidéo peut être soumis à la politique de confidentialité de Google/YouTube.')}
      ${h2('Sécurité')}
      ${p('Vos données sont transmises de manière chiffrée (chiffrement en transit, HTTPS/TLS). Aucun système n’étant totalement infaillible, nous ne pouvons garantir une sécurité absolue, mais nous prenons des mesures raisonnables pour protéger vos informations.')}
      ${h2('Élèves et mineurs')}
      ${p('EdLight Academy s’adresse principalement à des élèves du secondaire, dont certains sont mineurs. Nous ne collectons que les données nécessaires à l’apprentissage et nous n’utilisons pas les données des élèves à des fins publicitaires. Si vous êtes le parent ou le tuteur d’un mineur et souhaitez consulter ou supprimer ses données, contactez-nous à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a>.')}
      ${h2('Conservation et suppression des données')}
      ${p('Nous conservons vos données tant que votre compte est actif. Vous pouvez à tout moment demander la suppression de votre compte et des données associées en écrivant à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a>. Nous traiterons votre demande dans un délai raisonnable.')}
      ${h2('Modifications de cette politique')}
      ${p('Nous pouvons mettre à jour cette politique de temps à autre. En cas de changement important, nous actualiserons la date d’entrée en vigueur indiquée ci-dessus.')}
      ${h2('Nous contacter')}
      ${p('Pour toute question concernant vos données ou cette politique de confidentialité, écrivez-nous à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a>.')}`),
  },

  terms: {
    title: 'Conditions d’utilisation — EdLight Academy',
    description:
      'Les conditions d’utilisation d’EdLight Academy : comptes et accès, utilisations autorisées, propriété intellectuelle, avertissements et contact.',
    body: wrap(`
      ${h1('Conditions d’utilisation')}
      ${p('Ces conditions régissent votre utilisation d’EdLight Academy. En utilisant le site, vous les acceptez.')}
      ${h2('1. Acceptation des conditions')}
      ${p('En accédant à la plateforme ou en l’utilisant, vous acceptez ces Conditions d’utilisation et notre <a href="/privacy" style="color:#0A66C2">Politique de confidentialité</a>.')}
      ${h2('2. Comptes et accès')}
      ${p('Vous êtes responsable de la confidentialité de votre compte et de toutes les activités qui s’y déroulent. Prévenez-nous de toute utilisation non autorisée.')}
      ${h2('3. Utilisations autorisées')}
      ${ul([
        'Utilisez le site pour un apprentissage personnel et non commercial.',
        'Respectez toutes les lois applicables et les droits d’autrui.',
        'N’essayez pas de perturber, de faire de l’ingénierie inverse ou de détourner la plateforme.',
      ])}
      ${h2('4. Contenu et propriété intellectuelle')}
      ${p('Les supports de cours et les quiz sont fournis pour votre apprentissage. Ne redistribuez pas et ne copiez pas le contenu sans autorisation.')}
      ${h2('5. Avertissements')}
      ${p('Le service est fourni « tel quel », sans garanties. Nous nous efforçons d’être exacts mais ne garantissons pas un contenu sans erreur ni une disponibilité ininterrompue.')}
      ${h2('6. Modifications et résiliation')}
      ${p('Nous pouvons mettre à jour la plateforme ou ces conditions de temps à autre. Nous pouvons suspendre ou résilier l’accès en cas de violation ou pour des raisons de sécurité.')}
      ${h2('7. Contact')}
      ${p('Des questions sur ces conditions ? Écrivez à <a href="mailto:info@edlight.org" style="color:#0A66C2">info@edlight.org</a>.')}`),
  },

  courses: {
    title: 'Cours gratuits — physique, chimie, maths, économie — EdLight Academy',
    description:
      'Cours gratuits en ligne pour les élèves haïtiens : physique, chimie, mathématiques et économie, du NS I au NS IV. Vidéos courtes, exercices et suivi de progression, en français et en kreyòl.',
    body: wrap(`
      ${h1('Des cours structurés, du NS I au NS IV')}
      ${p('Des parcours complets en sciences et mathématiques pour le secondaire haïtien, alignés sur le programme du MENFP et la préparation du Baccalauréat. Chaque cours est découpé en unités et en leçons vidéo courtes, suivies d’exercices de pratique.')}
      ${h2('Matières disponibles')}
      ${ul([
        '<strong>Physique</strong> — mécanique, électricité, optique, ondes… du NS I au NS IV.',
        '<strong>Chimie</strong> — structure de la matière, réactions, solutions, chimie organique.',
        '<strong>Mathématiques</strong> — algèbre, analyse, géométrie, probabilités et statistiques.',
        '<strong>Économie</strong> — notions fondamentales, micro et macroéconomie pour le secondaire.',
      ])}
      ${h2('Comment se déroule un cours')}
      ${ul([
        'Chaque concept est expliqué dans une vidéo claire et concise, pour apprendre à votre rythme.',
        'Des questions ciblées après chaque leçon vérifient et renforcent la compréhension.',
        'Un « Quiz d’unité » de 10 questions clôt chaque unité.',
        'Votre progression est suivie par leçon, unité et matière.',
      ])}
      ${p('Le contenu est disponible en français et en créole haïtien (Kreyòl), et tout est gratuit. <a href="/exams" style="color:#0A66C2">Préparez ensuite les examens officiels</a> ou <a href="/quizzes" style="color:#0A66C2">entraînez-vous avec les quiz</a>.')}`),
  },

  quizzes: {
    title: 'Quiz et exercices de pratique — EdLight Academy',
    description:
      'Des milliers de questions de pratique par matière, niveau (NS I–IV) et unité, avec indices progressifs, trois essais et explications complètes. Gratuit, en français et en kreyòl.',
    body: wrap(`
      ${h1('Quiz et exercices de pratique')}
      ${p('Entraînez-vous par matière, niveau (NS I–IV) et unité : physique, chimie, mathématiques et économie. Chaque question propose des indices progressifs, trois essais et une explication complète — y compris le support des formules mathématiques.')}
      ${h2('Comment pratiquer')}
      ${ul([
        'Choisissez un cours, un niveau et une unité pour lancer une session de pratique.',
        'Utilisez les indices progressifs si vous bloquez — ils guident sans donner la réponse.',
        'Lisez l’explication complète après chaque question pour comprendre la démarche.',
        'Terminez chaque unité avec un « Quiz d’unité » de 10 questions.',
      ])}
      ${p('De nouvelles questions sont ajoutées régulièrement. <a href="/courses" style="color:#0A66C2">Revoyez d’abord les leçons</a> ou <a href="/exams" style="color:#0A66C2">passez à un examen blanc</a> quand vous êtes prêt.')}`),
  },
};

// exams body is computed (uses the catalog index)
ROUTES.exams = {
  title: 'Examens blancs — annales officielles du MENFP — EdLight Academy',
  description:
    'Passez de vraies épreuves officielles (9e année, Baccalauréat, concours d’université) en ligne avec correction automatique et explications détaillées. Gratuit.',
  body: examsBody(),
};

// ─── HTML surgery helpers ────────────────────────────────────────────────────

// Replace the full contents of <div id="root">…</div> using div-depth matching
// (survives html-webpack-plugin minification; no comment markers needed).
function replaceRoot(html, newContent) {
  const openTag = html.match(/<div id="root"[^>]*>/);
  if (!openTag) throw new Error('#root not found in dist/index.html');
  const start = openTag.index + openTag[0].length;
  const tagRe = /<div\b|<\/div>/g;
  tagRe.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) {
      return html.slice(0, start) + newContent + html.slice(m.index);
    }
  }
  throw new Error('#root closing tag not found');
}

function setHead(html, route, { title, description }) {
  const url = `${ORIGIN}/${route}`;
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${description}$2`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
if (!existsSync(distIndex)) {
  console.error('dist/index.html not found — run the webpack build first.');
  process.exit(1);
}
const baseHtml = readFileSync(distIndex, 'utf8');

for (const [route, { title, description, body }] of Object.entries(ROUTES)) {
  let html = replaceRoot(baseHtml, body);
  html = setHead(html, route, { title, description });
  const outDir = join(root, 'dist', route);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  const words = body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  console.log(`prerendered /${route} (${words} words)`);
}
console.log(`Done: ${Object.keys(ROUTES).length} routes prerendered.`);
