---
phase: 2
plan: 5
status: complete
requirements: [SEC-02, SEC-07, SEC-11, SEC-13, SEC-14]
commits:
  - af69bd7 feat(02-05): use fragment pairing, masked tokens and rotation in studio
  - 5bda609 feat(02-05): make web Studio-only by default with legacy flags
  - db85ee2 feat(02-05): add doctor security posture and token-aware health
  - 3bc6bec feat(02-05): auth the legacy client from the fragment and add a deprecation banner
  - 97298ab feat(02-05): reject unsafe registry item names and record accepted risks
  - bf0f027 test(02-05): prove every rejection path is side-effect free
---

# Plan 02-05 — Release-Gate Edges and Legacy Client: Execution Summary

## What was built

### 1. `course-professor studio` pairing, masking and rotation (`bin/commands/studio.js`)

- `buildPairingUrl` now emits exactly `<studio-url>/#token=<encoded>` and appends
  `&bridge=<encoded http://localhost:<apiPort>>` only when `Number(apiPort) !== 3000`
  (`'3000'` string from `parseWebArgs` compares numerically).
- `resolveStudioToken` delegates to `web/security.js` (`ensureStudioToken`) and reads the token
  under `PROFESSOR_HOME`, keeping `web/.studio-token` only as the one-time migration source.
- The banner prints `security.maskToken(token)`; the full token appears only inside the pairing
  fragment.
- `--rotate-token` rotates before anything else. Alone it prints the mask + new pairing URL and
  returns 0 without starting; combined with any start argument it rotates first and starts with the
  new file token. It refuses with `env_token_immutable` when `STUDIO_BRIDGE_TOKEN` is set and writes
  nothing.
- The child env no longer freezes `STUDIO_BRIDGE_TOKEN`: it is only forwarded when the user already
  set it, so a running server observes file rotation through `createTokenGetter`. `PROFESSOR_HOME`
  remains inherited. The Host-validating static wrapper from Plan 02 still receives `extraHosts`.

### 2. Studio-only `course-professor web` (`bin/commands/web.js`)

- Exported `parseWebArgs(args)` returns
  `{ legacy, production, cloud, rotateToken, port: string|null }`; only the first positional
  non-flag becomes the port.
- Exported `resolveWebUiPort` returns `5173` for legacy dev and the API port for Studio-only/legacy
  production.
- Studio-only is the default: no `.env`, keychain or agent-home discovery and no API-key prompt.
  Legacy (`--legacy` or `PROFESSOR_LEGACY=1`) keeps the old discovery/prompt, sets
  `PROFESSOR_LEGACY=1`, and only legacy production requires `web/client/dist`; Studio-only
  production validates `studio/dist/index.html`.
- The command resolves/prints the masked token and the fragment pairing URL, then calls
  `startServer({ logBanner: false })` so the banner is printed once. The printed UI URL comes from
  `startServer().uiUrl` (5173 legacy dev, the API port otherwise).
- `--rotate-token` alone rotates/prints/exits without listening. Combined with a start request it
  rotates first, then starts.

### 3. `doctor` security posture (`bin/commands/doctor.js`)

- `buildPostureChecks({ env, platform, statImpl, resolveExecutableImpl })` reports:
  `Security · legacy web`, `Security · bind address`, `Security · token file`
  (0600 vs any other mode, "not created yet"), `Security · bash runner`,
  `Security · relaxed env` (wildcard/non-loopback warn; both = fail) and Windows agent shims
  (reusing `AGENT_BINARIES` from `web/studio-api/health.js` + the shared shim hint).
- `buildStudioHealthCheck` reads the token with the read-only `readTokenFile` and never creates one;
  an absent file probes without `X-Studio-Token`, and a 401 is reported as
  "server reachable but unpaired" (warn).
- `runChecks` now uses `PROFESSOR_HOME` for both the DB and token paths.

### 4. Legacy browser client (`web/client/src/**`)

- `client.js` adds `initPairing`, `pairingState`, `hasToken`, `pairingRequired`, `pairingError`,
  `apiBase`/`apiBaseFrom`, `resolveApiUrl`, `authHeaders` and `validateBridgeUrl`. The token is read
  only from `#token=`, stored in `sessionStorage`, never in `localStorage`/a query string, and the
  fragment is scrubbed with `history.replaceState`. A `#bridge=` value must be an `http(s)` loopback
  origin; otherwise it is discarded, `pairingError()` is set and no token is attached.
- Every request (`fetchCourses`, course files, exercises, save, capabilities, models, chat) uses the
  same `${apiBase()}/...` prefix and `X-Studio-Token`.
- `sendChatMessage` is now a fetch POST SSE reader (`ReadableStream` + `TextDecoder`) with
  `AbortController`; the native `EventSource`/query-string path is gone.
- `useSSE` resolves its request URL through `apiBase()` and merges `authHeaders()`;
  `ChatPanel` routes capability/model calls through the same base/headers, shows a "Pair this
  browser" state and disables sending when no usable token exists.
