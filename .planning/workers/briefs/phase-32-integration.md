# Task brief: Phase 32 — Integration pass (wire the merged phases together)

Own git worktree branched from `feat/studio-local-first` (Phases 22–30 + 26b merged). Phase 31 runs IN PARALLEL and owns
`bin/**`, `studio/src/lib/settings.js`, `studio/src/main.jsx`, `studio/src/lib/repo/schema.js`, `studio/migrations/**`,
README.md and studio/README.md — do NOT touch those, and do NOT add a database migration. Small conventional commits
(one per item below). Do NOT push.

Read first: `studio/HANDOFF-23.md`, `HANDOFF-24.md`, `HANDOFF-26.md`, `HANDOFF-29.md` and the orchestrator list
/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/workers/INTEGRATION-TODO.md.

## Items (each with a test where it is logic)
1. **SQLite at startup (HANDOFF-26 §1)** — in `studio/src/App.jsx` call `initAdapter()` from `lib/repo/select-adapter.js`
   once at startup BEFORE demo seeding; keep the loading state until it resolves (fallback IndexedDB on failure).
2. **Loopback bind (HANDOFF-26 §3)** — `web/server.js`: `server.listen(PORT, HOST)` with `HOST = process.env.HOST ||
   '127.0.0.1'`; mention `HOST=0.0.0.0` in the startup banner text only if set.
3. **Root tests need web deps (HANDOFF-29 §4)** — root `package.json`: add `"pretest": "npm --prefix web install
   --no-audit --no-fund --silent"` so `npm test` works on a fresh clone.
4. **Course kinds single source** — `lib/prompts/tutor.js` must import `COURSE_KINDS`/default from `lib/course.js`
   (adapt the shape if course.js exports objects) instead of re-declaring.
5. **Tutor "Check my answer" with code (HANDOFF-29 §2)** — in `components/tutor/TutorPanel.jsx`, for the
   `check_answer` mode in a programming course, attach `await currentCodeBlock(lesson.id)` (from
   `lib/runner/current-code.js`) to the user message inside the `wrapUntrusted(..., 'learner_code')` helper from
   `lib/prompts/base.js` (add `learner_code` support there if needed). If null, keep today's behaviour (ask learner to
   paste). Test the message builder.
6. **Cards API (HANDOFF-24 §1)** — add `listCards({ courseId, lessonId })` to `lib/repo/index.js` (indexed `list`, order
   by `due_at`) and switch `components/practice/card-store.js` off `exportAll()`. Also add `deleteWorkspaceFile({
   lessonId, path })` (soft delete via `deleted_at`) and switch `lib/runner/skeleton.js`/workspace UI off the
   `DELETED_MARKER` tombstone (HANDOFF-29 §3.1). Leave run_results snapshot encoding as is (needs a migration — later).
7. **One streak implementation** — keep `lib/activity.js#computeStreak`; remove `streak()` from `lib/course.js` if unused
   (grep), update any import.
8. **Demo quiz key** — `data/demo-course.js` quiz_seed `answer` → `answerIndex` (normalizer stays tolerant).
9. **Export COURSE.md button (HANDOFF-23)** — in `pages/Course.jsx` header action container add "Export COURSE.md"
   using the same export function the DataPanel uses (import it; do not duplicate).
10. **Bundle** — lazy-load `CodeWorkspace` in `pages/Lesson.jsx` with `React.lazy` + `Suspense` (only programming
    courses); main chunk must be < 150 KB gzip (report before/after: `gzip -c dist/assets/index-*.js | wc -c`).
11. **Deploy config (HANDOFF-26 §6)** — add a root `void.config.ts` equivalent to `studio/void.config.ts` (outputDir
    `studio/dist`, SPA) and a root npm script `"build:studio": "npm --prefix studio run build"`; update
    `studio/docs/DEPLOY.md` accordingly (you own DEPLOY.md). Add the Pyodide CDN/CSP note from HANDOFF-29 §4 there.
12. When all applied: move any still-open HANDOFF items into `studio/docs/FOLLOW-UPS.md` (with owner + why), then delete
    the four `studio/HANDOFF-*.md` files.

## Verify before reporting
- Root `npm test`, `cd studio && npm test`, `npm run build` all pass; report main-chunk gzip size.
- `git diff --stat <base>..HEAD` must not include Phase 31's files.
Final notify summary: item-by-item status (done / moved to FOLLOW-UPS + reason).

