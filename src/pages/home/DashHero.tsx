import React from 'react';
import { Flame, Sparkles, Trophy } from 'lucide-react';
import useStore from '../../contexts/store';
import { useTrivia } from '../../hooks/useTrivia';
import { useStreak } from '../../hooks/useStreak';
import { useCollectives } from '../../hooks/useLeaderboard';
import { normalizeName } from '../../../shared/leaderboardAgg';
import { GRADES } from '../../config/trackConfig';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

/**
 * The dashboard hero, in the landing page's bolder language (Ted: the old one
 * was "too bland — do this one instead"). A brand-navy greeting, a tag with
 * the student's own class, a proof bar made of THEIR numbers — streak, XP,
 * school rank — and, on the right, the one next step (passed in as children:
 * the existing focus card, which already knows whether that is an exam to
 * resume, a course, or a first course to pick).
 */
export default function DashHero({ firstName, greeting, children }: {
  firstName: string | null;
  greeting: string;
  children: React.ReactNode;
}) {
  const language = useStore((s) => s.language);
  const grade = useStore((s) => s.grade);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { profile, level } = useTrivia();
  const { streak } = useStreak();
  const school: string | null = profile?.leaderboard?.school || null;
  const { groups } = useCollectives('school', 'all', !!school);
  const mine = school ? groups.find((g) => g.key === normalizeName(school)) : null;
  const gradeRow = GRADES.find((g) => g.code === grade);
  const days = streak?.currentStreak || 0;

  const proof = [
    { icon: <Flame size={16} aria-hidden="true" />, tone: 'amber', value: `${days} ${t(days === 1 ? 'jour' : 'jours', 'jou')}`, label: t('de série', 'seri') },
    { icon: <Sparkles size={16} aria-hidden="true" />, tone: 'azure', value: `${nf(profile?.xp || 0)} XP`, label: t(`niveau ${level?.level || 1}`, `nivo ${level?.level || 1}`) },
    mine
      ? { icon: <Trophy size={16} aria-hidden="true" />, tone: 'emerald', value: `#${mine.rank}`, label: t('ton école', 'lekòl ou') }
      : null,
  ].filter(Boolean) as { icon: React.ReactNode; tone: string; value: string; label: string }[];

  return (
    <section className="lp dash-hero lp-hero--bold">
      <div className="lp-hero__glow-a" aria-hidden="true" />
      <div className="lp-hero__glow-b" aria-hidden="true" />
      <div className="dash-hero__layout">
        <div className="dash-hero__copy">
          <span className="lp-tag">
            <span className="lp-tag__dot" aria-hidden="true" />
            {gradeRow
              ? t(`Ton espace · ${gradeRow.label}`, `Espas ou · ${gradeRow.labelHt}`)
              : t('Ton espace de travail', 'Espas travay ou')}
            {school ? ` · ${school}` : ''}
          </span>
          <h1 className="lp-hero__title dash-hero__title">
            {greeting}, {firstName || (isCreole ? 'zanmi' : 'à toi')}.
            <br />
            <span className="lp-hero__title-accent">{t('Ta prochaine étape est prête.', 'Pwochen etap ou pare.')}</span>
          </h1>
          <dl className="lp-proof dash-hero__proof">
            {proof.map((p) => (
              <div key={p.label} className="lp-proof__item">
                <dd className={`lp-proof__value lp-proof__value--${p.tone}`}>{p.value}</dd>
                <dt className="lp-proof__label">{p.label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="dash-hero__next">{children}</div>
      </div>
    </section>
  );
}