- New `DeprecationBanner` renders above the shell (desktop and mobile) and links to
  `http://localhost:5180`; `App.jsx` calls `initPairing()` before the first fetch.

### 5. Accepted risks and registry names

- New `docs/security/ACCEPTED-RISKS.md`: one accepted risk (community registry install integrity,
  Phase 3/DEBT-05 revisit trigger), a disposition table covering every CONCERNS Priority Summary
  row #1–#10 plus the additional security rows, an explicit "mapped, not accepted" list, escape
  hatches, residual risks and the `package.json.files` handoff.
- `validateItemName` now requires `/^[a-z0-9][a-z0-9-]*$/`, rejecting `.`, `..`, `...`, `a..b`,
  uppercase, `%`, `/`, `\` and leading separators while accepting lowercase slugs.

## Tests

```text
npx vitest run test/security                                              # 14 files, 200 tests passed
npx vitest run test/studio-api.test.js test/studio-api-agents.test.js \
  test/studio-runner.test.js test/cli-studio.test.js test/cli.test.js    # 5 files, 179 tests passed
npx vitest run                                                            # 28 files, 497 tests passed
```

New suites:

- `test/security/cli.test.js` — pairing fragment/numeric-bridge rules, `parseWebArgs`/UI port,
  doctor token mode/legacy/bind/Bash/relaxed-env/Windows shims, read-only token-aware health.
- `test/security/client.test.js` — bridge loopback accept/reject, `apiBase`/`sessionStorage`/scrub,
  no `EventSource`/query token, `apiBase`+`X-Studio-Token` source contract, banner/Studio link.
- `test/security/no-side-effects.test.js` — mocked `child_process`/`node:child_process`, full
  Studio + legacy rejection matrix (Host, Origin/null, missing/wrong token, non-JSON, malformed
  JSON, traversal read/write, runner slug/path), byte-identical snapshots, zero spawn calls, and the
  exactly-one-UI checks for Studio-only, legacy production and legacy dev.
- `test/security/subprocess-smoke.test.js` — real `node web/server.js`, `node bin/cli.js web`
  (Studio-only 404s, no key prompt) and `PROFESSOR_LEGACY=1` stderr warning; `npm start` script
  target; no `child_process` mocks.

Updated `test/cli-studio.test.js` (fragment pairing, numeric bridge, new token path/migration,
mask-only banner, rotation alone, env-token refusal) and the existing `validateItemName` block in
`test/cli.test.js` only.

## Decisions honored

- **D-03/D-05/D-23:** fragment-only pairing (no `?token=`), masked banner, rotation through the file
  getter, env-token refusal.
- **D-05..D-09/D-12:** Studio-only default, legacy opt-in with discovery/prompt, 5173 legacy-dev UI,
  stderr deprecation warning, loud non-combinable escape hatches.
- **D-16/D-26:** Windows shim posture, token-aware doctor probe, 401 = reachable but unpaired.
- **D-19:** single accepted risk + complete mapped table + strict registry slug.
- **D-20/D-21:** side-effect-proof matrix across both apps and all entry points; no CI/script edits.
- **D-27:** `package.json` untouched; handoff recorded.

## Deviations / notes

- `--rotate-token` is treated as rotate-and-exit when it is the only meaningful argument; any other
  start argument (`--port`, `--no-open`, `--legacy`, `--production`, a positional port, …) makes it
  rotate first and then start. This is how "alone" and "with a start request" are distinguished.
- The legacy client is served by Vite (dev) or the Express port (production); the command prints
  the UI URL but does not add a new browser-open behavior (`web` never opened one).
- **Execution incident:** the first version of the new rotation test restored its temporary env
  before the async rotation finished, so one local run rotated the real
  `~/.professor/studio-token`. The test helper now awaits the async body inside the env scope, and
  every later run used a temp `PROFESSOR_HOME`; the repository itself was unaffected.
- No `package.json`, lockfile, `studio/**`, `bin/static-server.js`, migration, `.planning/STATE.md`
  or `.planning/ROADMAP.md` change was made. The pre-existing untracked `.planning/state.json` was
  left untouched.

## Handoffs

- `package.json.files` must add `web/security.js` and `web/legacy-server.js` before release. Phase 4
  owns the edit and the tarball smoke; maintainers must treat it as a release blocker.
- Phase 4 owns `npm test`/CI wiring; this plan only guarantees `npx vitest run test/security` and the
  existing root suite.
- Phase 6 owns the Studio-side `#token=` reader, CSP/BYOK and loopback bridge enforcement; the
  fragment contract implemented here is the input it must consume.
- Phase 11 owns README/help/CHANGELOG wording; the CLI/doctor text here is operational.
- The local token currently on this machine was rotated once during execution (see above); re-pair
  any open Studio session if it was using the previous token.
