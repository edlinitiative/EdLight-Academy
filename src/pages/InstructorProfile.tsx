import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, School, BookOpen, ChevronRight } from 'lucide-react';
import useStore from '../contexts/store';
import { getInstructor, type Instructor } from '../services/instructorService';
import { getCachedCourses } from '../services/dataService';
import { Skeleton, SkeletonText } from '../components/Skeleton';
import '../components/CourseInstructors.css';
import './InstructorProfile.css';

/**
 * InstructorProfile — /enseignants/:instructorId
 *
 * The public face of a volunteer teacher: who they are, what they teach,
 * where they teach, and the EdLight courses they run. World-readable —
 * a named, credentialed person behind a course is a trust signal for
 * students and parents (and for the recruiting funnel: the page links
 * back to /enseigner).
 */

const SUBJECT_LABELS: Record<string, { fr: string; ht: string }> = {
  math: { fr: 'Mathématiques', ht: 'Matematik' },
  physics: { fr: 'Physique', ht: 'Fizik' },
  chemistry: { fr: 'Chimie', ht: 'Chimi' },
  economics: { fr: 'Économie', ht: 'Ekonomi' },
  other: { fr: 'Autre', ht: 'Lòt' },
};

const LEVEL_LABELS: Record<string, string> = {
  '9af': '9e AF', ns1: 'NS I', ns2: 'NS II', ns3: 'NS III', ns4: 'NS IV',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export default function InstructorProfile() {
  const { instructorId } = useParams();
  const navigate = useNavigate();
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const L = (fr: string, kr: string) => (ht ? kr : fr);

  const [instructor, setInstructor] = useState<Instructor | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setInstructor(undefined);
    if (!instructorId) { setInstructor(null); return; }
    getInstructor(instructorId).then((i) => {
      if (alive) setInstructor(i && i.visible !== false ? i : null);
    });
    return () => { alive = false; };
  }, [instructorId]);

  // Resolve the instructor's courses against the cached catalog for titles.
  const catalog = getCachedCourses()?.data || [];
  const courses = (instructor?.courseIds || [])
    .map((id) => catalog.find((c: any) => c.id === id))
    .filter(Boolean) as any[];

  if (instructor === undefined) {
    return (
      <section className="section">
        <div className="container instructor-container" aria-busy="true">
          <div className="card instructor-card">
            <div className="instructor-head">
              <Skeleton width={84} height={84} radius={999} />
              <div style={{ flex: 1 }}>
                <Skeleton width="55%" height={26} style={{ marginBottom: '0.6rem' }} />
                <Skeleton width="40%" height={16} />
              </div>
            </div>
            <SkeletonText lines={3} lastWidth="70%" />
          </div>
        </div>
      </section>
    );
  }

  if (instructor === null) {
    return (
      <section className="section">
        <div className="container instructor-container">
          <div className="card card--message">
            <h1 className="section__title">{L('Profil introuvable', 'Nou pa jwenn pwofil la')}</h1>
            <p className="text-muted">
              {L('Cet enseignant n’existe pas ou n’est plus visible.', 'Pwofesè sa a pa egziste oswa li pa vizib ankò.')}
            </p>
            <button className="button button--primary" onClick={() => navigate('/courses')}>
              {L('Voir les cours', 'Gade kou yo')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const bio = (ht ? instructor.bio_ht : instructor.bio_fr) || instructor.bio_fr || '';

  return (
    <section className="section">
      <div className="container instructor-container">
        <button type="button" className="course-overview__back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {L('Retour', 'Tounen')}
        </button>

        <div className="card instructor-card">
          <div className="instructor-head">
            {instructor.photoUrl ? (
              <img className="instructor-photo" src={instructor.photoUrl} alt="" />
            ) : (
              <span className="instructor-photo instructor-photo--initials" aria-hidden>
                {initials(instructor.name)}
              </span>
            )}
            <div>
              <h1 className="instructor-name">{instructor.name}</h1>
              <p className="instructor-role">
                <GraduationCap size={15} aria-hidden /> {L('Enseignant EdLight', 'Pwofesè EdLight')}
                {instructor.credentials ? ` · ${instructor.credentials}` : ''}
              </p>
              {instructor.school && (
                <p className="instructor-school">
                  <School size={15} aria-hidden /> {instructor.school}
                </p>
              )}
            </div>
          </div>

          {(instructor.subjects?.length || instructor.levels?.length) ? (
            <div className="instructor-chips">
              {(instructor.subjects || []).map((s) => (
                <span key={s} className="instructor-chip">{SUBJECT_LABELS[s]?.[ht ? 'ht' : 'fr'] || s}</span>
              ))}
              {(instructor.levels || []).map((l) => (
                <span key={l} className="instructor-chip instructor-chip--level">{LEVEL_LABELS[l] || l}</span>
              ))}
            </div>
          ) : null}

          {bio && <p className="instructor-bio">{bio}</p>}
        </div>

        {courses.length > 0 && (
          <div className="instructor-courses">
            <h2 className="course-instructors__title">
              <BookOpen size={18} aria-hidden /> {L('Ses cours sur EdLight', 'Kou li yo sou EdLight')}
            </h2>
            <div className="course-instructors__list">
              {courses.map((c) => (
                <Link key={c.id} to={`/courses/${encodeURIComponent(c.id)}`} className="course-instructor">
                  <span className="course-instructor__initials" aria-hidden>
                    <BookOpen size={20} />
                  </span>
                  <span className="course-instructor__body">
                    <span className="course-instructor__name">{c.name}</span>
                    <span className="course-instructor__sub">
                      {[c.subject, c.level ? String(c.level).toUpperCase() : ''].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={17} className="course-instructor__chevron" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="instructor-join text-muted">
          {L('Vous enseignez ? ', 'Ou anseye ? ')}
          <Link to="/enseigner">{L('Rejoignez l’équipe d’enseignants bénévoles.', 'Antre nan ekip pwofesè volontè yo.')}</Link>
        </p>
      </div>
    </section>
  );
}
