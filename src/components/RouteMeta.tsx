import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Updates the document <title> (and keeps it localized) on every route change.
 * SPAs otherwise keep the static index title on all pages, which hurts SEO,
 * browser history, and shared-link previews. Renders nothing.
 */

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
    [/^\/trivia(\/|$)/, 'trivia'],
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

export default function RouteMeta() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const key = metaKeyForPath(pathname);
    const base = 'EdLight Academy';
    if (key) {
      const page = t(`meta.${key}`);
      document.title = t('meta.titleTemplate', { page, defaultValue: `${page} · ${base}` });
    } else {
      document.title = base;
    }
  }, [pathname, t, i18n.language]);

  return null;
}
