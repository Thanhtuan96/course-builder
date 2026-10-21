---
phase: 03-plugin-drift-guard
verified: 2026-10-21T16:13:10Z
status: passed
score: "5/5 must-haves verified"
covered_files:
  - .claude-plugin/marketplace.json
  - .planning/phases/03-plugin-drift-guard/03-01-PLAN.md
  - .planning/phases/03-plugin-drift-guard/03-01-SUMMARY.md
  - bin/sync-shared.sh
  - plugin.json
  - scripts/sync-shared.mjs
  - shared/SKILL.md
  - templates/claude/plugin.json
  - test/shared-drift.test.js
covered_digest: "v3:sha256:675375762ef635582b66e225eaafd8920d9cbb5f93944150e4c412f442e89674"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Drift guard runs as a CI job on every push/PR to develop"
    addressed_in: "Phase 4"
    evidence: "Phase 4 owns .github/workflows/** and success criterion 2: 'A push to develop or a PR into develop triggers CI jobs for unit (root + Studio), security, drift, tarball smoke and the Node 18 CLI floor'. Phase 3 CONTEXT defers CI wiring to Phase 4."
  - truth: "A root package.json `sync:shared` script exists"
    addressed_in: "Phase 4"
    evidence: "D-08 and ROADMAP 'Lockfiles / package.json' rule: Phase 4 owns root package.json scripts. SUMMARY records the request."
---

# Phase 3: Plugin Drift Guard Verification Report

**Phase Goal:** The plugin files in `shared/` can never silently diverge from their canonical sources again.
**Verified:** 2026-10-21T16:13:10Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

Goal-backward and adversarial. SUMMARY claims were treated as hypotheses only. Every truth was checked
against the committed tree and re-proved against throwaway repository copies under `/tmp` (realpath'd
temp roots with `node_modules` symlinked) so that drift, manifest divergence and idempotence could be
injected without mutating the worktree. `--check` was hashed before/after to prove it is read-only.
No product code was edited.

One write-mode sync was also executed against the worktree while gathering idempotence evidence; it
regenerated `shared/` from the same canonical bytes, and `git status --short` was unchanged afterwards
(only the pre-existing untracked `.bg-shell/`), confirming no content was altered.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running the sync (Node script or `.sh` wrapper) makes every managed `shared/` file byte-identical to its canonical source, including `shared/SKILL.md` carrying the Agent Architecture section | ✓ VERIFIED | `node scripts/sync-shared.mjs --check` and `bash bin/sync-shared.sh --check` both print `OK shared/ is in sync (33 managed files)` and exit 0. All 5 agents + 26 commands + hook compare equal with `cmp`; `cmp professor-skill/SKILL.md shared/SKILL.md` exits 0 (both 567 lines) and `## Agent Architecture` is present at line 535 in both. A temp copy driven from a drifted/deleted state regenerated all 33 files and re-checked clean. |
| 2 | `--check` exits 0 on the committed tree and non-zero when a pair differs, a managed copy is missing, or an orphan exists; it writes nothing | ✓ VERIFIED | Committed tree exit 0. Temp fixture: canonical mutation → `CHANGED shared/agents/professor.md`, exit 1; hook mutation + deleted `shared/commands/professor/quiz.md` → exit 1 with both `MISSING` and `CHANGED` lines. SHA-256 of every file before/after `--check` was identical (`check_is_read_only`), and the mutated copy remained unrepaired. Orphans in agents/commands/hooks reported as `ORPHAN` and preserved. Vitest fixture suite independently asserts the same classes. |
| 3 | `test/shared-drift.test.js` fails on canonical/shared divergence and on command or agent registration divergence in either direction between `commands/professor/`, `agents/`, `plugin.json` and `templates/claude/plugin.json` | ✓ VERIFIED | `npx vitest run test/shared-drift.test.js` → 17/17 pass. Negative proof in a temp copy: removing one command from `plugin.json` → `missing command entry for commands/professor/quiz.md in plugin.json`; adding a ghost command → `unregistered command file commands/professor/ghost.md declared in plugin.json`; removing an agent from `templates/claude/plugin.json` → `missing agent entry for agents/coach.md in templates/claude/plugin.json`; mutating a shared copy → two failures naming `shared/agents/professor.md`; version mismatch → failure. Each mutation made the suite red. |
| 4 | `plugin.json.version`, `templates/claude/plugin.json.version`, and marketplace `metadata.version` + `plugins[0].version` all equal root `package.json.version` (`1.6.0-beta.1`) | ✓ VERIFIED | Independent `node -e` assertion printed `{"v":"1.6.0-beta.1","p":"1.6.0-beta.1","t":"1.6.0-beta.1","mv":"1.6.0-beta.1","pv":"1.6.0-beta.1"}`. The parity test's version case passes; deliberate `0.0.0` mutation made it fail. |
| 5 | Repeated sync runs are deterministic and idempotent; nothing outside the managed agent/command/hook trees and `shared/SKILL.md` is created, modified, or deleted | ✓ VERIFIED | Temp copy: first write `33 written, 0 unchanged, 0 removed`; immediate second write `0 written, 33 unchanged, 0 removed`, exit 0, and full-tree hashes were identical. SHA-256 of every file outside `shared/` was unchanged across a write that fixed one drifted file and removed two orphans (`sync_touched_nothing_outside_shared`). Paths are sorted and written only when bytes differ (`scripts/sync-shared.mjs:116,264-296`). |
| R1 | Roadmap SC1 (sync regenerates agents, commands, hooks, `SKILL.md`; skill matches canonical) | ✓ VERIFIED | Same evidence as truth 1; deduplicated. |
| R2 | Roadmap SC2 (`--check` and drift test fail on any canonical/shared difference) | ✓ VERIFIED | Same evidence as truths 2–3; deduplicated. |
| R3 | Roadmap SC3 (drift test fails on command parity divergence either direction) | ✓ VERIFIED | Same evidence as truth 3, including both removal and extra-entry direction; deduplicated. |

