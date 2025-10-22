import React, { useState } from 'react';

export default function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const supportEmail = 'info@edlight.org';

  const handleSubmit = (e) => {
    e.preventDefault();
    // Build a mailto link so users can contact without a backend
    const subj = encodeURIComponent(subject || `EdLight Academy Contact from ${name || 'Prospective Student'}`);
    const bodyLines = [
      name ? `Name: ${name}` : null,
      email ? `Email: ${email}` : null,
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
            <span className="page-header__eyebrow">We'd love to hear from you</span>
            <h1>Contact Us</h1>
            <p className="text-muted">Have a question, partnership idea, or feedback? Send us a note and we’ll get back to you.</p>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
          <form className="card" onSubmit={handleSubmit}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input id="name" className="input-field" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label className="label" htmlFor="subject">Subject</label>
              <input id="subject" className="input-field" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="I have a question about…" />
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label className="label" htmlFor="message">Message</label>
              <textarea id="message" className="input-field" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" required />
            </div>
            <div className="quiz-card__controls" style={{ marginTop: '0.9rem' }}>
              <button type="submit" className="button button--primary button--pill">Send message</button>
              <a className="button button--ghost button--pill" href={`mailto:${supportEmail}`}>Email {supportEmail}</a>
            </div>
          </form>

          <aside className="practice-aside" style={{ position: 'static' }}>
            <div className="card card--compact">
              <h3 className="card__title">Other ways to reach us</h3>
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
              <h3 className="card__title">Response time</h3>
              <p className="text-muted" style={{ margin: 0 }}>We typically reply within 1–2 business days.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
