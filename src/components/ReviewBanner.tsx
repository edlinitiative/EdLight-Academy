/**
 * ReviewBanner — the Dashboard's quiet entry into Revizyon.
 *
 * Shows how many missed questions are waiting (from the shared review map —
 * the same doc the mobile app and reminder emails read) and links to
 * /revision. Self-hides — margin included — when there is nothing to revise,
 * so a new student never sees an empty demand.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { loadReviewMap } from '../services/reviewService';
import { dueQuestionIds } from '../utils/review';

export default function ReviewBanner() {
  const user = useStore((s) => s.user);
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const [dueCount, setDueCount] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!user?.uid) { setDueCount(0); return undefined; }
    loadReviewMap(user.uid).then((map) => { if (alive) setDueCount(dueQuestionIds(map).length); });
    return () => { alive = false; };
  }, [user?.uid]);

  if (dueCount === 0) return null;

  return (
    <Link
      to="/revision"
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        padding: '0.9rem 1.1rem',
        marginBottom: '1rem',
        textDecoration: 'none',
        color: 'inherit',
      }}
      aria-label={`${t('Révision', 'Revizyon')} — ${dueCount} ${t('questions à revoir', 'kesyon pou revize')}`}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(232,147,12,0.12)',
          color: 'var(--warning-500, #E8930C)',
          flexShrink: 0,
        }}
      >
        <Brain size={20} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '0.95rem' }}>
          {t('Révision', 'Revizyon')}
        </strong>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
          {dueCount === 1
            ? t('1 question que tu as ratée t\'attend', '1 kesyon ou te rate ap tann ou')
            : t(`${dueCount} questions que tu as ratées t'attendent`, `${dueCount} kesyon ou te rate ap tann ou`)}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--text-400, #64778E)', flexShrink: 0 }} />
    </Link>
  );
}
