// Extends Jest's `expect` with DOM matchers like toBeInTheDocument / toHaveFocus.
import '@testing-library/jest-dom';

// jsdom has no layout engine, so its built-in `offsetParent` getter always
// returns null — which breaks visibility checks (e.g. focus-trap skipping
// hidden elements). Override it to return the parent for attached, non-hidden
// elements so those checks behave like a real browser in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() {
    if (this.style && this.style.display === 'none') return null;
    return this.parentNode || null;
  },
});
