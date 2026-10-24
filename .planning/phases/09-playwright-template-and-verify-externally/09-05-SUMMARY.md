---
phase: 09-playwright-template-and-verify-externally
plan: 05
subsystem: security
tags: [runner, allowlist, denylist, windows-shims, playwright, vitest]

# Dependency graph
requires:
  - phase: 02-security-release-gate-and-legacy-gating
    provides: COMMANDS allowlist, COMMAND_DENYLIST, assertCommandAllowed, shell:false spawn, security runner tests
provides:
  - "normalizeCommandName + COMMAND_SHIM_EXTENSIONS in web/studio-runner.js (additive, behaviour-neutral)"
  - "assertCommandAllowed rejects npm/npx/pnpm/yarn/playwright as bare names, POSIX/Windows paths, any case and any shim extension"
  - "test/runner-no-playwright.test.js — root-suite guard pinning the denylist baseline, the closed allowlist and every buildable pipeline"
affects: [09-06, 10, 12]

actuals:
  tokens: 3534
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Normalize-then-check: basename → lowercase → repeated shim strip before both the allow and deny checks"
    - "Guard test reads its own module source (shell:false, single spawn call site, denylist literal) as defence in depth"

key-files:
  created:
    - test/runner-no-playwright.test.js
  modified:
    - web/studio-runner.js

key-decisions:
  - "The only runner behaviour change in Phase 9 is the normalization inside assertCommandAllowed (D-19)"
  - "normalizeCommandName and COMMAND_SHIM_EXTENSIONS are exported solely so the guard test can assert the normalization directly (Assumption A1)"

patterns-established:
  - "PW-05 guard: every denied name is asserted in 13 spellings plus stacked shims, with err.code checked"
  - "Pipeline proof is denylist-shaped, not allowlist-shaped: `java` and `./main` are allowed but are not COMMANDS values"

requirements-completed: [PW-05]

coverage:
  - id: D1
    description: "The runner rejects npm, npx, pnpm, yarn and playwright in every spelling (bare, POSIX path, Windows path, upper/mixed case, each shim extension, stacked shims)"
    requirement: PW-05
    verification:
      - kind: unit
        ref: "test/runner-no-playwright.test.js#assertCommandAllowed denies package managers and Playwright in every form"
        status: pass
    human_judgment: false
  - id: D2
    description: "normalizeCommandName maps NPM.EXE→npm, /usr/local/bin/npx.cmd→npx, npm.cmd.exe→npm and leaves node/node.exe intact; empty, null and separator-only names stay denied"
    verification:
      - kind: unit
        ref: "test/runner-no-playwright.test.js#normalizeCommandName"
        status: pass
      - kind: unit
        ref: "test/runner-no-playwright.test.js#assertCommandAllowed keeps its empty-command branch"
        status: pass
    human_judgment: false
  - id: D3
    description: "The allowlist stays closed: COMMAND_DENYLIST keeps all eleven baseline entries and COMMANDS is exactly six languages × six commands"
    requirement: PW-05
    verification:
      - kind: unit
        ref: "test/runner-no-playwright.test.js#the runner denylist is not weakened"
        status: pass
      - kind: unit
        ref: "test/runner-no-playwright.test.js#the runner allowlist stays closed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every buildable pipeline (javascript, python, go, java, rust) has steps that pass assertCommandAllowed, are absent from the denylist, never resolve to a package manager, and start with the COMMANDS entry"
    verification:
      - kind: unit
        ref: "test/runner-no-playwright.test.js#every pipeline the runner can build is allowlist-clean"
        status: pass
    human_judgment: false
  - id: D5
    description: "Spawn containment unchanged: shell: false, exactly one spawn call site, denylist literal still lists all eleven names"
    verification:
      - kind: unit
        ref: "test/runner-no-playwright.test.js#the runner source keeps its containment guarantees"
        status: pass
      - kind: unit
        ref: "npm run test:security (203 tests)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-25
status: complete
---

# Phase 9 Plan 05: Runner Never Spawns npm, npx or Playwright Summary

**`assertCommandAllowed` now normalizes command names (basename → lowercase → repeated `.exe/.cmd/.bat/.com/.ps1` strip) before the denylist check, so `npx.cmd`, `NPM.EXE`, `npm.cmd.exe` and Windows paths are denied while the six-command allowlist stays closed**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-10-24T15:54:27Z
- **Completed:** 2026-10-24T15:57:47Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments

