# Requirements: Course Learning Plugin — v3.0 Professor Studio

**Defined:** 2026-10-15 (approved 2026-10-15)
**Core Value:** The learner builds real understanding by doing — not by reading Claude's code. Every interaction guides, questions, and teaches instead of shortcutting.

## v1 Requirements (milestone v3.0)

### App Shell (SHELL)

- [ ] **SHELL-01**: Learner can start the dashboard locally with `cd studio && npm install && npm run dev` and open it in a browser
- [ ] **SHELL-02**: Learner can navigate Home, New course, Course, Lesson, Review and Settings via hash routes that survive refresh and deep links on a static host
- [ ] **SHELL-03**: Learner can use the app on a phone-width screen (responsive layout, no horizontal scroll)
- [ ] **SHELL-05**: First-time learner sees a skippable onboarding: welcome + privacy line → pick AI source → test connection → on skip/failure, "Try the demo course"
- [ ] **SHELL-04**: Learner sees their data persist across reloads (IndexedDB), with an in-memory fallback warning when storage is unavailable

### AI Providers (AI)

- [ ] **AI-01**: Learner can choose an AI source in Settings: Anthropic (BYOK), OpenAI-compatible (base URL + key + model), Ollama (local URL + model), or Local agent bridge (URL of the `web/` server)
- [ ] **AI-02**: Learner can press "Test connection" and see success or an actionable error (bad key, CORS/OLLAMA_ORIGINS, bridge not running, model missing)
- [ ] **AI-03**: Learner's API keys are stored only in their browser, never included in backups/exports, and can be cleared with one click
- [ ] **AI-04**: Learner sees responses stream token-by-token and can stop a generation mid-way
- [ ] **AI-05**: Learner using Claude via BYOK gets the official Anthropic SDK path (default model `claude-opus-5-5`, selectable Sonnet/Haiku 5.5), with refusals surfaced as a readable message
- [ ] **AI-06**: Learner can use their own local agent (Claude Code / OpenCode / Cursor CLI) through the `web/` server bridge without any API key

### Course Creation (COURSE)

- [x] **COURSE-01**: Learner can create a course by entering a topic, level (Beginner→Expert) and goal; AI proposes a syllabus of 4–10 lessons with one-line summaries
- [x] **COURSE-02**: Learner can edit, reorder, add or remove proposed lessons before confirming (hybrid syllabus, as in professor:new-topic)
- [x] **COURSE-03**: Learner sees all their courses on Home with progress bars, and can delete a course
- [x] **COURSE-05**: When creating a course, the learner sees a proposed course kind — programming, quantitative, conceptual or skill — with a one-line reason, and can change it; the kind shapes lessons and exercises
- [ ] **COURSE-04**: Learner can try a built-in demo course without configuring any AI provider

### Lessons (LESSON)

- [x] **LESSON-01**: Learner can open a lesson and have its content generated on demand (Markdown: concept explanation, real-world example, one hands-on exercise), then cached locally
- [x] **LESSON-02**: Learner can regenerate a lesson
- [x] **LESSON-03**: Lesson Markdown renders safely (GFM tables/code, no raw HTML execution)
- [x] **LESSON-05**: Every lesson follows the shared learning core — objectives, explanation, worked example, common misconceptions, check-your-understanding questions, exercise with success criteria, key takeaways, resources — plus kind-specific blocks (programming: code walkthrough + runnable exercise skeleton with self-check tests; quantitative: step-by-step worked problem + problem set with final answers only; conceptual: case study + concept map/timeline + argument exercise with rubric; skill: model examples + drills + self-assessment)
- [ ] **LESSON-06**: Lessons render math (KaTeX) and diagrams (Mermaid, lazy-loaded) safely
- [x] **LESSON-04**: Learner can mark a lesson done (with a short reflection: "what was hardest?"); course progress and "continue learning" update accordingly

### Practice (PRACTICE)

