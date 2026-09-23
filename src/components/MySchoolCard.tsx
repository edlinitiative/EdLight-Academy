/**
 * MySchoolCard — the student's school, as a team they can grow.
 *
 * Ted: "use that information to tell them 'you are the first person from your
 * school' and invite them … everything on the platform becomes a tool to grow
 * users". So the card leads with the one fact that makes inviting rational —
 * where the school stands and who is missing — and puts the invite next to it.
 *
 *   no school yet   → one button that reopens the sign-in school step
 *   alone           → "you are the only one from X here" + invite
 *   with classmates → rank among schools, members, the gap to the school above
 *
 * Every number comes from the same all-time school board the ranking shows
 * (`useCollectives('school','all')`), so the card never disagrees with the
 * list underneath it. While that board is loading nothing is claimed.
 */
import React, { useEffect, useState } from 'react';
import { School as SchoolIcon, Share2, Copy, Check, Plus, TrendingUp } from './icons';
import useStore from '../contexts/store';
import { useTrivia } from '../hooks/useTrivia';
import { useCollectives } from '../hooks/useLeaderboard';
import { normalizeName } from '../../shared/leaderboardAgg';
import { schoolInviteMessage, inviteRef, sendInvite, canNativeShare } from '../utils/schoolInvite';
import './MySchoolCard.css';

const nf = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

export default function MySchoolCard({ where }: { where: string }) {
  const language = useStore((s) => s.language);
  const user = useStore((s) => s.user);
  const setSchoolChosen = useStore((s) => s.setSchoolChosen);
  const isCreole = language === 'ht';
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);

  const { profile, isLoading: profileLoading } = useTrivia();
  const school: string | null = profile?.leaderboard?.school || null;
  const { groups, isLoading: boardLoading } = useCollectives('school', 'all', !!school);

  const [ref, setRef] = useState<{ code: string | null; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!user?.uid) return;
    let live = true;
    inviteRef().then((r) => { if (live) setRef(r); });
    return () => { live = false; };
  }, [user?.uid]);

  if (!user?.uid || profileLoading) return null;

  if (!school) {
    return (
      <section className="myschool myschool--empty" aria-label={t('Ton école', 'Lekòl ou')}>
        <span className="myschool__icon" aria-hidden="true"><SchoolIcon size={20} /></span>
        <div className="myschool__body">
          <h2 className="myschool__title">{t('Représente ton école', 'Reprezante lekòl ou')}</h2>
          <p className="myschool__sub">
            {t('Chaque partie fait monter ton école au classement.', 'Chak pati fè lekòl ou monte nan klasman an.')}
          </p>
        </div>
        <button type="button" className="myschool__cta" onClick={() => setSchoolChosen(false)}>
          <Plus size={16} aria-hidden="true" /> {t('Ajouter mon école', 'Ajoute lekòl mwen')}
        </button>
      </section>
    );
  }

  const key = normalizeName(school);
  const mine = groups.find((g) => g.key === key) || null;
  const above = mine && mine.rank > 1 ? groups.find((g) => g.rank === mine.rank - 1) || null : null;
  // Members counts me when I have an entry; "alone" means nobody ELSE.
  const others = mine ? Math.max(0, mine.members - 1) : 0;
  const alone = !boardLoading && others === 0;

  const message = ref ? schoolInviteMessage(mine?.label || school, ref.code, ref.link, isCreole) : '';
  const invite = async (channel: 'whatsapp' | 'native' | 'copy') => {
    if (!message) return;
    const didCopy = await sendInvite(channel, message, where);
    if (didCopy) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
  };

  return (
    <section className="myschool" aria-label={t('Ton école', 'Lekòl ou')}>
      <div className="myschool__head">
        <span className="myschool__icon" aria-hidden="true"><SchoolIcon size={20} /></span>
        <div className="myschool__body">
          <span className="myschool__eyebrow">{t('Ton école', 'Lekòl ou')}</span>
          <h2 className="myschool__title">{mine?.label || school}</h2>
        </div>
        {mine && (
          <span className="myschool__rank" title={t('Rang parmi les écoles', 'Plas pami lekòl yo')}>
            #{mine.rank}
          </span>
        )}
      </div>

      {!boardLoading && (
        <p className="myschool__line">
          {alone
            ? t(
              'Tu es le seul élève de ton école ici. Invite ta classe : chaque camarade fait monter l’école.',
              'Se ou sèl elèv lekòl ou isit la. Envite klas ou : chak kanmarad fè lekòl la monte.',
            )
            : above
              ? <>
                <TrendingUp size={15} aria-hidden="true" />
                {t(
                  `${others + 1} élèves · ${nf(above.totalXp - mine.totalXp)} XP derrière ${above.label}`,
                  `${others + 1} elèv · ${nf(above.totalXp - mine.totalXp)} XP dèyè ${above.label}`,
                )}
              </>
              : mine?.rank === 1
                ? t(`${others + 1} élèves · 1ʳᵉ école du pays — défendez la place.`, `${others + 1} elèv · premye lekòl nan peyi a — defann plas la.`)
                : t(`${others + 1} élèves de ton école sont ici.`, `${others + 1} elèv lekòl ou isit la.`)}
        </p>
      )}

      <div className="myschool__actions">
        <button type="button" className="myschool__cta" disabled={!ref} onClick={() => invite('whatsapp')}>
          {t('Inviter sur WhatsApp', 'Envite sou WhatsApp')}
        </button>
        <button
          type="button"
          className="myschool__ghost"
          disabled={!ref}
          onClick={() => invite(canNativeShare() ? 'native' : 'copy')}
          aria-label={canNativeShare() ? t('Partager', 'Pataje') : t('Copier le lien', 'Kopye lyen an')}
        >
          {copied ? <Check size={16} aria-hidden="true" /> : canNativeShare() ? <Share2 size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span>{copied ? t('Copié', 'Kopye') : canNativeShare() ? t('Partager', 'Pataje') : t('Copier', 'Kopye')}</span>
        </button>
      </div>
    </section>
  );
}
