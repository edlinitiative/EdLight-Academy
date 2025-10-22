import React from 'react';

const faqs = [
  {
    q: 'How do I start learning?',
    a: 'Click Start Learning on the home page to sign in, or browse Courses to pick a subject and NS level. Open a course to follow units and lessons.'
  },
  {
    q: 'Where do I find practice questions?',
    a: 'Open the Quizzes page for curriculum practice by course, grade (NS I–IV), and unit. Inside a course, you can also take a 10-question unit quiz after the last subchapter.'
  },
  {
    q: 'Why are there no questions for my unit?',
    a: 'Some units are still being added. Try another unit in the same course or a different grade level. We add new questions weekly.'
  },
  {
    q: 'Do you support math formatting?',
    a: 'Yes. Questions and explanations are rendered with math support so equations display correctly.'
  },
  {
    q: 'How do I report an issue or suggest content?',
    a: 'Use the Contact Us page to send us a message. Include the course, unit, and a brief description of what you need.'
  }
];

export default function FAQ() {
  return (
    <section className="section">
      <div className="container">
        <div className="page-header">
          <div>
            <span className="page-header__eyebrow">Quick answers</span>
            <h1>Frequently Asked Questions</h1>
            <p className="text-muted">Answers to common questions about courses, practice, and getting started.</p>
          </div>
        </div>

        <div className="grid" style={{ gap: '0.75rem' }}>
          {faqs.map((item, idx) => (
            <details key={idx} className="card" style={{ padding: '1rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{item.q}</summary>
              <p className="text-muted" style={{ marginTop: '0.75rem' }}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