- [x] **PRACTICE-01**: Learner can take a 5-question multiple-choice quiz generated from the lesson, see per-question explanations and a score
- [x] **PRACTICE-02**: Learner can generate flashcards from a lesson and they enter a spaced-repetition queue (SM-2)
- [x] **PRACTICE-03**: Learner can review due flashcards (again/hard/good/easy) from a Review page, with a due-count badge on Home
- [x] **PRACTICE-04**: Learner sees a daily streak and days-studied indicator on Home

### Tutor (TUTOR)

- [x] **TUTOR-01**: Learner can chat with a Professor tutor scoped to the current lesson (lesson content + course context in the prompt)
- [x] **TUTOR-02**: Tutor follows the hybrid rules: explains concepts freely, but for the exercise asks guiding questions and gives layered hints (concept → pattern → pseudo-code) and never writes the full solution
- [x] **TUTOR-03**: Learner can pick quick actions: "Explain simpler", "Give me a hint", "Check my answer", "Quiz me"
- [x] **TUTOR-04**: Chat history per lesson is kept locally

### Code Workspace (CODE, Phase 29)

- [ ] **CODE-01**: In a programming course, learner opens a Workspace tab in the lesson with a lightweight code editor (CodeMirror 6: syntax highlighting, multiple files, dark/light, usable on mobile) preloaded with the exercise skeleton
- [ ] **CODE-02**: Learner can Run code in the browser with no install for JavaScript/TypeScript, Python (Pyodide), SQL (sql.js) and HTML/CSS preview, and see stdout/stderr/errors
- [ ] **CODE-03**: Learner can press Check to run the exercise's self-check tests and see pass/fail per check
- [ ] **CODE-04**: With the local server running, learner can run other languages with their installed toolchain; files live in `~/.professor/workspaces/<course>/` so they can also be opened in a real editor
- [ ] **CODE-05**: Every save/run keeps a snapshot (code + result) so learner code is never lost, and "Check my answer" in the tutor can attach the current code

### Dev CLI Fast-path (CLI, Phases 30–31)

- [x] **CLI-01**: Dev runs `course-professor status` and sees every course (CLI `learning/` + Studio DB when reachable): kind, progress, current section, flashcards due, streak
- [x] **CLI-02**: Dev runs `course-professor next [slug]` and sees the current lecture summary, objectives, exercise path and the agent command to continue
- [x] **CLI-03**: Dev runs `course-professor check [slug]` and the active exercise's self-checks run with the right toolchain, showing pass/fail per check (never revealing solutions)
- [x] **CLI-04**: Dev runs `course-professor doctor` and gets a checklist (Node ≥18, git, agent CLIs, Ollama, server port, DB path) with fix hints
- [x] **CLI-05**: Dev runs `course-professor studio` and one command starts the local server (bridge + SQLite) and the built Studio, prints URL + pairing token and opens the browser
- [x] **CLI-06**: Dev runs `course-professor review` and reviews due flashcards in the terminal (SM-2, keys 1–4) sharing state with Studio
- [x] **CLI-07**: Dev runs `course-professor import [slug|--all]` and CLI courses (COURSE.md, lectures/, SCHEDULE.md) appear in Studio's SQLite without loss

### Capstone (CAP, Phase 33)

- [x] **CAP-01**: Every Studio course names the real artifact the learner will ship ("What you'll ship" + Definition of Done, editable at creation) and gets a capstone brief to ship it, generated at course creation, shaped by the course kind (programming project / conceptual essay-analysis / quantitative problem set / skill performance + self-assessment), and it is immutable afterwards
- [x] **CAP-02**: The capstone unlocks only when all lessons are done; while it is active the tutor switches to capstone mode (concept discussion only — no hints, no solution help)
- [x] **CAP-03**: Learner can submit (text, repo link, or Code Workspace files) as many times as needed; every submission and its review is kept
- [x] **CAP-04**: Each submission is reviewed against the capstone rubric — programming submissions also run the capstone's automated tests through the Phase 29 runner — with a verdict (Course Complete / Needs work), per-criterion feedback and one next action, never a rewritten solution
- [x] **CAP-05**: On Course Complete, learner sees a completion page and can export a plugin-compatible `COMPLETION.md`; `course-professor import` brings CLI `CAPSTONE.md` / `COMPLETION.md` into Studio

