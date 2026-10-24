---
phase: 07-beta-report-ui-and-nudges
plan: 02
subsystem: ui
tags: [beta-report, nudge, instr-06, localstorage-markers, hash-router, i18n, react-ssr]

# Dependency graph
requires:
  - phase: 07-beta-report-ui-and-nudges
    plan: 01
    provides: downloadReportPayload/createDownloadHandler single seam, BetaReportPanel id=beta-report, betaReport namespace
  - phase: 05-beta-data-foundation
    provides: dayOffset/dayKey day math, getBetaProfile read-through, learning_events table
  - phase: 06-studio-beta-debt
    provides: per-namespace i18n glob (no index.js edit for new keys)
provides:
  - "BetaReportPanel.jsx: NUDGE_CHECKPOINTS, markerKey, safeStorage, readNudgeMarkers, writeNudgeMarker, activationOffset, nudgeVisible, BetaReportNudge"
  - "downloadReportPayload now records the exported marker for report.generatedAtDayOffset"
  - "Home.jsx: one read-through getBetaProfile() effect, dismissNudge, banner render"
  - "Settings.jsx: reportRequested, scrollToBetaReport, ?report=1 effect, Beta report scroll button"
  - "betaReport.nudge.{day7,day14,action,dismiss} + betaReport.jump in en and vi (43 keys)"
  - "studio/test/beta-report-panel-nudge.test.js (31 tests, INSTR-06 + dynamic-key i18n parity)"
affects: [10, 12]

actuals:
  tasks: 3
  commits: 3
  plan_head_before: 197a587
  plan_head_after: 2745c45

tech-stack:
  added: []
  patterns:
    - "localStorage markers as the only nudge persistence: per checkpoint, per kind, exact-'1' reads, every access in try/catch"
    - "Injectable storage/doc arguments so pure helpers are unit-tested with no globals; only the shipped download seam needs a global stub"
    - "Source-level assertions for the effect bodies `renderToString` never runs (no event, no revision, no course write)"
    - "Scroll affordance is a button calling a helper — never an anchor — because the hash router owns the fragment"

key-files:
  created:
    - studio/test/beta-report-panel-nudge.test.js
  modified:
    - studio/src/components/data/BetaReportPanel.jsx
    - studio/src/pages/Home.jsx
    - studio/src/pages/Settings.jsx
    - studio/src/lib/i18n/en/betaReport.json
    - studio/src/lib/i18n/vi/betaReport.json

key-decisions:
  - "D-11/D-12: the reminder is an inline amber banner (Layout's durability palette) at offsets exactly 7 and 14; no modal, no role=alert, no focus management, no route change."
  - "D-13: dismissal and export are separate localStorage marker kinds per checkpoint, so dismissing day 7 never silences day 14; exporting silences only its own offset."
  - "D-13: the exported marker is written inside downloadReportPayload — the one seam createDownloadHandler delegates to — so the learner's Download button and any programmatic export share it by construction."
  - "D-14: Home performs one read-through getBetaProfile() (allowed to create the singleton with activated_at null); a profile without activated_day shows no banner, and no learning event or meaningful row is written."
  - "D-02: the banner links to #/settings?report=1 (matchRoute strips the query) and Settings scrolls to id=beta-report; the query is deliberately left in the URL."
  - "T-07-07: the Settings affordance is <button type=\"button\"> calling scrollToBetaReport(), because <a href=\"#beta-report\"> would be parsed as a route and render NotFound."

patterns-established:
  - "Every nudge helper takes its storage/doc argument with a guarded default, so no test needs a global except the one that drives the real download path"
  - "The module-scope storage guard is proven by stripping comments, then asserting `localStorage` appears only inside safeStorage's body"

requirements-completed: [INSTR-06]

coverage:
  - id: T-2a
    description: "nudgeVisible fires only at offsets 7 and 14 and returns null for 0, 1, 6, 8, 13, 15, 21, -1, null, undefined and empty input."
  - id: T-2b
    description: "Dismissing day 7 hides 7 and still shows 14; exporting day 7 hides 7 only; dismissed/exported keys are distinct and per-offset."
  - id: T-2c
    description: "readNudgeMarkers ignores non-'1' values and never throws for undefined/null/partial/throwing storage; writeNudgeMarker returns false for all of them."
  - id: T-2d
    description: "activationOffset is null without a valid activated_day, returns 7/14 for pinned clocks, and clamps a pre-activation clock to 0 (no banner)."
  - id: T-2e
    description: "createDownloadHandler(payload) — the exact callable the panel passes as onDownload — writes exported:7, leaves captured.text === payload.json and leaves listEvents().length unchanged."
  - id: T-2f
    description: "A day-3 export writes the inert exported:3 marker, never exported:7, and still records no event."
  - id: T-2g
    description: "The day-7 banner renders #/settings?report=1, the day-7 copy and the dismiss control; the day-14 banner renders day-14 copy and never day-7 copy; no role=alert/dialog/autoFocus."
  - id: T-2h
    description: "reportRequested accepts #/settings?report=1 (with or without other params) and rejects #/settings, report=0, report=true and ''; scrollToBetaReport scrolls once with {behavior:'smooth',block:'start'} and returns false without throwing for null/partial docs."
  - id: T-2i
    description: "Settings.jsx contains no href=\"#beta-report\" and its affordance is a <button type=\"button\">; Home.jsx calls getBetaProfile() exactly once, inside a useEffect, and neither file contains recordEvent(/logEvent(/createRevisionLink(/upsertCourse(."
  - id: T-2j
    description: "Every dynamic betaReport.* key (kinds/storage/summary/values/nudge/jump) exists in en and vi, the namespace is key-identical, and no Vietnamese nudge string equals its English value."
