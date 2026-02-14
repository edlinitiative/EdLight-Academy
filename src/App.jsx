import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import AdminRoute from './components/AdminRoute';

// Lazy-loaded pages
const Home = React.lazy(() => import('./pages/Home'));
const Courses = React.lazy(() => import('./pages/Courses'));
const CourseDetail = React.lazy(() => import('./pages/CourseDetail'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Quizzes = React.lazy(() => import('./pages/Quizzes'));
const About = React.lazy(() => import('./pages/About'));
const Contact = React.lazy(() => import('./pages/Contact'));
const FAQ = React.lazy(() => import('./pages/FAQ'));
const Help = React.lazy(() => import('./pages/Help'));
const Privacy = React.lazy(() => import('./pages/Privacy'));
const Terms = React.lazy(() => import('./pages/Terms'));
const Admin = React.lazy(() => import('./pages/Admin'));
const CourseManager = React.lazy(() => import('./pages/CourseManager'));
const ExamBrowser = React.lazy(() => import('./pages/ExamBrowser'));
const ExamTake = React.lazy(() => import('./pages/ExamTake'));
const ExamResults = React.lazy(() => import('./pages/ExamResults'));

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
            <div className="flex items-center justify-center min-h-screen">
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
                <Route path="exams" element={<ExamBrowser />} />
                <Route path="exams/:examIndex" element={<ExamTake />} />
                <Route path="exams/:examIndex/results" element={<ExamResults />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}