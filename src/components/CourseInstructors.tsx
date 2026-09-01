/**
 * CourseInstructors — "Votre enseignant" card(s) on a course overview.
 *
 * Coursera-style: a named, credentialed person behind the course. Renders
 * nothing while loading or when no visible instructor is bound to the course
 * (courses without a real teacher keep their current chrome — no fake
 * placeholder person).
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap } from 'lucide-react';
import useStore from '../contexts/store';
import { getInstructorsForCourse, type Instructor } from '../services/instructorService';
import './CourseInstructors.css';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export default function CourseInstructors({ courseId }: { courseId: string }) {
  const language = useStore((s) => s.language);
  const ht = language === 'ht';
  const [instructors, setInstructors] = useState<Instructor[] | null>(null);

  useEffect(() => {
    let alive = true;
    setInstructors(null);
    getInstructorsForCourse(courseId).then((list) => {
      if (alive) setInstructors(list);
    });
    return () => { alive = false; };
  }, [courseId]);

  if (!instructors || instructors.length === 0) return null;

  return (
    <section className="course-instructors" aria-label={ht ? 'Pwofesè yo' : 'Enseignants'}>
      <h2 className="course-instructors__title">
        <GraduationCap size={18} aria-hidden />
        {instructors.length > 1 ? (ht ? 'Pwofesè ou yo' : 'Vos enseignants') : (ht ? 'Pwofesè ou' : 'Votre enseignant')}
      </h2>
      <div className="course-instructors__list">
        {instructors.map((i) => (
          <Link key={i.id} to={`/enseignants/${i.id}`} className="course-instructor">
            {i.photoUrl ? (
              <img className="course-instructor__photo" src={i.photoUrl} alt="" loading="lazy" />
            ) : (
              <span className="course-instructor__initials" aria-hidden>{initials(i.name)}</span>
            )}
            <span className="course-instructor__body">
              <span className="course-instructor__name">{i.name}</span>
              <span className="course-instructor__sub">
                {[i.credentials, i.school].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronRight size={17} className="course-instructor__chevron" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
