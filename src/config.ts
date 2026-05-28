// Runtime-configurable constants
// To set GOOGLE_CLIENT_ID without rebuilding, you can define window.EDLIGHT_GOOGLE_CLIENT_ID in index.html
// or a separate inline script in your hosting environment.
// Fallback to the provided default Client ID to avoid configuration issues.
export const GOOGLE_CLIENT_ID =
	(typeof window !== 'undefined' && window.EDLIGHT_GOOGLE_CLIENT_ID) ||
	'1049470868081-16speff0hcok8ru87b11b2ah2egeo0u6.apps.googleusercontent.com';