---

# Phase 7 Plan 2: Day-7/Day-14 Nudge and the Settings Deep Link Summary

Per-checkpoint dismissible Home reminder at local-day offsets 7 and 14 that routes the learner to the export card through `#/settings?report=1`, with the export marker written on the one shared download seam.

## What was built

### Nudge core (appended to `studio/src/components/data/BetaReportPanel.jsx`)

| Export | Behaviour |
|---|---|
| `NUDGE_CHECKPOINTS` | frozen `[7, 14]` — the only offsets that ever show the reminder |
| `markerKey(kind, offset)` | `professor-studio:beta-report-<dismissed\|exported>:<offset>` |
| `safeStorage()` | the browser storage, or `undefined`; the **only** place the module names `localStorage`, and never at module scope |
| `readNudgeMarkers(storage?)` | `{ dismissed: number[], exported: number[] }`, exact-`'1'` reads, every `getItem` in `try/catch` |
| `writeNudgeMarker(kind, offset, storage?)` | `true` only when a write was attempted and did not throw |
| `activationOffset(profile, now?)` | `dayOffset(dayKey(now), profile.activated_day)`, `null` without a valid activation day |
| `nudgeVisible({ offset, dismissed, exported })` | `7`, `14` or `null` |
| `BetaReportNudge({ checkpoint, onDismiss })` | the inline banner: amber card, `Link to="/settings?report=1"`, plain dismiss button |

`downloadReportPayload` gained exactly one line after the `download()` call:

```js
writeNudgeMarker('exported', payload?.report?.generatedAtDayOffset);
```

Because `BetaReportPanel` passes `createDownloadHandler(payload)` as `BetaReportPreview`'s `onDownload`, the marker is on the path the learner actually uses — there is no second call site and `createDownloadHandler` itself is unchanged. A marker written on any other offset (e.g. day 3) is inert: the banner only ever asks about 7 and 14.

### Home (`studio/src/pages/Home.jsx`)

One extra state (`nudge`) and one `useEffect` with an empty dependency list that reads the profile once, computes `nudgeVisible({ offset: activationOffset(profile), ...readNudgeMarkers() })` and stores it, with an `alive` guard and a swallowing `.catch`. It is deliberately **not** folded into the existing repository `onChange` refresh (that fires on every course write). Dismiss writes `dismissed:<offset>` and clears the state. The banner renders between the header row and the loading line, so it is never gated on `courses`.

### Settings (`studio/src/pages/Settings.jsx`)

| Export | Behaviour |
|---|---|
| `reportRequested(hash)` | `true` only when the query carries `report=1` |
| `scrollToBetaReport(doc?)` | `scrollIntoView({ behavior: 'smooth', block: 'start' })` on `#beta-report`; `false` when there is no element or no `scrollIntoView` |

One `useEffect` (empty deps, `typeof window` guard) honours the marker on arrival. The affordance beside the Storage heading is `<button type="button">` — an `<a href="#beta-report">` would be parsed by `matchRoute` as a route and render `NotFound`.

### `betaReport` key set (identical in `en` and `vi`, 43 keys)

```
title subtitle open jump building summaryTitle everythingInFile download error invalid
summary.{activation,window,loops,revisions,retention,capstone,version,storage}
kinds.{quiz_completed,recall_completed,answer_sent_for_review,workspace_run,exercise_completed,capstone_checkpoint}
values.{yes,no,activated,notActivated,none,week1,week2,started,notStarted,courseComplete,needsWork}
storage.{indexeddb,sqlite,memory,remote}
nudge.{day7,day14,action,dismiss}
```

`jump` and `nudge.*` are the only additions; no other namespace file was touched.

### Runtime state (no migration, no table)

```
professor-studio:beta-report-dismissed:<7|14>
professor-studio:beta-report-exported:<7|14>
```

## Verification

