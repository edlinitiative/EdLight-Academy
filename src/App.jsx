import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';

// Lazy-loaded pages
const Home = React.lazy(() => import('./pages/Home'));
const Courses = React.lazy(() => import('./pages/Courses'));
const CourseDetail = React.lazy(() => import('./pages/CourseDetail'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Quizzes = React.lazy(() => import('./pages/Quizzes'));
const About = React.lazy(() => import('./pages/About'));

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
              <Route index element={<Home />} />
              <Route path="courses" element={<Courses />} />
              <Route path="courses/:courseId" element={<CourseDetail />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="about" element={<About />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}