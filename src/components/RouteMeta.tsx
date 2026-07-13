import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Keeps per-route SEO metadata in sync as the SPA navigates.
 *
 * A single-page app otherwise serves the same static <title>, description and
 * canonical URL on every route, which hurts search indexing and makes shared
 * links (WhatsApp, Facebook, Twitter) all preview identically. On each route
 * change we update:
 *   - document.title (localized)
 *   - <meta name="description"> + og/twitter description
 *   - <link rel="canonical"> + og:url (absolute, trailing-slash normalized)
 *   - og:title / twitter:title
 *
 * Renders nothing.
 */

const SITE_ORIGIN = 'https://academy.edlight.org';

// Bilingual per-route descriptions. Inline fr/ht/en maps match the established
// codebase idiom (see Home content, About APPROACH_ITEMS). French is primary;
// Haitian Creole (ht) and English (en) fall back to fr when absent.
type Lang = 'fr' | 'ht' | 'en';
const DESCRIPTIONS: Record<string, Partial<Record<Lang, string>>> = {
  home: {
    fr: 'Cours de physique, chimie, mathématiques et économie pour les élèves haïtiens. Vidéos courtes, quiz interactifs et examens blancs — gratuit, en français et en créole.',
    ht: 'Kou fizik, chimi, matematik ak ekonomi pou elèv ayisyen. Videyo kout, quiz entèraktif ak egzamen blan — gratis, an franse ak kreyòl.',
    en: 'Physics, chemistry, math and economics courses for Haitian students. Short videos, interactive quizzes and mock exams — free, in French and Haitian Creole.',
  },
  courses: {
    fr: 'Explorez les cours EdLight Academy : physique, chimie, mathématiques et économie (NS I–IV), avec vidéos courtes et exercices pratiques.',
    ht: 'Gade kou EdLight Academy yo : fizik, chimi, matematik ak ekonomi (NS I–IV), ak videyo kout ak egzèsis pratik.',
  },
  quizzes: {
    fr: 'Entraînez-vous avec des quiz interactifs par matière, niveau et unité pour préparer le Baccalauréat haïtien.',
    ht: 'Antrene ak quiz entèraktif pa matyè, nivo ak inite pou prepare Bakaloreya ayisyen an.',
  },
  exams: {
    fr: 'Passez des examens blancs du Baccalauréat haïtien avec correction détaillée, par niveau et par matière.',
    ht: 'Fè egzamen blan Bakaloreya ayisyen an ak koreksyon detaye, pa nivo ak pa matyè.',
  },
  studyPlan: {
    fr: 'Créez votre plan d’étude personnalisé pour préparer le Baccalauréat à votre rythme.',
    ht: 'Kreye plan etid pa ou pou prepare Bakaloreya a nan ritm pa ou.',
  },
  trivia: {
    fr: 'Jeux et quiz rapides pour réviser en s’amusant : maths, chimie, biologie et anglais.',
    ht: 'Jwèt ak quiz rapid pou revize an amizan : matematik, chimi, biyoloji ak anglè.',
  },
  about: {
    fr: 'La mission d’EdLight Academy : un accès gratuit à une éducation de qualité pour les élèves haïtiens.',
    ht: 'Misyon EdLight Academy : yon aksè gratis ak yon edikasyon de kalite pou elèv ayisyen.',
  },
  contact: {
    fr: 'Contactez l’équipe EdLight Academy pour toute question, suggestion ou signalement.',
    ht: 'Kontakte ekip EdLight Academy pou nenpòt kesyon, sijesyon oswa siyalman.',
  },
  faq: {
    fr: 'Questions fréquentes sur EdLight Academy : comment commencer, trouver des quiz et préparer le Bac.',
    ht: 'Kesyon moun poze souvan sou EdLight Academy : kijan pou kòmanse, jwenn quiz ak prepare Bak la.',
  },
  help: {
    fr: 'Guides et conseils pour bien démarrer sur EdLight Academy.',
    ht: 'Gid ak konsèy pou byen kòmanse sou EdLight Academy.',
  },
  privacy: {
    fr: 'Politique de confidentialité d’EdLight Academy : quelles données nous collectons et comment nous les protégeons.',
    ht: 'Politik konfidansyalite EdLight Academy : ki done nou kolekte ak kijan nou pwoteje yo.',
  },
  terms: {
    fr: 'Conditions d’utilisation d’EdLight Academy.',
    ht: 'Kondisyon itilizasyon EdLight Academy.',
  },
};