**Score:** 5/5 must-haves verified (0 present, behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | CI drift job wiring (run the test on push/PR to `develop`) | Phase 4 | Phase 4 owns `.github/workflows/**`; its success criterion 2 names the drift job. CONTEXT explicitly defers CI wiring. |
| 2 | Root `package.json` `sync:shared` script | Phase 4 | D-08 + ROADMAP package.json ownership rule; no script was added in Phase 3 (`git diff` for `package.json` is empty). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/sync-shared.mjs` | Dependency-free canonical → shared sync + read-only `--check`; exports `canonicalFiles`, `syncShared`, `checkDrift` | ✓ VERIFIED | 417 lines; imports only `fs`, `path`, `url`. Exports confirmed by reading the module and by the tests/CLI exercising both modes. Path safety, symlink refusal, realpath `isMain`, arg rejection all verified. |
| `bin/sync-shared.sh` | One-line `exec node` wrapper | ✓ VERIFIED | 5 lines: shebang, comment, `set -euo pipefail`, one quoted `exec node ... "$@"`; no `eval`/`cp`/globs; executable bit preserved (`-rwxr-xr-x`). `--check` through it exits 0. |
| `shared/SKILL.md` | Reconciled, identical to `professor-skill/SKILL.md` | ✓ VERIFIED | `cmp` exit 0; 567 lines both; `## Agent Architecture` present. |
| `test/shared-drift.test.js` | Black-box drift, parity and version guard | ✓ VERIFIED | 385 lines, 17 tests, node environment; spawns the real CLI; realpaths temp fixtures; 17/17 pass; negative mutations documented above. |
| `plugin.json` | Version aligned | ✓ VERIFIED | `1.6.0-beta.1`; 26 command, 5 agent, PreCompact hook entries intact. |
| `templates/claude/plugin.json` | Version aligned | ✓ VERIFIED | `1.6.0-beta.1`; parity intact. |
| `.claude-plugin/marketplace.json` | Both version fields aligned | ✓ VERIFIED | `metadata.version` and `plugins[0].version` both `1.6.0-beta.1`; valid JSON; names/repos unchanged. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bin/sync-shared.sh` | `scripts/sync-shared.mjs` | `exec node "$(dirname "$0")/../scripts/sync-shared.mjs" "$@"` | ✓ WIRED | Wrapper check exits 0 and prints the same 33-file summary. |
| `professor-skill/SKILL.md` | `shared/SKILL.md` | Byte-for-byte sync | ✓ WIRED | `cmp` exit 0; sync re-creates it from canonical when missing/drifted. |
| `shared/SKILL.md` | `bin/platforms/claude.js`, `gemini.js`, `cursor.js` | Installers read `shared/SKILL.md` (and `_shared.js` copies `shared/`) | ✓ WIRED | `claude.js:88`, `cursor.js:31`, `gemini.js:30` read `PLUGIN_DIR/shared/SKILL.md`; agents/commands/hooks read from `shared/` at `claude.js:37,54,71`, `_shared.js:44,169`. |
| `commands/professor/*.md`, `agents/*.md` | `plugin.json` + `templates/claude/plugin.json` | One-to-one name/file entries | ✓ WIRED | Test passes both directions; deliberate removal and ghost entry both turn the suite red. |
| `test/shared-drift.test.js` | Phase 4 CI drift job | Test glob / `--check` command | N/A (deferred) | Phase 4 owns workflow wiring; this is the deferred item above, not a Phase 3 gap. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `scripts/sync-shared.mjs` | `canonicalFiles` / destination bytes | `readdirSync` + `readFileSync` on real canonical files (`agents/`, `commands/professor/`, `hooks/`, `professor-skill/SKILL.md`) | Yes — bytes written/compared directly; no placeholders or static fallbacks | ✓ FLOWING |
| `test/shared-drift.test.js` | drift/parity results | Real subprocess spawn of the CLI against real tree and temp fixtures; manifests read from disk | Yes — assertions are driven by actual exit codes/stdout and file contents | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Committed tree is in sync | `node scripts/sync-shared.mjs --check` | `OK shared/ is in sync (33 managed files)`, exit 0 | ✓ PASS |
| Wrapper delegates correctly | `bash bin/sync-shared.sh --check` | Same output, exit 0 | ✓ PASS |
| Canonical skill equals generated skill | `cmp professor-skill/SKILL.md shared/SKILL.md` | exit 0, both 567 lines | ✓ PASS |
| Drift is detected and not repaired by check | temp copy: append to canonical, run `--check` | `CHANGED shared/agents/professor.md`, exit 1, copy still drifted | ✓ PASS |
| Missing + changed reported together | temp copy: mutate hook, delete shared command | exit 1, `MISSING shared/commands/professor/quiz.md` + `CHANGED shared/hooks/pre-compact.js` | ✓ PASS |
| Check is read-only | SHA-256 full-tree snapshot before/after `--check` | digests identical | ✓ PASS |
| Sync is idempotent | run write twice in temp copy | 1st: 33 written; 2nd: 0 written, 33 unchanged; full-tree hashes identical | ✓ PASS |
| Sync scope is bounded | hash all files outside `shared/`, then write-mode sync | hashes identical; orphan agent + hook removed inside `shared/` only | ✓ PASS |
| Non-regular `shared/SKILL.md` is preserved | replace with directory, run `--check` then write | check exit 1 `ORPHAN shared/SKILL.md`; write exit 1 `refusing to overwrite non-file`; directory and inner file intact | ✓ PASS |
| Symlinked managed directory refused | symlink `shared/agents`, run write | exit 1 `managed directory is not a regular directory: shared/agents`; symlink preserved | ✓ PASS |
| Unknown argument rejected | `node scripts/sync-shared.mjs --bogus` | usage error, exit 1 | ✓ PASS |
| Missing canonical source fails | temporarily move `hooks/pre-compact.js`, run `--check` | exit 1 `canonical source missing: hooks/pre-compact.js` | ✓ PASS |
| Focused drift suite | `npx vitest run test/shared-drift.test.js` | 1 file, 17 tests passed | ✓ PASS |
| Full root suite (run once) | `npx vitest run` | 15 files, 311 tests passed | ✓ PASS |

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh`) exist and none are referenced by the plan or
summary. Not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BOUND-02 | 03-01 | Plugin files copied to `shared/` (agents, commands, hooks, `SKILL.md`) are generated from their canonical sources by one sync script, and a drift test fails CI when they diverge (including `plugin.json` command parity) | ✓ SATISFIED | Generated tree is byte-identical and check-clean; drift/parity/version guards pass and are falsified by injected divergence; CI wiring itself is Phase 4's deferred ownership. |

No orphaned requirements are mapped to Phase 3 in `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/placeholder markers in phase-modified files | — | None |
| — | — | No empty implementations, static fallbacks, or timestamped/absolute-path check output | — | None |

Phase commits touch only the claimed paths (`scripts/sync-shared.mjs`, `bin/sync-shared.sh`,
`shared/SKILL.md`, the three manifests, `test/shared-drift.test.js`, planning docs). `package.json`,
lockfiles, `SYNC_GUIDE.md`, `CLAUDE.md` and CI workflows are unchanged.

### Human Verification Required

None. All five must-haves are automatable and were exercised through the real CLI and the real Vitest
suite, including negative fixtures. No visual, real-time, external-service, or UX-quality behavior is
part of this phase.

### Gaps Summary

No gaps. The drift guard is complete and behaviorally verified: the committed tree is clean, both check
entry points are read-only and fail on every drift class, write mode is idempotent and scoped, and the
manifest/version parity guard fails in both directions when divergence is injected. Remaining work
(CI wiring, `sync:shared` script) is explicitly owned by Phase 4.

---

_Verified: 2026-10-21T16:13:10Z_
_Verifier: the agent (gsd-verifier)_
