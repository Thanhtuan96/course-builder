---
phase: 2
plan: 4
status: complete
requirements: [SEC-09, SEC-10, SEC-13]
commits:
  - e9e03e4 feat(02-04): harden bridge agent argv, env, cwd and executable resolution
  - 5d55a16 test(02-04): cover agent argv, scrubbed env, temp cwd and Windows shims
  - 53db609 feat(02-04): deny runner commands, cap concurrency and contain workspaces
  - d85d722 test(02-04): cover runner denylist, 429 limiter, containment and scrubbed env
---

# Plan 02-04 — Agent and Runner Hardening: Execution Summary

## What was built

### Bridge agents (`web/studio-api/agents.js`, `web/studio-api/health.js`)

1. **One argv builder and a final pre-spawn assertion.**
   - New exported `buildAgentArgs(agent, ctx)` owns the exact Claude, Cursor, OpenCode, Gemini and
     Antigravity argv (antigravity still delegates to `antigravityArgs`). No bypass flag is added.
   - `runJsonCli` now builds `args`/`env`, calls
     `security.assertSafeAgentInvocation(agent, args, env)` **before** resolving or spawning, and
     returns a no-op killer after `onError({ code:'unsafe_invocation' })`/`onDone()` on rejection.
2. **Allowlisted env, temp cwd and closed production surface.**
   - `defaultAgentRunners({ extraEnv = {} } = {})` wraps every spawn; each spawn builds exactly one
     env with `buildAgentEnv('<agent>', process.env, { extraEnv })`. `runJsonCli` uses only
     `spec.env` and never reads bare `process.env`.
   - OpenCode derives its env from `buildAgentEnv('opencode', …)` and merges the server-built deny
     profile (`edit`, `bash`, `webfetch`, `websearch`, `task`); inherited `OPENCODE_*` config is
     never copied.
   - Claude no longer uses `WEB_DIR`/`tempCwd:false`; every agent runs in a `professor-*` temp cwd
     and the ad-hoc `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` deletes are gone (the allowlist excludes
     them by construction). `cleanupTempCwd` still runs on every finish path.
   - `PROFESSOR_CAPTURE_FILE` is reachable only through the test-only `extraEnv`.
3. **Shell-less executable resolution and Windows shims.**
   - `commandExists` in `health.js` and `cursorBinary` in `agents.js` now use
     `security.resolveExecutable`; `execSync('which …')` is gone from both files.
   - New exported `resolveAgentCommand(command, opts)` resolves without a shell and throws
     `unsupported_windows_shim` (with the shared message) for a resolved `.cmd`/`.bat` on Windows.
     `runJsonCli` maps a Windows `EINVAL`/`ENOENT`/`EPERM` spawn error to the same code/message.
4. **Ollama host validation.**
   - New exported `health.ollamaBase(env)` accepts only `127.0.0.1`, `localhost` or `[::1]` unless
     `PROFESSOR_ALLOW_NON_LOOPBACK_OLLAMA=1`. `runOllama` returns `code:'config'` with an opt-in
     hint without fetching; `probeOllama` returns `false` and `listOllamaModels` throws the same
     config error before any network call.

### Learner runner (`web/studio-runner.js`)

1. **Command denylist and concurrency cap.**
   - Exported `COMMAND_DENYLIST` (`npm`, `npx`, `pnpm`, `yarn`, `playwright`, `sh`, `bash`, `zsh`,
     `fish`, `cmd`, `powershell`) and `assertCommandAllowed(command, { allowBash })`, checked in
     `buildPipeline` and again in `runStep`. `bash` is allowed only for the explicit `bash` language
     with `allowBash` (from `PROFESSOR_ALLOW_BASH=1`).
   - Exported `createRunLimiter({ max })` with `tryAcquire`/`release`/`size`; the router takes
     `maxRuns` (`PROFESSOR_MAX_RUNS`, clamped 1–8, default 2), `mintLimiter` and `spawnImpl`, and
     stores its limiter on `router.runLimiter`.
   - Validation order is strict: slug → every file path → total size → entry → pipeline/denylist →
     realpath containment → limiter acquire → first `mkdir`/write/`spawn`.
   - A saturated router returns `429 { error:'Too many concurrent runs', code:'busy' }` with
     `Retry-After: 1`, with no filesystem or process side effect. Release is idempotent and runs in
     `finally` plus `res.on('close')`.
