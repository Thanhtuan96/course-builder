---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Testing Patterns

**Analysis Date:** 2026-10-17

## Test Framework

**Runner:**
- Vitest, two independent installs:
  - Root project: `vitest` `^4.1.1` (`package.json` devDependencies). Config: `vitest.config.js`
  - Studio: `vitest` `^5.0.4` (`studio/package.json` devDependencies). Config is the `test` block inside `studio/vite.config.js`
- Root config (`vitest.config.js`): `include: ['test/**/*.test.js']`, `environment: 'node'`, excludes `**/node_modules/**`, `**/.claude/**`, `**/.agents/**`, `**/bin/**`, `**/web/**`, `**/skills/**/*.test.ts`
- Studio config (`studio/vite.config.js`): `environment: 'node'`, `include: ['test/**/*.test.js']` (relative to `studio/`)
- Root `pretest` script (`package.json`) runs `npm --prefix web install` before tests, so `web/` dependencies must be resolvable for the Studio API tests

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible matchers: `toEqual`, `toMatchObject`, `toBe`, `toContain`, `toThrow`/`not.toThrow`, `toBeGreaterThanOrEqual`)

**Test helpers in use:**
- `vi` from `vitest` for `vi.fn`, `vi.stubGlobal`, `vi.mock`, `vi.spyOn`
- `fake-indexeddb/auto` (studio devDependency) for IndexedDB-backed adapters in `studio/test/idb-upgrade.test.js`, `studio/test/adapter-contract.test.js`, `studio/test/storage-choice.test.js`
- `react-dom/server` `renderToString` for render-only component tests (no DOM library installed; there is no jsdom, happy-dom, or Testing Library in either `package.json`)

**Run Commands:**

```bash
npm test                                   # Root suite (test/), runs `vitest` (watch mode in interactive terminals)
npx vitest run                             # Root suite, single pass
npx vitest run test/cli.test.js            # One root test file
npx vitest --reporter=verbose              # Root suite, verbose
npx vitest run -t "buildStatusReport"      # Filter by test name (root)

cd studio && npx vitest run                # Studio suite (studio/test/), single pass
cd studio && npx vitest run test/srs.test.js   # One Studio test file

npm run smoke:pack                         # Tarball smoke: build, pack, install, run (scripts/smoke-pack.mjs)
SMOKE_SKIP_BUILD=1 npm run smoke:pack      # Pack an already-built tree
node bin/cli.js doctor                     # Environment checklist (also run in CI)
```

- No coverage command is defined. `@vitest/coverage-*` is not a dependency of either project

## Test File Organization

**Location:**
- Root suite: all tests in top-level `test/`, separate from source (`bin/`, `web/`, `studio/src/`)
- Studio suite: all tests in `studio/test/`, separate from `studio/src/`
- Fixtures are colocated with each suite: `test/fixtures/` and `studio/test/fixtures/`
- Cross-suite import exists: `test/studio-api.test.js` imports `runAdapterContract` from `studio/test/adapter-contract.test.js` and `createRemoteAdapter` from `studio/src/lib/repo/remote-adapter.js`. Keep shared contract helpers exported from a `studio/test/*.test.js` file so both suites can reuse them

**Naming:**
- `<area>.test.js` (kebab-case). Area prefixes group related files:
  - Root: `cli-*.test.js` (`cli-commands`, `cli-course-reader`, `cli-import`, `cli-import-capstone`, `cli-review`, `cli-studio`), `studio-*.test.js` (`studio-api`, `studio-runner`, `studio-api-agents`, `studio-capstone-migration`), `lecture-archive.test.js`, `node-version.test.js`, `cli.test.js`
  - Studio: `runner-*.test.js` (`runner-browser`, `runner-checks`, `runner-esm-cjs`, `runner-history`, `runner-languages`, `runner-local`, `runner-path`, `runner-selection`, `runner-skeleton`, `runner-strip-types`), `prompts-*.test.js`, `ai.test.js`, `openrouter.test.js`, `sse.test.js`, `srs.test.js`, `markdown.test.js`, `i18n-*.test.js`, `idb-upgrade.test.js`
  - Render tests use `<component>.render.test.js` (`studio/test/tutor-panel.render.test.js`)
