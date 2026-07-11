import React from 'react';
import { Sparkles } from 'lucide-react';
import { TRIVIA_CATEGORIES, TRIVIA_QUESTIONS } from '../../data/triviaData';
import useStore from '../../contexts/store';

/**
 * AdminTrivia — read-only browse of the static trivia categories.
 * Trivia content is defined in code (`src/data/triviaData.ts`); this page
 * only surfaces the catalog and per-category question counts.
 * Renders inside AdminLayout's <Outlet>.
 */

export default function AdminTrivia() {
  const isCreole = useStore((s) => s.language) === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const questions: Record<string, any[]> = TRIVIA_QUESTIONS as any;
  const totalQuestions = TRIVIA_CATEGORIES.reduce(
    (sum, cat) => sum + (questions[cat.id]?.length || 0),
    0,
  );

  return (
    <div>
      <div className="admin-page__head">
        <div className="admin-page__eyebrow">
          <Sparkles size={13} aria-hidden="true" /> {t('CONTENU', 'KONTNI')}
        </div>
        <h1 className="admin-page__title">{t('Trivia', 'Trivia')}</h1>
        <p className="admin-page__subtitle">
          {t(
            `${TRIVIA_CATEGORIES.length} catégories · ${totalQuestions} questions`,
            `${TRIVIA_CATEGORIES.length} kategori · ${totalQuestions} kesyon`,
          )}
        </p>
      </div>

      {TRIVIA_CATEGORIES.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty">{t('Aucune catégorie.', 'Pa gen kategori.')}</div>
        </div>
      ) : (
        <section className="admin-tiles" aria-label={t('Catégories de trivia', 'Kategori trivia')}>
          {TRIVIA_CATEGORIES.map((cat) => {
            const count = questions[cat.id]?.length || 0;
            const name = isCreole ? cat.nameHt || cat.name : cat.name;
            return (
              <div key={cat.id} className="admin-card admin-tile">
                <div className="admin-tile__label">
                  <span aria-hidden="true" style={{ marginRight: 6 }}>
                    {cat.icon}
                  </span>
                  {name}
                </div>
                <div className="admin-tile__value" style={{ color: cat.color }}>
                  {count}
                </div>
                <div className="admin-page__subtitle" style={{ margin: 0 }}>
                  {t(
                    `${count} question${count > 1 ? 's' : ''}`,
                    `${count} kesyon`,
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <p className="admin-page__subtitle" style={{ marginTop: 16 }}>
        {t(
          'Le contenu du trivia est défini dans le code (src/data/triviaData.ts).',
          'Kontni trivia a defini nan kòd la (src/data/triviaData.ts).',
        )}
      </p>
    </div>
  );
}
