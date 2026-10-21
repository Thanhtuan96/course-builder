---
phase: 2
plan: 1
status: complete
requirements: [SEC-07, SEC-08]
commits:
  - f70e929 feat(02-01): add security helpers for tokens, paths, guards and agents
  - c354868 test(02-01): cover token lifecycle and isolate the test environment
  - 6659e0f test(02-01): cover path containment and traversal rejection
  - 26dd9a8 test(02-01): cover host, origin, JSON, env, argv and executable helpers
  - docs(02-01): add execution summary
---

# Plan 02-01 — Security Helper Contract: Execution Summary

## What was built

`web/security.js` is the phase-wide helper module every later plan composes. No route, guard,
server, CLI or package metadata file was changed.

1. **Token lifecycle (D-01, D-02, D-05, D-23).**
   - `PROFESSOR_HOME`, `tokenFilePath`, `legacyTokenPath`, `readTokenFile`, `writeTokenFile`,
     `migrateLegacyToken`, `ensureStudioToken`, `maskToken`, `createTokenGetter`,
     `rotateStudioToken`.
   - Read-first resolution: `STUDIO_BRIDGE_TOKEN` → existing token file → one-time legacy
     migration → generated `randomBytes(24).toString('hex')`.
   - Atomic write: directory `0700`, sibling temp file `0600`, `chmod`, rename, then `chmod` the
     final path so a pre-existing `0644` token becomes `0600`. `readTokenFile` is read-only.
   - Migration writes the new file first and deletes the legacy file only when there is no env
     override and no new token file. An existing new file leaves the legacy file untouched.
   - `maskToken` returns first-four/last-four (or a bullet mask for short values) and never the
     full token.
   - `rotateStudioToken` refuses with `code: 'env_token_immutable'` and writes nothing when an env
     token is set.
   - `createTokenGetter` caches `{ token, mtimeMs, size }` and re-reads after a stat change.
2. **Path containment (D-10).**
   - `isSafeSlug`, `isSafeCourseFile`, `isSafeExerciseFilename`, `isSafeWorkspaceRelPath`,
     `resolveInside(root, ...segments)`, `safeWriteFile(root, segments, content)`.
    - Rejects non-strings, empty or `.`/`..` segments, NUL/control characters, backslashes, absolute paths,
     drive letters, UNC paths and a literal `%` after one `decodeURIComponent` (which also blocks
     `%2e%2e`, `%2F` and double-encoded `%252e%252e`).
   - Lexical containment plus a nearest-existing-ancestor realpath check, an unconditional final
     symlink rejection and `O_NOFOLLOW` on the last write. Directories are created only after
     validation.
3. **Host / Origin / JSON predicates (D-11..D-14, D-22).**
   - `HOST_ALLOWLIST`, `parseHostHeader`, `isAllowedHost`, `resolveExtraHosts`,
     `isLoopbackAddress`, `DEFAULT_ORIGINS`, `parseOrigins`, `isWildcardOrigins`,
     `isOriginAllowed`, `isNullOrigin`, `isJsonMediaType`, `hasRequestBody`,
     `requiresJsonContentType`.
   - The default origin string is unchanged; the literal `null` origin is always rejected and an
     absent Origin is left for the token guard.
4. **Agent env / argv / executable helpers (D-15, D-16).**
   - `AGENT_ENV_ALLOWLIST`, `LEARNER_ENV_ALLOWLIST`, `AGENT_ENV_DENYLIST`, `buildAgentEnv`,
     `buildLearnerEnv`, `AGENT_DENY_FLAGS`, `assertSafeAgentInvocation`, `resolveExecutable`,
     `isWindowsCommandShim`, `unsupportedWindowsShimMessage`.
   - Per-agent credentials survive; loader/options/env-bypass keys are dropped. An inherited
     `OPENCODE_CONFIG_CONTENT` is never copied (the server builds it). `extraEnv` is a test-only
     third argument merged after the allowlist.
   - The deny check handles exact flags, `--flag=value`, value-aware `--permission-mode`,
     `--approval-mode`, `--mode` and `--sandbox` forms, and rejects deny-listed env keys with
     `code: 'unsafe_invocation'`.
   - Executable resolution is cross-platform (`PATHEXT`/case-insensitive directory matching);
     Windows `.cmd`/`.bat` shims are detected and produce the documented beta message.
