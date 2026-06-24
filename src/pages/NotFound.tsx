import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';

/**
 * Branded, in-app 404 page (rendered by the catch-all route in App.tsx).
 * Keeps the user inside the product with clear routes back home and to the
 * course catalog, instead of a dead browser error.
 */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <section className="section">
      <div className="container">
        <div className="state-view state-view--page not-found">
          <p className="not-found__code" aria-hidden="true">
            {t('notFound.code', '404')}
          </p>
          <div className="state-view__icon" aria-hidden="true">
            <Compass size={30} strokeWidth={1.6} />
          </div>
          <h1 className="state-view__title">{t('notFound.title')}</h1>
          <p className="state-view__message">{t('notFound.body')}</p>
          <div className="state-view__actions">
            <Link className="button button--primary" to="/">
              {t('notFound.home')}
            </Link>
            <Link className="button button--ghost" to="/courses">
              {t('notFound.courses')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