- Closed the Windows-shim allowlist gap the research proved was live: `npx.cmd`, `NPM.EXE`,
  `playwright.cmd` and `C:\…\npx.cmd` were previously accepted by `assertCommandAllowed`.
- Added `test/runner-no-playwright.test.js` (29 tests) as the PW-05 guard: the deny matrix covers
  5 names × 13 spellings (bare, `/name`, `/usr/local/bin/name`, `C:\Program Files\nodejs\name`,
  upper, mixed, upper+shim, mixed+shim, and one per shim extension) = **65 deny assertions**, plus
  12 stacked-shim forms, 10 opted-in-bash forms and 22 denylist/path assertions — each verified to
  throw `/not allowed/` with `err.code === 'command_denied'`.
- Proved the allowlist is still closed and the runner still runs: `COMMAND_DENYLIST` retains all
  eleven Phase 2 entries, `COMMANDS` is pinned to exactly
  `['node','python3','go','javac','rustc','bash']` over
  `['javascript','python','go','java','rust','bash']`, and all five non-bash pipelines build with
  every step allowed and denylist-free.

## Task Commits

Each task was committed atomically:

1. **Task 1: Normalize command names before the denylist check** - `5af8aa8` (feat)
2. **Task 2: Prove the allowlist stays closed and the runner still works** - `c304cfb` (test)

**Plan metadata:** `docs(09-05): …` (see final docs commit)

## Files Created/Modified

- `web/studio-runner.js` — added `COMMAND_SHIM_EXTENSIONS` (frozen list `.exe/.cmd/.bat/.com/.ps1`)
  and `normalizeCommandName`; `assertCommandAllowed` now derives `name` from it. **Nothing else
  changed** — `COMMANDS`, `COMMAND_DENYLIST`, `buildPipeline`, the timeouts, error text and the
  spawn options are byte-identical to the pre-plan file apart from the four removed lines replaced
  by one.
- `test/runner-no-playwright.test.js` — new root-suite guard (29 tests, 291 lines).

## Normalization rule (exact)

```js
export const COMMAND_SHIM_EXTENSIONS = Object.freeze(['.exe', '.cmd', '.bat', '.com', '.ps1']);

export function normalizeCommandName(command) {
  let name = String(command ?? '').trim().split(/[\\/]/).pop().toLowerCase();
  for (;;) {
    const ext = COMMAND_SHIM_EXTENSIONS.find((candidate) => name.endsWith(candidate));
    if (!ext) return name;
    name = name.slice(0, -ext.length);   // repeated, so npm.cmd.exe → npm
  }
}
```

Order inside `assertCommandAllowed` is unchanged and now operates on the normalized name:

1. empty name → `Error('No command supplied.')`, `code = 'command_denied'`
2. `name === 'bash' && allowBash` → allowed
3. `COMMAND_DENYLIST.has(name)` → `Error('Command "<name>" is not allowed by the local runner.')`, `code = 'command_denied'`
4. otherwise allowed

Because normalization runs before the `bash` branch, `BASH.CMD` without `allowBash` is denied and
`bash` (or a shim spelling of it) is allowed only with the explicit opt-in — `buildPipeline` never
emits a shimmed name, so the actual spawn argument is unchanged.

## Deny matrix (what the guard asserts)