const DEFAULT_DESCRIPTION = DESCRIPTIONS.home.fr as string;

// Map a pathname to a `meta.*` translation key. Order matters: most specific
// prefixes first. Unmatched routes fall back to the bare site title.
function metaKeyForPath(pathname: string): string | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  const table: Array<[RegExp, string]> = [
    [/^\/courses(\/|$)/, 'courses'],
    [/^\/dashboard(\/|$)/, 'dashboard'],
    [/^\/quizzes(\/|$)/, 'quizzes'],
    [/^\/exams(\/|$)/, 'exams'],
    [/^\/study-plan(\/|$)/, 'studyPlan'],
    [/^\/(jeux|trivia)(\/|$)/, 'trivia'],
    [/^\/about(\/|$)/, 'about'],
    [/^\/contact(\/|$)/, 'contact'],
    [/^\/faq(\/|$)/, 'faq'],
    [/^\/help(\/|$)/, 'help'],
    [/^\/privacy(\/|$)/, 'privacy'],
    [/^\/terms(\/|$)/, 'terms'],
  ];
  for (const [re, key] of table) {
    if (re.test(p)) return key;
  }
  return null;
}

// Resolve a localized description for a route key, falling back to fr -> en.
function descriptionFor(key: string | null, lang: string): string {
  if (!key) return DEFAULT_DESCRIPTION;
  const entry = DESCRIPTIONS[key];
  if (!entry) return DEFAULT_DESCRIPTION;
  const l = (lang || 'fr').slice(0, 2) as Lang;
  return entry[l] || entry.fr || entry.en || DEFAULT_DESCRIPTION;
}

// Absolute, trailing-slash-normalized canonical URL for the current path.
function canonicalFor(pathname: string): string {
  const p = pathname.replace(/\/+$/, '');
  return p ? `${SITE_ORIGIN}${p}` : `${SITE_ORIGIN}/`;
}

// Idempotently upsert a <meta>/<link> tag identified by (selectorAttr=selectorValue).
function upsertHeadTag(
  tag: 'meta' | 'link',
  selectorAttr: string,
  selectorValue: string,
  valueAttr: string,
  value: string,
) {
  const selector = `${tag}[${selectorAttr}="${selectorValue}"]`;
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(selectorAttr, selectorValue);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, value);
}

export default function RouteMeta() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const key = metaKeyForPath(pathname);
    const base = 'EdLight Academy';
    const title = key
      ? t('meta.titleTemplate', { page: t(`meta.${key}`), defaultValue: `${t(`meta.${key}`)} · ${base}` })
      : base;
    const description = descriptionFor(key, i18n.language);
    const canonical = canonicalFor(pathname);

    document.title = title;
    upsertHeadTag('meta', 'name', 'description', 'content', description);
    upsertHeadTag('link', 'rel', 'canonical', 'href', canonical);
    upsertHeadTag('meta', 'property', 'og:title', 'content', title);
    upsertHeadTag('meta', 'property', 'og:description', 'content', description);
    upsertHeadTag('meta', 'property', 'og:url', 'content', canonical);
    upsertHeadTag('meta', 'name', 'twitter:title', 'content', title);
    upsertHeadTag('meta', 'name', 'twitter:description', 'content', description);
  }, [pathname, t, i18n.language]);

  return null;
}