- Test titles cite requirement IDs in uppercase-dash-number form (seen in titles: `CLI-07`, `STORE-01..03`, `LANG-02`, `LANG-04`, `CODE-02`; IDs such as `AI-02`, `CAP-02`, `REL-04` appear in source and script headers). Use the same when a test covers a tracked requirement, e.g. `describe('browser runner: HTML preview document (CODE-02)', ...)`

**Structure:**

```
test/
├── *.test.js                 # Root suite (CLI, bin/, web/ server, Studio API)
├── fixtures/
│   ├── courses/              # flavour-checkbox, flavour-list, flavour-nokind, flavour-table, not-a-course
│   └── roots/                # courses/{legacy,shared}, learning/{primary,shared} (multi-root resolution)
studio/test/
├── *.test.js                 # Studio suite (src/lib, src/components)
├── adapter-contract.test.js  # Exported contract suite (runAdapterContract), not a standalone test
└── fixtures/
    ├── agents/*.jsonl        # Recorded agent stream output (antigravity, claude, cursor, gemini, opencode)
    ├── courses/
    └── roots/
```

**Docblock environment:**
- Files that run pure Node logic put `/** @vitest-environment node */` at the top (about 21 files across both suites). Match this for new files even though `node` is the configured default

## Test Structure

**Suite Organization:**

```javascript
/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { readCourse } from '../bin/course-reader.js';

const FIXTURES = join(__dirname, 'fixtures', 'courses');

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'cp-cmd-'));
  tempDirs.push(dir);
  return dir;
}

describe('buildStatusReport', () => {
  const course = readCourse(join(FIXTURES, 'flavour-table'), {
    slug: 'flavour-table', today: '2026-10-15',
  });

  it('produces the documented --json shape', () => {
    const report = buildStatusReport([course], { today: '2026-10-15' });
    expect(Object.keys(report)).toEqual(['courses', 'streak']);
    // ...
  });
});
```

(Source: `test/cli-commands.test.js`, `test/cli.test.js`)

**Patterns:**
- Group by exported function with `describe('<functionName>', ...)`, or by feature with a descriptive label including the requirement ID
- Setup: build fixtures inline (`mkTemp()` then write files) or read a checked-in fixture directory. Pass a fixed `today`/`now` date into functions instead of relying on the system clock (fixture dates use `'2026-10-15'`)
- Teardown: a module-level `afterEach` drains a `tempDirs` array. Wrap `rmSync` in `try {} catch {}` so cleanup never masks the real failure
- Server-based tests start Express/http on an ephemeral port and close in `afterAll`:
  ```javascript
  beforeAll(async () => {
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => { server?.close(); db?.close(); });
  ```
  (Source: `test/studio-api.test.js`). Always bind to `port 0` and `127.0.0.1`; never hard-code ports in tests
- Env mutation: save the original value, change it, and restore it in `finally` or `afterEach`. Example: `process.env.PATH` is prepended with a fake-binary dir in `test/studio-api-agents.test.js` and restored after the test
- Top-level `await import(...)` is used when a `vi.mock` must be in place before the module is loaded (`test/cli.test.js`)

## Mocking

**Framework:** Vitest `vi` (`vi.mock`, `vi.fn`, `vi.stubGlobal`, `vi.spyOn`)

**Usage counts (current):** `vi.fn` in 9 test files, `vi.spyOn` in 3, `vi.mock` in 1 (`test/cli.test.js`), `vi.stubGlobal` in 2 studio files (`studio/test/ai-model-isolation.test.js`, `studio/test/no-sync-getprovider.test.js`). Prefer the lighter patterns below over module mocks

**Patterns:**

Module mock for CLI UI dependencies (hoisted by Vitest), from `test/cli.test.js`:

```javascript
vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}));

vi.mock('ora', () => ({
  default: function ora(text) {
    return {
      text,
      start: () => ora(text),
      stop: () => ora(text),
      succeed: () => ora(text),
      fail: () => ora(text),
    };
  },
}));

vi.mock('https', () => ({ get: vi.fn() }));
```

Global `fetch` stub for provider/bridge tests, from `studio/test/ai-model-isolation.test.js`:

```javascript
vi.stubGlobal('fetch', fetchMock);
// Streaming responses are simulated with a ReadableStream of SSE lines:
function sseResponse(lines) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
```

Recommended: restore globals in `afterEach(() => vi.unstubAllGlobals())` (Vitest API) so stubs do not leak between tests.

Repository injection for Studio data tests: swap the storage adapter instead of mocking the module:

```javascript
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});
```

(Source: `studio/test/tutor-panel.render.test.js`)

**What to Mock:**
- External process and network boundaries: `fetch` (AI providers, bridge), `https`, `inquirer` and `ora` (interactive CLI)
- The storage backend: use `createMemoryAdapter()` or `createIdbAdapter()` via `useAdapter`; do not mock `repo/index.js`
- Spawned tool output where needed. Real spawn is used in runner tests only when the test is about the runner (`studio/test/runner-*.test.js`)

**What NOT to Mock:**
- Pure parsers and reducers (`srs.js`, `course-reader.js`, `json.js`, `markdown.js`) run for real against fixtures
- The Studio API under test (`createStudioApp`) runs for real against a real SQLite DB (`createStudioDb` on a temp path) and an ephemeral HTTP server
- Filesystem: prefer a real temp dir (`mkdtempSync(join(tmpdir(), ...))`) over mocking `fs`

## Fixtures and Factories

**Fixture directories (checked in):**
- `test/fixtures/courses/<name>/` each a course folder (COURSE.md plus lecture content). Named by kind, e.g. `flavour-table` (kind conceptual), `flavour-checkbox`, `flavour-list`, `flavour-nokind` (tests the missing-Kind default of `programming`), `not-a-course` (a directory that is not a course)
- `test/fixtures/roots/` models the two storage roots (`learning/` primary, `courses/` legacy) with `shared` and per-course subfolders, for multi-root resolution tests
- `studio/test/fixtures/agents/*.jsonl` store recorded CLI-agent output streams per agent (`claude`, `cursor`, `gemini`, `opencode`, `antigravity`, `antigravity-tool-denied`) for parser tests

**Inline factories:** small object literals inside the test file, usually near the top, named by intent:

```javascript
const course = { id: 'c1', title: 'Go', level: 'Beginner', kind: 'conceptual', lessons: [] };
const lesson = { id: 'l1', position: 1, title: 'Variables', summary: 'Declaring variables' };
```

Helpers like `row = (over = {}) => ({ id: \`r${++seq}\`, name: 'x', ...over })` are used in contract tests (`studio/test/adapter-contract.test.js`) to build rows with overrides.

**Location:** fixtures stay in the suite's `test/fixtures/` or `studio/test/fixtures/`. Do not put fixtures in `learning/` or `courses/` at the repo root; those are user data and are gitignored

## Coverage

**Requirements:** None enforced. No `coverage` block in `vitest.config.js` or `studio/vite.config.js`, and no coverage provider is installed

**View Coverage:** Not configured. To get one-off numbers, run `npx vitest run --coverage` only after installing a provider locally (not committed)

## Test Types

**Unit Tests (majority):**
- Pure function tests for `bin/` parsers and helpers (`bin/course-reader.js`, `bin/commands/*.js` exported helpers, `bin/registry-helpers.js`, `bin/node-version.js`, `bin/platforms/_shared.js`)
- Pure Studio logic under `studio/src/lib/` (`srs.js`, `json.js`, `course.js`, `capstone.js`, `runner/path.js`, `ai/errors.js`)
- Roughly 780 `describe`/`it`/`test` call sites across both suites

**Integration Tests:**
- Studio API over real HTTP on an ephemeral port with a real SQLite DB (`test/studio-api.test.js`, `test/studio-runner.test.js`, `test/studio-api-agents.test.js`)
- CLI command tests that write a real course folder in a temp dir and call `run()` or helpers (`test/cli-import.test.js`, `test/cli-studio.test.js`, `test/cli-review.test.js`)
- Shared adapter contract run against every `StorageAdapter`: memory, IndexedDB (`fake-indexeddb`), and remote (`createRemoteAdapter`) via `runAdapterContract(makeAdapter)` in `studio/test/adapter-contract.test.js`

