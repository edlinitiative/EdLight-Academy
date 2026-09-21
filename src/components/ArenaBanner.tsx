/**
 * ArenaBanner — the Dashboard's only mention that the Arena exists.
 *
 * Before this, the web app had zero presence for the tournament: no page,
 * no card, nothing. And the whole reason it belongs HERE, on the web
 * Dashboard, rather than on the marketing homepage, is who actually lands on
 * each: signed-out visitors get `Home` (marketing), and every student who
 * already has an account — the only audience that can register — lands on
 * `Dashboard`. A banner on the marketing page would miss the people it needs
 * to reach.
 *
 * It links to `/download`, not to a registration form, because gameplay and
 * sign-up both live in the mobile app only — that was decided early
 * ("ask them to download the app") and nothing on web should quietly
 * contradict it by trying to register someone here.
 *
 * Self-hides, like `ReviewBanner`: no tournament in `registration` or
 * `doors` means nothing renders, margin included.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Swords, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { useOpenArena } from '../hooks/useOpenArena';

function formatStart(ms: number, locale: string): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(ms));
  } catch {
    return '';
  }
}

export default function ArenaBanner() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const open = useOpenArena();
  if (!open) return null;

  const dateStr = formatStart(open.startsAt, isCreole ? 'fr-HT' : 'fr-FR');
  const title = isCreole && open.titleHt ? open.titleHt : open.title;

  const subtitle = open.state === 'doors'
    ? t('Les portes sont ouvertes maintenant', 'Pòt yo louvri kounye a')
    : dateStr
      ? t(`Inscris ton école pour le ${dateStr}`, `Enskri lekòl ou pou ${dateStr}`)
      : t('Inscris ton école dès maintenant', 'Enskri lekòl ou kounye a');

  return (
    <Link
      to="/download?from=arena"
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
      aria-label={`${t('L’Arène', 'Arèn nan')} — ${title} — ${subtitle}`}
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
          background: 'rgba(27,111,224,0.12)',
          color: 'var(--primary-600, #1B6FE0)',
          flexShrink: 0,
        }}
      >
        <Swords size={20} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: '0.95rem' }}>
          {t('L’Arène', 'Arèn nan')} — {title}
        </strong>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
          {subtitle}
          {open.schools > 0
            ? ` · ${open.schools === 1
              ? t('1 école inscrite', '1 lekòl enskri')
              : t(`${open.schools} écoles inscrites`, `${open.schools} lekòl enskri`)}`
            : ''}
        </span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--text-400, #64778E)', flexShrink: 0 }} />
    </Link>
  );
}
