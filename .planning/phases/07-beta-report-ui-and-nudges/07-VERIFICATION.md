---
phase: 07-beta-report-ui-and-nudges
verified: 2026-10-25T00:12:00Z
status: passed
score: 15/15 must-haves verified
re_verification: false
---

# Phase 7: Beta Report UI and Nudges Verification Report

**Phase Goal:** A beta learner can see exactly what their beta report contains and download it, and is reminded to do so at day 7 and day 14
**Verified:** 2026-10-25
**Status:** passed
**Re-verification:** No — initial verification (no prior `07-VERIFICATION.md` existed)

## Independent Evidence (run in this worktree, not taken from the SUMMARYs)

| Gate | Command | Actual result |
|---|---|---|
| Studio suite (define present) | `npm --prefix studio test` | **57 files / 586 tests passed**, 0 failed |
| Root aggregate (define absent) | `npm test` | **86 files / 1156 tests passed**, 0 failed, no `ReferenceError: __APP_VERSION__ is not defined` |
| Focused Phase 7 suites | `npm --prefix studio test -- --run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js` | **2 files / 59 tests passed** |
| Production build | `cd studio && npx vite build --outDir /tmp/phase7-verify-dist --emptyOutDir` | built in 755 ms; `1.6.0-beta.1` present **exactly once**, in `assets/BetaReportPanel-*.js` |
| Working tree | `git status --porcelain` | empty (build wrote only to `/tmp`) |

