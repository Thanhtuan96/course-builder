---
phase: 07-beta-report-ui-and-nudges
plan: 01
subsystem: ui
tags: [beta-report, i18n, vite-define, react-ssr, privacy, instr-05]

# Dependency graph
requires:
  - phase: 05-beta-data-foundation
    provides: frozen reportSchema v1, buildBetaReport, computeMetrics, beta_profile singleton and the repo read API
  - phase: 06-studio-beta-debt
    provides: per-namespace i18n glob (a new namespace needs no index.js edit)
provides:
  - APP_VERSION_DEFINE (__APP_VERSION__ = root package.json version) exported from studio/vite.config.js
  - "BetaReportPanel.jsx: appVersion, providerCategory, assembleCapstoneSummary, buildReportExport, buildBetaReportPayload, downloadReportPayload, createDownloadHandler, BetaReportPreview, BetaReportPanel"
  - betaReport i18n namespace (en + vi, 38 keys each)
  - Settings ▸ Data mount of the export card (id="beta-report")
affects: [07-02, 10, 12]

actuals:
  tasks: 3
  commits: 3
  plan_head_before: f73f2c4
  plan_head_after: 8e705e9

tech-stack:
  added: []
  patterns:
    - "Build-time version injection: Vite `define` read from the root manifest via `new URL('../package.json', import.meta.url)`"
    - "Mandatory `typeof __APP_VERSION__ !== 'undefined'` guard because the root test aggregate never applies the Studio define"
    - "One download seam (`downloadReportPayload`) so a future export marker cannot land on a path the learner never uses"
    - "Node-only component tests: react-dom/server + exported pure helpers + stubbed Blob/document/URL, all restored per test"

key-files:
  created:
    - studio/src/components/data/BetaReportPanel.jsx
    - studio/src/lib/i18n/en/betaReport.json
    - studio/src/lib/i18n/vi/betaReport.json
    - studio/test/beta-report-panel.test.js
  modified:
    - studio/vite.config.js
    - studio/src/components/data/DataPanel.jsx

key-decisions:
  - "D-03/D-05: app.version is the ROOT package.json version (1.6.0-beta.1) via `__APP_VERSION__`; studio/package.json's 0.1.0 is asserted not to be the source."
  - "D-04: the define is only read through `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''`; `''` is schema-valid, so the root aggregate stays green."
  - "D-06/D-07: buildReportExport validates with reportSchema before any bytes exist and is the only producer of {json, filename}; the preview renders that same json."
  - "D-09: the capstone summary is assembled from listCourses/getCapstone/listCapstoneSubmissions, copying only the four scalars and coercing an out-of-enum verdict to null."
  - "D-10: filename is `professor-beta-report-<participantId.slice(0,8)>-d<generatedAtDayOffset>.json`, exactly as Phase 10 will document."
  - "Dynamic i18n keys (kinds.*, storage.*) are written as template literals so the i18n-keys scanner does not demand a literal `betaReport.kinds.` key; the parity test enumerates them explicitly."

patterns-established:
  - "Version provenance tests assert `config.define.__APP_VERSION__`, never the injected global, so they pass in both runners"
  - "Content-free proof carries a positive control (the sentinel strings are present in the repository dump) so the negative assertion can actually fail"

requirements-completed: [INSTR-05]

coverage:
  - id: T-1a
    description: "buildBetaReportPayload returns a reportSchema-valid schemaVersion 1 report with a UUID participantId and all nine top-level keys."
  - id: T-1b
    description: "Filename carries participantId.slice(0,8) and the day offset (pinned clocks produce -d0 and -d7)."
  - id: T-1c
    description: "buildReportExport throws code=beta_report_invalid for an unknown top-level key or an out-of-enum verdict and yields no bytes."
  - id: T-1d
    description: "Course/lesson/capstone text, submission content, a sk-live key, repo_url and all row ids are absent from payload.json."
  - id: T-1e
    description: "Every reachable provider × agent/preset combination yields a category reportSchema accepts; unknown ids yield null."
  - id: T-1f
    description: "assembleCapstoneSummary counts courses, submissions and external evidence and takes the highest-attempt verdict, coercing out-of-enum values to null."
  - id: T-1g
    description: "app.storage comes from getAdapterInfo().kind (memory adapter → 'memory')."
  - id: T-1h
    description: "The captured Blob text equals payload.json byte-for-byte and the previewed HTML contains the same json after unescaping."
  - id: T-1i
    description: "The closed panel renders the export action and id=beta-report; DataPanel renders both the backup card and the panel."
  - id: T-1j
    description: "config.define.__APP_VERSION__ equals JSON.stringify(root version) and differs from studio/package.json's 0.1.0."
  - id: T-1k
    description: "Error state renders role=status with the localized invalid message, no Download control and no raw schema paths."
