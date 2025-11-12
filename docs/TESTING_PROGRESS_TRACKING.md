# Progress Tracking Testing Guide

## Quick Start Testing

### 1. Test Video Tracking
1. Navigate to any course: `/courses/{courseId}`
2. Click on a video lesson
3. Wait 10 seconds while watching the video
4. Open browser DevTools Console
5. Look for log: `[VideoTracking] Tracked video view for: {videoId}`
6. Check Firestore: `users/{your-uid}/progress/{courseId}`
7. Verify `watchedVideos` object contains the video ID
8. Verify `lastStudyDate` is updated

**Expected Result:** Video tracking document created with watch data

### 2. Test Quiz Completion
1. Navigate to a course with quizzes
2. Click on a quiz-type lesson OR click "Practice" button on a video
3. Complete the quiz by answering all questions
4. Check the results screen
5. Open Firestore: `users/{your-uid}/progress/{courseId}`
6. Verify `quizAttempts` contains the quiz data
7. Verify `totalPoints` increased
8. Check console for badge awards

**Expected Result:** 
- Quiz attempt recorded
- Points awarded (10-50 based on score)
- Possible badge awards (quiz_enthusiast, perfectionist)

### 3. Test Lesson Completion
1. Navigate to a video lesson
2. Look for "Mark Complete" button in the lesson navigation
3. Click "Mark Complete"
4. Button should change to "✓ Completed" and become disabled
5. Check sidebar - lesson should have ✓ checkmark
6. Check Firestore: `completedLessons` array should include the lesson ID
7. Verify `totalPoints` increased by 10

**Expected Result:**
- Lesson marked complete
- 10 points awarded
- Visual indicators updated

### 4. Test Progress Dashboard
1. Navigate to `/dashboard`
2. Scroll to "Your Learning Journey" section
3. Verify stats cards show:
   - Total Points (sum of all points earned)
   - Badges Earned (count of unique badges)
   - Day Streak (current consecutive days)
   - Active Courses (courses with progress)
4. Verify badges display with icons
5. Verify course progress list shows enrolled courses

**Expected Result:** Dashboard displays all progress data correctly

### 5. Test Streak System
**Day 1:**
1. Complete a lesson or quiz
2. Check Firestore: `currentStreak` should be 1
3. Note the `lastStudyDate`

**Day 2 (next calendar day):**
1. Complete another lesson or quiz
2. Check Firestore: `currentStreak` should be 2
3. Verify `longestStreak` is updated

**Day 8:**
1. If you study 7 consecutive days
2. Check for `week_streak` badge award

**Expected Result:** Streak increments daily, badges awarded at milestones

### 6. Test Badge Awards
**First Lesson Badge:**
- Complete your very first lesson
- Check for `first_lesson` badge

**Quiz Enthusiast (10 quizzes):**
- Complete 10 different quizzes
- Check for `quiz_enthusiast` badge

**Perfectionist (5 perfect scores):**
- Get 100% on 5 different quizzes
- Check for `perfectionist` badge

**Point Collector (100 points):**
- Earn 100+ total points
- Check for `point_collector` badge

**Expected Result:** Badges automatically awarded when milestones reached

### 7. Test UI Indicators
**Lesson Sidebar:**
1. Complete a lesson
2. Check sidebar - should show ✓ instead of lesson number
3. Background should be light green
4. Border should be green

**Course Header Badges:**
1. On course detail page, check header
2. Should show badges for:
   - Points (if > 0)
   - Streak (if > 0)
   - Completed count (if > 0)

**Expected Result:** All visual indicators update in real-time

## Manual Firestore Verification

### Check Progress Document
1. Open Firebase Console
2. Navigate to Firestore Database
3. Go to: `users/{your-uid}/progress/{courseId}`
4. Verify structure matches:

```json
{
  "completedLessons": ["lesson-id-1", "lesson-id-2"],
  "watchedVideos": {
    "video-id-1": {
      "watchDuration": 10,
      "totalDuration": 600,
      "lastWatched": "2024-01-15T10:30:00.000Z",
      "completed": false
    }
  },
  "quizAttempts": {
    "quiz-id-1": [
      {
        "score": 8,
        "totalQuestions": 10,
        "percentage": 80,
        "timeSpent": 0,
        "attemptedAt": "2024-01-15T10:35:00.000Z"
      }
    ]
  },
  "totalPoints": 50,
  "badges": ["first_lesson", "quiz_enthusiast"],
  "currentStreak": 3,
  "longestStreak": 5,
  "lastStudyDate": "2024-01-15",
  "enrolledAt": "2024-01-10T08:00:00.000Z",
  "lastAccessedAt": "2024-01-15T10:35:00.000Z"
}
```

## Common Issues & Debugging

### Issue: Video tracking not working
**Check:**
- User is authenticated (logged in)
- User is enrolled in course
- Lesson type is 'video' (not 'quiz')
- Wait full 10 seconds
- Check console for errors

### Issue: Quiz not tracking
**Check:**
- Quiz is finished (all questions answered)
- courseId is passed as prop to UnitQuiz
- lessonId is passed for quiz-type lessons
- Check console for errors in tracking

### Issue: Points not awarded
**Check:**
- Firestore write succeeded (check console)
- `totalPoints` field exists in document
- Points calculation is correct (10-50 range)
- No errors in `awardPoints()` function

### Issue: Badges not showing
**Check:**
- Badges array exists in Firestore
- Badge IDs match defined list
- Badge icons defined in getBadgeIcon()
- Achievement conditions met

### Issue: Streak not incrementing
**Check:**
- Last study date is previous day (not same day)
- Date comparison logic in updateStreak()
- Timezone issues (dates should be in ISO format)

### Issue: Dashboard not loading
**Check:**
- User is authenticated
- Progress documents exist
- useAllProgress hook returning data
- No console errors

## Performance Testing

### Load Time:
- Dashboard should load progress in < 2 seconds
- Progress hooks should not cause lag
- Real-time updates should appear instantly

### Memory:
- Check for memory leaks in DevTools
- Verify `onSnapshot` listeners are cleaned up
- No excessive re-renders

## Browser Console Commands

### Check current user progress:
```javascript
// In browser console (when on course page)
console.log('User:', window.__USER__);
console.log('Progress:', window.__PROGRESS__);
```

### Manually trigger tracking (for testing):
```javascript
// Import and call functions directly
import { trackQuizAttempt } from './src/services/progressTracking';

trackQuizAttempt('user-id', 'course-id', 'quiz-id', {
  score: 10,
  totalQuestions: 10,
  percentage: 100,
  timeSpent: 120
});
```

## Automated Test Cases (Future)

### Unit Tests:
- [ ] Test badge award logic
- [ ] Test streak calculation
- [ ] Test points calculation
- [ ] Test completion percentage

### Integration Tests:
- [ ] Test full quiz flow
- [ ] Test full lesson completion flow
- [ ] Test video tracking flow
- [ ] Test dashboard display

### E2E Tests:
- [ ] Complete course from start to finish
- [ ] Earn all badges
- [ ] Build multi-day streak
- [ ] View progress dashboard

## Success Criteria

✅ Video tracking works after 10 seconds
✅ Quiz completion awards correct points (10-50)
✅ Lesson completion awards 10 points
✅ Badges are awarded automatically
✅ Streaks increment daily
✅ Dashboard displays all stats correctly
✅ UI indicators update in real-time
✅ Completed lessons show checkmarks
✅ No console errors during normal usage
✅ Firestore data structure is correct

---

**Last Updated:** 2024-01-15
**Status:** Ready for Testing
