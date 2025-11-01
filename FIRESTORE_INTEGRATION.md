# Firestore Integration - Course Data

## Overview

The application has been updated to fetch course content entirely from Firebase Firestore instead of CSV files. When a user clicks "Start Course", the app now retrieves the complete course structure (units, lessons, videos, quizzes) from Firestore collections.

## What Changed

### Data Flow (Before)
```
CSV Files → Transform to Courses → Display in App
```

### Data Flow (After)  
```
Firestore Only (courses, videos, quizzes) → Transform to App Format → Display in App
```

**Note**: CSV files are kept in the repository but are no longer loaded or used by the application.

## Changes Made

### 1. New Firestore Fetch Functions (`src/services/dataService.js`)

**`fetchCoursesFromFirestore()`**
- Fetches all course documents from the `courses` collection
- Returns array of courses with full structure (units & lessons)

**`fetchVideosFromFirestore()`**
- Fetches all video documents from the `videos` collection
- Returns Map of videoId → video data for fast lookup

**`fetchQuizzesFromFirestore()`**
- Fetches all quiz documents from the `quizzes` collection
- Returns Map of quizId → quiz data for fast lookup

### 2. New Transformation Function

**`transformFirestoreCourses()`**
- Transforms Firestore course structure to app-expected format
- Enriches lessons with video/quiz metadata:
  - **Video lessons**: Get video URL, duration, objectives, thumbnail
  - **Quiz lessons**: Get question count, time limit, passing score
- Maps subject codes to colors and icons
- Converts level codes (ns1 → NSI, ns2 → NSII, etc.)

### 3. Updated Data Loading

**`loadAppData()`**
- Now fetches courses, videos, and quizzes from Firestore in parallel
- CSV files are kept for backward compatibility (subjects, quiz bank)
- Logs detailed information about data loading for debugging

## Course Structure

### Firestore Structure
```json
{
  "id": "chem-ns1",
  "display_name": "Chimie - NSI",
  "description": "...",
  "subject": "chemistry",
  "level_id": "ns1",
  "number_of_units": 9,
  "number_of_lessons": 29,
  "units": [
    {
      "unitId": "chap1",
      "title": "Introduction à la chimie",
      "order": 1,
      "lessons": [
        {
          "lessonId": "chem-ns1-u1-l1",
          "title": "Branches de la chimie",
          "type": "video",
          "order": 1
        },
        {
          "lessonId": "chem-ns1-u1-quiz",
          "title": "Test unité — Chapitre 1",
          "type": "quiz",
          "order": 4
        }
      ]
    }
  ]
}
```

### App Format (After Transformation)
```javascript
{
  id: "chem-ns1",
  name: "Chimie - NSI",
  code: "CHEM-NSI",
  level: "NSI",
  subject: "CHEM",
  description: "...",
  color: "#10B981",
  thumbnail: "beaker",
  videoCount: 29,
  duration: 504,
  modules: [
    {
      id: "chap1",
      title: "Introduction à la chimie",
      order: 1,
      lessons: [
        {
          id: "chem-ns1-u1-l1",
          title: "Branches de la chimie",
          type: "video",
          videoUrl: "https://www.youtube.com/embed/...",
          duration: 15,
          objectives: "..."
        },
        {
          id: "chem-ns1-u1-quiz",
          title: "Test unité — Chapitre 1",
          type: "quiz",
          questionCount: 42,
          passingScore: 70,
          duration: 30
        }
      ]
    }
  ]
}
```

## Collections Used

### `courses` Collection
- **Purpose**: Course metadata and structure
- **Document ID**: Course ID (e.g., `chem-ns1`)
- **Key Fields**: `display_name`, `description`, `units`, `number_of_lessons`

### `videos` Collection
- **Purpose**: Video details for lessons
- **Document ID**: Video/Lesson ID (e.g., `chem-ns1-u1-l1`)
- **Key Fields**: `title`, `video_url`, `duration_min`, `learning_objectives`

### `quizzes` Collection
- **Purpose**: Quiz details and questions
- **Document ID**: Quiz ID (e.g., `chem-ns1-u1-quiz`)
- **Key Fields**: `title`, `questions`, `total_questions`, `passing_score`

## Benefits

1. **Single Source of Truth**: Course content is managed in Firestore
2. **Real-time Updates**: Changes in Firestore reflect immediately (after refresh)
3. **Scalable**: Easy to add new courses, videos, or quizzes
4. **Structured**: Proper data relationships (course → unit → lesson → video/quiz)
5. **Performance**: Firestore caching and CDN reduce load times

## Testing

To verify the integration works:

1. **Upload Data to Firestore** (if not done):
   ```bash
   cd upload_files
   node upload_videos.js videos.json edlight-academy
   node upload_quizzes.js quizzes.json edlight-academy
   node upload_courses.js courses.json edlight-academy
   cd ..
   firebase deploy --only firestore:rules
   ```

2. **Test Locally**:
   - Start the dev server: `npm run dev`
   - Open the app in browser
   - Check browser console for Firestore fetch logs:
     - `📚 Fetching courses from Firestore...`
     - `🎬 Fetching videos from Firestore...`
     - `📝 Fetching quizzes from Firestore...`
     - `✅ Fetched X courses from Firestore`

3. **Navigate to Courses**:
   - Click on any course
   - Verify course structure loads correctly
   - Check that units and lessons are displayed
   - Confirm video URLs are correct (not placeholders)

4. **Check Console Logs**:
   ```
   🚀 Loading application data...
   📚 Fetching courses from Firestore...
   🎬 Fetching videos from Firestore...
   📝 Fetching quizzes from Firestore...
   ✅ Fetched 11 courses from Firestore
   ✅ Fetched 309 videos from Firestore
   ✅ Fetched 68 quizzes from Firestore
   📊 Data loaded: {...}
   🔄 Transforming Firestore courses for app...
   ✅ Transformed 11 courses for app
   ```

## CSV Files Status

- **CSV files are kept** in the repository for reference but are **no longer loaded**
- Subject colors and icons are now defined in code (`SUBJECT_DEFAULTS`)
- Quiz bank uses video data from Firestore
- All course, video, and quiz data comes from Firestore

## Next Steps (Optional)

1. **Remove CSV Files**: Once confirmed everything works, CSV files can be deleted
2. **Add Caching**: Implement IndexedDB caching for offline support
3. **Real-time Updates**: Use Firestore `onSnapshot` for live data
4. **Individual Video Loading**: Lazy-load video details on-demand instead of fetching all at once
5. **User Progress Tracking**: Store progress in Firestore per user

## Troubleshooting

### Issue: "No courses found"
- **Check**: Firestore rules allow read access to `courses` collection
- **Solution**: Deploy updated rules: `firebase deploy --only firestore:rules`

### Issue: "Videos show placeholder URLs"
- **Check**: Videos are uploaded to Firestore
- **Solution**: Run `node upload_videos.js videos.json edlight-academy`

### Issue: "Console errors about missing data"
- **Check**: All three collections have data (courses, videos, quizzes)
- **Solution**: Upload all data using the upload scripts

### Issue: "Firestore permission denied"
- **Check**: `firestore.rules` has public read access
- **Solution**: Update rules and deploy:
  ```
  match /courses/{courseId} {
    allow read: if true;
  }
  match /videos/{videoId} {
    allow read: if true;
  }
  match /quizzes/{quizId} {
    allow read: if true;
  }
  ```

