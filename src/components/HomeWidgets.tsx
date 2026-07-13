/**
 * HomeWidgets — the "what should I do next?" row on the learner home/dashboard
 * ───────────────────────────────────────────────────────────────────────────
 * Four compact, glanceable, tappable cards:
 *   • Upcoming exam countdown
 *   • Daily Challenge (trivia)
 *   • Weekly leaderboard rank
 *   • Recommended lesson
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Gamepad2, Trophy, Sparkles, Check, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { getNextExamSession, preferredLevelForTrack } from '../config/examSchedule';
import './HomeWidgets.css';

function Widget({ tone, icon, eyebrow, value, caption, onClick, ariaLabel }) {
  return (
    <button className="home-widget" data-tone={tone} onClick={onClick} aria-label={ariaLabel} type="button">
      <span className="home-widget__icon">{icon}</span>
      <span className="home-widget__eyebrow">{eyebrow}</span>
      <span className="home-widget__value">{value}</span>
      <span className="home-widget__caption">{caption}</span>
      <ChevronRight size={16} className="home-widget__chevron" aria-hidden="true" />
    </button>
  );
}

function ExamCountdownWidget({ t, isCreole }) {
  const navigate = useNavigate();
  const track = useStore((s) => s.track);
  const session = getNextExamSession(preferredLevelForTrack(track));

  if (!session) {
    return (
      <Widget
        tone="indigo"
        icon={<CalendarClock size={20} />}
        eyebrow={t('Examen national', 'Egzamen nasyonal')}
        value={t('Bientôt', 'Talè')}
        caption={t('Voir les annales', 'Wè ansyen egzamen')}
        onClick={() => navigate('/exams')}
        ariaLabel={t('Examens', 'Egzamen')}
      />
    );
  }

  const d = session.daysRemaining;
  const label = isCreole ? session.labelHt : session.label;
  return (
    <Widget
      tone="indigo"
      icon={<CalendarClock size={20} />}
      eyebrow={t('Prochain examen', 'Pwochen egzamen')}
      value={d === 0 ? t("Aujourd'hui", 'Jodi a') : t(`${d} jours`, `${d} jou`)}
      caption={label}
      onClick={() => navigate(`/exams/${session.level}`)}
      ariaLabel={`${label} ${d} ${t('jours', 'jou')}`}
    />
  );
}

function DailyChallengeWidget({ t }) {
  const navigate = useNavigate();
  const { daily, isAuthed } = useTrivia();
  const done = daily.completedToday;

  return (
    <Widget
      tone="violet"
      icon={done ? <Check size={20} /> : <Gamepad2 size={20} />}
      eyebrow={t('Défi du jour', 'Defi jodi a')}
      value={done ? `${daily.score}/${daily.total}` : t('+50 XP', '+50 XP')}
      caption={
        done
          ? t('Terminé — revenez demain', 'Fini — retounen demen')
          : t('10 questions · gagnez des XP', '10 kesyon · ranmase XP')
      }
      onClick={() => navigate('/jeux/trivia', { state: { startDaily: !done } })}
      ariaLabel={t('Défi quotidien', 'Defi chak jou')}
    />
  );
}

function LeaderboardRankWidget({ t }) {
  const navigate = useNavigate();
  const { myRank, isLoading } = useLeaderboard(50);

  return (
    <Widget
      tone="amber"
      icon={<Trophy size={20} />}
      eyebrow={t('Classement', 'Klasman')}
      value={isLoading ? '—' : myRank ? `#${myRank}` : t('Rejoindre', 'Antre')}
      caption={
        myRank
          ? t('cette semaine', 'semèn sa a')
          : t('Grimpez le classement', 'Monte nan klasman')
      }
      onClick={() => navigate('/profile')}
      ariaLabel={t('Classement hebdomadaire', 'Klasman semèn nan')}
    />
  );
}

function RecommendedLessonWidget({ t, course }) {
  const navigate = useNavigate();

  if (!course) {
    return (
      <Widget
        tone="emerald"
        icon={<Sparkles size={20} />}
        eyebrow={t('Recommandé', 'Rekòmande')}
        value={t('Explorer', 'Eksplore')}
        caption={t('Trouvez votre prochain cours', 'Jwenn pwochen kou ou')}
        onClick={() => navigate('/courses')}
        ariaLabel={t('Cours recommandés', 'Kou rekòmande')}
      />
    );
  }

  const title = course.name || course.title || t('Cours', 'Kou');
  return (
    <Widget
      tone="emerald"
      icon={<Sparkles size={20} />}
      eyebrow={t('Recommandé', 'Rekòmande')}
      value={title.length > 22 ? `${title.slice(0, 22)}…` : title}
      caption={`${course.subject || ''}${course.level ? ` · ${course.level}` : ''}`.trim() || t('Continuer', 'Kontinye')}
      onClick={() => navigate(`/courses/${course.id}`)}
      ariaLabel={title}
    />
  );
}

export default function HomeWidgets({ recommendedCourse = null }) {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const t = (fr, ht) => (isCreole ? ht : fr);

  return (
    <div className="home-widgets" data-reveal>
      <ExamCountdownWidget t={t} isCreole={isCreole} />
      <DailyChallengeWidget t={t} />
      <LeaderboardRankWidget t={t} />
      <RecommendedLessonWidget t={t} course={recommendedCourse} />
    </div>
  );
}