2. **Realpath containment and scrubbed child env.**
   - `security.resolveInside(workspacesRoot, courseSlug)` and
     `resolveInside(workspacesRoot, courseSlug, ...filePathSegments)` replace the lexical prefix
     check; `isSafeRelPath` + `security.isSafeWorkspaceRelPath` remain the first line of defense.
     Symlinked course dirs and symlinked existing targets are rejected before any write; files are
     opened with `O_NOFOLLOW`; parent dirs are created only after validation.
   - `runStep` uses the injected `spawnImpl` with `shell:false` and
     `{ ...buildLearnerEnv(process.env), PYTHONUNBUFFERED:'1', PYTHONIOENCODING:'utf-8' }` — no API
     keys, tokens, `*_OPTIONS`, `LD_*` or `DYLD_*`.
   - The 2 MB total cap, 200 KB output cap, timeout and process-tree kill behavior are unchanged.

## Files

- Changed: `web/studio-api/agents.js`, `web/studio-api/health.js`, `web/studio-runner.js`
- New: `test/security/agents.test.js`, `test/security/runner.test.js`,
  `test/security/fixtures/fake-agents/{claude,agent,opencode,gemini,agy}` plus the shared
  `_capture.cjs` helper.
- Existing suites needed no edits: `test/studio-api-agents.test.js` and
  `test/studio-runner.test.js` pass unchanged.
- Untouched: `.planning/STATE.md`, `.planning/ROADMAP.md`, `package.json`, lockfiles, `studio/**`,
  `bin/static-server.js`, migrations, and the pre-existing untracked `.planning/state.json`.

## Tests run and results

```text
npx vitest run test/security/agents.test.js test/security/runner.test.js   # 2 files, 22 tests
npx vitest run test/studio-api-agents.test.js test/studio-runner.test.js   # 2 files, 21 tests
npx vitest run test/security                                               # 8 files, 143 tests
node --check web/studio-api/agents.js web/studio-api/health.js web/studio-runner.js
```

Coverage:

- Agents: real argv per agent passes and every deny token/`--flag=value` form fails; deny env keys
  fail; fake binaries prove expected argv, `professor-*` temp cwd under the real tmpdir, temp cwd
  removal, scrubbed env (`NODE_OPTIONS`, `LD_PRELOAD`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`,
  `CLAUDECODE` absent) while provider credentials survive; OpenCode deny profile; production
  `defaultAgentRunners()` never forwards `PROFESSOR_CAPTURE_FILE`; Windows `.cmd` resolution throws
  `unsupported_windows_shim`; non-loopback Ollama is refused without calling `fetch`.
- Runner: denylist unit matrix, bash opt-in, limiter counter/clamp, 429 with `Retry-After` and no
  second dir/spawn, slot release allowing a third run, traversal/absolute-path/symlink dir/symlink
  file rejection with no write or spawn, valid nested path, scrubbed learner env, non-zero exit and
  timeout behavior.

## Decisions honored

- **D-15:** shell-less spawns, temp cwd for every agent (including Claude), allowlisted env and a
  final argv/env assertion before spawn; no bypass flags.
- **D-16:** shared shell-less resolver; Windows `.cmd`/`.bat` shims fail with a structured
  `unsupported_windows_shim` error instead of an opaque spawn failure.
- **D-17:** language allowlist plus explicit command denylist, Bash off by default, concurrency cap
  (1–8, default 2) with `429` + `Retry-After` before side effects.
- **D-18:** learner processes receive the scrubbed `buildLearnerEnv` plus Python output flags.
- **SEC-13:** every rejection test asserts the injected spawn was not called and the workspace was
  not written.

## Deviations / notes

- `ollamaBase` lives in `health.js` (already imported by `agents.js`) so the bridge, health probe and
  model listing share one loopback policy; this also hardens `probeOllama`/`listOllamaModels`, which
  previously fetched an arbitrary `OLLAMA_HOST`.
- The fake-agent capture is implemented once in `_capture.cjs` and called by the five named wrapper
  fixtures; this keeps the per-agent protocol events in one place.
- `router.runLimiter` is exposed as a plain property (Express 5 routers have no `locals`), which the
  tests use to wait for release deterministically.
- The runner's `/toolchains` probe still uses `which`/`where` (unchanged contract); the plan only
  required replacing `which` in the agent health/agent modules.
- Existing `test/studio-api-agents.test.js` and `test/studio-runner.test.js` did not need changes:
  the runner's HTTP/SSE contract and the bridge re-export surface were preserved.

## Handoff notes

- Phase 5 documentation must keep describing the local runner as **not a sandbox**; it still runs
  learner code as the user even with the scrubbed env and containment.
- The `doctor` Windows agent-shim check mentioned in D-16 is not in this plan's file list; if not
  already added by Plan 05, it should consume `security.resolveExecutable` +
  `security.isWindowsCommandShim` and report the same message.
- Phase 4 owns `test:security`/CI wiring; these suites are runnable via plain `npx vitest run`.
- Root `package.json` `files` still needs `web/security.js` (Plan 01 handoff); Phase 4's tarball
  smoke should assert it is packed.
