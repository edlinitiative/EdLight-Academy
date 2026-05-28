import React, { useState } from 'react';
import useStore from '../contexts/store';

export default function Contact() {
  const language = useStore((s) => s.language);
  const isCreole = language === 'ht';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const supportEmail = 'info@edlight.org';

  const handleSubmit = (e) => {
    e.preventDefault();
    // Build a mailto link so users can contact without a backend
    const subj = encodeURIComponent(subject || `EdLight Academy Contact de la part de ${name || 'Futur(e) élève / Elèv kap vini'}`);
    const bodyLines = [
      name ? `${isCreole ? 'Non' : 'Nom'}: ${name}` : null,
      email ? `${isCreole ? 'Imèl' : 'Email'}: ${email}` : null,
      '',
      message || ''
    ].filter(Boolean);
    const body = encodeURIComponent(bodyLines.join('\n'));
    const href = `mailto:${supportEmail}?subject=${subj}&body=${body}`;
    window.location.href = href;
  };

  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">{isCreole ? 'Nou vle tande ou' : 'Nous serions ravis de vous lire'}</span>
            <h1>{isCreole ? 'Kontakte nou' : 'Contactez-nous'}</h1>
            <p className="text-muted">
              {isCreole
                ? 'Ou gen yon kesyon, yon lide patenarya, oswa yon fidbak? Ekri nou, n ap reponn ou.'
                : 'Une question, une idée de partenariat ou un retour ? Envoyez-nous un message, nous vous répondrons.'}
            </p>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <form className="card" onSubmit={handleSubmit}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="field">
                <label className="label" htmlFor="name">{isCreole ? 'Non ou' : 'Votre nom'}</label>
                <input
                  id="name"
                  name="name"
                  className="input-field"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  className="input-field"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label className="label" htmlFor="subject">{isCreole ? 'Sijè' : 'Sujet'}</label>
              <input
                id="subject"
                name="subject"
                className="input-field"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={isCreole ? 'Mwen gen yon kesyon sou…' : 'J’ai une question à propos de…'}
                autoComplete="off"
              />
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label className="label" htmlFor="message">{isCreole ? 'Mesaj' : 'Message'}</label>
              <textarea
                id="message"
                name="message"
                className="input-field"
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isCreole ? 'Kijan nou ka ede ou?' : 'Comment pouvons-nous aider ?'}
                required
              />
              <span className="field__hint">
                {isCreole ? 'Anjeneral, nou reponn nan 1–2 jou travay.' : 'Nous répondons généralement sous 1 à 2 jours ouvrés.'}
              </span>
            </div>
            <div className="quiz-card__controls" style={{ marginTop: '0.9rem' }}>
              <button type="submit" className="button button--primary button--pill">{isCreole ? 'Voye mesaj' : 'Envoyer'}</button>
              <a className="button button--ghost button--pill" href={`mailto:${supportEmail}`}>Email {supportEmail}</a>
            </div>
          </form>

          <aside className="practice-aside" style={{ position: 'static' }}>
            <div className="card card--compact">
              <h3 className="card__title">{isCreole ? 'Lòt fason pou jwenn nou' : 'Autres moyens de contact'}</h3>
              <ul className="list--bulleted text-muted">
                <li>
                  Email: <a className="footer__link" href={`mailto:${supportEmail}`}>{supportEmail}</a>
                </li>
                <li>
                  GitHub: <a className="footer__link" href="https://github.com/edlinitiative" target="_blank" rel="noopener noreferrer">edlinitiative</a>
                </li>
              </ul>
            </div>
            <div className="card card--compact">
              <h3 className="card__title">{isCreole ? 'Tan repons' : 'Délai de réponse'}</h3>
              <p className="text-muted" style={{ margin: 0 }}>
                {isCreole ? 'Anjeneral, nou reponn nan 1–2 jou travay.' : 'Nous répondons généralement sous 1 à 2 jours ouvrés.'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