| Form | npm | npx | pnpm | yarn | playwright |
|---|---|---|---|---|---|
| bare | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/name` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/usr/local/bin/name` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `C:\Program Files\nodejs\name` | ✓ | ✓ | ✓ | ✓ | ✓ |
| UPPER (`NPM`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mixed (`Npx`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| UPPER + `.EXE` (`NPM.EXE`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mixed + `.Cmd` (`Npx.Cmd`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `.exe` / `.cmd` / `.bat` / `.com` / `.ps1` | ✓ | ✓ | ✓ | ✓ | ✓ |

Plus stacked forms (`npm.cmd.exe`, `npm.EXE.CMD`, `npx.cmd.COM`, `playwright.cmd.exe`,
`C:\Program Files\nodejs\npx.CMD.EXE`, `/usr/local/bin/yarn.cmd.exe`, …), the same five names with
`{ allowBash: true }`, and `bash`/`BASH.CMD` gating.

## Allowlist pin (exact)

```js
expect(Object.keys(COMMANDS)).toEqual(['javascript','python','go','java','rust','bash']);
expect(Object.values(COMMANDS)).toEqual(['node','python3','go','javac','rustc','bash']);
```

No new executable, no mapping change, no denylist removal.

## Additive, behaviour-neutral exports

`normalizeCommandName` and `COMMAND_SHIM_EXTENSIONS` are **additive, behaviour-neutral exports**: on
their own they alter no code path and exist only so the root guard test can assert the
normalization directly instead of inferring it from the throwing wrapper (plan Assumption A1). The
**only runner behaviour change in the whole of Phase 9 is the normalization inside
`assertCommandAllowed`** (D-19) — no allowlist expansion, no new command, no other runner change.

## Decisions Made

- Followed D-19 exactly: one normalization helper, used for the `name` in `assertCommandAllowed`,
  with every existing branch, message and `error.code` preserved verbatim.
- Pipeline assertions are denylist-shaped, not allowlist-shaped: `java` emits `{ cmd: 'java' }` and
  `rust` emits `{ cmd: './main' }`, which are allowed but are not `COMMANDS` values. This
  distinction is asserted explicitly so a future reader cannot "fix" the test by widening the
  allowlist.
- Source containment assertions were extended slightly beyond the plan's two (`shell: false`,
  denylist literal) with `not.toContain('shell: true')` and an exactly-one `spawnImpl(` call-site
  check, per threat T-09-21.

## Deviations from Plan

### Plan-prose correction (no code change)

**1. [Prose] `assertCommandAllowed('...')` does not throw "No command supplied." — and was not forced to**

- **Found during:** Task 1 (deny matrix authoring)
- **Issue:** the plan's *Edge Coverage* prose says `assertCommandAllowed('...')` still throws the
  existing "No command supplied." branch. It does not — `'...'` normalizes to `'...'`, which is
  neither empty nor denylisted, so it was already accepted before this plan. Asserting the prose
  would require a behaviour change (rejecting dot-only names) that D-19 forbids and that the
  plan's own `<acceptance_criteria>` does not ask for.
- **Fix:** the Task 1 acceptance criteria is authoritative and lists only `''`, `null` and `'npx/'`
  (plus `'   '`/`undefined` for completeness); all of those are asserted to throw
  `'No command supplied.'` with `code === 'command_denied'`. `'...'` is not a package-manager alias:
  it cannot reach `COMMAND_DENYLIST`, and a real spawn would fail with `ENOENT` → exit 127, so the
  guard is not weakened by leaving it alone.
- **Files modified:** `test/runner-no-playwright.test.js`
- **Verification:** `npx vitest run test/runner-no-playwright.test.js --project root` green (29/29).
- **Committed in:** `5af8aa8`

---

**Total deviations:** 1 prose correction (0 code/behaviour deviations).
**Impact on plan:** None. No allowlist expansion, no denylist weakening and no change outside the
single approved `assertCommandAllowed` normalization.

## Verification Results

| Command | Result |
|---|---|
| `npx vitest run test/runner-no-playwright.test.js --project root` | ✓ 29/29 passed |
| `npx vitest run test/studio-runner.test.js --project root` | ✓ passed (pre-existing suite untouched) |
| `npm run test:security` | ✓ 14 files / 203 tests passed |
| `npm test` (full root + studio) | ✓ 87 files / 1199 tests passed |
| `git diff --stat 30c8776..HEAD` | only `web/studio-runner.js` (+32/−4) and the new test (+291) |

## Issues Encountered

None. The pre-existing `test/studio-runner.test.js` and `test/security/runner.test.js` were run at
Gate A (immediately after the runner patch) and again in the full suite; both stayed green.

## User Setup Required

None — no external service configuration, no dependency or lockfile change (`npm install` was not
run).

## Next Phase Readiness

- PW-05 is enforced by a test that covers shim, path and case variants rather than bare names only,
  so the external-evidence flow (other Phase 9 plans) can rely on Studio never spawning a package
  manager or Playwright.
- The runner file is patched only where D-19 allows; the rest of it remains read-only for this
  phase and for later phases.

## Self-Check: PASSED

- `test/runner-no-playwright.test.js` — FOUND
- `web/studio-runner.js` — FOUND
- commit `5af8aa8` — FOUND
- commit `c304cfb` — FOUND

---
*Phase: 09-playwright-template-and-verify-externally*
*Completed: 2026-10-25*
