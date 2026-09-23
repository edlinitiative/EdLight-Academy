import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Radio, Plus, KeyRound, ChevronRight } from '../../components/icons';

/**
 * Salon en direct — the entry to live rooms (Ted's "Salon Multijoueur"
 * mockup). The rooms themselves — PIN, schedule, podium, spectators — live in
 * the tournaments system at /tournois; this card joins one by its 6-digit PIN
 * or creates one. No list of "rooms in progress" is drawn: there is no data
 * source for it yet, and an invented list would be a lie.
 */
export default function LiveRoomEntry({ isCreole }: { isCreole: boolean }) {
  const t = (fr: string, ht: string) => (isCreole ? ht : fr);
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const valid = /^\d{6}$/.test(pin);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    navigate(`/tournois/rejoindre?pin=${pin}`);
  };

  return (
    <section className="live-entry" aria-labelledby="live-entry-title">
      <div className="live-entry__banner">
        <span className="live-entry__dot" aria-hidden="true" />
        <Radio size={18} aria-hidden="true" />
        <span>{t('Salon en direct', 'Salon an dirèk')}</span>
      </div>
      <h2 id="live-entry-title" className="live-entry__title">
        {t('Joue en même temps que ta classe', 'Jwe an menm tan ak klas ou')}
      </h2>
      <p className="live-entry__lede">
        {t(
          'Même question pour tout le monde, au même moment. Rejoins un salon avec son code, ou crée le tien et invite ta classe.',
          'Menm kesyon pou tout moun, an menm tan. Antre nan yon salon ak kòd li, oswa kreye pa ou epi envite klas ou.',
        )}
      </p>
      <div className="live-entry__grid">
        <form className="live-entry__card" onSubmit={join}>
          <span className="live-entry__icon"><KeyRound size={20} aria-hidden="true" /></span>
          <h3>{t('Rejoindre avec un code', 'Antre ak yon kòd')}</h3>
          <label className="live-entry__pin">
            <span>{t('Code du salon (6 chiffres)', 'Kòd salon an (6 chif)')}</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="829415"
              aria-label={t('Code du salon', 'Kòd salon an')}
            />
          </label>
          <button type="submit" className="sprint-btn sprint-btn--primary" disabled={!valid}>
            {t('Rejoindre', 'Antre')} <ChevronRight size={16} aria-hidden="true" />
          </button>
        </form>
        <div className="live-entry__card">
          <span className="live-entry__icon live-entry__icon--violet"><Plus size={20} aria-hidden="true" /></span>
          <h3>{t('Créer un salon', 'Kreye yon salon')}</h3>
          <p className="sprint-muted">
            {t('Choisis le format et la date ; les questions sont générées pour toi.', 'Chwazi fòma a ak dat la ; kesyon yo fèt pou ou.')}
          </p>
          <button type="button" className="sprint-btn sprint-btn--ghost" onClick={() => navigate('/tournois/nouveau')}>
            {t('Créer', 'Kreye')} <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <Link to="/tournois" className="live-entry__all">{t('Voir les tournois', 'Wè tounwa yo')} <ChevronRight size={14} aria-hidden="true" /></Link>
    </section>
  );
}
