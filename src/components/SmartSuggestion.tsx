/**
 * SmartSuggestion (web) — "Recommandé pour toi" Home card, mirroring the mobile
 * one. Driven by the shared pickHomeSuggestion() (track + season here; grade
 * capture on web is a follow-up). Dismissible per season via the store.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Landmark, ClipboardList, Gamepad2, BookOpen, ScrollText, ChevronRight, X } from 'lucide-react';
import useStore from '../contexts/store';
import { pickHomeSuggestion, type HomeSuggestionKind } from '../config/trackConfig';
import './SmartSuggestion.css';

type Copy = {
  Icon: typeof GraduationCap;
  gradient: string;
  title: string;
  subtitle: string;
  cta: string;
  to: string;
};

export default function SmartSuggestion() {
  const navigate = useNavigate();
  const track = useStore((s) => s.track);
  const grade = useStore((s) => s.grade);
  const language = useStore((s) => s.language);
  const dismissedSuggestionKey = useStore((s) => s.dismissedSuggestionKey);
  const setDismissedSuggestion = useStore((s) => s.setDismissedSuggestion);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const suggestion = pickHomeSuggestion({ track, grade });
  if (!suggestion || suggestion.key === dismissedSuggestionKey) return null;

  const COPY: Partial<Record<HomeSuggestionKind, Copy>> = {
    'choose-track': {
      Icon: GraduationCap,
      gradient: 'linear-gradient(135deg, #2E86F0, #1B6FE0, #0857A6)',
      title: t('Choisissez votre filière', 'Chwazi seri ou'),
      subtitle: t('Pour des recommandations sur mesure.', 'Pou rekòmandasyon ki fèt pou ou.'),
      cta: t('Choisir', 'Chwazi'),
      to: '/exams',
    },
    'prefac-switch': {
      Icon: Landmark,
      gradient: 'linear-gradient(135deg, #0EA5C4, #0891B2, #0E7490)',
      title: t('Le Bac est passé 🎓', 'Bak la fini 🎓'),
      subtitle: t(
        "Prochaine étape : préparez les concours d'entrée à l'université.",
        'Pwochen etap: prepare konkou antre inivèsite yo.',
      ),
      cta: t('Explorer la Préfac', 'Eksplore Prefak'),
      to: '/exams/university',
    },
    'bac-focus': {
      Icon: ClipboardList,
      gradient: 'linear-gradient(135deg, #2E86F0, #1B6FE0, #0857A6)',
      title: t('Le Bac approche', 'Bak la ap pwoche'),
      subtitle: t('Révisez avec les vrais sujets officiels.', 'Revize ak vre sijè ofisyèl yo.'),
      cta: t("S'entraîner", 'Antrene'),
      to: '/exams',
    },
    'trivia-first': {
      Icon: Gamepad2,
      gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED, #6D28D9)',
      title: t('Apprends en jouant', 'Aprann pandan w ap jwe'),
      subtitle: t(
        'Des jeux et défis pour progresser en douceur.',
        'Jwèt ak defi pou w pwogrese san strès.',
      ),
      cta: t('Jouer', 'Jwe'),
      to: '/jeux',
    },
    'cours-first': {
      Icon: BookOpen,
      gradient: 'linear-gradient(135deg, #10B981, #059669, #047857)',
      title: t('Renforce tes bases', 'Ranfòse baz ou yo'),
      subtitle: t(
        'Suis les cours et les quiz pour bâtir des fondations solides.',
        'Swiv kou ak quiz yo pou bati yon baz solid.',
      ),
      cta: t('Voir les cours', 'Wè kou yo'),
      to: '/courses',
    },
    'exam9e-focus': {
      Icon: ScrollText,
      gradient: 'linear-gradient(135deg, #2E86F0, #1B6FE0, #0857A6)',
      title: t('Prépare l’examen de 9ᵉ', 'Prepare egzamen 9yèm nan'),
      subtitle: t(
        'Entraîne-toi avec les sujets de l’examen national.',
        'Antrene ak sijè egzamen nasyonal yo.',
      ),
      cta: t("S'entraîner", 'Antrene'),
      to: '/exams',
    },
  };

  const c = COPY[suggestion.kind];
  if (!c) return null;
  const { Icon } = c;

  return (
    // ONE ROW. This was a gradient card with a drop shadow stacking three rows
    // — an eyebrow, an icon beside a title and subtitle, then a pill CTA —
    // which made a dismissible nudge the loudest thing on the dashboard.
    //
    // Same content, one line, and the surface now matches DashHeroStrip
    // directly above it: a hairline border on the card surface instead of a
    // gradient, so a suggestion reads as a note rather than as the
    // destination. The "Recommandé pour vous" eyebrow is gone — a dismissible
    // row with an icon and a call to action does not need to announce that it
    // is a suggestion.
    <div className="dash-suggestion">
      <span className="dash-suggestion__icon" style={{ background: c.gradient }}>
        <Icon size={14} />
      </span>

      <p className="dash-suggestion__text">
        <span className="dash-suggestion__title">{c.title}</span>
        {/* Hidden on narrow screens: the title and the CTA carry the message,
            and the subtitle is what would wrap this to a second line. */}
        <span className="dash-suggestion__subtitle">{c.subtitle}</span>
      </p>

      <button className="dash-suggestion__cta" onClick={() => navigate(c.to)} type="button">
        {c.cta} <ChevronRight size={14} />
      </button>

      <button
        className="dash-suggestion__dismiss"
        onClick={() => setDismissedSuggestion(suggestion.key)}
        aria-label={t('Ignorer', 'Inyore')}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}