---

# Phase 7 Plan 1: Beta Report Export UI Summary

Schema-validated, content-free beta report preview and download in Settings ▸ Data, with `app.version` injected from the root manifest and one shared download seam.

## What was built

`studio/src/components/data/BetaReportPanel.jsx` is the whole feature in one module (D-15 discretion: no
unlisted files). It composes Phase 5's frozen `buildBetaReport`/`reportSchema` and adds only what Phase 5
left to its caller:

| Export | Purpose |
|---|---|
| `appVersion(value = APP_VERSION)` | the build-injected version, `''` outside Vite, never throws |
| `providerCategory(settings)` | `bridge:<agent>` / `byok:<provider|preset>` / `null`, validated against report.js:13's enum |
| `assembleCapstoneSummary(courses)` | started / submissions / externalEvidence / latest-attempt verdict (enum-coerced) |
| `buildReportExport(report)` | the D-07 schema gate; only producer of `{ report, json, filename }` |
| `buildBetaReportPayload({ now, settings })` | repo rows → `buildBetaReport` → `buildReportExport` |
| `downloadReportPayload(payload)` | THE only `download()` call site; writes the caller's bytes |
| `createDownloadHandler(payload)` | the exact callable the preview receives as `onDownload` |
| `BetaReportPreview` | SSR-safe `<dl>` summary + the JSON as a `<pre><code>` text child + Download |
| `BetaReportPanel` | closed state = one button; nothing is read until it is clicked |

`APP_VERSION` stays module-private and is reached only through `appVersion()`.

`studio/vite.config.js` gained exactly one import, one exported constant and one `define:` key:

```js
export const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify(
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  ),
};
```

`plugins`, `base`, `server`, `test` and `relaxCspForDev` are byte-identical, so `settings-csp.test.js`
still finds the serve-only `studio-dev-csp` plugin.

`DataPanel.jsx` diff is 6 insertions / 2 deletions: the import, the fragment wrapper, `</Card>` and
`<BetaReportPanel />`. The existing card markup (including its original indentation) is untouched.

### Final `betaReport` key set (identical in `en` and `vi`, 38 keys)

```
title subtitle open building summaryTitle everythingInFile download error invalid
summary.{activation,window,loops,revisions,retention,capstone,version,storage}
kinds.{quiz_completed,recall_completed,answer_sent_for_review,workspace_run,exercise_completed,capstone_checkpoint}
values.{yes,no,activated,notActivated,none,week1,week2,started,notStarted,courseComplete,needsWork}
storage.{indexeddb,sqlite,memory,remote}
```

No existing namespace file was edited; `storage.remote` is labelled as the local SQLite file, mirroring
`data.kind.remote` without touching `data.json`.

## Verification

| Gate | Command | Result |
|---|---|---|
| Task 1 focused | `npm --prefix studio test -- --run test/beta-report-panel.test.js test/settings-csp.test.js test/i18n-catalogs.test.js` | 3 files / 23 tests passed |
| Task 2 focused | `npm --prefix studio test -- --run test/beta-report-panel.test.js` | 1 file / 22 tests passed |
| Task 3 focused | `npm --prefix studio test -- --run test/beta-report-panel.test.js test/course-export.test.js` | 2 files / 29 tests passed |
| Full Studio suite | `npm --prefix studio test` | **56 files / 555 tests passed** (baseline 55 / 527) |
| Root aggregate (no define) | `npm test` | **85 files / 1125 tests passed** (baseline 84 / 1097) |
| Build | `npx vite build --outDir $TMPDIR/phase7-dist --emptyOutDir` | built in 614 ms; `assets/Settings-*.js` contains `` var Ic=`1.6.0-beta.1` `` immediately before the provider regex → the define is inlined |

