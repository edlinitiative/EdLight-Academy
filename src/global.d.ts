// Global ambient augmentations for browser globals that the app touches but
// that are not part of the standard TypeScript DOM lib (vendor-prefixed APIs,
// third-party globals injected at runtime, and server-injected config).
// These are type-only declarations and do not affect runtime behavior.

export {};

declare global {
  interface Window {
    // YouTube IFrame Player API, loaded lazily via a <script> tag.
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;

    // Config injected into index.html by the server at runtime.
    EDLIGHT_GOOGLE_CLIENT_ID?: string;
    EDLIGHT_FIREBASE_CONFIG?: any;
  }

  interface Navigator {
    // Legacy IE property still probed for language detection.
    userLanguage?: string;
  }

  interface Document {
    // Vendor-prefixed Fullscreen API fallbacks.
    webkitExitFullscreen?: () => void;
    msExitFullscreen?: () => void;
  }
}
