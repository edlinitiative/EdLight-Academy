# App Review Resolution — Submission 56ff837f (v1.1.0, build 27)

Three guideline issues were raised. **One (4.8) is fixed in code** (this repo); the
other two are **App Store Connect changes only** (no code). Below: what to do in
ASC, the reply text to paste into App Review, and the console steps that make
Sign in with Apple actually work at runtime.

Roles note: updating App Privacy and metadata requires the **Account Holder or
Admin** role in App Store Connect.

---

## Guideline 4.8 — Login Services (Sign in with Apple)  ✅ fixed in code

The app offered Google + email/password but no Sign in with Apple. Apple requires
an equivalent privacy-forward login option when you offer Google. **Implemented:**
a native "Continue with Apple" button on the sign-in screen (`AuthScreen.tsx`),
directly below the Google button, wired to Firebase Auth via `OAuthProvider('apple.com')`.

**Before it works at runtime you must enable it in two consoles:**

1. **Firebase Console** → Authentication → Sign-in method → **enable Apple**.
   - For native iOS (which is all this app uses), enabling the provider is
     normally sufficient — Firebase validates Apple's identity token against the
     app's bundle ID (`com.edlightacademy`).
   - If you later add Apple login on **web/Android**, you must also fill the
     provider's Services ID + Apple private key (the OAuth redirect config). Not
     needed for the iOS-native flow.

2. **Apple Developer** → Certificates, IDs & Profiles → App ID `com.edlightacademy`
   → enable the **Sign In with Apple** capability. EAS can auto-manage this when
   building with the ASC API key already in `eas.json`; if a build fails on the
   entitlement/provisioning profile, run `eas credentials` (platform iOS) once to
   register the capability and regenerate the profile, then rebuild.

**Review Notes reply (paste in ASC):**
> The app now offers Sign in with Apple as an equivalent login option alongside
> Google. It appears on the sign-in screen ("Connexion"), directly below the
> "Continue with Google" button.

---

## Guideline 2.3.7 — Accurate Metadata (price reference in subtitle)  → ASC metadata

The subtitle referenced price ("free/gratuit/gratis"). Corrected strings are in
`app-store-metadata.md`. Update these fields in ASC (all locales); the word "free"
may stay in the **Description** only.

| Locale | New Subtitle |
|---|---|
| French (fr-FR) | `Cours, quiz et examens` |
| Haitian Creole (ht) | `Kou, quiz ak egzamen` |
| English (en-US) | `Courses, quizzes & exams` |

I also removed price words from the **promotional text** and **keywords** to be
safe (see `app-store-metadata.md`). No App Review reply is required for 2.3.7 —
just fix the metadata before resubmitting.

---

## Guideline 5.1.2(i) — Privacy / App Tracking Transparency  → ASC App Privacy (no code)

A full audit of the mobile app found **no tracking**: no analytics SDK, no ads,
no data-broker sharing, no third-party advertising, and **no phone number
collected anywhere** (no phone auth, no phone field). So the app does **not
"track"** in Apple's sense and needs **no ATT prompt**. The current privacy
labels are inaccurate — correct them in **App Store Connect → App Privacy**:

1. **Set "Used to Track You" → NONE.** No data type should be under tracking.
2. **Remove "Phone Number"** entirely — the app never collects one.
3. Keep the data the app genuinely collects, all marked **Linked to the user**,
   **purpose = App Functionality**, **Used for tracking = No**:

| Data type | Collected | Why |
|---|---|---|
| Email Address | Yes | Account (Firebase Auth) |
| Name | Yes | Display name / account |
| User ID | Yes | Firebase uid |
| Other User Content | Yes | AI-tutor ("Sandra") chat messages + course comments |
| Customer Support | Only if you handle support email | Support correspondence |

- "Emails or Text Messages" that Apple listed = the **Sandra AI-tutor chat text**
  the user types. That's **Other User Content used for App Functionality**, not
  tracking — recategorize it there with tracking OFF.
- The Expo **push token** is device functionality (used to deliver study
  reminders), never for tracking — no tracking label applies.
- Not collected at all (leave unchecked): Location, Purchases, Financial Info,
  Health, Browsing History, Search History, Contacts, Sensitive Info.

**App Review reply (paste in ASC):**
> The app does not track users. It contains no analytics or advertising SDKs and
> does not share data with third parties or data brokers. We have corrected the
> App Privacy information: "Used to Track You" is now set to None, and the Phone
> Number entry has been removed (the app collects no phone number). The data we
> collect — email, name, user ID, and user-generated content such as tutor-chat
> messages — is used solely for app functionality, not for tracking, so no
> AppTrackingTransparency permission request is required.

---

## Rebuild & resubmit checklist

1. Enable Apple provider in **Firebase Console** (§4.8 step 1).
2. Ensure the **Sign In with Apple capability** is on the App ID (§4.8 step 2).
3. **Rebuild** iOS (Sign in with Apple is native — an OTA update can't add it).
   The build number auto-increments (remote `appVersionSource`).
4. In **ASC**: fix the **subtitle** (§2.3.7) and the **App Privacy labels**
   (§5.1.2), attach the new build, and paste the two Review Notes replies above.
5. Submit for review.
