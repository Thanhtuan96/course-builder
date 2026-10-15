# HANDOFF — Phase 29: Code Workspace

Everything below is for the orchestrator (or the owner of the named file). Phase 29 only edited the
files it owns; the items here are integrations that touch files owned by other phases or the repo
layer.

## 1. Mount the local runner (owner: Phase 26 / `web/studio-api.js`) — ✅ DONE (Phase 26b)

`web/studio-runner.js` exports an Express Router. Mount it inside `web/studio-api.js` **inside the
already-token-guarded/CORS-allowlisted router** (one line, no CORS/token of its own):

```js
import { createRunnerRouter } from './studio-runner.js';
// ...
router.use('/run', createRunnerRouter(options.runner)); // options.runner defaults to ~/.professor/workspaces
```

Mounted in Phase 26b immediately after the pairing-token guard; covered by
`test/studio-api.test.js` (`GET /api/studio/run/toolchains` → 401 without token, 200 with).

> **Follow-up for the Phase 29 owner (not fixed in 26b — outside its file scope):** `/toolchains`
> probes with `commandExists(cmd, { cwd: workspacesRoot })`, and `spawnSync` fails on a missing
> cwd — so on a fresh machine (where `~/.professor/workspaces` does not exist yet) every toolchain
> reports `false`. Create the root in `createRunnerRouter` (`mkdirSync(workspacesRoot, {recursive:true})`)
> or drop the `cwd` from the probe.

Resulting endpoints (the Studio client calls exactly these):

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/studio/run/toolchains` | `{ node, python3, go, javac, java, rustc, bash }` booleans |
| `POST` | `/api/studio/run` | SSE `{"stdout"}…{"stderr"}…{"exit":code}…[DONE]` |

The router also registers `POST /run` (so it works even if a future caller mounts it at `/`, giving
`/api/studio/run/run`); prefer the `'/run'` mount above.

- Files are written to `${PROFESSOR_HOME:-~/.professor}/workspaces/<courseSlug>/`.
- `courseSlug` is derived in the UI from the course title (`slugify`), so folders are human-openable.
- Allowlist: `node`, `python3`, `go run`, `javac`+`java`, `rustc`, and `bash` **only** when
  `PROFESSOR_ALLOW_BASH=1` (or `createRunnerRouter({ allowBash: true })`).
- Safety: slug + relative-path validation, `spawn` with `shell: false`, 20 s timeout, 200 KB output
  cap, process tree killed on timeout or client disconnect (`res.on('close')`, `process.kill(-pid)`).

## 2. Tutor "Check my answer" (owner: Phase 25 / `TutorPanel.jsx`)

Phase 29 exposes the learner's **current** code for the lesson. In the tutor's "Check my answer"
quick action, import and attach it:

```js
import { getCurrentCode, currentCodeBlock } from '../lib/runner/current-code.js';

const code = await currentCodeBlock(lesson.id); // null when the learner has written nothing
// include `code` inside a clearly delimited untrusted block in the user message:
//   "Here is the learner's current code:\n--- <file> ---\n…"
```

`getCurrentCode(lessonId)` returns the live editor buffer when the Workspace tab is open, and
otherwise falls back to the last files saved in the repository — so it works even if the tab was
closed. It is read-only context; the tutor must still never produce a solution (TUTOR-02).

## 3. Repository gaps (owner: Phase 22/26 repo + schema)

Three places where the Phase 22 repository contract was insufficient; Phase 29 worked around each
**without** editing `studio/src/lib/repo/*`:

1. **No `deleteWorkspaceFile`.** Rename/delete write a tombstone content marker
   (`DELETED_MARKER = "\u0000__professor_deleted__"`, `lib/runner/skeleton.js`); `filesFromRows`
   filters it out. A first-class `deleteWorkspaceFile({ lessonId, path })` should replace this.
2. **No code column on `run_results`.** CODE-05 snapshots are encoded in the existing `checks_json`
   column as `{ checks, snapshot: { files, entry, language, hash } }` (`lib/runner/history.js`). A
   dedicated `code_json`/`code_hash` column is the clean follow-up; `history.js` is the single swap point.
3. **No `listWorkspaceFiles` ordering by course.** Fine for now; paths sort alphabetically.

## 4. Dependency / runtime notes for DEPLOY

- Pinned browser deps (all lazy/code-split): `@uiw/react-codemirror@^4.25.12`,
  `@codemirror/lang-{javascript,python,sql,html,css,go,java,rust}`, `sql.js@^1.15.0`.
- **Pyodide is not bundled.** It is fetched on first Python run from
  `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/` (pinned to the inspected `pyodide` npm version,
  `314.0.7`). A hosted deploy must allow `cdn.jsdelivr.net` (CSP `script-src`/`connect-src`).
- **TypeScript** runs via a small dependency-free type eraser (`lib/runner/strip-types.js`), *not*
  `esbuild-wasm`. It removes interfaces/type aliases/`as` casts/annotations/generics. It is
  deliberately conservative (primitives + `Foo<T>`/`Foo[]`); advanced TS (enums, decorators,
  namespaces) is out of scope and the worker surfaces a SyntaxError telling the learner to use `.js`.
- **Root test needs `web/node_modules`:** `test/studio-runner.test.js` resolves `express` from
  `web/` via `createRequire`, so `cd web && npm install` must run before root `npm test`. The root
  `package.json` was intentionally **not** modified.

## 5. Verification performed

- `studio: npm test` → 17 files, 119 tests pass (runner selection, path safety, check parsing, TS
  erasure, ESM→CJS shim, HTML preview, history encoding, current-code registry, local client SSE).
- root: `npx vitest run` → 3 files, 110 tests pass (incl. `test/studio-runner.test.js`: node hello
  world, `../` slug + `../` file rejection + on-disk escape check, busy-loop timeout/exit 124,
  non-zero exit, toolchain allowlist).
- `studio: npm run build` succeeds. **Main bundle**: 1,033.56 kB / 290.02 kB gzip → **1,061.51 kB /
  298.50 kB gzip** (+28 kB raw, **+8.5 kB gzip**). All heavy pieces are separate lazy chunks:
  `Editor-*.js` 792 kB (CodeMirror + grammars), `sql.worker-*.js` 42 kB + `sql-wasm-*.wasm` 685 kB,
  `js.worker-*.js` 8 kB, `python.worker-*.js` 3 kB.
- Manual dev (`npm run dev`): app + all new modules/workers transform with no errors (browser-only
  interactions — running Python/SQL/HTML — were not exercisable headlessly here).
