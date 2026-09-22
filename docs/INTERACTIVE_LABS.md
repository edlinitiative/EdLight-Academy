# Interactive labs — proposal, not scheduled

Manipulable simulations attached to lessons: the student changes a value and
watches the result, instead of reading about it. Raised September 2026 from a
set of Stitch mockups; captured here because the idea is sound and the mockups
are not a plan.

**Status: idea. Nothing built, nothing committed to.**

---

## Why this is a real fit, not a nice-to-have

Many Haitian schools have no physics lab and no chemistry reagents, but the
Bac still examines experimental content — so TP is taught on paper. "No
equipment, no danger, repeat it fifty times" answers an actual constraint of
this audience, and almost nobody builds this for the MENFP curriculum.

This is the strongest argument in the mockups and it came from their own
testimonial: *"Nan lekòl nou an nan Gonayiv, nou pa gen laboratwa fizik ni
réactif pou fè eksperyans chimik."*

---

## Don't build it. Almost all of it exists.

PhET (University of Colorado) has ~160 HTML5 simulations, free for education,
embeddable **and** downloadable as single-file HTML for offline use. Mapped
against our real chapters:

| Our chapter | Existing simulation |
|---|---|
| Physique Ch.1 — Lumière et optique | Bending Light (Snell), Geometric Optics |
| Physique Ch.2 — Circuits électriques | Circuit Construction Kit: DC |
| Physique Ch.3 — Électrostatique | Coulomb's Law, Charges and Fields |
| Physique Ch.4 — Magnétisme | Faraday's Law, Magnet and Compass |
| Physique Ch.5 — Énergie et transformations | Energy Skate Park |
| Chimie — Grandeurs et Mesures, L'Atome | Build an Atom, Molarity, pH Scale, Balancing Chemical Equations |

Others worth knowing about: **GeoGebra** and **Desmos** (free embed APIs, maths),
**JSXGraph** (MIT, ~200 KB — for building our own light interactive figures
rather than embedding a whole third-party app), and **Falstad's circuit
simulator** (open source, lighter than PhET's).

Verify the licence terms before shipping anything; "free for education" is not
the same as "free to redistribute inside our bundle".

---

## Three frictions specific to us

**1. Weight.** PhET sims run 2–8 MB each. The bundled `catalog.json`, the
service worker and the /courses load work all exist *because* of slow Haitian
connections. An 8 MB iframe dropped into a lesson fights that directly. It has
to load on an explicit tap, state its size first, and be cacheable — not
autoload.

**2. Language.** French is available. Haitian Creole needs checking sim by sim.
Worth knowing: PhET runs a translation programme, so where Kreyòl versions do
not exist **we could translate them and contribute them back**. That is a real
contribution and nobody else is going to produce Kreyòl physics simulations.

**3. CSP.** `vercel.json`'s `frame-src` currently allows only `self`, Google
auth, Firebase and YouTube. Every third-party embed is blocked until it is
extended — the same class of problem as the YouTube nocookie path that caused
the grey-rectangle bug. One line, but a deliberate security decision, not an
oversight to route around.

---

## If we do it, the cheapest way to find out whether it matters

Pick two or three PhET sims for **Chimie**, not Physique. Chimie is already
live with 133 lessons, so the idea gets tested against real students instead of
shipping blind alongside a launch. Extend `frame-src`, gate the load behind a
tap that shows the download size, and measure whether anyone opens it twice.

That is roughly a day. It answers the question that actually matters — do
students use this — before anyone commits to the Physique launch.

---

## What NOT to take from the mockups

They bundled three very different levels of difficulty and presented them as
one feature set:

- **One formula, sliders, a drawing that responds** — a day or two each. Ohm's
  law is one division. Projectile motion, the lens equation, pH of a strong
  acid, radioactive decay. `src/components/FigureRenderer.tsx` already draws
  circuits, graphs, geometry and chemistry as SVG (2,787 lines, 269 drawing
  calls) but is static — three pieces of state in the whole file. The gap is
  "can a slider change it", not "can we draw it".
- **A real simulation** — weeks each, and needs a physicist or chemist checking
  the model. Rewireable circuits need nodal analysis; a titration curve needs
  equilibrium chemistry; an optics bench needs ray tracing.
- **The escape game and the economy tycoon** — not simulations at all. Games:
  authored puzzles, narrative, balancing. Months, and mostly content production.

Also discard, as with every mockup in that series, the invented numbers and the
invented features: named tutors, downloadable PDF/MP3 packs, certificates of
aptitude, and "+65% retention vs the textbook".
