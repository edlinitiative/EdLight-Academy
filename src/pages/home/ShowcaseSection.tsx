import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlayCircle, ChevronRight } from '../../components/icons';
import SchoolBuilding from '../../components/arena/SchoolBuilding';
import { videoThumb } from '../../utils/videoThumb';
import { normalizeExamCatalog } from '../../utils/examCatalog';
import { buildExamIndex, subjectColor } from '../../utils/examUtils';
import { sessionRowName } from '../../utils/examNaming';
import { TFn, useCatalogSummary } from './content';

/**
 * The product, shown instead of described.
 *
 * Three panels, each drawn from the real thing: lesson frames from the
 * catalogue's own videos, the newest official paper as an exam sheet, and the
 * Arène's night city. They replace four icon cards, a programme grid, an
 * empty league box and a row of small exam cards — the same promises, made
 * by the product itself.
 */
const SUBJECT_LABEL: Record<string, { fr: string; ht: string }> = {
  MATH: { fr: 'Mathématiques', ht: 'Matematik' },
  CHEM: { fr: 'Chimie', ht: 'Chimi' },
  ECON: { fr: 'Économie', ht: 'Ekonomi' },
  PHYS: { fr: 'Physique', ht: 'Fizik' },
};
const CITY = ['Lycée', 'Collège', 'Institution', 'École', 'Lycée National', 'Collège Saint', 'Institution Mixte'];

