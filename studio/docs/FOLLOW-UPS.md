# Studio follow-ups

Open items carried over when the Phase 22–31 `HANDOFF-*.md` files were consolidated during the
Phase 32 integration pass. Each item names an owner and why it is not done here.

## Open

| # | Item | Owner | Why it is open |
|---|------|-------|----------------|
| 1 | **First-class code snapshot columns.** `run_results` CODE-05 snapshots are encoded inside the existing `checks_json` value as `{ checks, snapshot }` (`lib/runner/history.js`). Add dedicated `code_json` / `code_hash` columns. | repo/schema owner (Phase 22/26/31) | Requires a database migration and a schema change (`studio/src/lib/repo/schema.js`, `studio/migrations/**`) that this integration phase was explicitly told not to add. `history.js` is the single swap point. |
| 2 | **Tick PRACTICE-01..04.** The practice requirements are still `[ ]` in the main repo `.planning/REQUIREMENTS.md`. | orchestrator | `.planning/REQUIREMENTS.md` lives outside this worktree. |
| 3 | **Order `listWorkspaceFiles` by course.** Today files are listed per-lesson and sort by path alphabetically; a course-wide ordering would need a `course_id` index/order. | repo owner | Low impact; a lesson's files fit comfortably. Not needed for current UI. |
| 4 | **End-to-end browser UAT of the learning loop.** Run the full new-topic → lesson → quiz → tutor → workspace → review flow against a real provider and the local agent bridge. | orchestrator | Requires a browser + a configured provider/bridge; the Phase 32 worker verified unit/integration tests and production builds only. |

## Resolved during Phase 32 (for reference)

- `initAdapter()` is called at startup before demo seeding (SQLite auto-detect) — was HANDOFF-26 §1.
- `web/server.js` binds to loopback by default (`HOST=127.0.0.1`) — was HANDOFF-26 §3.
- Root `npm test` installs `web/` deps via a `pretest` script — was HANDOFF-29 §4.
- `repo.listCards({ courseId, lessonId })` added; `card-store.js` no longer serialises `exportAll()`
  — was HANDOFF-24 §1.
- `repo.deleteWorkspaceFile({ lessonId, path })` soft-deletes; the `DELETED_MARKER` tombstone is gone
  — was HANDOFF-29 §3.1.
- Single streak implementation (`lib/activity.js#computeStreak`); the row-less `course.js#streak` was
  removed — was HANDOFF-24 §5.
- Demo quiz seed uses `answerIndex` — was HANDOFF-24 §2.
- Tutor "Check my answer" attaches the learner's current code in a `<learner_code>` block — was
  HANDOFF-29 §2.
- "Export COURSE.md" mounted on the Course page from the shared `lib/course-export.js` — was
  HANDOFF-23.
- Root `void.config.ts` + `build:studio` + Pyodide CSP note — was HANDOFF-26 §6 / HANDOFF-29 §4.
| 5 | `/api/studio/db/health` reports `schemaVersion: 1` although 4 migrations are applied — derive it from the applied migration count (found in Phase 37 smoke). | server owner | Cosmetic; smoke test uses migrationsApplied. |
