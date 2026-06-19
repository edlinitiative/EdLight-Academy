import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import AdminRoute from './components/AdminRoute';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Lazy-loaded pages (lazyWithRetry self-heals stale chunk hashes after a deploy)
const Home = lazyWithRetry(() => import('./pages/Home'));
const Courses = lazyWithRetry(() => import('./pages/Courses'));
const CourseDetail = lazyWithRetry(() => import('./pages/CourseDetail'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Quizzes = lazyWithRetry(() => import('./pages/Quizzes'));
const About = lazyWithRetry(() => import('./pages/About'));
const Contact = lazyWithRetry(() => import('./pages/Contact'));
const FAQ = lazyWithRetry(() => import('./pages/FAQ'));
const Help = lazyWithRetry(() => import('./pages/Help'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const CourseManager = lazyWithRetry(() => import('./pages/CourseManager'));
const ExamLanding = lazyWithRetry(() => import('./pages/ExamLanding'));
const ExamBrowser = lazyWithRetry(() => import('./pages/ExamBrowser'));
const ExamTake = lazyWithRetry(() => import('./pages/ExamTake'));
const ExamResults = lazyWithRetry(() => import('./pages/ExamResults'));
const AnswerVerification = lazyWithRetry(() => import('./pages/AnswerVerification'));
const StudyPlan = lazyWithRetry(() => import('./pages/StudyPlan'));
const TriviaGames = lazyWithRetry(() => import('./pages/TriviaGames'));

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={
            <div className="suspense-fallback">
              <div className="loading-spinner" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="courses" element={<Courses />} />
                <Route path="courses/:courseId" element={<CourseDetail />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="quizzes" element={<Quizzes />} />
                <Route path="about" element={<About />} />
                <Route path="contact" element={<Contact />} />
                <Route path="faq" element={<FAQ />} />
                <Route path="help" element={<Help />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="terms" element={<Terms />} />
                <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
                <Route path="admin/courses" element={<AdminRoute><CourseManager /></AdminRoute>} />
                <Route path="admin/verify" element={<AdminRoute><AnswerVerification /></AdminRoute>} />
                <Route path="exams" element={<ExamLanding />} />
                <Route path="exams/:level" element={<ExamBrowser />} />
                <Route path="exams/:level/:examId" element={<ExamTake />} />
                <Route path="exams/:level/:examId/results" element={<ExamResults />} />
                <Route path="study-plan" element={<StudyPlan />} />
                <Route path="trivia" element={<TriviaGames />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}