### Grounding & Verification (GROUND, Phase 34)

- [ ] **GROUND-01**: Lessons are written from sources actually retrieved for that lesson (provider web search/fetch, or the local server's fetch of Wikipedia/Crossref/arXiv/official docs), never from model memory alone
- [ ] **GROUND-02**: Every lesson shows a Sources list with real, working URLs (title, publisher, access date, credibility tier); key claims carry numbered citations `[n]` that point only to retrieved sources
- [ ] **GROUND-03**: After generation, links are checked (alive + title match), cited excerpts are checked against the fetched page, and each key claim is labelled ✓ sourced / ⚠️ unverified / ✗ contradicted; unsourced claims stay visible with ⚠️ and a "verify this yourself" hint
- [ ] **GROUND-04**: Programming lessons verify code claims by running the example code in the runner where possible
- [ ] **GROUND-05**: Every lesson includes a "🔎 Verify it yourself" task based on SIFT (Stop, Investigate the source, Find better coverage, Trace to the original); the tutor offers "How can I verify this?"; quizzes include a source-credibility question; the capstone rubric includes "use and citation of sources"
- [ ] **GROUND-06**: Learner can report a passage as wrong; it is logged, regenerated as a new version, and the history is kept
- [x] **GROUND-07**: CLI plugin lectures (`professor:next`) follow the same rules: researched sources with real URLs, numbered citations, ⚠️ for unsourced claims, and a "Verify it yourself" section

### Language (LANG, Phase 35)

- [ ] **LANG-01**: Learner picks ONE learning language (onboarding, preselected from the browser) that drives both UI and generated content; courses can override it
- [ ] **LANG-02**: The whole Studio UI is available in Vietnamese and English
- [ ] **LANG-03**: Lesson and capstone section headings and labels follow the course language
- [ ] **LANG-04**: Generated syllabus, lessons, quizzes, flashcards, tutor replies and capstone reviews are verified to be in the course language and regenerated once automatically if not
- [ ] **LANG-05**: Learner can change a course's language; existing versions are kept and new generations use the new language

### Storage choice (STORE, Phase 36)

- [x] **STORE-01**: Learner chooses in Settings (and onboarding) where data is saved: this browser (IndexedDB) or the local SQLite file
- [x] **STORE-02**: Data is written only to the chosen store; if SQLite is chosen and the server is down, the app says so and never falls back silently
- [x] **STORE-03**: Switching stores offers to move all data with a verified count, keeping the old copy until the learner removes it
- [x] **STORE-04**: The "Your data is only in this browser" banner appears only when browser storage is chosen

### Release (REL, Phase 37)

- [x] **REL-01**: The npm tarball contains everything the CLI needs at runtime (web/studio-*.js, lecture-archive, studio/dist, studio/migrations) and nothing private
- [x] **REL-02**: Installed packages run Studio from the shipped build without building; `prepublishOnly` builds both UIs
- [x] **REL-03**: Studio/review/import explain the Node 22.5+ requirement clearly; setup commands still work on Node 18+
- [x] **REL-04**: A tarball smoke test (install → doctor → studio → health/db health) passes locally and in CI
- [x] **REL-05**: Version 1.6.0-beta.1 with CHANGELOG, README install notes and RELEASING.md (publish run by the user)

### Data Portability (DATA)

- [ ] **DATA-01**: Learner can export all data to a JSON backup file and restore it on another browser
- [ ] **DATA-02**: Learner can export a course as a plugin-compatible `COURSE.md` so it can be continued with `professor:*` commands
- [ ] **DATA-03**: Learner can reopen a completed lesson and see everything from it — lesson content (all versions; regenerating never overwrites), quiz attempts, flashcards, tutor chat, notes and the completion reflection
- [ ] **DATA-04**: When learning locally, learner's data is stored in a SQLite file on disk (`~/.professor/professor.db` via `node:sqlite` in the local server); Studio auto-detects it and falls back to IndexedDB on a static deploy without the server
- [ ] **DATA-05**: Learner can move their data from IndexedDB into SQLite (one-click import) without loss

### Plugin Course Kinds (PLUG, Phase 28)

- [x] **PLUG-04**: `professor:new-topic` proposes and confirms a course kind (programming / quantitative / conceptual / skill) and stores it in COURSE.md metadata
- [x] **PLUG-05**: Only programming courses require a git repo/worktree and exercises/ scaffolding; other kinds are created as plain course folders without git
- [x] **PLUG-06**: LECTURE.md template = shared learning core + kind-specific blocks; exercise files follow the course kind (language-correct code skeleton + self-check tests for programming; .md problem set / case analysis + rubric / drills otherwise) — no keyword guessing, no JS-by-default

### Plugin Lesson History (PLUG)

- [x] **PLUG-01**: When `professor:next` starts a new section, the previous `LECTURE.md` is archived to `lectures/NN-section-slug.md` instead of being overwritten (CLI commands, shared/ canonical files, and `web/server.js` save path)
- [x] **PLUG-02**: When `professor:done` completes a section, the Coach self-assessment (hardest concept, answers, verdict, watch-this flag) and duration are written to `LEARNING-LOG.md` under that section
- [x] **PLUG-03**: `professor:quiz` results (questions, learner answers, verdicts) are appended to `LEARNING-LOG.md`, and `professor:progress`/`professor:recall` can reference archived lectures

### Deploy & SaaS Path (DEPLOY)

- [ ] **DEPLOY-01**: `npm run build` produces a static `studio/dist/` that works from any static host (relative base, hash routing)
- [ ] **DEPLOY-02**: Repo contains documented, verified steps to deploy `studio/dist` to void.cloud
- [ ] **DEPLOY-03**: Repo contains `studio/docs/SAAS-ROADMAP.md`: SaaS architecture on Cloudflare (Workers API implementing the same `/api/studio/db/*` contract, **D1** as the database reusing `studio/migrations/`, tenancy model single-DB+`owner_id` vs DB-per-tenant with D1 limits, auth, local→cloud sync/import, managed AI proxy + metering, billing) and an Oboe feature-parity roadmap
- [ ] **DEPLOY-04**: `web/` server bridge accepts requests from the Studio origin safely (CORS allowlist + pairing token) and documents how to run it

## v2 Requirements (deferred)

- **REG-01**: Learner can browse and import community courses from the professor-skills-hub registry
- **SYNC-01**: Learner can sign in and sync courses across devices
- **AUDIO-01**: Learner can listen to a lesson as audio/podcast
- **MANAGED-01**: Learner can use the hosted AI without their own key (paid tier)

### Future (seeded)

- **ART-01..**: Artifact-first learning model — project spine, milestones, bring-your-own-project, artifact timeline, portfolio export (SEED-002, milestone v3.2)
- **TUI-01..**: Professor TUI (SEED-001, milestone v3.1)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hosted/cloud learner database in v3.0 | Local-first by design (local SQLite file or IndexedDB); cloud sync is the SaaS milestone |
| Removing or rewriting `web/` | Still used by CLI users and as the local agent bridge |
| Video lessons | Cost/complexity; text-first MVP |
| Multi-user / classrooms | Single learner per browser for v3.0 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Phase 22 | Pending |
| SHELL-02 | Phase 22 | Pending |
| SHELL-03 | Phase 22 | Pending |
| SHELL-04 | Phase 22 | Pending |
| SHELL-05 | Phase 22 | Pending |
| AI-01 | Phase 22 | Pending |
| AI-02 | Phase 22 | Pending |
| AI-03 | Phase 22 | Pending |
| AI-04 | Phase 22 | Pending |
| AI-05 | Phase 22 | Pending |
| COURSE-04 | Phase 22 | Pending |
| COURSE-05 | Phase 23–24 | Complete |
| LESSON-05 | Phase 23–24 | Complete |
| LESSON-06 | Phase 22 | Pending |
| CODE-01 | Phase 29 | Pending |
| CODE-02 | Phase 29 | Pending |
| CODE-03 | Phase 29 | Pending |
| CODE-04 | Phase 29 | Pending |
| CODE-05 | Phase 29 | Pending |
| CLI-01 | Phase 30 | Complete |
| CLI-02 | Phase 30 | Complete |
| CLI-03 | Phase 30 | Complete |
| CLI-04 | Phase 30 | Complete |
| CLI-05 | Phase 31 | Complete |
| CLI-06 | Phase 31 | Complete |
| CLI-07 | Phase 31 | Complete |
| CAP-01 | Phase 33 | Complete |
| CAP-02 | Phase 33 | Complete |
| CAP-03 | Phase 33 | Complete |
| CAP-04 | Phase 33 | Complete |
| CAP-05 | Phase 33 | Complete |
| GROUND-01 | Phase 34b | Pending |
| GROUND-02 | Phase 34b | Pending |
| GROUND-03 | Phase 34b | Pending |
| GROUND-04 | Phase 34b | Pending |
| GROUND-05 | Phase 34b | Pending |
| GROUND-06 | Phase 34b | Pending |
| GROUND-07 | Phase 34a | Complete |
| LANG-01 | Phase 35 | Pending |
| LANG-02 | Phase 35 | Pending |
| LANG-03 | Phase 35 | Pending |
| LANG-04 | Phase 35 | Pending |
| LANG-05 | Phase 35 | Pending |
| STORE-01 | Phase 36 | Complete |
| STORE-02 | Phase 36 | Complete |
| STORE-03 | Phase 36 | Complete |
| STORE-04 | Phase 36 | Complete |
| REL-01 | Phase 37 | Complete |
| REL-02 | Phase 37 | Complete |
| REL-03 | Phase 37 | Complete |
| REL-04 | Phase 37 | Complete |
| REL-05 | Phase 37 | Complete |
| PLUG-04 | Phase 28 | Complete |
| PLUG-05 | Phase 28 | Complete |
| PLUG-06 | Phase 28 | Complete |
| COURSE-01 | Phase 23–24 | Complete |
| COURSE-02 | Phase 23–24 | Complete |
| COURSE-03 | Phase 23–24 | Complete |
| LESSON-01 | Phase 23–24 | Complete |
| LESSON-02 | Phase 23–24 | Complete |
| LESSON-03 | Phase 23–24 | Complete |
| LESSON-04 | Phase 23–24 | Complete |
| PRACTICE-01 | Phase 23–24 | Complete |
| PRACTICE-02 | Phase 23–24 | Complete |
| PRACTICE-03 | Phase 23–24 | Complete |
| PRACTICE-04 | Phase 23–24 | Complete |
| TUTOR-01 | Phase 25 | Complete |
| TUTOR-02 | Phase 25 | Complete |
| TUTOR-03 | Phase 25 | Complete |
| TUTOR-04 | Phase 25 | Complete |
| AI-06 | Phase 26 | Pending |
| DATA-03 | Phase 22 | Pending |
| DATA-04 | Phase 26 | Pending |
| DATA-05 | Phase 26 | Pending |
| PLUG-01 | Phase 27 | Complete |
| PLUG-02 | Phase 27 | Complete |
| PLUG-03 | Phase 27 | Complete |
| DATA-01 | Phase 26 | Pending |
| DATA-02 | Phase 26 | Pending |
| DEPLOY-01 | Phase 26 | Pending |
| DEPLOY-02 | Phase 26 | Pending |
| DEPLOY-03 | Phase 26 | Pending |
| DEPLOY-04 | Phase 26 | Pending |

**Coverage:**
- v1 requirements: 83 total
- Mapped to phases: 83
- Unmapped: 0 ✓


---
*Requirements defined: 2026-10-15 (draft)*
