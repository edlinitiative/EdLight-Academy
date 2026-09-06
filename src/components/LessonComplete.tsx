import React from 'react';
import { Check, Flame, PlayCircle, X } from 'lucide-react';
import useStore from '../contexts/store';
import { useStreak } from '../hooks/useStreak';
import './LessonComplete.css';

/** Local YYYY-MM-DD — see StreakRail: toISOString() would shift Haiti (UTC-5)
 *  back a day all evening and report "not studied today" when they had. */
function localKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

type NextUp = { title: string; unit?: string } | null;

/**
 * The moment a lesson ends.
 *
 * Finishing a lesson used to be the end of the session: the button turned green
 * and the page went quiet. That is the one point where a student is already
 * warmed up and most likely to do one more rep, and the product was letting it
 * pass — the single biggest retention gap on the site.
 *
 * So this interrupts, once, and points forward: what was just earned, and the
 * next thing with a one-tap way into it. It is deliberately the only modal in
 * the lesson view.
 */
export default function LessonComplete({
  open,
  next,
  onContinue,
  onDismiss,
}: {
  open: boolean;
  next: NextUp;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const { streak } = useStreak();

  const continueRef = React.useRef<HTMLButtonElement>(null);

  // Send focus to the forward action, and let Escape out.
  React.useEffect(() => {
    if (!open) return;
    continueRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  const days = streak?.currentStreak || 0;
  const countedToday = (streak?.activeDays || []).includes(localKey(new Date()));

  return (
    <div className="lesson-done" role="dialog" aria-modal="true" aria-labelledby="lesson-done-title">
      <div className="lesson-done__sheet">
        <button
          type="button"
          className="lesson-done__close"
          onClick={onDismiss}
          aria-label={t('Fermer', 'Fèmen')}
        >
          <X size={18} />
        </button>

        <span className="lesson-done__mark" aria-hidden="true">
          <Check size={26} strokeWidth={3} />
        </span>

        <h2 id="lesson-done-title" className="lesson-done__title">
          {t('Leçon terminée', 'Leson fini')}
        </h2>

        {/* Only claim the streak when today has actually been counted — a stale
            "3 jours" right after the day was earned reads as broken. */}
        {countedToday && days > 0 && (
          <p className="lesson-done__streak">
            <Flame size={16} strokeWidth={2.4} aria-hidden="true" />
            {isCreole
              ? `${days} jou youn dèyè lòt`
              : `${days} jour${days === 1 ? '' : 's'} d'affilée`}
          </p>
        )}

        {next ? (
          <>
            <div className="lesson-done__next">
              <span className="lesson-done__next-label">
                {t('Ensuite', 'Apre sa')}
              </span>
              <span className="lesson-done__next-title">{next.title}</span>
              {next.unit && <span className="lesson-done__next-unit">{next.unit}</span>}
            </div>

            <button
              ref={continueRef}
              type="button"
              className="lesson-done__cta"
              onClick={onContinue}
            >
              <PlayCircle size={19} aria-hidden="true" />
              {t('Continuer', 'Kontinye')}
            </button>
          </>
        ) : (
          <>
            <p className="lesson-done__all">
              {t(
                'Vous avez terminé toutes les leçons de ce cours.',
                'Ou fini tout leson nan kou sa a.'
              )}
            </p>
            <button
              ref={continueRef}
              type="button"
              className="lesson-done__cta"
              onClick={onDismiss}
            >
              {t('Revenir au cours', 'Retounen nan kou a')}
            </button>
          </>
        )}

        {next && (
          <button type="button" className="lesson-done__later" onClick={onDismiss}>
            {t('Plus tard', 'Pita')}
          </button>
        )}
      </div>
    </div>
  );
}
