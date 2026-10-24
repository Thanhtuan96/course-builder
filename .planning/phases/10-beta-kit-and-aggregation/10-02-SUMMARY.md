---
phase: 10-beta-kit-and-aggregation
plan: 02
status: complete
requirements:
  - BETA-02
  - BETA-03
  - BETA-04
files_modified:
  - scripts/beta-aggregate.mjs
  - test/beta-aggregate.test.js
  - test/fixtures/beta-reports/valid/
  - test/fixtures/beta-reports/invalid/
  - test/fixtures/beta-reports/mixed/
  - test/fixtures/beta-reports/duplicate/
  - test/fixtures/beta-reports/duplicate-tie/
  - test/fixtures/beta-reports/missing-export/
  - test/fixtures/beta-reports/missing-export-list/
  - test/fixtures/beta-reports/empty/
  - test/fixtures/beta-reports/nested/
commits:
  - c1329e2: "test(10): add literal beta report fixtures for aggregation cases"
  - 691b8dc: "feat(10): add read-only beta report aggregator CLI"
  - 1ec8874: "test(10): cover the aggregation CLI and guard the beta kit docs"
---

# Phase 10 Plan 02: Beta Kit and Aggregation Summary

**A read-only `scripts/beta-aggregate.mjs` validates exported reports against the frozen Phase 5 schema, dedupes by participant and prints raw per-participant counts — table or one pinned JSON document, never a percentage — with 22 literal fixtures and a 35-test black-box suite that also guards the D-17 kit invariants.**

## What was built

### Fixtures — `test/fixtures/beta-reports/**` (22 literal JSON files)

Every fixture is hand-written literal JSON against the frozen schema; no clock, UUID generation,
builder round-trip or absolute path. Participant ids are fixed (`11111111…` through `88888888…`).

| Directory | Files | Purpose |
|---|---|---|
| `valid/` | 2 | Canonical activated participant A at d14; unactivated participant B at d0 with all-zero loops/revisions |
| `invalid/` | 6 | `bad-schema-version` (schemaVersion 2), `missing-bykind` (five missing kinds), `extra-key`, `bad-provider` (`"claude"`), `broken.json` (trailing comma), `array.json` (`[]`) |
| `mixed/` | 2 | Valid C at d7 beside `zz-bad-provider.json` (C with `"claude"`) |
| `duplicate/` | 2 | D at d7 (`week2Return: false`) and d14 (kept) |
| `duplicate-tie/` | 2 | E at d9 in `…-a-d9.json` (`w2Days: 2`) and `…-b-d9.json` (`w2Days: 5`, kept) |
| `missing-export/` | 2 | Canonical A report plus `roster.json` (`[A, F]`), passed with `--roster` and excluded from scanning |
| `missing-export-list/` | 3 | A report plus `roster.txt` (two lines) and `roster-comma.txt` (one comma line), both listing A and F |
| `empty/` | 0 JSON | `README.md` keeps the directory in git; no report files |
| `nested/` | 1 + 1 in `sub/` | G at d14 is found; H in `sub/` must be ignored (non-recursive) |

### CLI — `scripts/beta-aggregate.mjs`

`node scripts/beta-aggregate.mjs <dir> [--json] [--roster <file>]`, exactly to D-01..D-06:

- Imports `reportSchema` read-only from `../studio/src/lib/beta/report.js`; only `node:fs`,
  `node:path`, `node:url` and that relative import. No dependency, no package/lockfile change.
- Scanning: `readdirSync(dir).sort()` (UTF-16 code-unit order), direct children only, `.json`
  only, dotfiles skipped, roster excluded by resolved path. Non-regular entries (symlinks,
  directories) are never read.
- Validation order per file: `lstatSync().isFile()`, 1 MiB size cap, `JSON.parse`,
  `reportSchema.safeParse`. A file over the cap is rejected as
  `file too large: <n> bytes (max 1048576)` before parsing.
- Invalid reasons are one line, flushed to stderr in table mode and into `invalid[]` with
  `--json`; a run never aborts and valid rows always print.
- Dedupe by `participantId`: higher `generatedAtDayOffset` wins, equal offset keeps the
  lexicographically greater filename; one warning per dropped file naming both files.
  Duplicates never change the exit code.
- Roster: JSON array of ids or newline/comma-delimited ids; ids without an export become
  all-null participants (`source: null`) and `unknown` table cells. A missing or invalid
  roster is one fatal stderr line with empty stdout.
- Table columns: `participant day activated activeDays loops revisions w1 w2 w2Days capSub
  capEvidence verdict`; `yes`/`no` flags, `loops` = sum of `byKind`, `revisions` as
  `quiz/tutor/ws/cap`, unavailable values rendered `unknown`.
