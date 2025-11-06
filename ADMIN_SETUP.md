# Admin Setup Guide

You're getting "Missing or insufficient permissions" errors because the Firestore security rules need to be updated and your account needs admin privileges.

## Step 1: Deploy Firestore Rules

The updated rules are in `firestore.rules` but need to be deployed to Firebase.

### Option A: Deploy via Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the **edlight-academy** project
3. Click **Firestore Database** in the left sidebar
4. Click the **Rules** tab at the top
5. You'll see the current rules editor
6. **Delete all existing content** and paste this:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Users collection: users can read/write their own document
    match /users/{userId} {
      // Allow user to read their own document, or admins to read any
      allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
      
      // Allow user to create/update their own document
      allow create, update: if request.auth != null && request.auth.uid == userId;
      
      // Allow admins to update any user
      allow update: if isAdmin();
      
      // Prevent deletion (optional - remove this line if you want users to delete their accounts)
      allow delete: if false;
    }
    
    // Courses collection: Public read access, admin write
    match /courses/{courseId} {
      allow read: if true; // Anyone can read courses
      allow write: if isAdmin(); // Only admins can write
    }
    
    // Videos collection: Public read access, admin write
    match /videos/{videoId} {
      allow read: if true; // Anyone can read videos
      allow write: if isAdmin(); // Only admins can write
    }
    
    // Quizzes collection: Public read access, admin write
    match /quizzes/{quizId} {
      allow read: if true; // Anyone can read quizzes
      allow write: if isAdmin(); // Only admins can write
    }
    
    // Default: deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

7. Click the **Publish** button in the top right
8. Wait for "Rules published successfully" message

### Option B: Deploy via Firebase CLI (If you have access)

```bash
firebase login
firebase deploy --only firestore:rules
```

## Step 2: Set Your Account as Admin

After deploying the rules, you need to mark your user account as an admin.

1. Still in Firebase Console, go to **Firestore Database**
2. Click the **Data** tab at the top
3. Click on the **users** collection
4. Find **your user document** (it will have your UID as the document ID)
   - Look for the one with your email address
5. Click on your user document to open it
6. Click **"Add field"** (or edit if `role` field already exists)
7. Add:
   - **Field name**: `role`
   - **Type**: `string`
   - **Value**: `admin`
8. Click **Update** or **Add field**

## Step 3: Test Admin Access

1. **Refresh your browser** (to get new token with admin role)
2. Go to the Admin page
3. Click "Load current" to load data from Firebase
4. Try uploading a CSV or editing a video
5. Click "💾 Save to Firebase"
6. Should now see: "✅ Successfully synced X items to Firebase!"

## Troubleshooting

### Still Getting Permission Errors?

1. **Log out and log back in** - Your auth token needs to refresh
2. **Check the `role` field** - Make sure it says exactly `admin` (lowercase)
3. **Check Rules are Published** - In Firebase Console → Firestore → Rules, verify the `isAdmin()` function is there
4. **Check Browser Console** - Look for any other error messages

### How to Make Other Users Admins

Repeat Step 2 for any other user documents in the `users` collection.

### Security Note

Only give admin role to trusted users! Admins can:
- Edit all videos, quizzes, and courses
- Read all user data
- Update any user's information

## Questions?

If you're still having issues after following these steps, check:
- Your user document has `role: 'admin'`
- The Firestore rules are published
- You've refreshed your browser after adding the admin role
