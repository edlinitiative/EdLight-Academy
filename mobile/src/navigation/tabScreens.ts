/**
 * The five tab roots, each inside its own error boundary (AppErrorBoundary
 * `withTabBoundary`). Shared by the JS and native tab bars so both get the
 * same containment: a render error in one tab shows the FR/HT recovery screen
 * in that tab only, with "Réessayer" and "Retour à l'accueil", and the other
 * tabs keep working. Wrapped once here so component identity is stable.
 */
import { withTabBoundary } from '../components/AppErrorBoundary';
import DashboardScreen from '../screens/DashboardScreen';
import CoursesNavigator from './CoursesNavigator';
import ExamsNavigator from './ExamsNavigator';
import QuizNavigator from './QuizNavigator';
import TriviaScreen from '../screens/TriviaScreen';
import ProfileScreen from '../screens/ProfileScreen';

export const DashboardTab = withTabBoundary(DashboardScreen as any, 'Dashboard');
export const CoursesTab = withTabBoundary(CoursesNavigator as any, 'Courses');
export const ExamsTab = withTabBoundary(ExamsNavigator as any, 'Exams');
export const QuizTab = withTabBoundary(QuizNavigator as any, 'Quiz');
export const TriviaTab = withTabBoundary(TriviaScreen as any, 'Trivia');
export const ProfileTab = withTabBoundary(ProfileScreen as any, 'Profile');
