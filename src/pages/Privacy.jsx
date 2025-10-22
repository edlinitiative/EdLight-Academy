import React from 'react';

export default function Privacy() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Our commitment</span>
            <h1>Privacy Policy</h1>
            <p className="text-muted">We respect your privacy. This page explains what we collect, how we use it, and your choices.</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">Information we collect</h3>
            <ul className="list--bulleted text-muted">
              <li>Account details you provide (e.g., name, email) when signing in or contacting us.</li>
              <li>Learning activity such as courses viewed and practice attempts to improve your experience.</li>
              <li>Technical data like device and browser info collected through standard analytics.</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">How we use information</h3>
            <ul className="list--bulleted text-muted">
              <li>To operate the site and deliver course content, practice questions, and progress tracking.</li>
              <li>To improve the platform, such as understanding which units need more practice items.</li>
              <li>To communicate important updates or respond to your messages.</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Cookies and analytics</h3>
            <p className="text-muted" style={{ margin: 0 }}>We may use cookies or similar technologies to remember preferences and to measure usage. You can control cookies in your browser settings.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Data sharing</h3>
            <p className="text-muted" style={{ margin: 0 }}>We do not sell your personal information. We may share minimal data with service providers who help us run the platform (e.g., hosting) under appropriate safeguards.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Your choices</h3>
            <ul className="list--bulleted text-muted">
              <li>You can contact us to update or delete your information where applicable.</li>
              <li>You may opt out of non-essential communications.</li>
              <li>You can control cookies via your browser or device settings.</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">Contact</h3>
            <p className="text-muted" style={{ margin: 0 }}>Questions about privacy? Email <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