`i18n-keys.test.js`, `i18n-catalogs.test.js` and `settings-csp.test.js` are green in both runners.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Second literal `download(` in a doc comment broke the single-seam assertion**
- **Found during:** Task 3
- **Issue:** the source-level check `(PANEL_SOURCE.match(/\bdownload\(/g) || []).length === 1` counted the
  JSDoc phrase ``may call `download()` `` as a second call site.
- **Fix:** reworded the comment to "may trigger a download" (no code change); the assertion now proves the
  single real call site.
- **Files modified:** `studio/src/components/data/BetaReportPanel.jsx`
- **Commit:** 8e705e9

**2. [Rule 1 - Bug] Preview test asserted a retention label the unactivated payload never renders**
- **Found during:** Task 3
- **Issue:** an unactivated report has `week1Active: false`, so the preview renders only `values.no` and the
  `values.yes` assertion failed.
- **Fix:** the test now seeds a day-0 and a day-1 event and previews at day 7, so both labels render.
- **Files modified:** `studio/test/beta-report-panel.test.js`
- **Commit:** 8e705e9

### Deliberate choices (not deviations)

- **Positive control instead of a scratch log.** The plan asked to prove the sentinel assertion can fail by
  temporarily logging. Instead the test asserts the sentinel strings *are* present in `repo.exportAll()`
  before asserting they are absent from `payload.json` — permanent proof, no uncommitted logging.
- **`DataPanel` children keep their original indentation** so the diff stays at the fragment wrapper, the
  import and the new sibling, as the acceptance criteria require.
- **Dynamic i18n keys use template literals** (`t(\`betaReport.kinds.${kind}\`)`). A `t('betaReport.kinds.' + kind)`
  form would make the `i18n-keys` scanner demand a literal `betaReport.kinds.` key. The parity test enumerates
  `kinds.*` and `storage.*` explicitly, which is the coverage the scanner cannot provide.

## Privacy / security notes

- The payload is produced only by `buildBetaReport`; the panel adds four capstone scalars. `reportSchema` is
  strict, so unknown keys are rejected rather than stripped.
- `providerCategory` returns `null` outside the closed enum, and `assembleCapstoneSummary` coerces an
  out-of-enum verdict to `null`, so a single bad row can never brick future exports.
- The preview renders the JSON as a React text child; `dangerouslySetInnerHTML` and `.innerHTML` are asserted
  absent from the module, and a `<tag>` in the JSON renders as `&lt;tag&gt;`.
- No download can exist before validation: `BetaReportPreview` renders the control only when a payload built
  by `buildReportExport` is present, and the error state renders no Download at all.
- The export path records no learning events and writes no repository rows (asserted by counting events
  around the download).

## For plan 07-02

`downloadReportPayload` is the one place to add the `exported` marker: both the preview's Download control
(via `createDownloadHandler(payload)`) and any programmatic export call it, and a source-level test pins the
`onDownload={createDownloadHandler(payload)}` wiring.

## Self-Check: PASSED

- Created files exist: `studio/src/components/data/BetaReportPanel.jsx`, `studio/src/lib/i18n/{en,vi}/betaReport.json`, `studio/test/beta-report-panel.test.js`, `.planning/phases/07-beta-report-ui-and-nudges/07-01-SUMMARY.md`.
- Commits exist: 893304c, 63065b1, 8e705e9, 39fa02a (working tree clean).
- Final gate re-run: Studio 56 files / 555 tests passed; root aggregate 85 files / 1125 tests passed; focused beta-report + settings-csp + i18n-catalogs + i18n-keys 4 files / 45 tests passed.
- No `STATE.md`, `ROADMAP.md`, repo module, lockfile, `package.json` or migration file was modified.
