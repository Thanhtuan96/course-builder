# Phase 7: Beta Report UI and Nudges - Research

**Researched:** 2026-10-24
**Domain:** React 19 + Vite 8 + Vitest 5 Studio UI (preview/download panel, activation-day nudge, build-time version injection)
**Confidence:** HIGH (every load-bearing claim below was executed in this worktree, not recalled)

## Summary

Phase 7 is a **composition-only** phase: Phase 5 already ships a strict, content-free report
builder + schema, and Phase 6 already ships the per-namespace i18n glob. There is no new library,
no new table, no repo change. The whole phase is three seams — (1) a pure payload builder that
turns repo rows into `{ filename, json, report }`, (2) a presentational preview component that
renders exactly that `json` and downloads exactly that `json`, and (3) a pure nudge predicate
(`offset === 7 | 14` minus dismissed/exported markers) plus a banner that mirrors `Layout`'s
durability banner.

The one genuinely tricky item is `__APP_VERSION__`. It is **proven below** that a Vite `define`
in `studio/vite.config.js` reaches modules under `npm --prefix studio test` (and `vite build`),
but **does not reach the Studio project when tests run through the root aggregate
`vitest.config.js`** — which is exactly what CI runs (`npm test`). An unguarded
`__APP_VERSION__` reference therefore produces a green Studio suite and a red CI. The
`typeof __APP_VERSION__ !== 'undefined'` guard is mandatory, and the anti-drift test must read
`config.define` from the imported Vite config rather than the injected global.

**Primary recommendation:** Build one exported pure function chain in `BetaReportPanel.jsx`
(`providerCategory` → `assembleCapstoneSummary` → `buildBetaReportPayload` → `buildReportExport`
→ `exportBetaReport`) plus one presentational `BetaReportPreview`; put the nudge predicates and
`BetaReportNudge` in the same module and have `Home.jsx` own only the read/dismiss wiring.
Test the pure functions directly and the two components with `react-dom/server`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry point and navigation**
- **D-01:** `BetaReportPanel` is mounted **inside Settings ▸ Data** by `DataPanel` (the owned mount
  point). `DataPanel` keeps its existing card and renders `BetaReportPanel` below it as its own card —
  no new route, no router change.
- **D-02:** Both entry points lead to the same panel: the Home nudge links to `/settings?report=1`
  (hash routing already tolerates a query — `matchRoute` strips it) and `Settings.jsx` scrolls to the
  panel's stable `id="beta-report"` when that marker is present; `Settings.jsx` also renders a small
  "Beta report" link near the Storage/Data heading that scrolls to the same id on click.
  Scrolling is the only behaviour added to `Settings.jsx`.

**App version (required by success criterion 2)**
- **D-03:** The report's `app.version` comes from **one source of truth: the root `package.json`
  version**, injected at build time by a Vite `define` (`__APP_VERSION__`) added to
  `studio/vite.config.js`. A test asserts `__APP_VERSION__ === require('../package.json').version`
  so the two can never drift. — **Reversibility:** reversible — one define line plus one test.
- **D-04:** The `define` must also cover Vitest (it does: Vitest transforms through the same Vite
  config), so `BetaReportPanel.jsx` may reference `__APP_VERSION__` at module scope. If `define` is
  somehow absent (plain Node import outside Vite), fall back to `''` — the schema accepts `''` and
  the report stays valid, never throwing on an undefined global.
- **D-05:** `studio/package.json`'s `0.1.0` is **not** the app version and must not be used —
  it is a stale private-package field, not the shipped product version (`1.6.0-beta.x`).
  Ownership exception recorded in D-03 (see `<specifics>`).

**Preview and download**
- **D-06:** One action opens the preview: a summary block (activation, report window offsets,
  loop counts, retention, capstone, app version, storage kind) followed by the **exact
  pretty-printed JSON that will be downloaded** under the copy "this is everything in the file".
  A test compares the downloaded text to the previewed text byte-for-byte, so the preview cannot
  drift from the file.
- **D-07:** The previewed/downloaded payload is produced by Phase 5's `buildBetaReport(...)` and is
  re-validated with `reportSchema` in the panel before it becomes downloadable; a schema failure
  surfaces an error and disables Download (never writes a partial file).
- **D-08:** `app.storage` is `(await getAdapterInfo()).kind` (`indexeddb|sqlite|memory|remote`).
  `app.provider` is a category string only: `bridge:<agent>` for the local bridge,
  `byok:<provider>` for BYOK (OpenAI-compatible preset id when the provider is `openai`), and `null`
  when nothing is configured or the value is outside the schema's closed enum. Never a key, model
  name or URL.

**Capstone summary (assembled here, not in Phase 5)**
- **D-09:** The panel assembles the capstone summary Phase 5 left to the caller: `started` = any
  course has a capstone; `submissions` = total capstone submissions across courses;
  `externalEvidence` = submissions whose `testResults.source === 'external'`; `verdict` = the
  verdict of the most recent submission (by `attempt`), or `null`. Reads use only the frozen repo
  API (`listCourses`, `getCapstone`, `listCapstoneSubmissions`) — no repo changes.

**Filename**
- **D-10:** Filename is `professor-beta-report-<pid>-d<N>.json` where `<pid>` is the **first 8
  characters of the participant UUID** and `<N>` is the report's `generatedAtDayOffset`. The full
  participant id stays inside the JSON (that is what Phase 10 dedupes on). — **Reversibility:**
  costly — Phase 10's aggregation and the beta kit documentation refer to this file name.