Root manifest version is `1.6.0-beta.1`; `studio/package.json` is `0.1.0` and is asserted **not** to be the source (D-05).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Settings ▸ Data renders an "Export beta report" card with stable `id="beta-report"`; nothing is read until the learner clicks | ✓ VERIFIED | `DataPanel.jsx:240` mounts `<BetaReportPanel />`; `BetaReportPanel.jsx:349` renders `<Card id="beta-report">`; closed state is one `Button` (`betaReport.open`) with no repo read; render test asserts `id="beta-report"` + `betaReport.open` and that `betaReport.download` is absent before a click |
| 2 | Clicking the export action previews a localized summary plus the exact pretty-printed JSON under "this is everything in the file" | ✓ VERIFIED | `BetaReportPreview` (`BetaReportPanel.jsx:196-288`) renders the `<dl>` summary, `t('betaReport.everythingInFile')`, and `<pre><code>{json}</code></pre>` (React text child, no `dangerouslySetInnerHTML`/`innerHTML` — asserted); test unescapes the SSR HTML and asserts it contains `payload.json` verbatim plus every summary/kind/storage label |
| 3 | Downloading saves `professor-beta-report-<pid8>-d<N>.json` whose bytes are byte-identical to the previewed JSON | ✓ VERIFIED | `buildReportExport` filename = `professor-beta-report-${String(data.participantId).slice(0,8)}-d${data.generatedAtDayOffset}.json`; `downloadReportPayload` writes `payload.filename`/`payload.json`; tests assert `captured.text === payload.json`, `clicked === [payload.filename]`, and pinned clocks yield `-d0`/`-d7`; the panel passes the *same* payload object to preview and handler |
| 4 | The saved JSON contains schemaVersion, a random participant id, report window with active-day offsets, activation, learning loops, retention, capstone, app version and storage kind, and passes strict schema validation | ✓ VERIFIED | Payload is produced only by frozen `buildBetaReport` → `reportSchema.parse` (strictObject, `schemaVersion: z.literal(1)`), then re-gated by `buildReportExport`'s `reportSchema.safeParse`; test asserts all nine top-level keys, UUID `participantId` (`crypto.randomUUID()` in `repo/index.js:28-31`), `app.storage === 'memory'` on the memory adapter, and `reportSchema.safeParse(...).success === true` |
| 5 | The saved JSON is content-free (no course text, prompt, code, answer, key, model name, provider URL, or course/lesson/capstone id) | ✓ VERIFIED | Sentinel test seeds title/description/lesson `content_md`/capstone `brief_md`/submission `content_md`/`repo_url` with `sk-live-…`, proves those strings are in `repo.exportAll()` (positive control), then asserts none — and no row id or `example.test` — appear in `payload.json`; `providerCategory` emits only closed-enum category strings |
| 6 | When validation fails, the panel shows a localized error, offers no download, and writes no bytes | ✓ VERIFIED | `buildReportExport` throws `code: 'beta_report_invalid'` before any `{json, filename}` exists; panel catches, sets `payload = null`; error branch of `BetaReportPreview` renders `role="status"` + `betaReport.error`/`betaReport.invalid` and no Download control (test asserts the download label is absent and schema detail is not echoed) |
| 7 | `app.version` comes from the ROOT `package.json` via `__APP_VERSION__` with the mandatory `typeof` guard, green in BOTH runners | ✓ VERIFIED | `studio/vite.config.js` exports `APP_VERSION_DEFINE` read from `new URL('../package.json', import.meta.url)` and adds `define: APP_VERSION_DEFINE`; panel uses `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''`; anti-drift test compares `config.define` to root version and asserts it is not `0.1.0`; both suites green (86/1156 root run with no ReferenceError) |
| 8 | Home shows a dismissible, non-blocking reminder at activation offsets exactly 7 and 14 only | ✓ VERIFIED | `NUDGE_CHECKPOINTS = Object.freeze([7,14])`; `nudgeVisible` returns the offset only for 7/14 and `null` for 0,1,6,8,13,15,21,-1,null,undefined; `activationOffset` returns `null` without `activated_day` and `dayOffset` clamps pre-activation to 0 (no banner); `Home.jsx:100` renders `BetaReportNudge` between the header row and the loading line; banner is an inline amber card with a plain dismiss `<button>`, no `role="alert"`/dialog/focus trap (asserted) |
| 9 | Dismissing day 7 persists per checkpoint and never suppresses day 14 | ✓ VERIFIED | `markerKey('dismissed',7) !== markerKey('dismissed',14)`; `Home.jsx:75` writes `dismissed:<offset>`; `readNudgeMarkers` reads both checkpoints; test asserts after dismissing 7, offset 7 is hidden and 14 still returns 14 |
| 10 | Exporting on the real download path permanently silences that checkpoint | ✓ VERIFIED | `downloadReportPayload` (the only `download()` call site in the module) calls `writeNudgeMarker('exported', payload.report.generatedAtDayOffset)`; the panel passes `createDownloadHandler(payload)` as `onDownload` (source-asserted); test drives that exact callable, then reads `exported: [7]` (never 14) and `nudgeVisible({offset:7, ...markers}) === null`; a day-3 export writes an inert `exported:3`, never `exported:7` |
| 11 | The reminder action lands on `#/settings?report=1` and Settings scrolls to `id=beta-report`; Settings' own affordance is a `<button>`, not an anchor | ✓ VERIFIED | `Link to="/settings?report=1"` renders `href="#/settings?report=1"`; `matchRoute` strips the query (`router.js:31`), so the route stays `settings`; `reportRequested` accepts the marker; `scrollToBetaReport` calls `scrollIntoView({behavior:'smooth',block:'start'})` and returns false for null/missing/partial docs; Settings renders `<button type="button" onClick={() => scrollToBetaReport()}>` and source contains no `href="#beta-report"` |
| 12 | The nudge and export path records no learning events and no meaningful repository rows | ✓ VERIFIED | Download-path test snapshots `listEvents().length` before/after `createDownloadHandler(payload)()`; source assertions pin `Home.jsx`'s single `getBetaProfile()` inside a `useEffect` and assert `Home.jsx`/`BetaReportPanel.jsx` contain no `recordEvent(`/`logEvent(`/`createRevisionLink(`/`upsertCourse(`; only side effects are the two localStorage marker kinds (D-14 read-through allowed) |
| 13 | New copy lives only in the `betaReport` namespace with en/vi key parity | ✓ VERIFIED | Only `studio/src/lib/i18n/{en,vi}/betaReport.json` are added; 43 keys each; `catalogKeys('vi')` equals `catalogKeys('en')` for the namespace; dynamic keys (`kinds.*`, `storage.*`, `summary.*`, `values.*`, `nudge.*`, `jump`) are enumerated and resolve to non-empty copy in both languages |
| 14 | Tests stay Node-only `.test.js`, no jsdom/testing-library, no `test.include` change | ✓ VERIFIED | Both files are `.test.js` with `@vitest-environment node`, use `react-dom/server` + exported pure helpers; no jsdom/testing-library imports (only prose mentions); `studio/vite.config.js` still has `test: { environment: 'node', include: ['test/**/*.test.js'] }` unchanged |
| 15 | Ownership boundary respected: only owned files changed; no migration, dependency, lockfile, or `STATE.md`/`ROADMAP.md`/`CLAUDE.md` edit | ✓ VERIFIED | `git diff --name-status develop...HEAD` lists only `BetaReportPanel.jsx`, `DataPanel.jsx`, `Home.jsx`, `Settings.jsx`, `i18n/{en,vi}/betaReport.json`, both tests, `vite.config.js` (define only), plus `.planning/phases/07-*`; no package.json/lockfile/migration/planning-doc changes |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `studio/src/components/data/BetaReportPanel.jsx` | Payload seam, single download seam, preview, panel, nudge helpers + banner | ✓ VERIFIED | 481 lines; exports `appVersion`, `providerCategory`, `assembleCapstoneSummary`, `buildReportExport`, `buildBetaReportPayload`, `downloadReportPayload`, `createDownloadHandler`, `BetaReportPreview`, `BetaReportPanel`, `NUDGE_CHECKPOINTS`, `markerKey`, `safeStorage`, `readNudgeMarkers`, `writeNudgeMarker`, `activationOffset`, `nudgeVisible`, `BetaReportNudge`; all imports used; no module-scope I/O |
| `studio/src/components/data/DataPanel.jsx` | Mount `<BetaReportPanel />` below the existing card | ✓ VERIFIED | `-w` diff is exactly the import, `<>` fragment and `<BetaReportPanel />`; existing card markup reindented only (see Info note) |
| `studio/src/pages/Home.jsx` | One read-through profile effect, dismiss handler, banner render | ✓ VERIFIED | `nudge` state, one `useEffect` with `getBetaProfile()`, `dismissNudge`, banner between header and loading line |
| `studio/src/pages/Settings.jsx` | `reportRequested`, `scrollToBetaReport`, `?report=1` effect, button affordance | ✓ VERIFIED | All present; affordance is `<button type="button">`; no `href="#beta-report"` |
| `studio/vite.config.js` | `APP_VERSION_DEFINE` + `define`, nothing else | ✓ VERIFIED | Diff is one import, one exported constant, one `define:` key; plugins/base/server/test byte-identical |
| `studio/src/lib/i18n/en/betaReport.json` | English namespace | ✓ VERIFIED | 43 keys; title/open/download/everythingInFile/summary/kinds/values/storage/nudge/jump |
| `studio/src/lib/i18n/vi/betaReport.json` | Vietnamese namespace, identical keys | ✓ VERIFIED | 43 keys, parity asserted; learner-facing copy genuinely translated |
| `studio/test/beta-report-panel.test.js` | INSTR-05 coverage | ✓ VERIFIED | 544 lines, 8 describe blocks: version provenance, i18n parity, payload seam, provider matrix, capstone summary, single download seam, preview/panel/error/mount |
| `studio/test/beta-report-panel-nudge.test.js` | INSTR-06 + dynamic i18n parity | ✓ VERIFIED | 553 lines, 8 describe blocks: checkpoints, markers, activation offset, shipped export marker, source guard, banner render, Settings deep link, no-write assertions, dynamic key parity |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `BetaReportPanel.jsx` | `lib/beta/report.js` | `buildBetaReport` + `reportSchema` | ✓ WIRED | Imported and used in `buildBetaReportPayload`/`buildReportExport`; frozen API consumed unchanged |
| `BetaReportPanel.jsx` | `lib/repo/index.js` | `listEvents`, `getBetaProfile`, `listRevisionLinks`, `listCourses`, `getCapstone`, `listCapstoneSubmissions`, `getAdapterInfo` | ✓ WIRED | All seven imported and used (payload + capstone summary) |
| `BetaReportPanel.jsx` | `lib/course-export.js` | `download()` only inside `downloadReportPayload` | ✓ WIRED | Exactly one `download(` call site (line 175); preview's `onDownload={createDownloadHandler(payload)}` source-asserted |
| `BetaReportPanel.jsx` | `lib/beta/metrics.js` | `dayOffset(dayKey(now), activated_day)` | ✓ WIRED | `activationOffset` uses only the frozen day math |
| `DataPanel.jsx` | `BetaReportPanel.jsx` | Renders as sibling card | ✓ WIRED | SSR test proves both `data.title` and `id="beta-report"` with the backup card first |
| `Home.jsx` | `BetaReportPanel.jsx` | `activationOffset`, `readNudgeMarkers`, `writeNudgeMarker`, `nudgeVisible`, `BetaReportNudge` | ✓ WIRED | All five imported; banner rendered conditionally on resolved nudge |
| `Home.jsx` | `lib/repo/index.js` | `getBetaProfile()` read-through in one effect | ✓ WIRED | Exactly one call, inside `useEffect`, `.catch` swallows failure |
| `BetaReportNudge` | `Settings.jsx` | `#/settings?report=1` → `id=beta-report` | ✓ WIRED | `matchRoute` strips query; `reportRequested` + `scrollToBetaReport` tested |
| `studio/vite.config.js` | root `package.json` | `readFileSync(new URL('../package.json', import.meta.url))` | ✓ WIRED | `config.define.__APP_VERSION__` equals root version in both runners; dist build contains `1.6.0-beta.1` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| INSTR-05 | 07-01 (also claimed in 07-02) | Learner can preview and download a beta report JSON (schemaVersion, random local participant id, report window with active-day offsets, activation, learning loops, retention, capstone, app version, storage kind) that is strictly schema-validated and verified content-free | ✓ SATISFIED | Truths 1-7; payload seam + schema gate + sentinel test + byte-equality + preview/error render tests; both runners green |
| INSTR-06 | 07-02 | Home shows a non-blocking reminder to export the beta report on day 7 and day 14 | ✓ SATISFIED | Truths 8-12; `nudgeVisible` predicate, per-checkpoint markers, banner render, deep link, no-event assertions |

