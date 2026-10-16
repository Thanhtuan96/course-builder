# Task brief: Phase 36 — Learner chooses where data is stored (browser vs local SQLite), write only there

Own git worktree from `feat/studio-local-first` AFTER Phase 26c is merged. Only Studio worker running. Small conventional
commits. Do NOT push.

## User request (2026-10-15)
"Settings should let the user choose to save into the browser or into SQLite, then save only where needed. Only when the
user chooses the browser option show the notification 'Your data is only in this browser — export a backup in Settings.'"

## Current behaviour (read first)
`studio/src/lib/repo/select-adapter.js` + `App.jsx` startup: `initAdapter()` auto-detects — SQLite (remote adapter) when the
bridge answers `/db/health`, else silently falls back to IndexedDB. Layout shows the "only in this browser" banner based on
persistence. Risk: data silently splits between stores across sessions. DataPanel already has backup/restore and
"Import browser data into SQLite".

## Requirements (STORE-01..04 — report them in your summary; orchestrator records them)
- **STORE-01 explicit choice**: `settings.storage = 'browser' | 'sqlite'`. Settings → "Where your learning data is saved"
  radio with short pros/cons, current status (browser: persistent/best-effort, quota; sqlite: file path from
  `/db/health`, connected/offline). Onboarding gains this question (default: `sqlite` when the URL pairing/bridge is present,
  else `browser`). Migrate existing users: if they currently have data only in one store, preselect that store; if both have
  data, ask once (modal) which one is the primary.
- **STORE-02 write only to the chosen store**: `initAdapter()` uses ONLY `settings.storage`; never auto-fallback. If
  `sqlite` is chosen and the server is unreachable → app shows a blocking, actionable state ("Local server isn't running —
  run `course-professor studio`" + Retry + "Switch to browser storage…" which goes through STORE-03); no reads/writes to
  IndexedDB happen in that state. Unit-test: sqlite chosen + server down ⇒ zero IndexedDB writes.
- **STORE-03 switching moves data safely**: changing the setting opens "Move N courses, M cards… to <target>?" → copy via
  `exportAll()`/`importAll()` (add SQLite→browser direction), verify per-table counts, then switch; the source copy is
  kept until the learner presses "Remove the old copy". Cancel leaves everything unchanged. Keys/settings are never moved.
- **STORE-04 banner only for browser storage**: Layout banner "Your data is only in this browser — export a backup in
  Settings." renders only when `settings.storage === 'browser'` (dismissible per session); never for sqlite.

## Files you own
`studio/src/lib/repo/select-adapter.js`, `studio/src/lib/settings.js` (storage field + migration), `studio/src/App.jsx`
(startup state), `studio/src/components/Layout.jsx` (banner condition), `studio/src/components/Onboarding.jsx` (storage
step), `studio/src/components/data/*`, `studio/src/pages/Settings.jsx` (storage section), tests, `studio/README.md`
(storage section).

## Verify before reporting
All suites + build. Real run `node bin/cli.js studio --no-open --port 5196 --api-port 3017` with temp `PROFESSOR_HOME`:
(1) choose SQLite → create course → row appears in the temp DB, IndexedDB empty, no banner; (2) stop the server → reload →
blocking "server not running" state, no IndexedDB writes; (3) restart, switch to browser → move dialog → counts match →
banner appears. Paste what you observed.
