---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Coding Conventions

**Analysis Date:** 2026-10-17

## Naming Patterns

**Files:**
- Node/CLI modules are kebab-case: `bin/cli.js`, `bin/registry-helpers.js`, `bin/course-reader.js`, `bin/static-server.js`, `bin/node-version.js`, `bin/studio-store.js`
- CLI subcommands live one-per-file under `bin/commands/` named after the command: `bin/commands/status.js`, `bin/commands/next.js`, `bin/commands/check.js`, `bin/commands/doctor.js`, `bin/commands/import.js`, `bin/commands/review.js`, `bin/commands/studio.js`
- Platform installers live under `bin/platforms/` named after the platform (`claude.js`, `gemini.js`, `opencode.js`, `cursor.js`) plus the shared helper `bin/platforms/_shared.js` (leading underscore marks the shared module)
- Studio (`studio/src`) modules are kebab-case `.js`: `studio/src/lib/srs.js`, `studio/src/lib/ai/openai-compatible.js`, `studio/src/lib/repo/memory-adapter.js`, `studio/src/lib/runner/strip-types.js`
- Studio React components are PascalCase `.jsx` files with a matching named export: `studio/src/components/ui/Button.jsx` exports `Button`, `studio/src/components/tutor/TutorPanel.jsx` exports `TutorPanel`
- Studio pages are PascalCase `.jsx` under `studio/src/pages/` (`Home.jsx`, `Course.jsx`, `Lesson.jsx`, `Review.jsx`)
- Web worker files use the `.worker.js` suffix: `studio/src/workers/js.worker.js`, `studio/src/workers/python.worker.js`
- Test files: `<area>.test.js`, kebab-case, grouped by prefix. Root suite uses `cli-*`, `studio-*`, `lecture-archive.test.js`, `node-version.test.js`. Studio suite uses area names (`runner-*.test.js`, `idb-upgrade.test.js`, `tutor-panel.render.test.js`) and `*.render.test.js` for SSR render tests
- Plugin Markdown files are kebab-case, with agents as role nouns (`agents/professor.md`, `agents/researcher.md`) and commands named after the action (`commands/professor/new-topic.md`, `commands/professor/skill-export.md`)
- Course artifacts use UPPER_SNAKE_CASE file names: `COURSE.md`, `LECTURE.md`, `LEARNING-LOG.md`, `CAPSTONE.md`, `NOTES.md`, `COMPLETION.md`

**Functions:**
- camelCase for all functions: `validateItemName` (`bin/registry-helpers.js`), `buildStatusReport` (`bin/commands/status.js`), `resolveActiveCourse` (`bin/commands/next.js`), `allLessonsDone` (`studio/src/lib/capstone.js`)
- Verb-led names for actions: `build*`, `parse*`, `resolve*`, `validate*`, `fetch*`, `install*`, `read*`, `write*`, `create*`, `get*`, `list*`, `delete*`
- Pure helpers exported for tests are common in CLI modules (`parseCheckOutput`, `evaluateNodeVersion`, `summarizeChecks`, `whichPath` are exported next to the `run` entry point)
- Each CLI command module exports a `run` function as its entry point: `export async function run(...)` in `bin/commands/check.js`
- React components use PascalCase and named exports (`export function Button(...)`). Hooks use `use*` names (`studio/src/lib/ai/useStream.js`); translation hook is `useT()` from `studio/src/lib/i18n/index.js`
- Factory functions use `create*` (`createMemoryAdapter`, `createIdbAdapter`, `createGenerateJson`, `createStaticServer`-style helpers in `bin/static-server.js`)

**Variables:**
- camelCase locals; UPPER_SNAKE_CASE for module-level constants: `SUPPORTED_AGENTS` (`bin/cli.js`), `COURSE_KINDS`, `DEFAULT_KIND`, `STATUS_BY_EMOJI`, `SECTION_EMOJI_RE` (`bin/course-reader.js`), `TOKEN_WARNING_THRESHOLD` (`hooks/pre-compact.js`), `STUDIO_MIN_NODE` (`bin/node-version.js`), `DAY` (`studio/src/lib/srs.js`)
- Regex constants end in `_RE`
- Test fixtures and temp dirs are declared as `const FIXTURES = join(__dirname, 'fixtures', 'courses')` and `const tempDirs = []`