- JSON: `{ schemaVersion: 1, ok, participants[], invalid[{file,reason}], duplicates[{participantId,kept,dropped}], unknown[] }`
  with stable key order, `null` preserved, no timestamps or absolute paths.
- Exit `0` only when at least one report was discovered and none was invalid; `1` for any
  invalid file, wrong usage, missing/not-a-directory `<dir>`, an empty folder (`no report
  files`), or an unreadable roster. `--json` still exits `1` when anything is invalid.
- No `/` arithmetic for derived figures, no `%` character anywhere in either stream, and no
  emitted key or header matches `/\b(percent|percentage|rate|average|avg)\b/i`
  (`generatedAtDayOffset` passes because of word boundaries).

### Tests — `test/beta-aggregate.test.js` (35 tests)

Spawns the real script with an absolute path via `spawnSync(process.execPath, [SCRIPT, …])`,
asserting real exit codes and separated streams. Describe blocks match the Validation
Architecture filters: `table` (counts, non-recursive scan, read-only snapshot), `json` (pinned
document, six `EVENT_KINDS`, six revision keys), `invalid` (all six reasons, mixed folder,
directory errors, 1 MiB cap, symlink sentinel), `usage`, `duplicate` (offset and tie),
`roster` (JSON/newline/comma, roster exclusion, fatal read), `percentage` (both modes, every
JSON key at every depth), `docs` (D-17 guards below).

Doc guards: every README link resolves and no `owner/`/`participant/` document is orphaned;
four `## Day 0|3–4|7|14` sections each carry the three pinned questions; only Day 7 and Day 14
contain the export step; `TROUBLESHOOTING.md` teaches "never widen the allowed browser
origins" and "never disable the agent's permission prompts"; `THRESHOLDS.md` keeps the
`DRAFT — PENDING OWNER SIGN-OFF` label and empty `Name`/`Date`/`Commit` sign-off lines with
no `%`; the decision memo links `THRESHOLDS.md` without restating numbers; no document under
`docs/beta/**` contains `STUDIO_ORIGINS=*`, `--dangerously-skip-permissions` or
`STUDIO_ALLOW_NON_LOOPBACK`.

## Verification

Ran from the repository root, in plan order:

1. Fixture sweep (Task 1 `<automated>`) → `fixtures ok`.
2. CLI contract sweep (Task 2 `<automated>`) → `script-ok`, including: `--help` exits 0, valid
   folder exits 0, invalid folder exits 1, `--json` gives `ok: true` with two participants and
   loop totals 7 + 0, no bare import, `%` only outside comments, `not a directory` and
   `no report files` substrings present.
3. Phase test file (Task 3 `<automated>`) → `npx vitest run test/beta-aggregate.test.js
   --project root` → **35 passed (35)**, 1 file, ~1.9 s.
4. Targeted filters → `table` 4, `json` 4, `invalid` 9, `usage` 8, `duplicate` 2, `roster` 6,
   `percentage` 2, `docs` 6; all passed (`-t` matches whole test names, so some filters collect
   neighbouring tests that contain the word).
5. Full suite → `npm test` → **85 test files passed (85), 1132 tests passed (1132)**,
   11.84 s, root + Studio projects. No pre-existing or new failure.
6. `git diff --stat package.json package-lock.json studio/package.json studio/package-lock.json`
   empty; working tree clean after the three task commits; changes confined to
   `scripts/beta-aggregate.mjs`, `test/beta-aggregate.test.js` and
   `test/fixtures/beta-reports/**`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Roster read failures lost the file name to reason truncation**
- **Found during:** Task 3 (test suite), first run of `roster > fails with one stderr line`
- **Issue:** The fatal roster path reused the per-file `oneLine()` helper, whose 160-character
  cap cut off the basename on a long fixture path, so stderr no longer named the roster as the
  contract requires.
- **Fix:** Main collapses whitespace on the roster error without truncating; per-file invalid
  reasons keep their 160-character cap.
- **Files modified:** `scripts/beta-aggregate.mjs` (one line)
- **Verification:** `npx vitest run test/beta-aggregate.test.js --project root` → 35/35 pass.
- **Committed in:** `1ec8874` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug). No architectural decision was needed and no
plan step was skipped.

**Note on reason length:** `bad-provider.json` identifies the zod regex failure in ~190
characters, so its reason is capped at 160 with `...`; the required prefix
`app.provider: invalid_format` is intact and asserted by the suite.

## Self-Check: PASSED

- `scripts/beta-aggregate.mjs`, `test/beta-aggregate.test.js` and all 22 fixture files exist.
- Commits `c1329e2`, `691b8dc`, `1ec8874` present on `gsd/phase-10-beta-kit`.
- `npm test` green: 85 files / 1132 tests.
