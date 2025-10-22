// Runtime-configurable constants
// To set GOOGLE_CLIENT_ID without rebuilding, you can define window.EDLIGHT_GOOGLE_CLIENT_ID in index.html
// or a separate inline script in your hosting environment.
export const GOOGLE_CLIENT_ID = (typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) || '';