**Types and data shapes:**
- No TypeScript in source. Shape documentation uses JSDoc `@param`/`@returns` with inline object types: `@param {{ optional?: boolean }} opts`
- Exception: `void.config.ts` at the repo root and `studio/void.config.ts` exist; source code is `.js`/`.jsx` only
- Error codes are string constants from an array: `ERROR_CODES` in `studio/src/lib/ai/errors.js` (`'auth'`, `'network'`, `'rate_limit'`, ...)
- Status values are strings or emoji-mapped enums: `STATUS_BY_EMOJI` maps `⬜ → 'todo'`, `🔄 → 'active'`, `✅ → 'done'`, `🔒 → 'locked'` in `bin/course-reader.js`

**Course kinds and command names:**
- Command identifiers are `professor:<action>` (kebab-case action): `professor:new-topic`, `professor:capstone-review`, `professor:template-export`
- Course kinds are one of `programming | quantitative | conceptual | skill` (`COURSE_KINDS` in `bin/course-reader.js`)
- Course slugs are kebab-case directory names (`learning/react-hooks/`)

## Code Style

**Formatting:**
- No formatter config is committed (no `.prettierrc`, no `biome.json`, no `.editorconfig`)
- Observed style in `bin/` and `hooks/`: 2-space indentation, semicolons, single quotes, trailing commas in multi-line literals
- `AGENTS.md` states the rules: 2 spaces, semicolons, max line length 100 characters, spaces around operators
- The 100-char limit is a guideline from `AGENTS.md`; long string literals (for example hint text in `studio/src/lib/ai/errors.js`) exceed it. Nothing enforces it
- Studio source (`studio/src`) uses the same 2-space style, with single quotes in JS and JSX

**Linting:**
- No ESLint or Biome configuration exists in the repository. Do not add lint-disable comments; there is nothing to disable
- Style is enforced by review and by `AGENTS.md`, not by tooling

## Import Organization

**Order (as observed in `bin/cli.js`, `bin/commands/*.js`, `studio/src/pages/Home.jsx`):**
1. Local project modules that are the main dependencies (`./registry-helpers.js`, `../lib/repo/index.js`) at the top in `bin/cli.js`, or Node built-ins first in `bin/course-reader.js`. The repo does not enforce a strict group order; match the file you edit
2. Node built-ins: `fs`, `path`, `url`, `os`, `child_process`, `module`. Both bare (`'fs'`) and `node:`-prefixed (`'node:fs'`) forms are used; the `node:` prefix is used in newer Studio tests (`studio/test/i18n-keys.test.js`, `studio/test/no-sync-getprovider.test.js`)
3. Third-party packages: `chalk`, `inquirer`, `ora`, `express`, `cors`, `react`, `react-dom`, `vitest`
4. Local component/library imports in Studio, one per line, e.g. `studio/src/pages/Home.jsx` imports `../lib/router.js`, then `../lib/repo/index.js`, then `../components/ui/*.jsx`, then `../components/practice/*.jsx`

**Path Aliases:**
- None. All imports are relative (`../bin/course-reader.js`, `../src/lib/srs.js`) and include the file extension (`.js`, `.jsx`)
- Always include the extension in relative imports; the Node ESM loader requires it in `bin/` and `studio/src/`

**Module system:**
- ES modules (`import`/`export`) for `bin/`, `studio/`, `web/`, `scripts/`, `test/`, and `studio/test/`. `package.json` sets `"type": "module"` at the root and in `studio/package.json`
- CommonJS (`require`/`module.exports`) only in `hooks/pre-compact.js` (loaded by runtimes that may not support ESM hooks)
- `scripts/smoke-pack.mjs` uses `.mjs` and `createRequire(import.meta.url)` when it needs CJS resolution
- Top-level `await` is used in tests to load modules after `vi.mock` (see `test/cli.test.js`: `const {...} = await import('../bin/registry-helpers.js')`)

**Path handling:**
- Always build paths with `path.join()`. Never concatenate with `/`
- `__dirname` in ES modules is derived with `dirname(fileURLToPath(import.meta.url))`; this is the pattern in `bin/cli.js`, `bin/platforms/_shared.js`, `bin/course-reader.js`, and the test files

## Error Handling

**CLI (`bin/`):**
- Wrap filesystem reads in `try/catch`, log a warning with the path, and return `null` or a fallback instead of throwing (from `AGENTS.md` and `bin/registry-helpers.js`):
  ```javascript
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.error(`Warning: Could not read ${filePath}: ${err.message}`);
    return null;
  }
  ```
