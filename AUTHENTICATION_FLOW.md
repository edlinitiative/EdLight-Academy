# Authentication-Based Layout System

## Overview

EdLight Academy now uses **two different layouts** based on authentication status:

1. **Public Layout** - For non-authenticated users (simple informational website)
2. **Private Layout** - For authenticated users (sidebar navigation with full features)

---

## Public Layout (Non-Authenticated Users)

### Layout: `PublicLayout.jsx`
- **Navbar**: Horizontal navigation bar at the top
- **Routes Accessible**:
  - `/` - Home page (hero section with course information)
  - `/courses` - Browse all courses
  - `/courses/:id` - View individual course details
  - `/about` - About page
  - `/contact` - Contact page
  - `/faq` - FAQ page
  - `/help` - Help page
  - `/privacy` - Privacy policy
  - `/terms` - Terms of service

### Features:
- Clean, simple navigation
- "Sign In" and "Create Account" buttons in navbar
- Hero landing page with call-to-action
- Can browse courses but cannot enroll
- Cannot access Dashboard, Quizzes, Profile, or Settings

---

## Private Layout (Authenticated Users)

### Layout: `PrivateLayout.jsx`
- **Sidebar**: Left sidebar with navigation icons and labels
- **Top Bar**: Shows EdLight logo and user avatar
- **Purple Border**: Main content wrapped in purple border

### Routes Accessible:
All public routes PLUS:
- `/dashboard` - Personal dashboard with enrolled courses and progress
- `/quizzes` - Practice quizzes (curriculum-based)
- `/profile` - User profile information
- `/settings` - User settings and preferences
- `/admin` - Admin panel (if authorized)

### Sidebar Navigation Items:
1. **Dashboard** - Home/overview
2. **Courses** - Course catalog
3. **Practice** - Quizzes
4. **About** - Information

### Bottom Sidebar Items:
1. **Profile** - User account info
2. **Settings** - Preferences

### Features:
- Fixed left sidebar (180px on desktop, collapses on mobile)
- Purple-themed UI with gradient avatar
- Top bar with user initials in circular avatar
- Can enroll in courses
- Track progress and quiz attempts
- Access all features

---

## Authentication Flow

### 1. Non-Authenticated User Journey

```
User visits site
   ↓
Sees PublicLayout (horizontal navbar)
   ↓
Can browse: Home, Courses, About, etc.
   ↓
Clicks "Sign In" or "Create Account"
   ↓
Auth Modal appears
   ↓
User signs in/up
   ↓
Layout switches to PrivateLayout (sidebar)
   ↓
Redirected to Dashboard
```

### 2. Attempting to Access Protected Routes

```
Non-authenticated user tries to access /dashboard
   ↓
PrivateLayout detects no authentication
   ↓
Redirects to "/" (home page)
   ↓
User must sign in to access
```

### 3. Authenticated User Journey

```
User signs in
   ↓
Layout switches to PrivateLayout
   ↓
Sidebar appears
   ↓
Can access all routes including Dashboard, Quizzes, Profile, Settings
   ↓
User signs out
   ↓
Layout switches back to PublicLayout
   ↓
Redirected to home page
```

---

## Layout Switching Logic

### `Layout.jsx` (Master Layout Component)

```jsx
export function Layout() {
  const { isAuthenticated } = useStore();
  
  // Conditionally render layout based on auth status
  return isAuthenticated ? <PrivateLayout /> : <PublicLayout />;
}
```

This single component determines which layout to use based on the user's authentication state from the global store (Zustand).

---

## Protected Routes Implementation

### Dashboard Protection
```jsx
// In Dashboard.jsx
useEffect(() => {
  if (!isAuthenticated) {
    navigate('/', { replace: true });
  }
}, [isAuthenticated, navigate]);
```

### Quizzes Protection
```jsx
// In Quizzes.jsx
useEffect(() => {
  if (!isAuthenticated) {
    navigate('/', { replace: true });
  }
}, [isAuthenticated, navigate]);
```

