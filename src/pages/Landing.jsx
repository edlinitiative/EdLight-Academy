import React, { useState } from 'react';
import useStore from '../contexts/store';
import { useAppData } from '../hooks/useData';

export default function Landing() {
  const { toggleAuthModal } = useStore();
  const { data, isLoading } = useAppData();
  const [heroSrc, setHeroSrc] = useState('/assets/student-hero.jpg');

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  const coursesCount = data?.courses?.length || 0;
  const quizzesCount = data?.quizzes?.length || 0;

  return (
    <div className="landing-page">
      {/* Navbar */}
      <nav className="landing-navbar">
        <div className="landing-navbar__content">
          <div className="landing-navbar__logo">
            EdLight Academy
          </div>
          
          <div className="landing-navbar__links">
            <button onClick={() => scrollToSection('home')} className="landing-navbar__link">
              Home
            </button>
            <button onClick={() => scrollToSection('features')} className="landing-navbar__link">
              Features
            </button>
            <button onClick={() => scrollToSection('courses')} className="landing-navbar__link">
              Courses
            </button>
            <button onClick={() => scrollToSection('about')} className="landing-navbar__link">
              About
            </button>
            <button onClick={() => scrollToSection('contact')} className="landing-navbar__link">
              Contact
            </button>
          </div>

          <div className="landing-navbar__actions">
            <button 
              className="button button--ghost"
              onClick={() => toggleAuthModal()}
            >
              Sign In
            </button>
            <button 
              className="button button--primary"
              onClick={() => {
                toggleAuthModal();
                useStore.getState().setActiveTab('signup');
              }}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="landing-hero">
        <div className="landing-hero__content">
          <div className="landing-hero__text">
            <h1 className="landing-hero__title">
              Welcome to <span className="landing-hero__brand">EdLight Academy</span>
            </h1>
            <p className="landing-hero__subtitle">
              World-class courses in Physics, Chemistry, Mathematics, and Economics — 
              designed specifically for Haitian students to excel in academics and beyond.
            </p>
            
            <div className="landing-hero__stats">
              <div className="landing-stat">
                <div className="landing-stat__value">{coursesCount}+</div>
                <div className="landing-stat__label">Courses</div>
              </div>
              <div className="landing-stat">
                <div className="landing-stat__value">{quizzesCount}+</div>
                <div className="landing-stat__label">Quizzes</div>
              </div>
              <div className="landing-stat">
                <div className="landing-stat__value">1,200+</div>
                <div className="landing-stat__label">Students</div>
              </div>
            </div>

            <div className="landing-hero__actions">
              <button 
                className="button button--primary button--large"
                onClick={() => {
                  toggleAuthModal();
                  useStore.getState().setActiveTab('signup');
                }}
              >
                Get Started Free
              </button>
              <button 
                className="button button--ghost button--large"
                onClick={() => toggleAuthModal()}
              >
                Sign In
              </button>
            </div>
          </div>

          <div className="landing-hero__visual">
            <img
              className="landing-hero__image"
              src={heroSrc}
              alt="Students learning"
              loading="eager"
              onError={(e) => {
                if (heroSrc !== '/assets/student-hero.svg') {
                  setHeroSrc('/assets/student-hero.svg');
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <h2 className="landing-features__title">Why Choose EdLight Academy?</h2>
        
        <div className="landing-features__grid">
          <div className="landing-feature">
            <div className="landing-feature__icon">📚</div>
            <h3 className="landing-feature__title">Comprehensive Curriculum</h3>
            <p className="landing-feature__description">
              Structured courses aligned with the Haitian educational system, from NS I to NS IV.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🎯</div>
            <h3 className="landing-feature__title">Practice Quizzes</h3>
            <p className="landing-feature__description">
              Test your knowledge with hundreds of practice questions and instant feedback.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">📊</div>
            <h3 className="landing-feature__title">Track Progress</h3>
            <p className="landing-feature__description">
              Monitor your learning journey with detailed progress tracking and analytics.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🌍</div>
            <h3 className="landing-feature__title">Dual Language</h3>
            <p className="landing-feature__description">
              Content in English with support for Kreyòl and French learners.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">⚡</div>
            <h3 className="landing-feature__title">Learn Anywhere</h3>
            <p className="landing-feature__description">
              Access your courses on any device - desktop, tablet, or mobile.
            </p>
          </div>

          <div className="landing-feature">
            <div className="landing-feature__icon">🏆</div>
            <h3 className="landing-feature__title">Earn Badges</h3>
            <p className="landing-feature__description">
              Stay motivated with achievement badges and progress milestones.
            </p>
          </div>
        </div>
      </section>

      {/* Courses Section */}
      <section id="courses" className="landing-courses">
        <div className="landing-courses__content">
          <h2 className="landing-section__title">Our Courses</h2>
          <p className="landing-section__subtitle">
            Comprehensive curriculum covering all major subjects for Haitian students
          </p>

          <div className="landing-courses__grid">
            <div className="landing-course-card">
              <div className="landing-course-card__icon">⚗️</div>
              <h3 className="landing-course-card__title">Chemistry</h3>
              <p className="landing-course-card__description">
                Master chemical concepts from NS I to NS IV. Learn about atoms, molecules, reactions, and more with hands-on examples.
              </p>
              <ul className="landing-course-card__features">
                <li>Atomic structure & periodic table</li>
                <li>Chemical reactions & equations</li>
                <li>Organic & inorganic chemistry</li>
                <li>Laboratory techniques</li>
              </ul>
            </div>

            <div className="landing-course-card">
              <div className="landing-course-card__icon">🔬</div>
              <h3 className="landing-course-card__title">Physics</h3>
              <p className="landing-course-card__description">
                Understand the laws of nature through mechanics, electricity, waves, and modern physics concepts.
              </p>
              <ul className="landing-course-card__features">
                <li>Mechanics & motion</li>
                <li>Electricity & magnetism</li>
                <li>Waves & optics</li>
                <li>Thermodynamics</li>
              </ul>
            </div>

            <div className="landing-course-card">
              <div className="landing-course-card__icon">📐</div>
              <h3 className="landing-course-card__title">Mathematics</h3>
              <p className="landing-course-card__description">
                Build strong mathematical foundations from algebra to calculus with step-by-step problem solving.
              </p>
              <ul className="landing-course-card__features">
                <li>Algebra & geometry</li>
                <li>Trigonometry & functions</li>
                <li>Calculus & analysis</li>
                <li>Statistics & probability</li>
              </ul>
            </div>

            <div className="landing-course-card">
              <div className="landing-course-card__icon">💰</div>
              <h3 className="landing-course-card__title">Economics</h3>
              <p className="landing-course-card__description">
                Explore economic principles, markets, and financial concepts relevant to real-world applications.
              </p>
              <ul className="landing-course-card__features">
                <li>Micro & macroeconomics</li>
                <li>Supply & demand</li>
                <li>Financial markets</li>
                <li>Economic policy</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="landing-trusted">
        <div className="landing-trusted__content">
          <h2 className="landing-section__title">Trusted By Leading Schools</h2>
          <p className="landing-section__subtitle">
            Educational institutions across Haiti rely on EdLight Academy
          </p>

          <div className="landing-trusted__grid">
            <div className="landing-trusted__item">
              <div className="landing-trusted__logo">🏫</div>
              <h4 className="landing-trusted__name">Collège Saint-Pierre</h4>
              <p className="landing-trusted__location">Port-au-Prince</p>
            </div>

            <div className="landing-trusted__item">
              <div className="landing-trusted__logo">🎓</div>
              <h4 className="landing-trusted__name">Lycée Alexandre Pétion</h4>
              <p className="landing-trusted__location">Port-au-Prince</p>
            </div>

            <div className="landing-trusted__item">
              <div className="landing-trusted__logo">📚</div>
              <h4 className="landing-trusted__name">Institution Mixte Bethesda</h4>
              <p className="landing-trusted__location">Cap-Haïtien</p>
            </div>

            <div className="landing-trusted__item">
              <div className="landing-trusted__logo">✏️</div>
              <h4 className="landing-trusted__name">École Nouvelle</h4>
              <p className="landing-trusted__location">Jacmel</p>
            </div>

            <div className="landing-trusted__item">
              <div className="landing-trusted__logo">🏛️</div>
              <h4 className="landing-trusted__name">Collège Catts Pressoir</h4>
              <p className="landing-trusted__location">Port-au-Prince</p>
            </div>
          </div>

          <div className="landing-trusted__stats">
            <div className="landing-trusted__stat">
              <span className="landing-trusted__stat-number">50+</span>
              <span className="landing-trusted__stat-label">Partner Schools</span>
            </div>
            <div className="landing-trusted__stat">
              <span className="landing-trusted__stat-number">1,200+</span>
              <span className="landing-trusted__stat-label">Active Students</span>
            </div>
            <div className="landing-trusted__stat">
              <span className="landing-trusted__stat-number">95%</span>
              <span className="landing-trusted__stat-label">Satisfaction Rate</span>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="landing-testimonials">
        <div className="landing-testimonials__content">
          <h2 className="landing-section__title">What Students Say</h2>
          <p className="landing-section__subtitle">
            Hear from students who have transformed their learning with EdLight Academy
          </p>

          <div className="landing-testimonials__grid">
            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "EdLight Academy helped me improve my chemistry grades significantly! 
                The video lessons are clear and the practice quizzes really helped me 
                prepare for my NS III exams. I went from struggling to being one of 
                the top students in my class."
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">MJ</div>
                <div>
                  <div className="landing-testimonial__name">Marie-Josée Laurent</div>
                  <div className="landing-testimonial__info">NS III Student, Port-au-Prince</div>
                </div>
              </div>
            </div>

            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "The mathematics courses are excellent! I can learn at my own pace 
                and review difficult concepts as many times as I need. The step-by-step 
                explanations make complex problems easy to understand."
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">JB</div>
                <div>
                  <div className="landing-testimonial__name">Jean-Baptiste Pierre</div>
                  <div className="landing-testimonial__info">NS II Student, Cap-Haïtien</div>
                </div>
              </div>
            </div>

            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "I love how EdLight tracks my progress. Seeing my improvement 
                over time motivates me to keep learning. The physics courses 
                are comprehensive and well-structured. Highly recommended!"
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">SC</div>
                <div>
                  <div className="landing-testimonial__name">Sophia Charles</div>
                  <div className="landing-testimonial__info">NS IV Student, Jacmel</div>
                </div>
              </div>
            </div>

            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "As a student preparing for university, EdLight Academy has been 
                invaluable. The economics courses are thorough and practical. 
                I feel much more confident about my future studies."
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">PD</div>
                <div>
                  <div className="landing-testimonial__name">Pierre Duval</div>
                  <div className="landing-testimonial__info">NS IV Student, Port-au-Prince</div>
                </div>
              </div>
            </div>

            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "The quiz system is fantastic! I can practice as much as I want 
                and get instant feedback. This has really helped me identify my 
                weak areas and improve them before exams."
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">AL</div>
                <div>
                  <div className="landing-testimonial__name">Anne Louissaint</div>
                  <div className="landing-testimonial__info">NS I Student, Gonaïves</div>
                </div>
              </div>
            </div>

            <div className="landing-testimonial">
              <div className="landing-testimonial__stars">⭐⭐⭐⭐⭐</div>
              <p className="landing-testimonial__text">
                "EdLight Academy is a game-changer for Haitian students. 
                The content is aligned with our curriculum and accessible 
                anytime. It's like having a personal tutor available 24/7!"
              </p>
              <div className="landing-testimonial__author">
                <div className="landing-testimonial__avatar">RC</div>
                <div>
                  <div className="landing-testimonial__name">Robert Claude</div>
                  <div className="landing-testimonial__info">NS III Student, Les Cayes</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="landing-about">
        <div className="landing-about__content">
          <h2 className="landing-section__title">About EdLight Academy</h2>
          <p className="landing-section__subtitle">
            Empowering Haitian students through accessible, quality education
          </p>

          <div className="landing-about__grid">
            <div className="landing-about__text">
              <h3>Our Mission</h3>
              <p>
                EdLight Academy is dedicated to providing high-quality educational resources 
                to Haitian students. We believe that every student deserves access to excellent 
                learning materials, regardless of their location or economic situation.
              </p>
              <p>
                Our platform offers comprehensive courses in Physics, Chemistry, Mathematics, 
                and Economics, aligned with the Haitian curriculum from NS I to NS IV.
              </p>

              <h3>What Makes Us Different</h3>
              <ul>
                <li><strong>Curriculum-Aligned:</strong> All content follows the official Haitian NS curriculum</li>
                <li><strong>Interactive Learning:</strong> Engage with quizzes, practice problems, and video lessons</li>
                <li><strong>Progress Tracking:</strong> Monitor your improvement with detailed analytics</li>
                <li><strong>Free Access:</strong> Education should be accessible to everyone</li>
              </ul>
            </div>

            <div className="landing-about__stats">
              <div className="landing-stat-box">
                <div className="landing-stat-box__number">{coursesCount}+</div>
                <div className="landing-stat-box__label">Courses Available</div>
              </div>
              <div className="landing-stat-box">
                <div className="landing-stat-box__number">{quizzesCount}+</div>
                <div className="landing-stat-box__label">Practice Questions</div>
              </div>
              <div className="landing-stat-box">
                <div className="landing-stat-box__number">1,200+</div>
                <div className="landing-stat-box__label">Active Students</div>
              </div>
              <div className="landing-stat-box">
                <div className="landing-stat-box__number">4</div>
                <div className="landing-stat-box__label">Core Subjects</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="landing-contact">
        <div className="landing-contact__content">
          <h2 className="landing-section__title">Get In Touch</h2>
          <p className="landing-section__subtitle">
            Have questions? We're here to help you on your learning journey
          </p>

          <div className="landing-contact__grid">
            <div className="landing-contact__info">
              <div className="landing-contact__item">
                <div className="landing-contact__icon">📧</div>
                <div>
                  <h4>Email Us</h4>
                  <p>support@edlightacademy.com</p>
                </div>
              </div>

              <div className="landing-contact__item">
                <div className="landing-contact__icon">💬</div>
                <div>
                  <h4>Chat Support</h4>
                  <p>Available Monday - Friday, 9AM - 5PM</p>
                </div>
              </div>

              <div className="landing-contact__item">
                <div className="landing-contact__icon">📱</div>
                <div>
                  <h4>Follow Us</h4>
                  <p>Stay updated on social media</p>
                </div>
              </div>
            </div>

            <div className="landing-contact__form">
              <h3>Send us a message</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                alert('Thank you for your message! We will get back to you soon.');
              }}>
                <input 
                  type="text" 
                  placeholder="Your Name" 
                  className="landing-contact__input"
                  required
                />
                <input 
                  type="email" 
                  placeholder="Your Email" 
                  className="landing-contact__input"
                  required
                />
                <textarea 
                  placeholder="Your Message" 
                  className="landing-contact__textarea"
                  rows="4"
                  required
                ></textarea>
                <button type="submit" className="button button--primary" style={{ width: '100%' }}>
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <h2 className="landing-cta__title">Ready to Start Learning?</h2>
        <p className="landing-cta__description">
          Join thousands of students already learning with EdLight Academy
        </p>
        <button 
          className="button button--primary button--large"
          onClick={() => {
            toggleAuthModal();
            useStore.getState().setActiveTab('signup');
          }}
        >
          Create Your Free Account
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p className="landing-footer__text">
          © {new Date().getFullYear()} EdLight Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

