The repository is a small static frontend for EdLight Academy. The site is served from the `public/` folder and is entirely client-side — there is no server code in this repo.

Key points to help an AI coding agent be productive here:

- Big picture
  - The app is a static site: `public/index.html` loads `public/app.js` and `public/styles.css`.
  - Content is driven from CSVs in `public/data/` (`edlight_subjects.csv`, `edlight_videos.csv`, `edlight_quizzes.csv`). `app.js` loads these via fetch, parses them with a local `parseCSV` function, and renders the catalog and quiz UI.
  - Data flow: CSV rows -> parseCSV() -> arrays of objects -> `renderCatalog()` (video listing) and `renderQuizAPI()` (exposes `window.EdLightQuizzes.forVideo(id)`).

- Files to look at first
  - `public/app.js` — the single JS entrypoint. Read this to understand UI rendering, CSV parsing, and how quiz lookups are exposed.
  - `public/index.html` — page structure and where the course catalog element (id="course-catalog") is injected.
  - `public/styles.css` — utility classes and components (badge, card, modal) used across the UI.
  - `public/data/*.csv` — canonical data model. Use headers here as the source-of-truth for field names (e.g. `video_id`, `option_a`, `subject_code`, `unit_no`).

- Conventions and patterns observed
  - No build step: assets are referenced directly; edits to `public/` files are reflected by static hosting. Assume a simple static web server for local testing (e.g., `python -m http.server` or `live-server`).
  - CSV parsing is done by a custom `parseCSV` function that returns an array of objects using the CSV header row as keys. Keep changes compatible with that parser (it handles quoted fields and CRLF).
  - Global small-surface API: quizzes are exposed as `window.EdLightQuizzes.forVideo(id)` rather than a REST API.
  - UI actions use dataset attributes (e.g. `data-quiz-for="${v.id}"`) and event delegation on `document.body` to open quiz modals.

- Typical tasks and tips
  - Add a new field to videos: update the CSV header, then use `renderCatalog()` to access the new property (e.g., `v.new_field`). Tests or transforms are not present — make sure the CSV includes the new column for all rows.
  - Add unit / integration behavior: keep code small and client-side. For non-trivial features, prefer adding modular helper functions in `app.js` and keep DOM query selectors near their usage.
  - Avoid adding Node tooling unless necessary. If you need a build step, document it in `README.md` and add a minimal `package.json` in the repo root.

- Debugging & local run
  - Serve `public/` from a static server for development. Example quick commands (not in repo):
    - python: `python -m http.server 8000 --directory public`
    - Node: `npx serve public`
  - Use the browser Console to view errors from the CSV fetcher. `app.js` prints friendly errors and will insert the message "Couldn't load curriculum data. Check CSV paths." into the element with id="course-catalog" if fetch fails.

- Integration points & file references
  - Quiz lookup: `public/app.js` -> `renderQuizAPI()` builds `byVideo` and creates `window.EdLightQuizzes.forVideo`.
  - CSV headers to reference when adding data-driven UI: `public/data/edlight_videos.csv` (fields like `id,subject_code,unit_no,lesson_no,video_title,video_url`), `public/data/edlight_subjects.csv` (fields like `id,name,code,color`), `public/data/edlight_quizzes.csv` (fields like `quiz_id,video_id,question,option_a...correct_option`).

- When merging or changing data shape
  - Always update `parseCSV` expectations only if you update all CSVs consistently. Keep backward-compatible field access (use `v.some_field || ''`) to avoid rendering errors.

If anything in these notes is unclear or you'd like the agent to include additional project-specific conventions (testing, CI integration, or deployment), tell me what to add and I'll iterate.
