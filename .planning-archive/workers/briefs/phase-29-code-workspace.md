# Task brief: Phase 29 — Code Workspace

You implement one phase of milestone v3.0 **Professor Studio** (`studio/`). Own git worktree, branched from the
merged Phase 22 foundation. Phases 23–26 and 28 run IN PARALLEL — ONLY edit the files you own; anything else goes into
`studio/HANDOFF-29.md` for the orchestrator. Small conventional commits. Do NOT push.

Read first: /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/ROADMAP.md (Phase 29), /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md (CODE-01..05), /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/research/PITFALLS.md (streaming/abort,
security). In your worktree: `studio/src/pages/Lesson.jsx` (Workspace tab mounts your component),
`studio/src/components/workspace/CodeWorkspace.jsx` (stub you replace — keep export name + props `{ lesson, course }`),
`studio/src/lib/repo/index.js` (`listWorkspaceFiles`, `saveWorkspaceFile`, `saveRunResult`, `listRunResults`),
`studio/src/lib/ai/bridge.js` + settings (bridge URL/token), `studio/src/components/ui/*`,
`web/server.js` + `web/studio-api.js` if present (read only).

## Requirements
CODE-01, CODE-02, CODE-03, CODE-04, CODE-05.

## Files you own
`studio/src/components/workspace/*`, `studio/src/lib/runner/*`, `studio/src/workers/*` (Web Workers),
NEW `web/studio-runner.js`, tests under `studio/test/runner*` and root `test/studio-runner.test.js`,
`studio/package.json`/lockfile (dependency additions only).

## Dependencies (exact majors)
`@uiw/react-codemirror@^4.25.12`, `@codemirror/lang-javascript@^6.2.5`, `lang-python@^6.2.1`, `lang-sql@^6.10.0`,
`lang-html@^6.4.12`, `lang-css@^6.3.1`, `lang-go@^6.0.1`, `lang-java@^6.0.2`, `lang-rust@^6.0.2`, `sql.js@^1.15.0`.
Pyodide: load lazily at first Python run from the official CDN (`https://cdn.jsdelivr.net/pyodide/v<version>/full/`,
pin the version that matches the npm `pyodide` package you inspect; do not bundle the 10 MB runtime). Everything heavy
must be code-split (dynamic import) so the main bundle does not grow by more than ~200 KB gzip.

## Build
1. **Runner interface** `lib/runner/index.js`: `run({ language, files, entry, tests, signal, onOutput }) →
   { stdout, stderr, exitCode, checks: [{ name, passed, message }], durationMs, runner }`; picks a backend:
   in-browser when supported, else local (if bridge configured + healthy), else an error with a hint.
2. **In-browser backends** (each in a Web Worker or sandboxed iframe, killable, 10 s timeout, output capped ~200 KB):
   - JS/TS: Worker running the code (TS: strip types with a tiny transform — use `esbuild-wasm` ONLY if it stays
     lazy-loaded; otherwise support JS + "TS without type syntax" and document); capture console.*.
   - Python: Pyodide worker; capture stdout/stderr; `input()` disabled with a clear message.
   - SQL: sql.js; show result tables; seed SQL from the exercise file if present.
   - HTML/CSS/JS: `<iframe sandbox="allow-scripts">` preview via srcdoc (no allow-same-origin).
3. **Checks (CODE-03)**: convention shared with Phase 23/28 exercise skeletons — tests are plain asserts in a
   "self-check" block (Python `assert`, JS `console.assert`/a tiny `check(name, fn)` helper you inject, SQL expected
   rows in a comment). Run them, report per-check pass/fail. Never reveal or generate solutions.
4. **Local runner (CODE-04)** `web/studio-runner.js`: Express Router exporting `createRunnerRouter({ workspacesRoot })`
   with `POST /run` → writes files to `${PROFESSOR_HOME:-~/.professor}/workspaces/<courseSlug>/` (path traversal
   safe: reject absolute paths and `..`), runs a per-language command from an allowlist (node, python3, go run,
   javac+java, rustc, bash only if explicitly allowed) with `spawn` (no shell), timeout 20 s, output cap, kills the process
   tree on timeout/client disconnect; streams SSE `data: {"stdout":"..."}` / `{"stderr":"..."}` / `{"exit":code}` /
   `[DONE]`. `GET /toolchains` reports which commands exist. It relies on the parent router for token + CORS — write the
   one-line mount instruction into HANDOFF-29.md (`router.use('/run', createRunnerRouter(...))` inside studio-api.js).
5. **UI (CODE-01, CODE-05)** `CodeWorkspace`: file tabs (+ add/rename/delete file), CodeMirror with language from
   extension, light/dark theme, Run / Check / Stop / Reset-to-skeleton (confirm; keeps history), output panel (stdout,
   stderr, checks with ✓/✗), runner badge (Browser / Local) and toolchain hint. Initial files: if none saved, seed from
   the lesson's exercise skeleton (fenced code block under the lesson's "Exercise" section — extract the first code block
   whose language matches the course; else an empty `main.<ext>`). Autosave (debounced 1 s) via `saveWorkspaceFile`;
   every Run/Check stores `saveRunResult` (code snapshot hash + outputs) so history is kept; "History" drawer lists
   past runs and can restore a snapshot. Expose `getCurrentCode(lessonId)` from `lib/runner/current-code.js` so the
   tutor's "Check my answer" can attach the code (note this in HANDOFF-29.md for Phase 25 integration).
6. Mobile: editor full width, output below, tabs scroll horizontally.

## Verify before reporting
1. `cd studio && npm test` (runner selection, path-safety, check parsing, output cap/timeout logic) and root `npm test`
   (studio-runner router with a temp dir: runs `node` hello world, rejects `../`, times out a busy loop).
2. `npm run build` passes; report main-bundle size before/after.
3. Manual with `npm run dev`: Python hello + failing/passing assert, JS console.log, SQL select, HTML preview.
4. `git diff --stat <base>..HEAD` only lists owned files.
Final notify summary: commits, tests, bundle delta, HANDOFF items.
