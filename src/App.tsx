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
import { captureRefFromUrl } from './services/referralService';

// Lazy-loaded pages (lazyWithRetry self-heals stale chunk hashes after a deploy)
const Courses = lazyWithRetry(() => import('./pages/Courses'));
const CourseDetail = lazyWithRetry(() => import('./pages/CourseDetail'));
const Quizzes = lazyWithRetry(() => import('./pages/Quizzes'));
const Revision = lazyWithRetry(() => import('./pages/Revision'));
const About = lazyWithRetry(() => import('./pages/About'));
const Contact = lazyWithRetry(() => import('./pages/Contact'));
const Teach = lazyWithRetry(() => import('./pages/Teach'));
const InstructorProfile = lazyWithRetry(() => import('./pages/InstructorProfile'));
const FAQ = lazyWithRetry(() => import('./pages/FAQ'));
const Help = lazyWithRetry(() => import('./pages/Help'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const DeleteAccount = lazyWithRetry(() => import('./pages/DeleteAccount'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const Defi = lazyWithRetry(() => import('./pages/Defi'));
const Live = lazyWithRetry(() => import('./pages/Live'));
const Direct = lazyWithRetry(() => import('./pages/Direct'));
const Arena = lazyWithRetry(() => import('./pages/Arena'));
const ArenaClaim = lazyWithRetry(() => import('./pages/ArenaClaim'));
const ArenaConsentForm = lazyWithRetry(() => import('./pages/ArenaConsentForm'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const CourseManager = lazyWithRetry(() => import('./pages/CourseManager'));
// Admin console pages
const AdminOverview = lazyWithRetry(() => import('./pages/admin/AdminOverview'));
const AdminCourseDetail = lazyWithRetry(() => import('./pages/admin/AdminCourseDetail'));
const AdminUsers = lazyWithRetry(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazyWithRetry(() => import('./pages/admin/AdminUserDetail'));
const AdminModeration = lazyWithRetry(() => import('./pages/admin/AdminModeration'));
const AdminSandra = lazyWithRetry(() => import('./pages/admin/AdminSandra'));
const AdminInstructors = lazyWithRetry(() => import('./pages/admin/AdminInstructors'));
const AdminSiteStats = lazyWithRetry(() => import('./pages/admin/AdminSiteStats'));
const AdminVideos = lazyWithRetry(() => import('./pages/admin/AdminVideos'));
const AdminQuizzes = lazyWithRetry(() => import('./pages/admin/AdminQuizzes'));
const AdminExams = lazyWithRetry(() => import('./pages/admin/AdminExams'));
const AdminTrivia = lazyWithRetry(() => import('./pages/admin/AdminTrivia'));
const AdminArena = lazyWithRetry(() => import('./pages/admin/AdminArena'));
const AdminArenaQuestions = lazyWithRetry(() => import('./pages/admin/AdminArenaQuestions'));
const ExamLanding = lazyWithRetry(() => import('./pages/ExamLanding'));
const ExamOverview = lazyWithRetry(() => import('./pages/ExamOverview'));
const ExamSubject = lazyWithRetry(() => import('./pages/ExamSubject'));
const ExamHistory = lazyWithRetry(() => import('./pages/ExamHistory'));
const ExamBrowser = lazyWithRetry(() => import('./pages/ExamBrowser'));
const ExamTake = lazyWithRetry(() => import('./pages/ExamTake'));
const ExamResults = lazyWithRetry(() => import('./pages/ExamResults'));
const AnswerVerification = lazyWithRetry(() => import('./pages/AnswerVerification'));
const StudyPlan = lazyWithRetry(() => import('./pages/StudyPlan'));
const TriviaGames = lazyWithRetry(() => import('./pages/TriviaGames'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const Releve = lazyWithRetry(() => import('./pages/Releve'));
const Classement = lazyWithRetry(() => import('./pages/Classement'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const FigureEmbed = lazyWithRetry(() => import('./pages/FigureEmbed'));
const Download = lazyWithRetry(() => import('./pages/Download'));
const TournoisHub = lazyWithRetry(() => import('./pages/tournois/TournoisHub'));
const TournoisCreate = lazyWithRetry(() => import('./pages/tournois/TournoisCreate'));
const TournoisJoin = lazyWithRetry(() => import('./pages/tournois/TournoisJoin'));
const TournoisRoom = lazyWithRetry(() => import('./pages/tournois/TournoisRoom'));

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    },
  },
});

export default function App() {
  // Capture a ?ref=CODE invite param once on load, before any navigation, so it
  // survives the route change to signup (stored in localStorage). Stripped from
  // the URL by the helper.
  React.useEffect(() => {
    captureRefFromUrl();
  }, []);

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
                {/* The student's workspace (Ted's "Espace de travail" mockup); the
                    signed-in "/" keeps the Dashboard. */}
                <Route path="dashboard" element={<Courses mode="workspace" />} />
                <Route path="quizzes" element={<Quizzes />} />
                {/* Ted: "for this page - change all of it, replace with" the quiz
                    hub mockup. The Pratiquer tab is the quiz hub; /quizzes stays
                    as the same page for existing links. */}
                <Route path="practice" element={<Quizzes />} />
                <Route path="revision" element={<Revision />} />
                <Route path="about" element={<About />} />
                <Route path="contact" element={<Contact />} />
                <Route path="enseigner" element={<Teach />} />
                <Route path="enseignants/:instructorId" element={<InstructorProfile />} />
                <Route path="faq" element={<FAQ />} />
                <Route path="help" element={<Help />} />
                <Route path="privacy" element={<Privacy />} />
                <Route path="delete-account" element={<DeleteAccount />} />
                <Route path="terms" element={<Terms />} />
                <Route path="defi/:code" element={<Defi />} />
                <Route path="exams" element={<ExamLanding />} />
                {/* Static segment must be declared before :level (router ranks it higher anyway) */}
                <Route path="exams/resultats" element={<ExamHistory />} />
                <Route path="exams/:level" element={<ExamBrowser />} />
                <Route path="exams/:level/matiere/:subject" element={<ExamSubject />} />
                {/* Coursera-style: the exam URL is its overview page; taking lives on /take */}
                <Route path="exams/:level/:examId" element={<ExamOverview />} />
                <Route path="exams/:level/:examId/take" element={<ExamTake />} />
                <Route path="exams/:level/:examId/results" element={<ExamResults />} />
                <Route path="study-plan" element={<StudyPlan />} />
                <Route path="jeux" element={<TriviaGames />} />
                <Route path="jeux/:gameId" element={<TriviaGames />} />
                {/* Legacy /trivia links (old notifications, bookmarks) */}
                <Route path="trivia" element={<Navigate to="/jeux" replace />} />
                <Route path="trivia/:gameId" element={<Navigate to="/jeux" replace />} />
                <Route path="profile" element={<Profile />} />
                {/* Printable progress record. Inside Layout: its signed-out
                    state invites the visitor to sign in, and Layout is what
                    renders <AuthModal>. The print stylesheet hides the chrome. */}
                <Route path="releve" element={<Releve />} />
                {/* Bare /arena is the link buildArenaInviteMessage()
                    (mobile/src/services/arenaService.ts) puts in every "il
                    manque N joueurs" share text, so it is the most-followed
                    championship URL there is. It rendered "Page introuvable",
                    then a redirect to /download — a QR code with no
                    explanation, which Ted hit twice.

                    Now it is the real page. Ted, 2026-09-21: "only the play is
                    now allowed on website, everything else is" — so a student
                    registers here and installs the app to play. PLAYING stays
                    mobile-only (section A): that is where the integrity
                    controls live, and no browser can offer an equivalent.

                    INSIDE Layout, unlike /direct and /arena/reclamation next
                    to it below. Layout is what renders <AuthModal>, so a page
                    outside it can flip `showAuthModal` and nothing appears —
                    which is exactly what "Se connecter" did here. It also owns
                    the navbar, the footer and the install prompts, and a page
                    asking a visitor to sign in and then install the app needs
                    all three. */}
                <Route path="arena" element={<Arena />} />
                {/* User-created tournaments. Static segments before :id. */}
                <Route path="tournois" element={<TournoisHub />} />
                <Route path="tournois/nouveau" element={<TournoisCreate />} />
                <Route path="tournois/rejoindre" element={<TournoisJoin />} />
                <Route path="tournois/:id" element={<TournoisRoom />} />
                <Route path="classement" element={<Classement />} />
                <Route path="leaderboard" element={<Navigate to="/classement" replace />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* Chrome-free figure embed for the mobile app's WebView */}
              <Route path="/figure-embed" element={<FigureEmbed />} />

              {/* Device-detecting "get the app" smart link (QR-code target) */}
              <Route path="/download" element={<Download />} />

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
                {/* Static segment first: "questions" must not be read as a tournament. */}
                <Route path="content/arena/questions" element={<AdminArenaQuestions />} />
                <Route path="content/arena" element={<AdminArena />} />
                <Route path="content/verify" element={<AnswerVerification />} />
                {/* Users */}
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/moderation" element={<AdminModeration />} />
                <Route path="users/sandra" element={<AdminSandra />} />
                {/* Must precede users/:uid — "instructors" would otherwise match as a uid */}
                <Route path="users/instructors" element={<AdminInstructors />} />
                <Route path="users/:uid" element={<AdminUserDetail />} />
                {/* Data */}
                <Route path="data/collections" element={<Admin />} />
                <Route path="data/stats" element={<AdminSiteStats />} />
                {/* Back-compat redirects from the old flat paths */}
                <Route path="courses" element={<Navigate to="/admin/content/courses" replace />} />
                <Route path="verify" element={<Navigate to="/admin/content/verify" replace />} />
              </Route>

              {/* The live stage sits OUTSIDE Layout on purpose: it is projected
                  and streamed, so the site header, footer and nav would be
                  furniture around a broadcast. Full bleed, or it is not a
                  stage. */}
              {/* The prize claim and the parental authorisation it needs. Both
                  are linked from an email, so both are plain public routes —
                  the claim page does its own auth gate, and the form is a
                  printable document that reveals nothing. */}
              <Route path="/arena/reclamation" element={<ArenaClaim />} />
              <Route path="/arena/autorisation" element={<ArenaConsentForm />} />
              {/* The projector page. It resolves its own tournament and falls
                  back to the weekly school race between events — a screen in a
                  school hall is never blank. */}
              <Route path="/direct" element={<Direct />} />
              <Route path="/live" element={<Navigate to="/direct" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
