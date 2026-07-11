import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import ScrollToTop from './components/ScrollToTop';
import HomeRoute from './components/HomeRoute';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Lazy-loaded pages (lazyWithRetry self-heals stale chunk hashes after a deploy)
const Courses = lazyWithRetry(() => import('./pages/Courses'));
const CourseDetail = lazyWithRetry(() => import('./pages/CourseDetail'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Quizzes = lazyWithRetry(() => import('./pages/Quizzes'));
const About = lazyWithRetry(() => import('./pages/About'));
const Contact = lazyWithRetry(() => import('./pages/Contact'));
const FAQ = lazyWithRetry(() => import('./pages/FAQ'));
const Help = lazyWithRetry(() => import('./pages/Help'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const DeleteAccount = lazyWithRetry(() => import('./pages/DeleteAccount'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const CourseManager = lazyWithRetry(() => import('./pages/CourseManager'));
// Admin console pages
const AdminOverview = lazyWithRetry(() => import('./pages/admin/AdminOverview'));
const AdminCourseDetail = lazyWithRetry(() => import('./pages/admin/AdminCourseDetail'));
const AdminUsers = lazyWithRetry(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazyWithRetry(() => import('./pages/admin/AdminUserDetail'));
const AdminModeration = lazyWithRetry(() => import('./pages/admin/AdminModeration'));
const AdminSiteStats = lazyWithRetry(() => import('./pages/admin/AdminSiteStats'));
const AdminVideos = lazyWithRetry(() => import('./pages/admin/AdminVideos'));
const AdminQuizzes = lazyWithRetry(() => import('./pages/admin/AdminQuizzes'));
const AdminExams = lazyWithRetry(() => import('./pages/admin/AdminExams'));
const AdminTrivia = lazyWithRetry(() => import('./pages/admin/AdminTrivia'));
const ExamLanding = lazyWithRetry(() => import('./pages/ExamLanding'));
const ExamBrowser = lazyWithRetry(() => import('./pages/ExamBrowser'));
const ExamTake = lazyWithRetry(() => import('./pages/ExamTake'));
const ExamResults = lazyWithRetry(() => import('./pages/ExamResults'));
const AnswerVerification = lazyWithRetry(() => import('./pages/AnswerVerification'));
const StudyPlan = lazyWithRetry(() => import('./pages/StudyPlan'));
const TriviaGames = lazyWithRetry(() => import('./pages/TriviaGames'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const FigureEmbed = lazyWithRetry(() => import('./pages/FigureEmbed'));

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
          <ScrollToTop />
          <Suspense fallback={
            <div className="suspense-fallback">
              <div className="loading-spinner" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<HomeRoute />} />
                <Route path="courses" element={<Courses />} />
                <Route path="courses/:courseId" element={<CourseDetail />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="quizzes" element={<Quizzes />} />
                <Route path="about" element={<About />} />
                <Route path="contact" element={<Contact />} />
                <Route path="faq" element={<FAQ />} />
                <Route path="help" element={<Help />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="delete-account" element={<DeleteAccount />} />
                <Route path="terms" element={<Terms />} />
                  <Route path="exams" element={<ExamLanding />} />
                <Route path="exams/:level" element={<ExamBrowser />} />
                <Route path="exams/:level/:examId" element={<ExamTake />} />
                <Route path="exams/:level/:examId/results" element={<ExamResults />} />
                <Route path="study-plan" element={<StudyPlan />} />
                <Route path="trivia" element={<TriviaGames />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* Chrome-free figure embed for the mobile app's WebView */}
              <Route path="/figure-embed" element={<FigureEmbed />} />

              {/* Admin console — sidebar layout with grouped sections/subpages */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminOverview />} />
                {/* Content */}
                <Route path="content/courses" element={<CourseManager />} />
                <Route path="content/courses/:courseId" element={<AdminCourseDetail />} />
                <Route path="content/videos" element={<AdminVideos />} />
                <Route path="content/quizzes" element={<AdminQuizzes />} />
                <Route path="content/exams" element={<AdminExams />} />
                <Route path="content/trivia" element={<AdminTrivia />} />
                <Route path="content/verify" element={<AnswerVerification />} />
                {/* Users */}
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/moderation" element={<AdminModeration />} />
                <Route path="users/:uid" element={<AdminUserDetail />} />
                {/* Data */}
                <Route path="data/collections" element={<Admin />} />
                <Route path="data/stats" element={<AdminSiteStats />} />
                {/* Back-compat redirects from the old flat paths */}
                <Route path="courses" element={<Navigate to="/admin/content/courses" replace />} />
                <Route path="verify" element={<Navigate to="/admin/content/verify" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}