**Guard / architectural tests (static scans):**
- `studio/test/no-sync-getprovider.test.js`: walks `studio/src/**/*.{js,jsx}` and fails if any `getProvider(` call is not awaited. Use this pattern to enforce an API contract across the codebase
- `studio/test/i18n-keys.test.js`: every translation key used in `src/**` must exist in both `studio/src/lib/i18n/en.json` and `vi.json`, and the two catalogs must have identical key sets
- `studio/test/ai-model-isolation.test.js`: asserts a provider only reads its own model slot
- `test/node-version.test.js`: `parseNodeVersion`, `nodeSupportsSqlite`, `assertStudioNode` against `STUDIO_MIN_NODE`

**Render Tests:**
- `studio/test/tutor-panel.render.test.js` uses `renderToString(createElement(TutorPanel, props))` and asserts on HTML string content. No interaction or DOM assertions

**Release Smoke (not part of `npm test`):**
- `scripts/smoke-pack.mjs` (`npm run smoke:pack`): builds the legacy client and Studio bundles, runs `npm pack`, installs the tarball into a fresh temp project, then runs `course-professor --help`, `doctor`, `status`, `import --all --dry-run` against a throwaway `PROFESSOR_HOME`, and starts `studio --no-open` on ports `SMOKE_STUDIO_PORT` (default `5197`) and `SMOKE_API_PORT` (default `3019`). It checks `GET` studio HTML (200), `/api/studio/health` (200 with token), and `/api/studio/db/health` (SQLite and migrations applied). Failures exit non-zero with `✗ SMOKE FAILED:`
- `.github/workflows/release-smoke.yml`: two jobs. `tarball-smoke` on Node 22 runs `npm ci` then `npm run smoke:pack`. `cli-floor` on Node 18 runs `node bin/cli.js --help` and `node bin/cli.js doctor`. Triggers: push to `main` and `feat/studio-local-first`, pull requests, and manual dispatch
- The workflow comment says the smoke test must run before every publish

**E2E Tests:** Not used. There is no Playwright, Cypress, or browser-driven test runner in the repo

## Common Patterns

**Async Testing:** use `async` test functions and `await` directly. For servers, wrap `listen` in a Promise (see the Structure section). For timing, pass explicit `now` values to `review(card, grade, now)` in `studio/src/lib/srs.js` rather than using fake timers

**Error Testing:**

```javascript
// Real pattern from test/cli-commands.test.js
it('is JSON-serializable', () => {
  const report = buildStatusReport([course], { today: '2026-10-15' });
  expect(() => JSON.stringify(report)).not.toThrow();
});
```

Studio throws `Error('Unsafe path: ...')` from `studio/src/lib/runner/path.js` on unsafe relative paths; assert with `toThrow(/Unsafe path/)`.
Check provider errors by `code` and `hint`: `ProviderError` from `studio/src/lib/ai/errors.js` carries `code` in `ERROR_CODES`. Assert on the code, not the message text

**Negative and edge cases to cover for new code:**
- Missing `kind` in `COURSE.md` falls back to `programming` (`flavour-nokind` fixture)
- Non-course directories are rejected (`not-a-course` fixture)
- Both `learning/` and legacy `courses/` roots are exercised (`test/fixtures/roots`)
- External references are not inlined (`studio/test/runner-browser.test.js`: `leaves external references alone`)
- Floors and minimums: Node version checks (`STUDIO_MIN_NODE`), ease floor `1.3` in SM-2 (`studio/test/srs.test.js`)

**Writing new tests (checklist derived from the existing suites):**
1. Put the file in `test/` (root CLI/server) or `studio/test/` (Studio lib/components) with the `<area>.test.js` name
2. Add `/** @vitest-environment node */` for Node-only logic
3. Import from the source by relative path including `.js`/`.jsx`
4. Use `mkdtempSync(join(tmpdir(), 'cp-<area>-'))` for scratch dirs and clean them in `afterEach`
5. Pin dates and clocks through parameters (`today`, `now`)
6. Include the requirement ID in the `describe` title when the test covers a tracked requirement
7. Run the single file with `npx vitest run <path>` before the full suite

---

*Testing analysis: 2026-10-17*