| Gate | Command | Result |
|---|---|---|
| Task 1 focused | `npm --prefix studio test -- --run test/beta-report-panel-nudge.test.js test/beta-report-panel.test.js` | 2 files / 44 tests passed |
| Task 2 focused | `npm --prefix studio test -- --run test/beta-report-panel-nudge.test.js test/i18n-keys.test.js test/i18n-catalogs.test.js` | 3 files / 34 tests passed |
| Task 3 focused | `npm --prefix studio test -- --run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js test/i18n-keys.test.js test/i18n-catalogs.test.js` | 4 files / 66 tests passed |
| Full Studio suite (define present) | `npm --prefix studio test` | **57 files / 586 tests passed** (baseline 56 / 555) |
| Root aggregate (define absent) | `npm test` | **86 files / 1156 tests passed** (baseline 85 / 1125); no `__APP_VERSION__ is not defined` |
| Production build | `cd studio && npx vite build --outDir /tmp/phase7-dist --emptyOutDir` | built in 632 ms; `assets/BetaReportPanel-*.js` contains `1.6.0-beta.1` (1 occurrence) |
| Parity red-check | delete `vi.kinds.workspace_run`, re-run the nudge suite, restore | 2 failures naming the missing key, then green after restore |
| Working tree | `git status --porcelain` | only the six `files_modified` paths — no lockfile, no `studio/dist` |

Manual browser check (export from Settings ▸ Data, open the JSON) was **not** performed in this headless run; it stays a manual item in `07-VALIDATION.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc comments broke the source-level no-write / no-anchor assertions**
- **Found during:** Task 2
- **Issue:** the plan's source-level checks count tokens in the raw file. A Home comment containing
  `` `getBetaProfile()` `` made `(HOME_SOURCE.match(/getBetaProfile\(/g))` return 2 instead of 1, and a
  Settings JSDoc quoting `<a href="#beta-report">` tripped `not.toContain('href="#beta-report"')`.
- **Fix:** reworded both comments ("the read-through is allowed to create the singleton…", "an anchor
  whose href is the bare `#beta-report` fragment…"). No code change; the assertions now prove the real
  call sites.
- **Files modified:** `studio/src/pages/Home.jsx`, `studio/src/pages/Settings.jsx`
- **Commit:** 8802acd

**2. [Rule 1 - Bug] First parity draft asserted every Vietnamese value differs from English**
- **Found during:** Task 3
- **Issue:** `betaReport.storage.sqlite` is `"SQLite"` in both languages (correctly), so a blanket
  `vi !== en` loop would fail on a legitimate product noun.
- **Fix:** split the block into "resolves every dynamic key to real copy in both languages" (all keys) and
  "never leaves a Vietnamese nudge string as English" (the learner-facing copy only).
- **Files modified:** `studio/test/beta-report-panel-nudge.test.js`
- **Commit:** 2745c45

### Deliberate choices (not deviations)

- **The `localStorage` module-scope guard strips comments first.** The runtime reference must live only
  inside `safeStorage`, but the doc prose is allowed to name the API; stripping comments makes that
  distinction explicit instead of forcing the comments to lie.
- **Only one test installs a global `localStorage`.** Every marker helper takes an injected storage, so
  the pure cases never touch `globalThis`; the download-path case must, because it drives the shipped
  seam, which takes no storage argument. Both the original `localStorage` and the download stubs are
  saved and restored around each test.
- **`?report=1` stays in the URL.** It is not a secret, and scrubbing would need `history.replaceState`
  for no benefit.
- **The day-14 banner test asserts the day-7 copy is absent**, compared against the unescaped HTML, so a
  copy/paste mistake between the two checkpoints cannot pass.

## Privacy / security notes

- The nudge path performs no repository write and records no learning event: the only side effects are two
  `localStorage` markers. `renderToString` skips effects, so this is additionally pinned at source level
  (`getBetaProfile(` appears exactly once, inside a `useEffect`; no `recordEvent(`/`logEvent(`/
  `createRevisionLink(`/`upsertCourse(` in `Home.jsx` or `BetaReportPanel.jsx`).
- A tampered or corrupt marker can only hide one reminder: reads accept the exact string `'1'` and every
  access is inside `try/catch` (T-07-09).
- The reminder is non-blocking by construction: inline banner, no `role="alert"`, no `<dialog>`, no
  `autoFocus`, no navigation (T-07-06). Asserted on the rendered markup.
- The Settings affordance cannot dead-end: it is a button calling a guarded helper, and the source is
  asserted to contain no `href="#beta-report"` (T-07-07).

## For Phase 10

Day-7 and Day-14 exports are now prompted on Home and silenced per checkpoint once exported. The marker
shape (`professor-studio:beta-report-exported:<offset>`) is local-only and carries no learner data, so the
aggregation script and the check-in doc can assume a week-1 and a week-2 file per participant without any
server-side state.

## Self-Check: PASSED

- Created files exist: `studio/test/beta-report-panel-nudge.test.js`, `.planning/phases/07-beta-report-ui-and-nudges/07-02-SUMMARY.md`.
- Commits exist: d9af759, 8802acd, 2745c45 (working tree clean).
- Final gate re-run: Studio 57 files / 586 tests passed; root aggregate 86 files / 1156 tests passed; focused 4 files / 66 tests passed; `vite build` 632 ms with `1.6.0-beta.1` in the panel chunk.
- No `STATE.md`, `ROADMAP.md`, repo module, `report.js`, `metrics.js`, `i18n/index.js`, `vite.config.js`, `DataPanel.jsx`, `package.json`, lockfile or migration file was modified.
