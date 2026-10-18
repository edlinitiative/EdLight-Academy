import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import CourseOverview from '../CourseOverview';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d?: any) => (typeof d === 'string' ? d : d?.defaultValue || _k), i18n: { language: 'fr' } }) }));
jest.mock('../CourseInstructors', () => () => null);

const lessons = (u: number, n: number) => Array.from({ length: n }, (_, i) => ({
  id: `C-U${u}-L${i + 1}`, title: `Leçon ${u}.${i + 1}`, duration: 7, videoUrl: 'https://www.youtube-nocookie.com/embed/6oKYUnJMdOw',
}));
const base = {
  id: 'chem-ns1', code: 'CHEM-NSI', name: 'Chimie NS I', subject: 'chemistry',
  description: 'Cours de Chimie du Nouveau Secondaire 1 (NS1), enseigné en vidéo par EdLight. Vous y étudierez…',
};
const modules = [{ id: 'U1', title: 'Grandeurs et mesures', lessons: lessons(1, 3) }, { id: 'U2', title: 'L’atome', lessons: lessons(2, 2) }];

function setup(extra: any = {}, props: any = {}) {
  const onStart = jest.fn(); const onSelectLesson = jest.fn();
  render(
    <MemoryRouter>
      <CourseOverview course={{ ...base, ...extra }} modules={modules} onStart={onStart} onSelectLesson={onSelectLesson} {...props} />
    </MemoryRouter>,
  );
  return { onStart, onSelectLesson };
}

test('no stock band, generated summary hidden, one solid action named after the lesson', () => {
  const { onStart } = setup();
  expect(document.querySelector('img.course-overview__cover')).toBeNull();
  expect(screen.queryByText(/enseigné en vidéo par EdLight/)).not.toBeInTheDocument();
  expect(screen.getByText('5 leçons')).toBeInTheDocument();
  expect(screen.getByText('35 min')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Commencer : Leçon 1.1/ }));
  expect(onStart).toHaveBeenCalled();
  expect(document.querySelectorAll('.co__solid')).toHaveLength(1);
});

test('chapters sit on subject frames; the resumed one is open, others toggle; lessons open', () => {
  const { onSelectLesson } = setup();
  expect(document.querySelectorAll('.co__thumb .sf.sf--chem')).toHaveLength(2);
  const ch2 = screen.getByRole('button', { name: /Chapitre 2 : L’atome/ });
  expect(ch2).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(ch2);
  expect(ch2).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: /2\.2 Leçon 2\.2/ }));
  expect(onSelectLesson).toHaveBeenCalledWith(1, 1);
});

test('outcomes only when authored; evidence only when there is some', () => {
  setup();
  expect(screen.queryByText('Ce que tu sauras faire')).not.toBeInTheDocument();
  expect(screen.queryByText(/terminée/)).not.toBeInTheDocument();
});

test('enrolled: progress card with the evidence triple and authored outcomes', () => {
  setup(
    { outcomes: ['Calculer une masse volumique'] },
    { isEnrolled: true, hasProgress: true, progress: { completedLessons: ['C-U1-L1', 'C-U1-L2'] }, mastery: { 'C-U1-L1': { bestPct: 80 } }, resumeTarget: { module: 0, lesson: 2 } },
  );
  expect(screen.getByText('Ta progression')).toBeInTheDocument();
  expect(screen.getByText('2/5')).toBeInTheDocument();
  expect(screen.getAllByText('2 terminées · 1 pratiquée').length).toBeGreaterThan(0);
  expect(screen.getByText('Calculer une masse volumique')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continuer : Leçon 1.3/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /En cours/ })).toHaveAttribute('aria-current', 'step');
});