## 13. Addendum (orchestrator, found in browser E2E) — REQUIRED
- First `git merge feat/studio-local-first` into your branch (Phase 31 landed: bin/**, settings.js pairing, main.jsx,
  migration 0002, idb-adapter DB_VERSION 3). Resolve conflicts keeping both sides' intent.
- BUG: `studio/src/lib/ai/bridge.js` does `throw new ProviderError(...)` (SSE `json.error` branch) but only has
  `export { ProviderError } from './errors.js'` — a re-export creates NO local binding → ReferenceError
  "ProviderError is not defined" shown in Settings → Test connection whenever the bridge streams an error.
  Fix: import ProviderError (or use `providerError(...)`). Add a test that feeds an SSE `{"error":"x","code":"server"}`
  line and asserts a ProviderError with code `server` is thrown. Also run `npx eslint`-style check:
  `grep -rn "new ProviderError\|instanceof ProviderError" studio/src` and confirm every file imports it.

## 14. Addendum (orchestrator, browser E2E) — CRITICAL, do this FIRST
`getProvider()` in `studio/src/lib/ai/index.js` became `async` in the Phase 22 follow-up, but 5 call sites written in
parallel still call it synchronously, so EVERY AI action in Studio is broken (E2E: "Propose syllabus" fails with
"Cannot read properties of undefined"):
`pages/NewCourse.jsx:52`, `components/course/LessonContent.jsx:69`, `components/practice/QuizPanel.jsx:71`,
`components/practice/FlashcardGenerator.jsx:44`, `components/tutor/TutorPanel.jsx:143`.
Fix each with `const provider = await getProvider(settings)` (make the enclosing callbacks async; keep abort/stop
semantics). Add a guard test `studio/test/no-sync-getprovider.test.js` that scans `studio/src/**/*.{js,jsx}` and fails if
any `getProvider(` call (outside lib/ai/index.js definition and comments) is not preceded by `await`. Also add one
integration test per feature path that calls the real `getProvider` with a fake bridge/openai fetch (stub `fetch`) and
asserts text flows through (at least NewCourse's syllabus generation and LessonContent's generation helpers).

## 15. Addendum — pairing UX
`applyPairingFromUrl()` (settings.js, Phase 31 merged — you may now edit it) only switches to the local agent when no
provider is stored. A learner running `course-professor studio` wants the local agent: switch `provider` to `bridge`
when the stored provider is not ready (missing key/URL per `configIssue`, or `lastTestOk` not true). Also re-run pairing
on `hashchange` (an already-open tab navigated to a pairing URL is not reloaded). Tests for both.

## 16. Addendum (orchestrator E2E via `course-professor studio` + Claude Code bridge) — lesson language
NewCourse "Lesson language = Vietnamese" → the syllabus came back in Vietnamese, but "Generate lesson" produced ENGLISH:
the language chosen at course creation is not stored on the course, so LessonContent / QuizPanel / FlashcardGenerator /
TutorPanel fall back to the global settings language.
Decision: add `studio/migrations/0003_course_language.sql` (`ALTER TABLE courses ADD COLUMN language TEXT;` — D1-safe),
mirror `language` in `schema.js` fields (no index), persist it in `repo.createCourse`, and make every prompt builder use
`course.language ?? settings.language`. Old courses (NULL) keep using the settings language.
Test: a course created with language `Vietnamese` → buildLessonMessages / buildTutorMessages / practice prompts all
contain the Vietnamese language instruction.

## 17. Addendum — Mermaid diagrams render as raw code
In the same E2E lesson, this block (stored in SQLite) is shown as a plain code block, with NOTHING logged:
```
flowchart TD
    A[French conquest 1884\nIndochinese Union 1887] --> B[Colonial exploitation\ntaxes, monopolies, plantations]
    B --> C[Hardship for peasants\nnew social groups appear]
    A --> D[Cần Vương fails\nold methods no longer work]
    C --> E[New patriotic ideas]
    D --> E
    E --> F[Phan Bội Châu\nĐông Du\narmed struggle + foreign help]
```
All dist chunks (incl. mermaid*) are served 200 with text/javascript, so it is a render-time failure swallowed by the
fallback in `components/ui/Markdown.jsx`. Fix: `console.warn('[mermaid]', err)` in the fallback; check
`mermaid.initialize` is called once before `render`, the render id is unique and valid (no dots/colons), and that the
`\n` inside `[...]` labels is converted to `<br/>` (or wrap labels in quotes) by a small `sanitizeMermaid()` pre-pass;
unit-test sanitizeMermaid with the block above. Also make the lesson prompt (lib/prompts/lesson.js) tell the model:
quote node labels and use `<br/>` for line breaks in Mermaid.