**Day-7 / day-14 nudge**
- **D-11:** The Home banner appears **only when the learner's local-day offset from activation is
  exactly 7 or 14** (Phase 5's `dayOffset`/`dayKey` helpers, activation = offset 0). Before
  activation, or on any other offset, nothing renders.
- **D-12:** The reminder is non-blocking (an inline banner like the existing durability banner — no
  modal, no route change) and carries two actions: the export action (D-02 link to the panel) and a
  dismiss control.
- **D-13:** Dismissal persists **per checkpoint** (`day7` and `day14` separately) in `localStorage`,
  so dismissing day 7 never suppresses day 14. Exporting also silences the current checkpoint: the
  download handler records "exported at offset N" and the banner for N is hidden from then on.
  All storage access is guarded for non-browser environments.
- **D-14:** The banner does not create learning events and does not write meaningful rows; the only
  side effects are the local export/dismiss markers. `getBetaProfile()` may be called read-through
  (it creates the singleton with `activated_at: null` when absent, by design) but a profile without
  `activated_day` shows no banner.

**Testing and i18n**
- **D-15:** Tests stay in the existing Studio harness: `.test.js` files (not `.test.jsx`), Node
  environment, `react-dom/server` `renderToString` for render assertions plus direct calls to pure
  helpers exported from the panel/Home module (payload build, filename, nudge state, provider
  category, capstone summary, preview text). No jsdom, no testing-library, and **no change to
  `test.include`** (a second ownership exception is not wanted).
- **D-16:** New copy lives only in the new `betaReport` namespace (`en`/`vi`), addressed as
  `betaReport.*`. Existing namespace files are never edited; the Home banner uses `betaReport.*`
  keys too (the namespace is the report feature, wherever it is rendered).

### Claude's Discretion
- Card layout, button variants, whether the summary is a definition list or a compact grid, and
  the exact English/Vietnamese wording (subject to D-16).
- Whether helpers live in the panel module or a sibling module under
  `studio/src/components/data/` **as long as no unlisted file is added** — the default is to export
  them from `BetaReportPanel.jsx`/`Home.jsx` themselves.
- Ordering of summary rows and how numbers are rendered (raw counts only, never percentages).

### Deferred Ideas (OUT OF SCOPE)
- Copy-to-clipboard and a "download every report" history — not needed; one file per checkpoint.
- Showing the report on Home inline (instead of linking to Settings) — the nudge is enough.
- Recording an export as a learning event or a new table — explicitly out of scope (no migration,
  and exporting is not a meaningful learning action per Phase 5 D-01).
- Percentages or cohort comparisons in the panel — raw counts only, aggregation belongs to Phase 10.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INSTR-05 | Learner can preview and download a beta report JSON (schemaVersion, random local participant id, report window with active-day offsets, activation, learning loops, retention, capstone, app version, storage kind) that is strictly schema-validated and verified content-free | §3 (payload builder over the frozen Phase 5 API), §4 (`__APP_VERSION__` injection proven in build + both test runners), §6 (byte-equality proof, content-free sentinel test), §7 (capstone assembly from `listCourses`/`getCapstone`/`listCapstoneSubmissions`) |
| INSTR-06 | Home shows a non-blocking reminder to export the beta report on day 7 and day 14 | §8 (activation offset via `dayKey` + `dayOffset`, per-checkpoint localStorage markers, banner mirroring `Layout`), §9 (query-string routing + `scrollIntoView` safety) |
</phase_requirements>

## 1. Standard stack (all pre-installed — zero dependency changes)

| Library | Version | Purpose | Confirmed |
|---|---|---|---|
| react / react-dom | ^19.3.1 | `createElement`, `renderToString` in tests | `studio/package.json` |
| vite | ^8.3.4 | `define` injection, build | `node_modules` |
| vitest | ^5.0.4 | test runner, `environment: 'node'` | `studio/vite.config.js:34` |
| zod | ^4.6.7 | `reportSchema.safeParse` (Phase 5) | `studio/src/lib/beta/report.js:9` |

No installs. `studio/package.json` and all lockfiles are owned by Phase 1 — Phase 7 must not touch
them.

## 2. Exact frozen API surface to compose (file:line)

Everything below is read-only for Phase 7.

### Report + metrics (`studio/src/lib/beta/`)

| Symbol | Signature | Notes |
|---|---|---|
| `buildBetaReport` | `({ events = [], profile = null, revisionLinks = [], now = new Date(), app = {version:'',storage:'memory',provider:null}, capstone = {started:false,submissions:0,externalEvidence:0,verdict:null} }) => object` | **sync**, returns `reportSchema.parse(...)` (`report.js:87-134`); throws when `profile.participant_id` is null (`report.js:95`) |
| `reportSchema` | zod strict object | `schemaVersion: z.literal(1)`; every nested object strict (`report.js:24-62`) |
| `computeMetrics` | `({ events, profile, now }) => { activation, generatedAtDayOffset, window, loops, retention }` | sync, pure (`metrics.js:97`) |
| `dayOffset` | `(day: 'YYYY-MM-DD', activatedDay: 'YYYY-MM-DD') => number \| null` | calendar-day diff, clamps negatives to 0 (`metrics.js:48`) |
| `dayNumber` | `(day) => number \| null` | validation helper (`metrics.js:22`) |

`reportSchema` closed enums (do not exceed them):
- `app.storage`: `indexeddb | sqlite | memory | remote`
- `app.provider`: `null` or `/^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/` (`report.js:13`)
- `app.version`: `z.string().max(32)` — `''` is valid (this is why D-04's fallback is safe)
- `capstone.verdict`: `null | 'course_complete' | 'needs_work'`
- `loops.byKind`: exactly the six `EVENT_KINDS` (`repo/events.js:9-16`)

### Repository read API (`studio/src/lib/repo/index.js`) — all `async`

| Symbol | Returns | Line |
|---|---|---|
| `listEvents({kind,day,surface,courseId,lessonId,includeDeleted})` | all non-deleted events, `created_at` asc | 1087 |
| `getBetaProfile()` | singleton row `{ id:'local', participant_id, activated_at, activated_day }`; **creates it (activated_at null) when absent** | 1022 |
| `listRevisionLinks({surface,courseId,lessonId,attemptId,revisedId,linkKind})` | all links, `created_at` asc | 1108 |
| `listCourses()` | course rows (no lessons), `updated_at` desc | 299 |
| `getCapstone(courseId)` | decoded capstone or `null` (at most one per course) | 861 |
| `listCapstoneSubmissions(capstoneId)` | decoded rows, `attempt` asc | 966 |
| `getAdapterInfo()` | `{ kind: 'indexeddb' \| 'memory' \| 'remote', persistent, path?, schemaVersion? }` | 65; `remote-adapter.js:151` |
| `onChange(handler)` | unsubscribe fn; `detail.table` | 51 |

**Capstone submission row shape** (`decodeCapstoneSubmission`, `index.js:846-854`):
`{ id, owner_id, capstone_id, attempt:number, content_md, repo_url, files, testResults, review, verdict, external_id, created_at, updated_at, deleted_at }`.
`testResults` is JSON-parsed from `test_results_json` → `testResults?.source === 'external'` is the
marker Phase 5's emitter uses (`index.js:947`). `attempt` is `max(existing)+1` (`index.js:927`), so
"most recent" = highest `attempt` (also the last array element).

### Download + day helpers

| Symbol | Signature | Line |
|---|---|---|
| `download` | `(filename, text, type = 'application/json') => void` — `new Blob([text])`, `URL.createObjectURL`, hidden `<a download>`, click, revoke | `course-export.js:16-26` |
| `dayKey` | `(date = new Date()) => 'YYYY-MM-DD'` (local calendar) | `course.js:184` |
| `useT` | `() => (key, params?) => string` | `i18n/index.js:140` |
| `translate` | `(language, key, params?) => string` — use in tests for language-independent assertions | `i18n/index.js:100` |

### Provider category inputs (`studio/src/lib/ai/catalog.js`, `settings.js`)

- `settings.provider ∈ {anthropic, openai, ollama, bridge}`, default `'anthropic'` (`settings.js:52,75-96`).
- `settings.bridge.agent ∈ {claude, opencode, cursor, gemini, antigravity, ollama}` (`catalog.js:56-113`), default `'claude'` (`catalog.js:43`).
- `settings.openai.preset ∈ {openai, openrouter, groq, lmstudio, custom}` (`catalog.js:26-30`), default `'openai'`.
- Every one of those ids is inside the schema's closed enum → the mapping `bridge:<agent>` /
  `byok:<preset>` / `byok:ollama` / `byok:anthropic` never needs a translation table, only a guard.

## 3. Recommended module design (the seams)

One file owns the feature so there is a single source of truth and no unlisted file is added
(D-15 discretion). `Home.jsx` imports only what it needs.

### 3.1 `BetaReportPanel.jsx` — exported surface

```js
// constant, module scope (D-03/D-04)
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

export function appVersion(value = APP_VERSION)            // () -> string, never throws
export function providerCategory(settings)                 // (settings) -> string|null
export async function assembleCapstoneSummary(courses)     // (courseRows) -> {started,submissions,externalEvidence,verdict}
export async function buildBetaReportPayload(options)      // {now?,settings?} -> {report,json,filename}
export function buildReportExport(report)                  // (report) -> {report,json,filename}; throws on schema failure
export async function exportBetaReport(options)            // payload + download() + recordExport(offset)
export function BetaReportPreview(props)                   // presentational, SSR-safe
export function BetaReportPanel()                          // container: button -> preview -> download
export const NUDGE_CHECKPOINTS = [7, 14];
export function markerKey(kind, offset)                    // 'professor-studio:beta-report-{exported|dismissed}:<n>'
export function readNudgeMarkers(storage?)                 // -> {dismissed:[7], exported:[14]}
export function writeNudgeMarker(kind, offset, storage?)   // guarded setItem
export function activationOffset(profile, now?)            // -> number|null
export function nudgeVisible({offset, dismissed, exported}) // -> 7|14|null
export function BetaReportNudge({ checkpoint, onDismiss }) // presentational banner
```

`buildBetaReportPayload` in full — this is the "compose, don't re-implement" core:

```js
export async function buildBetaReportPayload({ now = new Date(), settings = loadSettings() } = {}) {
  const [events, profile, revisionLinks, adapter, courses] = await Promise.all([
    listEvents(), getBetaProfile(), listRevisionLinks(), getAdapterInfo(), listCourses(),
  ]);
  return buildReportExport(
    buildBetaReport({
      events,
      profile,
      revisionLinks,
      now,
      app: { version: appVersion(), storage: adapter?.kind ?? 'memory', provider: providerCategory(settings) },
      capstone: await assembleCapstoneSummary(courses),
    })
  );
}
```

`buildReportExport` is the D-07 gate — validate **before** anything becomes downloadable:

```js
export function buildReportExport(report) {
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw Object.assign(new Error(`Beta report failed schema validation — ${detail}`), { code: 'beta_report_invalid' });
  }
  const data = parsed.data;
  return {
    report: data,
    json: JSON.stringify(data, null, 2),
    filename: `professor-beta-report-${String(data.participantId).slice(0, 8)}-d${data.generatedAtDayOffset}.json`,
  };
}
```

`providerCategory` — defensive, never emits a value the schema rejects:

```js
const PROVIDER_CATEGORY_RE =
  /^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/;

export function providerCategory(settings = {}) {
  const provider = settings?.provider;
  let candidate = null;
  if (provider === 'bridge') candidate = `bridge:${settings?.bridge?.agent || 'claude'}`;
  else if (provider === 'openai') candidate = `byok:${settings?.openai?.preset || ''}`;
  else if (provider) candidate = `byok:${provider}`;
  return candidate && PROVIDER_CATEGORY_RE.test(candidate) ? candidate : null;
}
```

The regex is duplicated from `report.js:13` (that file is not owned). Kill the drift risk with a
test that feeds every reachable `(provider, agent/preset)` combination through `providerCategory`
and asserts `reportSchema` accepts the result (§10, T-1e).

### 3.2 `DataPanel.jsx` mount (file:line)

`DataPanel` currently returns a single `<Card className="space-y-4">…</Card>` (`DataPanel.jsx:168-237`).
Change the return to a fragment with the existing card plus the new panel:

```jsx
return (
  <>
    <Card className="space-y-4">…unchanged…</Card>
    <BetaReportPanel />
  </>
);
```
`Settings.jsx:65` renders `<DataPanel />` inside `<section className="space-y-3">`, so two sibling
cards stack with the existing gap — no CSS work needed. Add
`import { BetaReportPanel } from './BetaReportPanel.jsx';` next to the other imports.

### 3.3 `BetaReportPanel` container behaviour

- Initial state: a single `Button` (`t('betaReport.open')`) — nothing is read until the learner
  clicks (keeps Settings light, and keeps `renderToString` free of async work).
- On click: `busy` → `buildBetaReportPayload()` → on success `setPayload(...)`, on failure
  `setError(err.message)`.
- Preview: `<BetaReportPreview payload={payload} onDownload={...} busy={busy} error={error} />`.
- Download: `exportBetaReport()` re-uses `buildBetaReportPayload` **only if** you want a fresh
  report at click time; simpler and equally correct for D-06 is
  `download(payload.filename, payload.json, 'application/json')` + `writeNudgeMarker('exported', payload.report.generatedAtDayOffset)`.
  Use the latter — it guarantees the bytes the learner previewed are the bytes on disk.
- `<Card id="beta-report" className="space-y-4">` — `Card` forwards `...rest` to the element
  (`Card.jsx:2-8`), so the scroll target works.

### 3.4 `BetaReportPreview` render shape (CSP-safe, SSR-testable)

```jsx
export function BetaReportPreview({ payload, onDownload, busy, error }) {
  const t = useT();
  if (error) return <p role="status" className="text-sm text-red-600 dark:text-red-400">{t('betaReport.error')} {error}</p>;
  if (!payload) return null;
  const { report, json, filename } = payload;
  return (
    <div className="space-y-3">
      <dl className="grid gap-1 text-sm sm:grid-cols-2">{/* summary rows, raw counts only */}</dl>
      <p className="text-xs text-neutral-500">{t('betaReport.everythingInFile')}</p>
      <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800"><code>{json}</code></pre>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onDownload} disabled={busy}>{t('betaReport.download')}</Button>
        <span className="text-xs text-neutral-500">{filename}</span>
      </div>
    </div>
  );
}
```

The Download button only exists after `buildReportExport` succeeded, which is D-07's
"never writes a partial file" by construction.

## 4. `__APP_VERSION__` — verified behaviour and the mandatory guard

### 4.1 What was executed (not recalled)

| Probe | Command | Result |
|---|---|---|
| `define` reaches test modules | temp `vite.probe.config.js` with `define: {__APP_VERSION__: JSON.stringify('9.9.9-probe')}` + a guarded module, `npx vitest run --config vite.probe.config.js` | **`"9.9.9-probe"`** — define applies to test-transformed source |
| Same probe through the root aggregate config | `npx vitest run --project studio zz-probe` (repo root) | **`"FALLBACK"`** — define does **not** apply |
| Unguarded module-scope reference, studio config | `export const BARE = __APP_VERSION__` imported by a test | **`ReferenceError: __APP_VERSION__ is not defined`** |
| Unguarded reference, root aggregate | same file, `--project studio` | **same ReferenceError** |
| `import.meta.url` inside `studio/vite.config.js` | logged, then `npx vitest run` **and** `npx vite build` | `file:///…/studio/vite.config.js` in both → `new URL('../package.json', import.meta.url)` = the **root** package.json |
| End-to-end build injection | temp `define` + temp `console.log(APP_VERSION_PROBE)` in `main.jsx`, `npx vite build` | emitted chunk contains `BUILD_VERSION_MARKER` followed by the literal `1.6.0-beta.1` — build injection works |

### 4.2 The consequence for the plan (non-negotiable)

- CI runs `npm test` **at the repo root** (`.github/workflows/ci.yml:47`), which uses
  `vitest.config.js` → `test.projects` → the studio project `{ root: './studio', extends: true }`
  and **never loads `studio/vite.config.js`**. So `__APP_VERSION__` is undefined in CI.
- `npm --prefix studio test` **does** load `studio/vite.config.js` and does define it.
- Therefore: **always** write `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''`.
  A bare identifier is a green-local / red-CI trap (proven above).
- Do **not** "fix" this by adding `define` to the root `vitest.config.js` — that file belongs to
  Phase 4, and Phase 7 has no ownership exception for it.
- Do **not** write a test asserting `appVersion() === rootVersion`; it passes under
  `npm --prefix studio test` and fails under `npm test`. Assert against `config.define` instead.

### 4.3 Exact `studio/vite.config.js` edit (the single approved exception)

```js
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The ONE app version (Phase 7 D-03): the root package.json `version`, never studio/package.json's
 * stale `0.1.0` (D-05). `import.meta.url` is the real config path under `vite build` and Vitest, so
 * `../package.json` resolves to the repository root in every runner (verified).
 */
export const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  ),
};

export default defineConfig({
  define: APP_VERSION_DEFINE,   // new line
  plugins: [ /* unchanged */ ],
  base: './',
  server: { port: 5180, host: true },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
```

Why `readFileSync` + `JSON.parse` rather than `import pkg from '../package.json' with { type: 'json' }`:
import attributes warn as experimental on several Node 20/22 releases and are unsupported on older
Node; `readFileSync` is silent everywhere and accepts a `URL` directly.

`export const APP_VERSION_DEFINE` exists purely so the anti-drift test can read the value in both
runners without depending on the injection having happened. `defineConfig` is the identity
function, so `config.define` is readable from the imported default export — the same trick
`settings-csp.test.js:10,101-105` already uses for `config.plugins`.

Existing test that imports this file (and will keep passing): `studio/test/settings-csp.test.js`
asserts `config.plugins.find(p => p.name === 'studio-dev-csp')` and `plugin.apply === 'serve'`.
Adding `define` does not disturb it.

## 5. i18n: the new `betaReport` namespace

- Loader: `import.meta.glob('./{en,vi}/*.json', { eager: true })` (`i18n/index.js:36`) →
  `mergeCatalogModules` regex `^\.\/([^/]+)\/([^/]+)\.json$` (`index.js:25`). A new
  `en/betaReport.json` + `vi/betaReport.json` pair is picked up with **zero** `index.js` changes.
  Verified present in both runners (ran `i18n-catalogs.test.js` via `--project studio` at the repo
  root **and** in `studio/`: 5/5 pass each, so the eager glob works in Node without
  `studio/vite.config.js`).
- Shape: flat JSON with dotted access, nested objects allowed (`en/data.json` uses `kind.*`).
  `t('betaReport.nudge.day7')` resolves through `lookup()` (`index.js:56-64`).
- Constraints enforced by existing tests (both must stay green):
  - `test/i18n-keys.test.js:28-38` regex-scans `src/**` (skipping `src/lib/i18n`) for **literal**
    `t('…')` first arguments and requires each key in **both** `en` and `vi`. So: every literal key
    used must be added to **both** new files. Prefer literals over dynamic keys —
    `{checkpoint === 7 ? t('betaReport.nudge.day7') : t('betaReport.nudge.day14')}` is stronger
    than a template literal, because the scanner then proves the key exists.
  - `test/i18n-catalogs.test.js:41-76` requires the same namespace **file set** per language and
    identical flattened key sets; `REQUIRED_NAMESPACES` (18-39) is a subset assertion, so adding
    `betaReport` needs no edit there.
- Do not reuse `data.kind.*` for the storage label: it exists in `en/data.json` but editing that
  file is forbidden by D-16, and it has no `sqlite` member. Add
  `betaReport.storage.{indexeddb,sqlite,memory,remote}`.
- Suggested key set (wording is discretion): `title`, `subtitle`, `open`, `preview`, `download`,
  `everythingInFile`, `error`, `downloading`, `summary.{activation,window,loops,revisions,retention,capstone,version,storage,session}`, `storage.*`,
  `values.{activated,notActivated,started,notStarted,yes,no}`, `kinds.*` (six event kinds),
  `nudge.{day7,day14,action,dismiss}`.

## 6. Testability without jsdom (the patterns this repo already uses)

| Problem | Repo pattern | File |
|---|---|---|
| Render a component in Node | `renderToString(createElement(C, props))` | `tutor-panel.render.test.js:16`, `settings-provider-form.test.js:29` |
| Assert localized copy without touching `setLanguage` | `expect(html).toContain(translate('en', 'key'))` | `settings-provider-form.test.js:37` |
| Provide `localStorage` | `globalThis.localStorage = mockLocalStorage({...})` + `delete` in `afterEach` | `i18n-render.test.js:12-35` |
| Intercept `download()` | stub `globalThis.URL.createObjectURL/revokeObjectURL` + `globalThis.document` | `course-export.test.js:14-35` |
| Isolate the repo | `repo.useAdapter(createMemoryAdapter())` in `beforeEach` | `beta-privacy.test.js:18-20` |
| Prove content-free | sentinel strings in seeds, then `expect(serialized).not.toContain(...)` | `beta-privacy.test.js:6-41` |

### 6.1 Capturing the downloaded bytes (verified)

`download()` builds `new Blob([text], …)` first, so overriding the Blob constructor captures the
exact text. Ran this against the real helper:

```
globalThis.Blob = class { constructor(parts, opts) { captured = { text: parts.join(''), opts }; } };
globalThis.URL.createObjectURL = () => 'blob:mock';
globalThis.URL.revokeObjectURL = () => {};
globalThis.document = { body: { appendChild(){} }, createElement: () => ({ click(){ clicked.push(this.download); }, remove(){} }) };
download('x.json', '{"a":1}');
// => captured { text: '{"a":1}', opts: { type: 'application/json' } } ; clicked ['x.json']
```

Restore all four globals in `afterEach` (`delete globalThis.Blob` would remove a real global —
save and restore the original instead).

### 6.2 Byte-equality: `renderToString` escapes quotes (verified)

```
renderToString(<pre>{'{"a":"x","c":"<tag>","d":"it\'s"}'}</pre>)
=> "<pre>{&quot;a&quot;:&quot;x&quot;,&quot;c&quot;:&quot;&lt;tag&gt;&quot;,&quot;d&quot;:&quot;it&#x27;s&quot;}</pre>"
```

React escapes `&` `<` `>` `"` `'`. So the byte-equality assertion needs an unescape helper in the
test (order matters — `&amp;` last):

```js
const unescape = (html) => html
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
```

### 6.3 The recommended byte-equality test (proves D-06 in one shot)

```js
const payload = await exportBetaReport({ now: fixedNow });   // real function under test
expect(captured.text).toBe(payload.json);                    // bytes on disk === payload.json
expect(captured.filename).toBe(payload.filename);
const html = unescape(renderToString(createElement(BetaReportPreview, { payload })));
expect(html).toContain(payload.json);                        // preview === bytes on disk
```

Because both sides derive from the same returned `payload`, this is a true byte-for-byte proof:
"what you see" and "what you saved" cannot drift.

## 7. Capstone summary assembly (D-09)

```js
export async function assembleCapstoneSummary(courses = []) {
  const summary = { started: false, submissions: 0, externalEvidence: 0, verdict: null };
  let latestAttempt = -1;
  for (const course of courses) {
    const capstone = await getCapstone(course.id);
    if (!capstone) continue;
    summary.started = true;
    for (const row of await listCapstoneSubmissions(capstone.id)) {
      summary.submissions += 1;
      if (row?.testResults?.source === 'external') summary.externalEvidence += 1;
      const attempt = Number(row?.attempt ?? 0);
      if (attempt >= latestAttempt) {
        latestAttempt = attempt;
        const verdict = row?.verdict;
        summary.verdict = verdict === 'course_complete' || verdict === 'needs_work' ? verdict : null;
      }
    }
  }
  return summary;
}
```

Notes:
- Sequential `getCapstone` per course is deliberate: it is 1–5 courses in practice and avoids a
  burst of adapter transactions; keep it inside the payload builder (not the render path).
- The verdict guard matters: an out-of-enum value would make `reportSchema` throw and brick the
  report for that learner forever (D-07 would show an error with no way out). Coercing to `null`
  is the only failure mode that keeps the file valid.
- `content_md`, `repo_url`, `files`, `review` are **never** copied — only the four scalars above.

## 8. The Home nudge (INSTR-06)

### 8.1 Pure predicates (testable with zero clock or storage)

```js
export const NUDGE_CHECKPOINTS = Object.freeze([7, 14]);
const MARKER_PREFIX = 'professor-studio:beta-report';

export function markerKey(kind, offset) {                 // 'exported' | 'dismissed'
  return `${MARKER_PREFIX}-${kind}:${offset}`;
}

export function readNudgeMarkers(storage = safeStorage()) {
  const out = { dismissed: [], exported: [] };
  for (const kind of ['dismissed', 'exported']) {
    for (const offset of NUDGE_CHECKPOINTS) {
      try { if (storage?.getItem?.(markerKey(kind, offset)) === '1') out[kind].push(offset); } catch { /* ignore */ }
    }
  }
  return out;
}

export function activationOffset(profile, now = new Date()) {
  if (!profile?.activated_day) return null;
  return dayOffset(dayKey(now), profile.activated_day);   // null when either side is malformed
}

export function nudgeVisible({ offset, dismissed = [], exported = [] } = {}) {
  if (!NUDGE_CHECKPOINTS.includes(offset)) return null;
  if (dismissed.includes(offset) || exported.includes(offset)) return null;
  return offset;                                          // 7 | 14 | null
}
```

`dayOffset` already clamps pre-activation days to 0 (`metrics.js:52`), so a clock skew can never
produce `-1`.

### 8.2 Banner markup — mirror `Layout.jsx:90-105`

`Layout`'s durability banner: outer
`border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`,
inner `flex … items-center justify-between gap-3`, dismiss is a plain
`<button type="button" className="shrink-0 text-xs opacity-70 hover:opacity-100">`. On Home the
banner sits in the content column, so use the rounded-card variant of the same palette:

```jsx
<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
  <div className="flex items-start justify-between gap-3">
    <span>
      {checkpoint === 7 ? t('betaReport.nudge.day7') : t('betaReport.nudge.day14')}{' '}
      <Link to="/settings?report=1" className="underline">{t('betaReport.nudge.action')}</Link>.
    </span>
    <button type="button" onClick={onDismiss} className="shrink-0 text-xs opacity-70 hover:opacity-100">
      {t('betaReport.nudge.dismiss')}
    </button>
  </div>
</div>
```

- `Link` renders a real `<a href="#/settings?report=1">` (`router.js:69-71`) → middle-click and
  copy-link keep working (D-02), and no modal/route change (D-12).
- Insert the banner in `Home.jsx` between the header row (ends line 59) and the
  `courses === null` loading line (line 61) — it must not be gated on `courses`.
- `role="status"` is optional; the durability banner uses none. Keep it non-modal (no
  `role="alert"`, no focus trap) — D-12.

### 8.3 Home container wiring

```jsx
const [nudge, setNudge] = useState(null);
useEffect(() => {
  let alive = true;
  getBetaProfile()
    .then((profile) => {
      if (!alive) return;
      setNudge(nudgeVisible({ offset: activationOffset(profile), ...readNudgeMarkers() }));
    })
    .catch(() => { /* no profile, no banner */ });
  return () => { alive = false; };
}, []);
```

- `getBetaProfile()` creating the singleton with `activated_at: null` is explicitly allowed
  (D-14, `index.js:1022-1028`). **Never** call it at module scope or inside render.
- Do not fold this into the existing `onChange` refresh (line 31-33): that fires on every course
  write and the profile only changes once.
- Dismiss handler: `writeNudgeMarker('dismissed', nudge)` then `setNudge(null)`.
- Export (in the panel): `writeNudgeMarker('exported', payload.report.generatedAtDayOffset)`.
  Offsets 7 and 14 are the only ones the banner checks, so exporting on day 9 writes a marker that
  is inert — harmless and matches D-13.

### 8.4 localStorage guard (repo convention + Node 26 reality)

Node 26 exposes `globalThis.localStorage` as a getter that emits
`ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`
on **first access** and returns `undefined`. `typeof localStorage === 'undefined'` therefore works
but prints once per worker (the suite already prints this today). Consequences:

- Keep storage access inside functions, never at module scope (a module-scope touch warns at import
  time in all 55 test files).
- Wrap `getItem`/`setItem` in `try/catch` as `settings.js:174-207` and `Layout.jsx:43-50` do — a
  Safari private-mode `QuotaExceededError` must not break Home.
- Provide a `safeStorage()` helper that returns `undefined` in Node so
  `readNudgeMarkers(storage = safeStorage())` is injectable from tests without touching globals.

## 9. Router, `?report=1` and `scrollIntoView`

### 9.1 Query strings are already tolerated (verified by reading the parser)

`matchRoute` (`router.js:30-43`): `String(hash).replace(/^#/, '').split('?')[0] || '/'` — the query
is stripped **before** matching. So `#/settings?report=1` → `{ name: 'settings', path: '/settings', params: {} }`.
`Link` prefixes `#` and a leading `/` only (`router.js:70`), so `<Link to="/settings?report=1">` →
`href="#/settings?report=1"` unchanged.

No interference with pairing: `parsePairingHash` (`settings.js:228-247`) finds `?`, reads
`bridge`/`token` (both empty) and returns `null`, so `applyPairingFromUrl` on `hashchange` neither
saves nor scrubs.

### 9.2 Reading the marker in `Settings.jsx` (pure + guarded)

```js
/** @param {string} [hash] */
export function reportRequested(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  const at = raw.indexOf('?');
  if (at === -1) return false;
  return new URLSearchParams(raw.slice(at + 1)).get('report') === '1';
}

/** @param {Document|null} [doc] */
export function scrollToBetaReport(doc = typeof document !== 'undefined' ? document : null) {
  const el = doc?.getElementById?.('beta-report');
  if (!el || typeof el.scrollIntoView !== 'function') return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
```

- Both are pure enough to unit-test: `reportRequested` with `#/settings?report=1`, `#/settings`,
  `#/settings?report=0`, `#/settings?bridge=x&token=y&report=1`; `scrollToBetaReport` with a fake
  `doc` (`{ getElementById: () => ({ scrollIntoView: spy }) }`).
- Call them from `useEffect(() => { if (reportRequested(window.location.hash)) scrollToBetaReport(); }, [])`.
  Effects never run under `renderToString`, so the Node test environment never touches `document` /
  `window` — the existing `settings.js:342` module-level `typeof window !== 'undefined'` guard is
  the same convention.
- The "Beta report" link near the Storage heading must be a `<button type="button" onClick={…}>`,
  **not** `<a href="#beta-report">`: the hash router owns the fragment and would parse
  `#beta-report` as a route → `notfound` (`App.jsx` `default: <NotFound />`). This is the single
  easiest way to break the phase.
- Leave `?report=1` in the URL (do not scrub): it is not a secret, and scrubbing would need
  `history.replaceState` for zero benefit. Consequence: pressing the nav "Settings" link later
  (`#/settings`) does not re-scroll, and revisiting the deep link re-scrolls — both correct.

### 9.3 `scrollIntoView` in the test environment

Never executed in tests (effects are skipped by `renderToString`, and the helper takes an injected
`doc`). `scrollIntoView` exists in every Chromium/Safari/Firefox build; the
`typeof el.scrollIntoView === 'function'` guard covers the SSR/preview-document edge.

## 10. Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 (`studio/vite.config.js` → `test: { environment: 'node', include: ['test/**/*.test.js'] }`) |
| Config file | `studio/vite.config.js` (with `define`) **or** root `vitest.config.js` `projects[studio]` (**without** `define`) — both must pass |
| Quick run command | `npx vitest run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js` (from `studio/`) |
| Full suite command | `npm --prefix studio test` (from repo root) **and** `npm test` (root aggregate = what CI runs) |
| Baseline today | 55 files / 527 tests, ~2.5 s wall, all green (`npx vitest run` in `studio/`) |
| New files | `studio/test/beta-report-panel.test.js`, `studio/test/beta-report-panel-nudge.test.js` (both match the owned `beta-report-panel*` glob) |

### Phase Requirements → Test Map

| ID | Test | Req | Behavior proved | Type | Command | Exists? |
|----|------|-----|-----------------|------|---------|---------|
| T-1a | `buildBetaReportPayload returns a schema-valid report from repo rows` | INSTR-05 | `reportSchema.safeParse(report).success === true`; `schemaVersion === 1`; `participantId` is a UUID | unit | `npx vitest run test/beta-report-panel.test.js` | ❌ Wave 0 |
| T-1b | `filename uses the first 8 chars of the participant id and the day offset` | INSTR-05 | `professor-beta-report-<pid8>-d<N>.json`, `<pid8> === participantId.slice(0,8)` | unit | same | ❌ Wave 0 |
| T-1c | `buildReportExport throws on schema failure and never yields a payload` | INSTR-05 / D-07 | corrupted report → throw with `code: 'beta_report_invalid'`; no `{json, filename}` produced | unit | same | ❌ Wave 0 |
| T-1d | `payload is content-free` | INSTR-05 / INSTR-02 | seed course/lesson/capstone/submission with sentinel title, prompt, code, `content_md`, `repo_url`, `sk-live-…`; assert none appear in `payload.json` | unit | same | ❌ Wave 0 |
| T-1e | `providerCategory never emits a value the schema rejects` | INSTR-05 / D-08 | every `provider` × `agent`/`preset` pair → `reportSchema` accepts; unknown id → `null` | unit | same | ❌ Wave 0 |
| T-1f | `assembleCapstoneSummary counts courses, submissions, external evidence and the latest verdict` | INSTR-05 / D-09 | 2 courses (1 with capstone), 3 submissions (1 external), verdict from highest `attempt`; out-of-enum verdict → `null` | unit | same | ❌ Wave 0 |
| T-1g | `storage kind comes from getAdapterInfo().kind` | INSTR-05 / D-08 | memory adapter → `report.app.storage === 'memory'` | unit | same | ❌ Wave 0 |
| T-1h | `preview shows exactly the bytes it downloads` | INSTR-05 / D-06 | `exportBetaReport()` → captured Blob text `=== payload.json`; unescaped `renderToString(BetaReportPreview)` contains `payload.json` | unit (SSR + DOM stub) | same | ❌ Wave 0 |
| T-1i | `the panel renders the export action and the preview copy` | INSTR-05 | `renderToString(BetaReportPanel)` contains `translate('en','betaReport.open')`; `BetaReportPreview` with a payload contains `betaReport.everythingInFile` + the JSON | render smoke | same | ❌ Wave 0 |
| T-1j | `app.version is injected from the root package.json` | INSTR-05 / D-03 | `config.define.__APP_VERSION__ === JSON.stringify(rootPackage.version)`; `appVersion()` is a string; injected `version` lands in `report.app.version` | unit | same (**passes in both runners**) | ❌ Wave 0 |
| T-2a | `nudgeVisible only fires on offsets 7 and 14` | INSTR-06 | 0,1,6,8,13,15,`null` → `null`; 7 → 7; 14 → 14 | unit | `npx vitest run test/beta-report-panel-nudge.test.js` | ❌ Wave 0 |
| T-2b | `dismissal and export markers are per checkpoint` | INSTR-06 / D-13 | dismissed `[7]` hides 7, still shows 14; exported `[7]` hides 7 only; storage keys are distinct | unit | same | ❌ Wave 0 |
| T-2c | `activationOffset uses local calendar days and no banner before activation` | INSTR-06 / D-11 | `activated_day: null` → `null`; pinned `now` + `activated_day` → 7 / 14; clock before activation clamps to 0 (no banner) | unit (pinned clock) | same | ❌ Wave 0 |
| T-2d | `the banner links to the panel and carries a dismiss control` | INSTR-06 / D-12 | `renderToString(BetaReportNudge({checkpoint:7}))` contains `href="#/settings?report=1"`, `betaReport.nudge.day7`, `betaReport.nudge.dismiss` | render smoke | same | ❌ Wave 0 |
| T-2e | `reportRequested recognises the ?report=1 marker` | INSTR-06 / D-02 | `#/settings?report=1` → true; `#/settings` → false; `?report=0` → false | unit | same | ❌ Wave 0 |
| T-2f | `scrollToBetaReport is safe with no document` | INSTR-06 / D-02 | injected fake `doc` → `scrollIntoView` called with `{behavior:'smooth'}`; `null` doc → `false`, no throw | unit | same | ❌ Wave 0 |
| T-3 | `i18n coverage` | D-16 | existing `i18n-keys` + `i18n-catalogs` stay green with `betaReport.json` in both languages | unit | `npx vitest run test/i18n-keys.test.js test/i18n-catalogs.test.js` | ✅ existing |
| T-4 | `build still injects the version` | INSTR-05 / D-03 | `vite build` succeeds and the emitted chunk contains the root version string | build | `npx vite build --outDir /tmp/phase7-dist --emptyOutDir` (from `studio/`) | ❌ optional gate |

### Sampling Rate

- **Per task commit (from `studio/`):** `npx vitest run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js`
- **Per wave merge / before verify:** `npm --prefix studio test` **and** `npm test` from the repo root
  (the root aggregate is the only place the no-`define` path is exercised — it is the CI contract).
- **Phase gate:** both suites green, plus one `npx vite build` from `studio/`.
- **Max feedback latency:** ~3 s (full Studio suite is 2.5 s today).

### Exact commands (copy-paste)

```bash
# focused, from studio/
cd studio && npx vitest run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js

# i18n contract
cd studio && npx vitest run test/i18n-keys.test.js test/i18n-catalogs.test.js

# full Studio suite (studio vite config, define applied)
npm --prefix studio test

# full aggregate (CI path, define NOT applied — must still be green)
npm test

# build gate (define injection + CSP unchanged)
cd studio && npx vite build --outDir /tmp/phase7-dist --emptyOutDir
```

### Wave 0 Gaps

None — existing infrastructure covers every requirement (Vitest 5 node env, `renderToString`
smoke pattern, `translate()` assertions, memory adapter, DOM/Blob stubs). Only two new test files
and two new i18n files are needed; `test.include` is not changed.

## 11. Don't hand-roll

| Problem | Don't build | Use | Why |
|---|---|---|---|
| Counting events / offsets / retention | a second metrics pass in the panel | `buildBetaReport` (`report.js:87`) | Phase 5's schema is the cross-phase contract; a second implementation drifts |
| Local calendar-day math | `Math.floor((b-a)/86400000)` | `dayKey` + `dayOffset` (`course.js:184`, `metrics.js:48`) | DST, UTC+7 early morning, pre-activation clamping are already solved and tested (Pitfall 9) |
| Version string | hardcode `1.6.0-beta.1`, or read `studio/package.json` (`0.1.0`) | `__APP_VERSION__` define (D-03) | Two sources always drift; D-05 forbids the stale field |
| File download | a data-URL + manual `<a>` | `download()` (`course-export.js:16`) | Same helper DataPanel uses; proven CSP-safe (blob URL + `download` attr is not a `connect-src` fetch) |
| i18n registration | touching `i18n/index.js` | two new `betaReport.json` files | D-16 + the eager glob (`index.js:36`) |
| Dismiss state | a new repo table/event | `localStorage` markers | D-13/D-14 forbid rows and events |
| Report JSON shape | a `toJSON`/`sanitize` layer | `reportSchema` (strict) | Unknown keys are rejected, not stripped (`report.test.js:51-72`) — that is the leak guard |

## 12. Common pitfalls for this phase

### Pitfall 1 — Bare `__APP_VERSION__` (green local, red CI) — **PROVEN**
**Goes wrong:** `const V = __APP_VERSION__` at module scope. `npm --prefix studio test` passes;
`npm test` at the root throws `ReferenceError: __APP_VERSION__ is not defined` because the studio
project in `vitest.config.js` never loads `studio/vite.config.js`.
**Avoid:** `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''` (D-04). Never add the
define to `vitest.config.js` (Phase 4 owns it).
**Warning sign:** the test passes locally but the `unit` CI job fails with `ReferenceError`.

### Pitfall 2 — The anti-drift test that only passes in one runner
**Goes wrong:** `expect(__APP_VERSION__).toBe(rootVersion)` — true under `npm --prefix studio test`,
false under `npm test`.
**Avoid:** assert on `config.define.__APP_VERSION__` from the imported `studio/vite.config.js`, plus
`expect(typeof appVersion()).toBe('string')`. Both are runner-independent (verified: the config
default export is the plain object, same trick as `settings-csp.test.js:101-105`).

### Pitfall 3 — `<a href="#beta-report">` breaks the router
**Goes wrong:** the hash router owns the fragment, so `#beta-report` becomes a route → `notfound`
(`App.jsx` default branch).
**Avoid:** `<button type="button" onClick={() => scrollToBetaReport()}>`, and `Link to="/settings?report=1"`
for the nudge.

### Pitfall 4 — Byte-equality test fails on HTML escaping
**Goes wrong:** `expect(html).toContain(payload.json)` fails because React renders `"` as `&quot;`
and `'` as `&#x27;` (verified).
**Avoid:** unescape before comparing (§6.2), and prefer comparing the Blob capture to
`payload.json` — that half needs no unescaping and is the stronger assertion.

### Pitfall 5 — Download written before validation (D-07 violated)
**Goes wrong:** render the Download button from `payload` built by `buildBetaReport`, then
`safeParse` inside the click handler — a partial/invalid file can be saved.
**Avoid:** `buildReportExport` validates first and is the only producer of `{json, filename}`;
`BetaReportPreview` renders Download only when `payload` exists.

### Pitfall 6 — Out-of-enum capstone verdict bricks the report
**Goes wrong:** `verdict: latestRow.verdict` passes through and `reportSchema` throws for that
learner on every future export.
**Avoid:** coerce to `null` unless it is exactly `course_complete` or `needs_work` (§7).

### Pitfall 7 — `app.storage === 'remote'` is the SQLite value
**Goes wrong:** the plan assumes a SQLite learner reports `'sqlite'`. `getAdapterInfo().kind` is
`'remote'` for the local server (`remote-adapter.js:151`); `'sqlite'` is only reachable via the
backup-health payload.
**Avoid:** identity-map per D-08 and label `remote` as "SQLite file (local server)" in
`betaReport.storage.*` — Phase 10's aggregator must accept `remote` too. Do not "translate"
`remote → sqlite` in the panel: that would be a silent contract change for Phase 10.

### Pitfall 8 — localStorage noise / crashes
**Goes wrong:** touching `globalThis.localStorage` at module scope prints an
`ExperimentalWarning` on import in every Node test worker (Node 26 here), and a private-mode
`setItem` can throw.
**Avoid:** inside functions only, `typeof … === 'undefined'` + `try/catch`, and an injectable
`storage` parameter so tests never need the global.

### Pitfall 9 — Extra i18n keys or keys only in one language
**Goes wrong:** a literal `t('betaReport.nudge.action')` without the `vi` entry fails
`i18n-keys.test.js:45-50`; a key only in `en` fails `i18n-catalogs.test.js:65-76`.
**Avoid:** add the pair together; prefer literal keys over template-literal keys so the scanner
covers them.

### Pitfall 10 — Nudge flicker or "always visible"
**Goes wrong:** initialising state from `readNudgeMarkers()` during render while the profile is
still loading, then rendering the banner before the offset is known.
**Avoid:** `useState(null)` + one effect; render nothing until `nudgeVisible` returns 7 or 14.
Also do not key the effect on `courses`/`onChange` — the profile changes once.

### Pitfall 11 — Filename collision
Same participant exporting twice on the same offset overwrites (`(1)` suffix in the browser).
Day 7 and day 14 never collide because `<N>` differs. Acceptable; note it in the panel copy? No —
out of scope. Just do not add a timestamp, which would break D-10's contract with Phase 10.

### Pitfall 12 — `renderToString` cannot prove the fetched state
`renderToString` skips effects, so a bare `<BetaReportPanel/>` render only shows the closed state.
Test the **opened** state through `BetaReportPreview` with an injected `payload` — that is why the
presentational component must be exported separately (D-15's "pure helpers" seam).

## 13. Open questions (with recommendations)

1. **`provider: null` semantics (D-08 wording "nothing is configured").**
   - What we know: the schema accepts `''` for version and `null` for provider; `settings.provider`
     has a default (`'anthropic'`), so a strict reading of "configured" (`configIssue`) would make
     the field null for every learner who never added a key.
   - Recommendation: derive from ids/presets only and return `null` only for an id/preset outside
     the closed enum. Deterministic, no `ai/config.js` import, and it never varies with whether a
     secret exists. If the planner prefers `configIssue(settings, provider) !== null → null`, it is
     a one-line change with the same test — both branches are covered by T-1e.

2. **Should the panel auto-open the preview when `?report=1` is present?**
   - What we know: D-02 limits `Settings.jsx` to scrolling ("Scrolling is the only behaviour added").
   - Recommendation: scroll only. One extra click from the nudge is acceptable and locked by D-02.

3. **`id="beta-report"` placement.**
   - Recommendation: on the panel's own `<Card>` (a wrapper inside `BetaReportPanel`), so the scroll
     target exists as soon as the panel mounts, independent of whether a payload has been built.

## 14. Implementation order the planner should use (suggested waves)

1. **Wave A (foundation, serial):** `studio/vite.config.js` define + `en/vi` `betaReport.json` +
   T-1j. Everything else depends on the namespace existing (i18n tests are global).
2. **Wave B (panel):** `BetaReportPanel.jsx` (pure chain + preview + container) + `DataPanel` mount
   + `test/beta-report-panel.test.js`.
3. **Wave C (navigation + nudge):** `Settings.jsx` (`reportRequested`/`scrollToBetaReport`/link),
   `Home.jsx` (container + banner import) + `test/beta-report-panel-nudge.test.js`.
4. **Gate:** `npm --prefix studio test`, `npm test`, one `npx vite build`.

Run the root `npm test` before declaring the phase done — it is the only runner that exercises the
no-`define` path.

## Sources

### Primary (HIGH confidence — executed in this worktree)
- `studio/src/lib/beta/report.js:13,24-62,87-134` — schema and builder, read directly.
- `studio/src/lib/beta/metrics.js:22,48,97-147` — `dayNumber`/`dayOffset`/`computeMetrics`.
- `studio/src/lib/repo/index.js:51,65,299,308,846-854,861,910-972,1022-1028,1059,1087,1108` — read/write API.
- `studio/src/lib/course-export.js:16-26` — `download()`; `course.js:184` — `dayKey`.
- `studio/src/lib/router.js:30-43,69-71` — query stripping and `Link`.
- `studio/src/lib/i18n/index.js:22-38,56-64,100-144` — glob, merge, `translate`, `useT`.
- `studio/src/lib/settings.js:52-96,174-207,228-247` — provider ids, guarded storage, pairing parser.
- `studio/vite.config.js:11-35`, `vitest.config.js` (root), `.github/workflows/ci.yml:47` — config/CI contract.
- `studio/test/{course-export,beta-privacy,beta-report,i18n-keys,i18n-catalogs,i18n-render,settings-csp,settings-provider-form,tutor-panel.render}.test.js` — house test patterns.
- Empirical probes executed and reverted (working tree verified clean with `git status --porcelain`):
  define-in-Vitest, define-under-root-aggregate, bare-reference `ReferenceError`, `import.meta.url`
  in the config under `vitest` and `vite build`, end-to-end build injection, `renderToString`
  escaping, `Blob` capture through `download()`.

### Secondary (MEDIUM confidence)
- `.planning/research/{SUMMARY,FEATURES,PITFALLS,ARCHITECTURE}.md` — design intent (non-blocking
  banner, "this is everything in the file", report export hidden in settings as the failure mode).
- `.planning/phases/05-beta-data-foundation/05-CONTEXT.md` D-08..D-11, `.planning/phases/06-studio-beta-debt/06-CONTEXT.md` D-06..D-09 — frozen upstream contracts.

### Tertiary (LOW confidence)
- None. No external library research was required: every dependency is already installed and every
  behaviour above was executed locally rather than recalled.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from `studio/package.json`; no new dependency.
- API surface: HIGH — signatures read at the cited lines, and Phase 5's own tests exercise them.
- `__APP_VERSION__` behaviour: HIGH — five separate probes executed, including the CI-path failure.
- Test seams: HIGH — `renderToString`, `Blob` capture and the DOM stub were all run in this session.
- Nudge/i18n/router: HIGH — read from source, plus `i18n-catalogs.test.js` run under both configs.
- Pitfalls: HIGH for 1–4 and 7–9 (executed), MEDIUM for 5/6/10/11 (derived from the frozen schema
  and code paths).

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (stable — no external moving parts; re-check only if `vitest.config.js`,
`studio/vite.config.js` or Phase 5's report schema change).