5. **Test harness primitives.**
   - `test/security/helpers/snapshot.js`: symlink-safe tree snapshot (path/type/mode/size/SHA-256)
     with `snapshotTree` and `assertUnchanged`.
   - `test/security/helpers/env.js`: `withTempProfessorHome`, `isolateEnv`, `restoreEnv` (plus a
     `cleanupTempHome` convenience) that remove ambient API keys and every `PROFESSOR_*`/`STUDIO_*`
     key, then restore the exact snapshot.

## Key files

- `web/security.js` (new, single helper contract)
- `test/security/token.test.js`
- `test/security/paths.test.js`
- `test/security/helpers.test.js`
- `test/security/helpers/snapshot.js`
- `test/security/helpers/env.js`

## Tests run and results

All verify commands from the plan are green on Node 22 / Vitest 5:

```text
npx vitest run test/security/token.test.js      # passed
npx vitest run test/security/paths.test.js      # passed
npx vitest run test/security/helpers.test.js    # passed
# combined: 3 files, 88 tests passed
node -e "...export check..."                    # ok
node --check web/security.js                    # ok
```

The tests cover: generated token shape/newline/mode, pre-existing `0644` chmod, env override
writes nothing, migration + legacy deletion, existing-new-file precedence, rotation, immutable env
token, mask, and the mtime/size getter; every traversal/encoded/backslash/absolute/UNC and
file/directory symlink vector with parent snapshots; Host spoofing/ports/IPv6/userinfo,
origin `null`, wildcard non-emission policy, JSON media types and body gating, env allow/deny
behavior and `extraEnv`, per-agent argv denials and real bridge argv, `.cmd`/`.bat` detection and
the structured message.

## Decisions honored

- **D-01/D-02:** token at `${PROFESSOR_HOME:-~/.professor}/studio-token`, read-first, `0600` after
  every write, one-time legacy migration with deletion only when no env override and no new file.
- **D-05:** fixed-width mask; the full token is never returned by `maskToken`.
- **D-14:** single home in `web/security.js`; `DEFAULT_ORIGINS`/`parseOrigins` live here for Plan 02
  to re-export from `web/studio-api/guards.js`.
- **D-15/D-16:** env allowlist, argv denylist and Windows shim detection; no shell.
- **D-20:** `test/security/helpers/{snapshot,env}.js` are reusable by later plans; rejection tests
  assert filesystem snapshots.
- **D-23:** rotating writes a new token; `createTokenGetter` observes it by `mtimeMs`/`size`; env
  tokens cannot be rotated.

## Deviations / notes

- None from the plan's file list or semantics.
- `resolveExecutable` resolves Windows entries by matching actual directory-entry casing, so a
  `.cmd` shim resolves correctly even when the test host's filesystem is case-insensitive.
- `ensureStudioToken` only performs legacy migration when a `legacyFile` is supplied; later plans
  pass `legacyTokenPath(repoRoot)`. This keeps an accidental real-repo read out of helpers called
  with only a temp `home`.
- No route wiring, no `package.json`, lockfile, `studio/**`, `.planning/STATE.md`,
  `.planning/ROADMAP.md` or migration changes were made. The pre-existing untracked
  `.planning/state.json` was left untouched.

## Handoff notes

- Root `package.json.files` (not owned by Phase 2, D-27) must gain `web/security.js` and
  `web/legacy-server.js` (Plan 03) before release; Phase 4's tarball smoke must assert both are
  packed.
- Do not add a `test:security` script or change `vitest.config.js` (Phase 4 owns those, D-21).
- Plan 02 should import `DEFAULT_ORIGINS`/`parseOrigins` from this module and re-export them from
  `web/studio-api/guards.js` to preserve the Phase 1 surface.
- Plan 04's bridge should call `buildAgentEnv(agent, process.env, { extraEnv })` and
  `assertSafeAgentInvocation(agent, argv, env)` immediately before `spawn`, and set the OpenCode
  deny profile itself (this module never copies an inherited config).