- Fatal user errors print with `console.error` and exit with `process.exit(1)`; success exits `0`. `process.exit(1)` appears 36 times across `bin/`
- Fetch/network helpers return `null` on optional failure (`fetchRegistryText(url, { optional: true })`) and throw otherwise
- Empty `catch {}` blocks are used for best-effort cleanup only, such as removing temp dirs in tests (`test/cli-commands.test.js`: `try { rmSync(dir, { recursive: true, force: true }); } catch {}`). Do not use empty catches for production logic

**Studio (`studio/src/`):**
- Throw plain `Error` for invalid input and parse failures: `throw new Error('Empty response')` in `studio/src/lib/json.js`, `throw new Error('No sections found in COURSE.md')` in `studio/src/lib/course.js`, `throw new Error(`Unsafe path: ${rel}`)` in `studio/src/lib/runner/path.js`
- AI provider failures throw `ProviderError(code, message, hint)` where `code` is one of `ERROR_CODES` in `studio/src/lib/ai/errors.js`. Each code has a default human hint in `ERROR_HINTS`; providers may override it. Example from `studio/src/lib/ai/bridge.js`:
  ```javascript
  if (json.error) throw new ProviderError(String(json.code || 'unknown'), json.error, json.hint || RUN_HINT);
  ```
- UI layers catch and render with `ErrorNotice` (`studio/src/components/ui/ErrorNotice.jsx`) rather than crashing; async UI loaders fall back to empty state, as in `studio/src/pages/Home.jsx`: `.catch(() => alive && setCourses([]))`
- Validation returns a result object `{ ok, error }` rather than throwing in prompt validators (`studio/src/lib/capstone.js` checks `validated.ok` and throws only at the boundary)

**Hook (`hooks/pre-compact.js`):**
- Runs before context compaction, so it should not throw. Helper functions in the file are plain CommonJS; keep runtime dependencies to Node built-ins (`fs`, `path`)

## Logging

**Framework:** `console` for the CLI. `chalk` for colored output, `ora` for spinners (`bin/cli.js`, `bin/registry-helpers.js`). Use the `style(kind, text)` helper from `bin/registry-helpers.js` for `error`/`warn`/`success` styling.

**Patterns:**
- Prefix warnings with `Warning:` in plain text (`Warning: Could not read ${filePath}: ...`)
- Errors are prefixed for humans: `console.error(style('error', '...'))`
- Studio: no logger abstraction; components surface problems through `ErrorNotice`. Server (`web/server.js`) also relies on `console` (no logger module is imported)

## Comments

**When to Comment:**
- Module header comment states purpose and the requirement or phase it serves. Examples: `studio/src/lib/capstone.js` ("CAP-02 unlock, CAP-04 test run, CAP-05 completion export"), `studio/src/lib/ai/errors.js` ("AI-02"), `bin/course-reader.js` ("Phase 31")
- Inline comments explain non-obvious math or protocol details: `// SM-2 quality mapping: hard=3, good=4, easy=5` in `studio/src/lib/srs.js`; `// see it again in 10 minutes` on the `again` grade
- Section dividers in long modules use `// ─── Name ───` banners (`bin/course-reader.js`, `test/cli-commands.test.js`, `test/cli.test.js`). Match this style when adding a section

**JSDoc/TSDoc:**
- Required on all exported functions in `bin/` (per `AGENTS.md`): `@param {type} name`, `@returns {type}`
- Typedef-style inline types for test helpers: `/** @type {string[]} */`
- Studio uses JSDoc on exports that are part of a contract (adapter interface, `StorageAdapter`, `runAdapterContract` in `studio/test/adapter-contract.test.js`)

## Function Design

**Size:** Keep parser and helper functions small and pure. Command modules are large (`bin/cli.js` 966 lines, `bin/commands/import.js` 532 lines) and are the exception; new behavior should go into a helper module, with the command file only wiring it.

**Parameters:**
- Use an options object for optional arguments: `readCourse(dir, { slug, today })`, `buildStatusReport(courses, { today })`, `fetchRegistryText(url, { optional = false } = {})`
- Accept `now = Date.now()` or `today` as a parameter for any time-dependent logic so tests can pin time (`newCardState(now = Date.now())` in `studio/src/lib/srs.js`)