function useNewestPaper() {
  const q = useQuery({
    queryKey: ['exam-catalog-index'],
    queryFn: async () => {
      const res = await fetch('/exam_catalog_index.json');
      if (!res.ok) throw new Error('catalog index unavailable');
      return normalizeExamCatalog(await res.json());
    },
    staleTime: Infinity,
  });
  return useMemo(() => {
    if (!q.data) return { paper: null as any, total: 0 };
    const all = buildExamIndex(q.data).exams;
    const bac = all.filter((e: any) => e.level === 'baccalaureat');
    const sorted = [...bac].sort((a: any, b: any) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
    const paper = sorted.find((e: any) => e._subject === 'Mathématiques') || sorted[0] || null;
    return { paper, total: all.length };
  }, [q.data]);
}

export default function ShowcaseSection({ t }: { t: TFn }) {
  const { summary } = useCatalogSummary(t);
  const { paper, total } = useNewestPaper();
  const lang = t('fr', 'ht') as 'fr' | 'ht';
  const frames = useMemo(() => {
    const seen = new Set<string>();
    return (summary?.frames || []).filter((f) => {
      if (seen.has(f.code)) return false;
      seen.add(f.code);
      return true;
    }).map((f) => ({ ...f, src: videoThumb(f.videoUrl, 'hq') })).filter((f) => f.src).slice(0, 3);
  }, [summary]);

  return (
    <section className="lp-show" aria-labelledby="lp-show-title">
      <div className="lp-container">
        <header className="lp-show__head" data-reveal>
          <p className="lp-over">{t('Une plateforme, trois façons d’avancer', 'Yon platfòm, twa fason pou avanse')}</p>
          <h2 id="lp-show-title" className="lp-display">{t('Apprends. Entraîne-toi. Fais gagner ton école.', 'Aprann. Antrene w. Fè lekòl ou genyen.')}</h2>
        </header>

        <div className="lp-bento">
          {/* Apprendre — real lesson frames */}
          <Link to="/courses" className="lp-pane lp-pane--learn" data-reveal>
            <div className="lp-pane__copy">
              <p className="lp-pane__over">{t('Apprendre', 'Aprann')}</p>
              <h3>{t('Chaque leçon du programme, expliquée en vidéo.', 'Chak leson nan pwogram nan, esplike an videyo.')}</h3>
              <p>{t('Du NS I au NS IV, chapitre par chapitre — puis un quiz pour vérifier que c’est acquis.', 'Depi NS I rive NS IV, chapit pa chapit — epi yon quiz pou verifye ou konprann.')}</p>
              {summary?.lessons ? <p className="lp-pane__stat"><b>{summary.lessons}</b> {t('leçons', 'leson')}</p> : null}
              <span className="lp-pane__cta">{t('Voir les cours', 'Gade kou yo')} <ChevronRight size={18} aria-hidden="true" /></span>
            </div>
            <div className="lp-frames" aria-hidden="true">
              {frames.map((f, i) => (
                <span key={f.courseId} className={`lp-frame lp-frame--${i}`}>
                  <img src={f.src!} alt="" loading="lazy" />
                  <span className="lp-frame__tag">{t(SUBJECT_LABEL[f.code].fr, SUBJECT_LABEL[f.code].ht)} · {f.label}</span>
                  {i === 0 && <span className="lp-frame__play"><PlayCircle size={30} /></span>}
                </span>
              ))}
            </div>
          </Link>

          {/* Examens — the newest real paper */}
          <Link to="/exams" className="lp-pane lp-pane--exams" data-reveal>
            <div className="lp-pane__copy">
              <p className="lp-pane__over">{t('Examens', 'Egzamen')}</p>
              <h3>{t('Les vrais sujets du Bac, en conditions réelles.', 'Vrè sijè Bak yo, nan vrè kondisyon.')}</h3>
              {total > 0 && <p className="lp-pane__stat"><b>{total}</b> {t('sujets officiels', 'sijè ofisyèl')}</p>}
            </div>
            {paper && (
              <span className="lp-sheet" aria-hidden="true">
                <span className="lp-sheet__back" />
                <span className="lp-sheet__paper">
                  <span className="lp-sheet__top">{t('République d’Haïti · MENFP', 'Repiblik d Ayiti · MENFP')}</span>
                  <span className="lp-sheet__subject" style={{ color: subjectColor(paper._subject) }}>{paper._subject}</span>
                  <span className="lp-sheet__session">{sessionRowName(paper, lang).title}</span>
                  <span className="lp-sheet__lines"><i /><i /><i className="is-short" /></span>
                  <span className="lp-sheet__stamp">{t('Examen blanc', 'Egzamen blan')}</span>
                </span>
              </span>
            )}
          </Link>

          {/* Arène — the night city */}
          <Link to="/arena" className="lp-pane lp-pane--arena" data-reveal>
            <span className="lp-pane__sky" aria-hidden="true" />
            <div className="lp-pane__copy">
              <p className="lp-pane__over">{t('L’Arène', 'Arèn nan')}</p>
              <h3>{t('Chaque bonne réponse fait monter ton école.', 'Chak bon repons fè lekòl ou monte.')}</h3>
              <span className="lp-pane__cta">{t('Entrer dans l’Arène', 'Antre nan Arèn nan')} <ChevronRight size={18} aria-hidden="true" /></span>
            </div>
            <span className="lp-city" aria-hidden="true">
              {CITY.map((n, i) => <SchoolBuilding key={n} name={n} floors={[3, 5, 7, 4, 6, 3, 5][i]} night cell={4} />)}
            </span>
          </Link>
        </div>

        {summary && summary.subjects.length > 0 && (
          <div className="lp-subj-grid" data-reveal>
            {summary.subjects.map((s) => (
              <Link key={s.code} to={s.comingSoon ? '/courses' : `/courses?matiere=${s.code}`} className={`lp-subj${s.comingSoon ? ' is-soon' : ''}`}>
                <b>{s.comingSoon ? t('Bientôt', 'Byento') : s.lessons}</b>
                <span className="lp-subj__name">{s.name}</span>
                <span className="lp-subj__meta">
                  {s.comingSoon
                    ? t('en préparation', 'k ap prepare')
                    : `${t('leçons', 'leson')} · ${s.levels.filter((l) => !l.comingSoon).map((l) => l.label).join(', ')}`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
