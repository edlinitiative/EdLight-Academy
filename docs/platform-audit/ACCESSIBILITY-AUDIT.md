# Accessibility Audit — EdLight Academy

**Audit date:** 2026-06-26  
**Standard:** WCAG 2.2 AA

---

## Strengths

- Auth modal uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby` — correct
- Auth modal has `useFocusTrap` hook — focus is correctly trapped
- Auth modal has body scroll lock while open — prevents background scroll issues
- Error messages use `role="alert"` — screen readers announce them
- Success messages use `role="status"` — announced politely
- Timer in ExamTake uses `aria-live="polite"` during warning state, `aria-atomic="true"` — correct
- Progress bar in ExamTake uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Question navigation buttons have `aria-label="Aller à la question X"`
- Section navigation has `role="navigation"` with `aria-label`
- Resume/restart dialogs in ExamTake use `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`
- Password toggle button has `aria-label` and `aria-pressed`
- Image alt text: `CardCover` component
- KaTeX math rendered via `dangerouslySetInnerHTML` — no alt text possible, but this is a known KaTeX limitation
- Keyboard navigation supported in ExamTake (Arrow keys)
- Escape key closes modals (Auth, ExamTake overlays)

---

## Issues

### A11Y-P1: Focus Management — Auth Modal

The auth modal sets `tabIndex={-1}` on the modal container and uses `useFocusTrap`, but the initial focus target is not explicitly set to the first interactive element. Screen reader users may land on an unexpected element when the modal opens.

**Fix:** Call `modalRef.current.focus()` or explicitly focus the first form input when the modal opens.

---

### A11Y-P2: Admin Edit Modal Close Button

```tsx
<button className="modal__close" onClick={onCancel} aria-label="Close">×</button>
```

`aria-label="Close"` is in English while the app is bilingual (French/Creole). Screen reader users may hear "Close" in English.

**Fix:** Localize the `aria-label` or use the same `t('auth.close')` pattern used in the Auth modal.

---

### A11Y-P2: DataTable — No `scope` on Header Cells

```tsx
<th key={c} style={{ ... }}>{c}</th>
```

Table header cells should have `scope="col"` to associate them with their columns for screen readers.

**Fix:** Add `scope="col"` to all `<th>` elements in the DataTable component.

---

### A11Y-P2: Dashboard Course Progress Bar

```tsx
<span className="dash-course__bar" aria-hidden="true">
  <span style={{ width: `${percent}%` }} />
</span>
```

The progress bar is hidden from screen readers (`aria-hidden="true"`), but the percentage value is available in text (`{percent}%`). This is acceptable, but the text percentage should be wrapped in a `<span>` with a visually-hidden description.

---

### A11Y-P2: `button--danger` Missing from Design System

The "🧹 Clear quiz database" button in Admin uses class `button--danger` which does not exist. The button will render with no distinct danger styling — a user may not realize the destructive nature of the action. This also reduces contrast for users with color vision deficiency.

**Fix:** Add `.button--danger` to the CSS design system with appropriate red/warning styling.

---

### A11Y-P2: `window.confirm()` for Destructive Actions

The "Clear quiz database" flow uses `window.confirm()` which:
- Is not customizable with ARIA roles
- Cannot be styled to match the app
- Is blocked by some assistive technologies
- Cannot be read by custom screen reader announcement

**Fix:** Replace with a custom confirmation dialog using the existing `.modal` pattern with proper focus management.

---

### A11Y-P3: Heading Hierarchy

On the Dashboard, there is an `<h1>` for the greeting and multiple `<h2>` for section panels. However, the `ReadinessCard` component uses its own heading structure that may not integrate correctly into the page hierarchy. Needs manual inspection.

---

### A11Y-P3: Icon Buttons Without Labels

Several navigation buttons use only icons:
- `<ChevronRight>` icons in dashboard activity rows are wrapped in `<button>` but do not have `aria-label`
- The `ExamTake` "back" button `← Examens` is text-based — acceptable
- The user dropdown close button in `UserDropdown` has no visible `aria-label`

**Fix:** Add `aria-label` to all icon-only buttons.

---

### A11Y-P3: KaTeX Math Accessibility

KaTeX renders math as HTML+CSS with no MathML fallback by default. Screen readers cannot meaningfully describe rendered math formulas.

**Fix:** Enable KaTeX's `output: 'mathml'` or `output: 'htmlAndMathml'` option to add MathML. This is a known industry problem with no perfect solution.

---

### A11Y-P3: Color Contrast

Cannot be verified via static analysis. Manual review with a contrast checker (WCAG AA requires 4.5:1 for normal text, 3:1 for large text) should be performed on:
- The `--color-text-muted` on `--color-bg-secondary` combination
- Exam question text on the card background
- The timer warning state (`exam-take__timer--warning`)

---

### A11Y-P3: Reduced Motion

The ExamTake page has a `prefers-reduced-motion` check for scroll behavior:
```ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
contentRef.current?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
```

This is correct. However, the Homepage uses `data-reveal` scroll animations (handled in Layout). These should also respect `prefers-reduced-motion`.

---

## Summary

| Severity | Count |
|---|---|
| P1 | 1 |
| P2 | 5 |
| P3 | 5 |
| **Total** | **11** |

The app has a strong accessibility foundation (focus traps, ARIA roles on modals, keyboard navigation in exams). The main gaps are around data tables, admin UI, and math accessibility.
