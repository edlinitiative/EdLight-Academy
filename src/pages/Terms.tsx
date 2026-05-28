import React from 'react';

export default function Terms() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Please read carefully</span>
            <h1>Terms of Use</h1>
            <p className="text-muted">These terms govern your use of EdLight Academy. By using the site, you agree to them.</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          <article className="card card--compact">
            <h3 className="card__title">1. Acceptance of terms</h3>
            <p className="text-muted" style={{ margin: 0 }}>By accessing or using the platform, you agree to these Terms of Use and our Privacy Policy.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">2. Accounts and access</h3>
            <p className="text-muted" style={{ margin: 0 }}>You are responsible for maintaining the confidentiality of your account and for all activities under it. Notify us of any unauthorized use.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">3. Allowed uses</h3>
            <ul className="list--bulleted text-muted">
              <li>Use the site for personal, non-commercial learning.</li>
              <li>Follow all applicable laws and respect others’ rights.</li>
              <li>Do not attempt to disrupt, reverse engineer, or misuse the platform.</li>
            </ul>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">4. Content and intellectual property</h3>
            <p className="text-muted" style={{ margin: 0 }}>Course materials and quizzes are provided for your learning. Do not redistribute or copy content without permission.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">5. Disclaimers</h3>
            <p className="text-muted" style={{ margin: 0 }}>The service is provided “as is” without warranties. We strive for accuracy but do not guarantee error-free content or uninterrupted availability.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">6. Changes and termination</h3>
            <p className="text-muted" style={{ margin: 0 }}>We may update the platform or these terms from time to time. We may suspend or terminate access for violations or security reasons.</p>
          </article>

          <article className="card card--compact">
            <h3 className="card__title">7. Contact</h3>
            <p className="text-muted" style={{ margin: 0 }}>Questions about these terms? Email <a className="footer__link" href="mailto:info@edlight.org">info@edlight.org</a>.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
