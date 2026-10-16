# Task brief: Phase 22 — Studio Foundation

You implement the foundation of **Professor Studio** (`studio/`), a local-first learning web app (static Vite SPA).
You work in your own git worktree (your current directory). Commit on your branch in small logical conventional
commits. Do NOT push. Only touch `studio/`.

Read first: `.planning/` is not in your worktree — read these from the main repo:
- /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/ROADMAP.md (Phase 22 + the contracts other phases rely on)
- /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md
- /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/*.md (if present — STACK/ARCHITECTURE/PITFALLS)
Existing seed in `studio/src/lib/`: `db.js` (raw IndexedDB k/v — to be replaced by `lib/repo/`), `srs.js` (SM-2, keep),
`json.js` (extractJson, keep), `course.js` (course helpers + COURSE.md parse/serialize, keep and adapt).

## Requirements
SHELL-01..04, AI-01..05, COURSE-04, DATA-03 (see REQUIREMENTS.md). Phases 23–26 run in PARALLEL after you, each in its
own worktree, and will REPLACE the stub files you create. Your job is to make those contracts exact and stable.

## Stack (already installed — do not add a router, state library or UI kit)
React 19, react-markdown 10 + remark-gfm 4, @anthropic-ai/sdk 0.134, Vite 8, Tailwind v4 via `@tailwindcss/vite`
(`@import "tailwindcss";` in index.css), Vitest 5, fake-indexeddb 6 (tests). JavaScript + JSX (no TypeScript), ES modules,
2-space indent, semicolons. Add JSDoc types on public functions.

## 1. Repository layer — `src/lib/repo/` (DATA-03, D1-ready)
- `studio/migrations/0001_init.sql` — SQLite DDL, **must be Cloudflare D1 compatible** (wrangler migrations layout):
  TEXT primary keys (use `crypto.randomUUID()`), every table has `owner_id TEXT NOT NULL DEFAULT 'local'`,
  `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL`, `deleted_at TEXT` (ISO-8601), JSON stored as TEXT, no PRAGMA,
  no extensions. Tables:
  `courses(id, title, description, level, goal, topics_json, source, status)`,
  `lessons(id, course_id, position, title, summary, status todo|active|done, completed_at, current_version_id)`,
  `lesson_versions(id, lesson_id, version, content_md, model, provider)` ← regenerating ADDS a row, never overwrites,
  `quiz_attempts(id, lesson_id, questions_json, answers_json, score, total)`,
  `cards(id, course_id, lesson_id, front, back, ease, interval_days, reps, lapses, due_at)`,
  `reviews(id, card_id, grade, reviewed_at)`,
  `chat_messages(id, lesson_id, role, content, mode)`,
  `reflections(id, lesson_id, hardest, confidence, note)`,
  `notes(id, course_id, lesson_id, content_md)`,
  `activity(id, day, kind, ref_id)`.
  Add sensible indexes (course_id, lesson_id, due_at, day).
- `schema.js` — JS metadata mirroring the tables (names + indexed fields) used by the IndexedDB adapter.
- `idb-adapter.js` — IndexedDB implementation (one object store per table, indexes per schema.js, soft delete via
  `deleted_at`, sets timestamps/owner_id automatically). Falls back to an in-memory adapter when IndexedDB is unavailable
  and exposes `isPersistent`. Call `navigator.storage?.persist?.()` once.
- `remote-adapter.js` — **stub** exporting `createRemoteAdapter({ baseUrl, token })` that throws `not implemented`.
  Phase 26 replaces this file; document the HTTP contract in a header comment exactly as below.
- `index.js` — the ONLY API pages use. Adapter-agnostic async functions:
  `listCourses()`, `getCourse(id)` (with ordered lessons), `createCourse({title, description, level, goal, topics, lessons:[{title, summary}]})`,
  `updateCourse(id, patch)`, `deleteCourse(id)`, `updateLesson(id, patch)`, `addLessonVersion(lessonId, {content_md, model, provider})`
  (sets current_version_id), `listLessonVersions(lessonId)`, `getLessonContent(lessonId)`,
  `saveQuizAttempt(...)`, `listQuizAttempts(lessonId)`, `addCards(courseId, lessonId, [{front, back}])`, `listDueCards(now)`,
  `gradeCard(cardId, grade)` (uses srs.js + writes a review row), `appendChat(lessonId, msg)`, `listChat(lessonId)`,
  `saveReflection(lessonId, data)`, `getLessonHistory(lessonId)` (versions + attempts + chat + reflection + notes),
  `logActivity(kind, refId)`, `listActivity()`, `exportAll()` / `importAll(dump)` (no settings/keys).
  Plus `getAdapterInfo()` → `{ kind: 'indexeddb'|'memory'|'remote', persistent }` and `useAdapter(adapter)`.
  Emits a `change` event (simple EventTarget) after writes.
- HTTP contract to document in remote-adapter.js (Phase 26 implements on local `node:sqlite`, later a Cloudflare Worker on D1):
  `GET {base}/api/studio/db/health` → `{ ok, kind:'sqlite', path }`;
  `POST {base}/api/studio/db/rpc` body `{ op: '<function name above>', args: [...] }` → `{ ok, result }` / `{ ok:false, error }`;
  header `X-Studio-Token: <token>`.

## 2. AI provider layer — `src/lib/ai/`
Interface (all providers): `streamText({ system, messages, signal, onText, effort }) → Promise<string>` (full text) and
`generateJson({ system, messages, signal, validate }) → Promise<any>` (uses streamText + `extractJson`, validates, retries
ONCE with a "return only valid JSON" repair message). Errors are `ProviderError` with `code` in
`auth | network | cors | rate_limit | refusal | bad_json | not_running | aborted | unknown` and a human `hint`.
- `anthropic.js` — official SDK in the browser:
  ```js
  import Anthropic from '@anthropic-ai/sdk';
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.beta.messages.stream({
    model, max_tokens: 16000, system, messages,
    output_config: { effort },             // 'low' for chat/JSON, 'medium' for lessons
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // omit both for claude-haiku-5-5
  }, { signal });
  for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onText(ev.delta.text);
  const msg = await stream.finalMessage(); // if msg.stop_reason === 'refusal' → ProviderError('refusal')
  ```
  Models offered: `claude-opus-5-5` (default), `claude-sonnet-5-5`, `claude-haiku-5-5` — use these exact IDs, no date
  suffix, do NOT send `thinking` or `temperature`. If the API returns 400 mentioning fallbacks/beta, retry once without
  `betas`/`fallbacks`. Map SDK errors: 401→auth, 429→rate_limit, network TypeError→network.
- `openai-compatible.js` — `fetch(baseUrl + '/chat/completions', { stream: true })`, parse SSE (`data:` lines, handle
  chunk boundaries, `[DONE]`), `Authorization: Bearer` when key set. Presets: OpenAI, OpenRouter, Groq, LM Studio
  (`http://localhost:1234/v1`), Custom.
- `ollama.js` — wraps openai-compatible with base `http://localhost:11434/v1`; `listModels()` via `GET /api/tags`;
  CORS failure hint: set `OLLAMA_ORIGINS` to the Studio origin and restart Ollama.
- `bridge.js` — local agent bridge client. Contract (Phase 26 implements server side):
  `GET {bridgeUrl}/api/studio/health` (header `X-Studio-Token`) → `{ ok, agents: { claude, opencode, cursor, ollama } }`;
  `POST {bridgeUrl}/api/studio/complete` body `{ system, messages, agent?, model? }` → SSE lines
  `data: {"text":"..."}` … `data: {"error":"...","code":"..."}` … `data: [DONE]`. Fetch failure → `not_running` with hint
  "run `npx course-professor web` (or `npm start` in the repo)".
- `index.js` — `getProvider(settings)`, `testConnection(settings)` (streams a 1-sentence reply), `PROVIDERS` metadata.
- Unit tests: SSE parser (split chunks, multiple events per chunk, [DONE], error lines), error mapping, generateJson repair.

## 3. Settings & secrets — `src/lib/settings.js`
Settings in `localStorage` key `professor-studio:settings` (provider, per-provider config, model, bridgeUrl, bridgeToken,
learner name, language). Keys never go into repo/export. `clearSecrets()`. Settings page: provider cards, fields, model
select (Ollama lists installed models), "Test connection" with streamed output + actionable error, "Clear keys",
storage info (`getAdapterInfo()`), and mounts `<DataPanel />` from `components/data/DataPanel.jsx` (stub; Phase 26).
Privacy note: "Keys stay in this browser and are sent only to the provider you choose."

## 4. App shell, routing, UI
- `lib/router.js`: hash router hook `useRoute()` + `navigate(path)` + `<Link>`. Routes: `#/` Home, `#/new` NewCourse,
  `#/course/:id` Course, `#/course/:id/lesson/:lessonId` Lesson, `#/review` Review, `#/settings` Settings, 404.
- `components/Layout.jsx`: top bar (logo "Professor Studio", nav Home / Review (with `<DueBadge/>`) / Settings,
  provider status pill), responsive (mobile bottom nav ≤ 640px), light + dark (prefers-color-scheme), focus states.
  Visual tone: calm, editorial, readable (max-width prose ~70ch for lessons), one accent color; no emoji soup.
- `components/ui/`: Button, Card, Input, Select, Textarea, Badge, Progress, Spinner, Markdown (react-markdown + remark-gfm,
  NO rehype-raw, links open in new tab with rel=noopener, code blocks styled), EmptyState, ErrorNotice (shows ProviderError hint).
- Pages — FINAL from you: `Settings.jsx`, `Lesson.jsx` (layout only: header with breadcrumb + status, then
  `<LessonContent lesson course />` from `components/course/LessonContent.jsx`, then tabs "Practice" →
  `<LessonPractice lesson course />` (components/practice) and "Tutor" → `<TutorPanel lesson course />` (components/tutor),
  and a "Mark done" button that opens a reflection dialog (hardest concept + confidence 1–5) → `saveReflection` +
  `updateLesson(status done)` + `logActivity('lesson_done')`).
- Pages — STUBS (Phase 23 replaces): `Home.jsx` (lists courses + "New course" + `<StreakBadge/>`), `NewCourse.jsx`, `Course.jsx`
  — make them minimally functional with the demo course so the app is usable now.
- Stub components (later phases replace the file in place; keep the export names/props exactly):
  `components/course/LessonContent.jsx` (renders current version Markdown or "Generate lesson" placeholder button),
  `components/practice/LessonPractice.jsx`, `StreakBadge.jsx`, `DueBadge.jsx`, `pages/Review.jsx`,
  `components/tutor/TutorPanel.jsx`, `components/data/DataPanel.jsx`. Each stub renders a small "Coming soon" card.
- `lib/prompts/base.js`: shared `PROFESSOR_PERSONA` (hybrid pedagogy: explain clearly in lessons; for exercises never give
  the full solution — guide with questions and layered hints concept → pattern → pseudo-code), `withLanguage(text, lang)`,
  `courseContext(course, lesson)` helper. Phases 23–25 add `course.js`, `lesson.js`, `practice.js`, `tutor.js` beside it.
- `data/demo-course.js` + first-run seeding: a demo course "How to learn anything with Professor" (4 short lessons with
  PRE-WRITTEN Markdown content and 3 flashcards) inserted on first run so the app works with zero configuration (COURSE-04).
- `main.jsx`, `App.jsx`, `index.css` (Tailwind v4 + CSS variables for theme).

## 5. Tests & checks (must pass before you report)
- `npm test`: repo (idb-adapter with fake-indexeddb: create course → add 2 versions → history keeps both; soft delete;
  due cards; export/import round trip excludes settings), srs, json, course, SSE parser, generateJson repair.
- `npm run build` succeeds; `npm run dev` starts (check it serves `/` with curl, then stop it).
- Validate `migrations/0001_init.sql` with Node's built-in SQLite: `node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');d.exec(require('fs').readFileSync('studio/migrations/0001_init.sql','utf8'));console.log('ok')"`.
- `git diff --stat main..HEAD -- . ':!studio'` must be empty (you only touch studio/).
- Delete the old `src/lib/db.js` once nothing imports it.

## Report
Final notify summary: commits, test count, build OK, and any decision you made that deviates from this brief.

## 6. Research-driven additions (orchestrator review of STACK.md + PITFALLS.md — these override anything above)
- **Anthropic**: `dangerouslyAllowBrowser: true` makes the SDK add `anthropic-dangerous-direct-browser-access`; do not
  add the header by hand. Also offer `claude-fable-5-1` as an "Advanced (premium)" model option.
- **Local Network Access (Chrome ≥142)**: a public https origin calling `http://localhost` triggers a permission prompt;
  Safari may hard-block. For bridge/Ollama/LM Studio fetches pass `targetAddressSpace: 'loopback'` when the host is
  localhost/127.0.0.1 (feature-detect; retry without the option if the browser throws on it). Classify failures
  separately: `local_network_blocked` (add this error code) vs `cors` vs `not_running`, each with its own hint. Settings
  shows a note: "Using a local agent or Ollama works best when Studio itself runs locally (`npm run dev`)".
- **SSE parser**: must be chunk-boundary independent — add a test that feeds a recorded stream split at EVERY byte, plus
  CRLF, multibyte UTF-8 (use `TextDecoder` with `{stream:true}`), multiple events per chunk, unknown event types ignored.
- **React streaming**: accumulate tokens in a ref and flush to state at most once per animation frame; a new request
  aborts the previous one (AbortController per request; ignore late chunks from a stale request id). Provide a reusable
  hook `useStream()` in `src/lib/ai/useStream.js` returning `{ text, status, error, start, stop }` — Phases 23–25 use it.
- **Cost guard**: `max_tokens` defaults per task (lesson 8000, JSON 4000, chat 2000) exported from `lib/ai/index.js`;
  `generateJson` retries at most once.
- **Prompt injection**: `lib/prompts/base.js` must wrap lesson/course content passed back to the model inside clearly
  delimited `<lesson_content>…</lesson_content>` blocks with an instruction that it is reference material, not
  instructions.
- **Durability**: call `navigator.storage.persist()`; if storage is memory-only or not persisted, show a dismissible
  banner in Layout ("Your data is only in this browser — export a backup in Settings"). Catch `QuotaExceededError`
  and show an ErrorNotice.
- **Host-agnostic build**: keep `base: './'` + hash routing; no `void/*` imports in `studio/src`.
- Keep IndexedDB hand-rolled (no Dexie, no idb) — consistent with the repo layer above.

## 7. Addendum after FEATURES.md review (SHELL-05) — also required
- `components/Onboarding.jsx`, shown on first run (flag in settings), skippable at every step:
  1) Welcome + privacy line: "Everything stays on your device. Your API keys are never uploaded or included in backups."
  2) Pick AI source (4 cards, short pros/cons: Anthropic key · OpenAI-compatible key · Ollama free/local · My local agent free)
  3) Fields + "Test connection" (reuse Settings components)
  4) Success → "Create your first course" (#/new); skip/failure → "Try the demo course" (opens it).
- Demo course must be fully bundled and walkable with NO provider: its lessons ship pre-written Markdown, a pre-written
  5-question quiz per lesson (store as `quiz_seed` on the lesson in demo data so Phase 24 can show it), and flashcards.
- Never render a "reveal solution" control for exercises anywhere (product rule).

## 8. Contract change (orchestrator, overrides §1 where they differ) — TABLE-LEVEL ADAPTER
Business logic lives ONLY in `lib/repo/index.js`; adapters are dumb table-level storage so the SQLite server and the
future Cloudflare D1 Worker stay generic. Every adapter (idb, memory, remote) implements exactly:
```js
/** @typedef {{ get(table, id), put(table, row), putMany(table, rows), list(table, { where?: {field: value}, includeDeleted?, orderBy?, limit? }), softDelete(table, id), exportAll(), importAll(dump), info() }} StorageAdapter */
```
`put` upserts by `id` and the ADAPTER stamps nothing — `repo/index.js` stamps `id`, `owner_id`, `created_at`,
`updated_at`, `deleted_at`. `list` filters on equality of indexed fields only (fields listed in `schema.js`); anything
richer (sorting by position, due-date filtering) is done in `repo/index.js`.
Remote HTTP contract (document in remote-adapter.js header; Phase 26 implements server):
`GET {base}/api/studio/db/health` → `{ ok, kind:'sqlite', path, schemaVersion }`;
`POST {base}/api/studio/db` body `{ op: 'get'|'put'|'putMany'|'list'|'softDelete'|'exportAll'|'importAll', table?, args }`
→ `{ ok:true, result }` | `{ ok:false, error, code }`; header `X-Studio-Token`. Table names must be validated against
schema.js on both sides. Write an adapter contract test suite `test/adapter-contract.test.js` exported as a function
`runAdapterContract(makeAdapter)` and run it against the idb and memory adapters (Phase 26 will run it against remote).

## 9. Addendum (orchestrator, user decision) — course kind + math/diagrams (COURSE-05 groundwork, LESSON-06)
- Schema: add `kind TEXT NOT NULL DEFAULT 'conceptual'` to `courses` in `0001_init.sql` (not yet released, so edit in place)
  and to `schema.js`; allowed values `programming | quantitative | conceptual | skill`, exported as `COURSE_KINDS` from
  `lib/course.js` with label + one-line description each. `repo.createCourse` accepts `kind`. Demo course: `conceptual`.
- `lib/prompts/base.js`: export `LEARNING_CORE_SECTIONS` (Objectives, Explanation, Worked example, Common misconceptions,
  Check your understanding, Exercise + success criteria, Key takeaways, Resources) — Phase 23 builds kind templates on it.
- Shared `<Markdown>` (components/ui): add `remark-math@^6.0.0` + `rehype-katex@^7.0.1` + `katex@^0.19.0` (import
  `katex/dist/katex.min.css`), and render fenced ```mermaid blocks with `mermaid@^12.2.0` **lazy-loaded via dynamic
  import()** only when a mermaid block is present (`securityLevel: 'strict'`, theme follows light/dark, render errors fall
  back to showing the code block). Keep NO rehype-raw. Add a test for the markdown plugin config if practical, and make
  sure `npm run build` keeps mermaid in a separate chunk.

## 10. Addendum (orchestrator, user decision) — Code Workspace slot (Phase 29 groundwork)
- Migration: add tables `workspace_files(id, owner_id, course_id, lesson_id, path, language, content, created_at,
  updated_at, deleted_at)` and `run_results(id, owner_id, lesson_id, file_id, runner TEXT /* browser|local */, language,
  stdout, stderr, exit_code INTEGER, checks_json, duration_ms INTEGER, created_at, updated_at, deleted_at)` (+ indexes on
  lesson_id) — same D1 rules. Mirror in schema.js. repo: `listWorkspaceFiles(lessonId)`, `saveWorkspaceFile(...)`
  (each save = new row version is NOT required; upsert by (lesson_id, path) but ALSO append a `run_results`-style
  snapshot is Phase 29's job — just provide upsert + list), `saveRunResult(...)`, `listRunResults(lessonId)`.
- Lesson.jsx: add a third tab "Workspace" rendered ONLY when `course.kind === 'programming'`, mounting
  `<CodeWorkspace lesson course />` from `components/workspace/CodeWorkspace.jsx` (stub "Coming soon" card).
