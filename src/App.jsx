import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';

// Lazy-loaded pages
const Landing = React.lazy(() => import('./pages/Landing'));
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
const AuthCallback = React.lazy(() => import('./pages/AuthCallback'));
const Admin = React.lazy(() => import('./pages/Admin'));
const CourseManager = React.lazy(() => import('./pages/CourseManager'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Settings = React.lazy(() => import('./pages/Settings'));

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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <div className="loading-spinner" />
          </div>
        }>
          <Routes>
            <Route path="/" element={<Layout />}>
              {/* Public route - single landing page */}
              <Route index element={<Landing />} />
              
              {/* Auth callback */}
              <Route path="auth/google/callback" element={<AuthCallback />} />
              
              {/* Protected routes - require authentication, shown with sidebar */}
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="courses" element={<Courses />} />
              <Route path="courses/:courseId" element={<CourseDetail />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="about" element={<About />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
              <Route path="contact" element={<Contact />} />
              <Route path="faq" element={<FAQ />} />
              <Route path="help" element={<Help />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
              <Route path="admin" element={<Admin />} />
              <Route path="admin/courses" element={<CourseManager />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}