### Profile & Settings Protection
```jsx
// In Profile.jsx and Settings.jsx
if (!isAuthenticated) {
  return (
    <div className="card card--message">
      <h2>Please sign in to view your profile</h2>
      <button onClick={() => useStore.getState().toggleAuthModal()}>
        Sign In
      </button>
    </div>
  );
}
```

---

## Visual Differences

### Public Layout
- ✅ Horizontal navbar
- ✅ Simple, clean design
- ✅ Standard white/blue theme
- ✅ No sidebar
- ✅ CTA buttons prominent

### Private Layout
- ✅ Left sidebar navigation
- ✅ Purple-themed UI
- ✅ Purple gradient avatar
- ✅ Purple border around content
- ✅ Top bar with logo
- ✅ Sticky sidebar
- ✅ Modern glassmorphism effects

---

## State Management (Zustand)

The authentication state is managed globally using Zustand:

```javascript
// Key state variables
isAuthenticated: boolean
user: { name, email, ... }
showAuthModal: boolean

// Key actions
toggleAuthModal()
login(userData)
logout()
```

When `isAuthenticated` changes, the `Layout` component automatically re-renders and switches between `PublicLayout` and `PrivateLayout`.

---

## Testing the Flow

### Test Case 1: Public Access
1. Clear browser cache/cookies
2. Visit `http://localhost:8080`
3. **Expected**: See horizontal navbar, hero section, "Sign In" button
4. **Expected**: Can browse courses and about page
5. **Expected**: Cannot access `/dashboard`, `/quizzes`, `/profile`, `/settings`

### Test Case 2: Sign In
1. From public home page, click "Sign In"
2. Complete authentication
3. **Expected**: Layout switches to sidebar immediately
4. **Expected**: Redirected to `/dashboard`
5. **Expected**: Sidebar visible with all navigation items
6. **Expected**: Purple avatar in top right

### Test Case 3: Protected Route Access
1. While not authenticated, try to manually navigate to `/dashboard`
2. **Expected**: Redirected back to `/` (home)
3. Sign in
4. **Expected**: Can now access `/dashboard` successfully

### Test Case 4: Sign Out
1. While authenticated, click sign out (in Settings page)
2. **Expected**: Layout switches back to horizontal navbar
3. **Expected**: Redirected to home page
4. **Expected**: Sidebar disappears
5. **Expected**: Can only access public routes

---

## Mobile Responsiveness

### Public Layout (Mobile)
- Hamburger menu for navigation
- Collapsed menu overlay
- Mobile-friendly navbar

### Private Layout (Mobile)
- Sidebar collapses to 70px (icons only)
- Labels hidden
- Top bar remains visible
- Content adapts to smaller width

---

## Accessibility

- All navigation items have proper ARIA labels
- Keyboard navigation supported
- Focus states visible
- Screen reader friendly

---

## Performance

- Layout switching is instant (no page reload)
- Zustand state updates trigger React re-render
- Lazy loading for page components
- Sidebar is position: fixed (no layout shifts)

---

## Future Enhancements

1. **Remember Last Route**: After login, redirect to the route user was trying to access
2. **Session Persistence**: Keep user logged in across browser sessions
3. **Loading States**: Show skeleton while switching layouts
4. **Smooth Transitions**: Add fade animations when switching layouts
5. **Role-Based Layouts**: Different sidebars for students vs admins

---

## Summary

✅ **Two separate layouts** based on authentication  
✅ **Public users** see simple informational site with horizontal navbar  
✅ **Authenticated users** see full-featured sidebar navigation with purple theme  
✅ **Protected routes** automatically redirect to home if not authenticated  
✅ **Seamless switching** between layouts on login/logout  
✅ **Mobile responsive** with collapsing sidebar  
✅ **No linting errors** - all code passes validation  

This system provides a clear separation between public marketing/information pages and the authenticated learning platform experience.

