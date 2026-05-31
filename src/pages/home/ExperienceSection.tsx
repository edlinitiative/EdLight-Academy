import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Check, Book, Triangle } from 'lucide-react';
import useStore from '../../contexts/store';
import { TFn } from './content';

export default function ExperienceSection({ t }: { t: TFn }) {
  const navigate = useNavigate();
  const { toggleAuthModal, isAuthenticated } = useStore();

  return (
    <section className="lp-section lp-experience">
      <div className="lp-container">
        <div className="lp-experience__grid">
          <div className="lp-experience__copy" data-reveal>
            <span className="lp-eyebrow lp-eyebrow--muted">{t('Expérience', 'Eksperyans')}</span>
            <h2 className="lp-section__title">
              {t('Apprenez comme dans', 'Aprann tankou nan')}
              <br />
              <span className="lp-text-accent">{t('une grande école.', 'yon gwo lekòl.')}</span>
            </h2>
            <ul className="lp-checklist">
              <li><span className="lp-check"><Check size={14} strokeWidth={3} /></span> {t('Vidéos HD avec sous-titres en français et créole', 'Videyo HD ak soustit an franse ak kreyòl')}</li>
              <li><span className="lp-check"><Check size={14} strokeWidth={3} /></span> {t('Quiz qui s’adaptent à votre niveau', 'Quiz ki ajiste ak nivo ou')}</li>
              <li><span className="lp-check"><Check size={14} strokeWidth={3} /></span> {t('Corrections rédigées par des enseignants', 'Koreksyon ekri pa pwofesè')}</li>
              <li><span className="lp-check"><Check size={14} strokeWidth={3} /></span> {t('Plan d’étude hebdomadaire personnalisé', 'Plan etid chak semèn pèsonalize')}</li>
            </ul>
            <div className="lp-hero__actions">
              <button className="lp-btn lp-btn--primary" onClick={() => (isAuthenticated ? navigate('/dashboard') : toggleAuthModal())}>
                {t('Créer mon espace', 'Kreye espas mwen')}
              </button>
              <button className="lp-btn lp-btn--ghost" onClick={() => navigate('/trivia')}>{t('Essayer la trivia', 'Eseye trivia')}</button>
            </div>
          </div>

          <div className="lp-experience__panel" data-reveal>
            <div className="lp-panel">
              <div className="lp-panel__head">
                <div className="lp-panel__dots"><span /><span /><span /></div>
                <span>{t('Tableau de bord', 'Tablo de bò')}</span>
              </div>
              <div className="lp-panel__body">
                <div className="lp-panel__row">
                  <div>
                    <div className="lp-panel__label">{t('Maîtrise globale', 'Metrize jeneral')}</div>
                    <div className="lp-panel__value">82%</div>
                  </div>
                  <div className="lp-panel__bar"><div style={{ width: '82%' }} /></div>
                </div>
                <div className="lp-panel__row">
                  <div>
                    <div className="lp-panel__label">{t('Quiz cette semaine', 'Quiz semèn nan')}</div>
                    <div className="lp-panel__value">24</div>
                  </div>
                  <div className="lp-panel__sparkline" aria-hidden="true">
                    <span style={{ height: '30%' }} /><span style={{ height: '55%' }} /><span style={{ height: '40%' }} />
                    <span style={{ height: '70%' }} /><span style={{ height: '60%' }} /><span style={{ height: '90%' }} />
                    <span style={{ height: '75%' }} />
                  </div>
                </div>
                <div className="lp-panel__chips">
                  <span className="lp-chip lp-chip--ok"><Flame size={14} strokeWidth={2.2} /> 12 {t('jours', 'jou')}</span>
                  <span className="lp-chip"><Book size={14} strokeWidth={2.2} /> Physique · 88%</span>
                  <span className="lp-chip"><Triangle size={14} strokeWidth={2.2} /> Maths · 76%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