No orphaned Phase 7 requirements: `REQUIREMENTS.md` maps only INSTR-05/INSTR-06 to Phase 7, and both are declared in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No TODO/FIXME/placeholder/empty-handler/console-only stubs in any changed production file | — | None |
| `studio/src/components/data/DataPanel.jsx` | 169-242 | Whole card reindented by commit `26b9d54` (134-line diff; `git diff -w` shows only import + fragment + sibling) | ℹ️ Info | Whitespace only — no markup reordered or reworded, no behavior change |
| test output | — | Node emits `ExperimentalWarning: localStorage is not available…` in 4 workers per runner | ℹ️ Info | Emitted only when `safeStorage()`/`downloadReportPayload()` are exercised inside functions, never at module scope; tests pass and no module-scope access exists (source-asserted) |

### Human Verification Required

None blocking. The one item recorded in `07-VALIDATION.md` ("the downloaded file opens as valid JSON in a real browser and the preview matches it visually") is already covered programmatically for this phase's contract: the preview renders `payload.json` verbatim, the download writes the same `payload.json` bytes to `payload.filename`, and `JSON.parse`-validity follows from `reportSchema`. The remaining browser-only aspect is the anchor-download behaviour of the pre-existing `download()` helper (`lib/course-export.js`), already exercised by `test/course-export.test.js` and used by the existing DataPanel backup flow. It can be re-checked manually during Phase 12 E2E/UAT; it does not gate this phase's goal.

### Gaps Summary

No gaps. Every truth is backed by shipped code plus a passing test in both runners, the focused suites and the production build prove the version injection, and the ownership boundary holds (only owned files changed; no migration, dependency, lockfile or planning-doc edits).

---

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_