**Return Values:**
- Pure functions return plain JSON-serializable objects. `buildStatusReport` is required to be JSON-serializable (asserted in `test/cli-commands.test.js`)
- Lookups return `null` when not found (`resolveActiveCourse(courses, 'missing')` returns `null`)
- Functions that can fail softly return `{ ok: boolean, error?: string }` (prompt/validator style)

## Module Design

**Exports:**
- Named exports only in `bin/`, `studio/src/lib/`, and `studio/src/components/`. No default exports except the `default` shape required by mocked modules (`vi.mock('inquirer', () => ({ default: {...} }))`)
- Command modules export `run` plus the pure helpers used by tests
- Platform modules export a `TOOL_SUBSTITUTIONS` map and `substituteTokens` (`bin/platforms/_shared.js`)

**Barrel Files:**
- Used selectively for swappable subsystems: `studio/src/lib/ai/index.js` (provider registry: `getProvider`, `resolveProviderModel`, `createGenerateJson`), `studio/src/lib/repo/index.js` (storage facade with `useAdapter`, `listCourses`, `getCourse`, `onChange`), `studio/src/lib/i18n/index.js`, `studio/src/lib/runner/index.js`
- Consumers import from the barrel, never from adapter files directly (except tests, which import `memory-adapter.js` / `idb-adapter.js` to build a fixture adapter)

## Markdown Conventions (Plugin Prompt Files)

These files are the behavior of the product. They are read by the AI agent at runtime.

**Agent files (`agents/*.md`):**
- YAML frontmatter at the top, delimited by `---`, with `name` and a folded multi-line `description: >` block. Example, `agents/professor.md`:
  ```yaml
  ---
  name: professor
  description: >
    A Socratic teaching assistant that helps users learn technology concepts by
    asking questions rather than giving answers. Invoke for any professor:* command
  ---
  ```
- The description lists trigger phrases and the commands the agent handles, because the description drives agent routing
- Canonical copies live in `shared/agents/`. They must be byte-identical to the root files at commit time. Currently all five are identical

**Command files (`commands/professor/*.md`):**
- YAML frontmatter with `name: professor:<action>`, a quoted one-line `description`, and an `argument-hint` in square brackets (for example `argument-hint: "[section or concept]"`)
- `argument-hint` is present in 7 of 25 command files (for example `commands/professor/quiz.md`); the other 18 omit it, including `commands/professor/done.md`. When adding a command that takes arguments, add `argument-hint`
- Body is imperative instructions to the agent, written in second person to the agent ("Use AskUserQuestion to ask the scope..."), not to the learner
- Every command file must be registered in `plugin.json` under `commands[]` with `{ "name": "professor:<action>", "file": "commands/professor/<action>.md" }`
- Canonical copies in `shared/commands/professor/` are kept identical to the root copies, synced by `bin/sync-shared.sh` (a plain `cp`, no transformation). All 25 are currently identical

**Platform tool placeholders:**
- Interactive questions are written as `AskUserQuestion` (in backticks or bare). This is the canonical placeholder in `shared/` and in root files
- At install time `substituteTokens(content, platform)` in `bin/platforms/_shared.js` replaces it:
  - `claude`: unchanged (`AskUserQuestion`)
  - `gemini`: `ask_user`
  - `opencode`: `question`
  - `cursor`: replaced with the phrase `ask the user directly in chat` (plain inline question)
- Replacement handles the backtick-wrapped form first, then the bare form, so both spellings must be handled. New interactive prompts must use the literal `AskUserQuestion` token; do not write platform-specific tool names into `shared/` files
- Commands with a single question phrase it as: `Use AskUserQuestion to ...` followed by a quoted question and an options list (`Options: "Current section" / "Entire course so far"`)

**Phrasing rules for agent prompt content:**
- Commands and agents must never instruct the agent to write working code for the learner (see `CLAUDE.md` core behavior rules). Keep this in every new command body
- Reference paths with backticks and the `learning/{slug}/` form first, `courses/{slug}/` as legacy fallback

## Git and Commit Conventions

- Conventional-commit style prefixes are used in history: `feat:`, `fix(scope):`, `docs:`, `chore(planning):`, `chore(...)`. Scopes are used for platform fixes (`fix(opencode):`, `fix(claude):`) and `feat(web-client):`
- Version bumps are separate commits with the bare version as the subject (`1.5.0`)
- Branches: `develop` is the working branch; `main` is the release branch

---

*Convention analysis: 2026-10-17*
