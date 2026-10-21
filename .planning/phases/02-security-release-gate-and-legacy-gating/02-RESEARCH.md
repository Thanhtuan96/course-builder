# Phase 2 Research: Security Release Gate and Legacy Gating

**Researched:** 2026-10-22
**Phase:** 2 — Security Release Gate and Legacy Gating
**Status:** Ready for planning
**Question answered:** What do we need to know to PLAN this phase well?

**Method:** Read the Phase 2 context, requirements, roadmap, CONCERNS, and every Phase-2-owned
source file; verified version-sensitive CLI/Node/Express behavior against live documentation
(links in Sources); checked the current Express/body-parser implementation in `node_modules` where
the repo itself pins the behavior.

---

## Executive Summary

1. **The guard layer must be rebuilt, not extended in place.** The current Studio guards parse the
   body *before* authentication (`web/studio-api/guards.js:49-57`), have no `Host` guard, no JSON
   content-type gate, and allow `Origin` absence without a token check only because the token guard
   follows anyway. Legacy has no guard at all (`web/server.js:27-28`).
2. **`web/server.js` is not a factory today.** It mounts `cors()`, creates `COURSES_DIR`, starts
   Vite with `shell: true`, and calls `server.listen()` at module load (`web/server.js:19-33`,
   `:1170-1183`, `:1205`). It must be split into a pure `createApp({ legacy })` plus an entry-point
   `startServer()`; `web/studio-api.js` also has an eager module-level init (`:145-156`) that must be
   removed for the same reason.
3. **The legacy agent paths are more dangerous than CONCERNS records.** Besides Claude's
   `--dangerously-skip-permissions` and Cursor's `--trust`, the legacy OpenCode path
   (`web/server.js:836-919`) runs `opencode run --format json` with no permission overrides and
   `cwd: web/`; OpenCode defaults most tools to `allow` (edit/bash included). Gating legacy behind a
   token does not make that safe by itself — the spawns must use the same safe argv/env/temp-cwd
   contract as the bridge.
4. **Safe invocations are possible for all six agents, but the facts differ.** Claude and Cursor
   must never receive bypass/force/trust flags; Gemini/Antigravity `--mode plan` is a read-only
   intent, not a hard sandbox (Gemini headless Plan Mode can auto-switch to YOLO when it exits
   plan); OpenCode needs a deny permission profile injected through `OPENCODE_CONFIG_CONTENT`;
   Ollama is HTTP-only. A shared `assertSafeAgentInvocation(argv, env)` is the enforceable contract.
5. **Windows `.cmd`/`.bat` shims cannot work with `spawn({ shell:false })`.** Node documents that
   batch files are not executable without a terminal and cannot be launched by `execFile`; Node
   20+ commonly reports `EINVAL`. Resolve the binary, detect the extension, and return a structured
   `unsupported_windows_shim` error before spawning; `doctor` reports the same.
6. **Path containment needs lexical *and* real-path checks.** Express decodes `%2F` in route params
   (the CONCERNS write traversal was verified), and `resolve()` alone does not stop symlink escapes.
   Validate decoded slug/file names against exact allowlists, then verify the realpath of the target
   (or its nearest existing ancestor) is under the real root; reject a final symlink; use
   `O_NOFOLLOW` where available for the last write.
7. **Token handling must move out of `web/` and become read-first.** The current code regenerates a
   token and writes `web/.studio-token` on every server start (`web/studio-api.js:35-48`) and prints
   it in full (`:50-64`). Phase 2 must read an existing token, atomically write with mode `0600`,
   migrate the legacy file once, mask the banner, and support rotation that the guard observes.
8. **Side-effect tests are feasible without flakiness** by combining: injected `db`/`runners`/
   `capabilities`/`spawnImpl`, a `supertest` matrix for headers, a filesystem snapshot (hash +
   mode) for writes, and a `child_process` spy for the claim "no process spawned". One subprocess
   smoke covers `node web/server.js`; `npm start` can be a single per-test-timeout smoke, not a
   matrix.
9. **Two integration gaps need an explicit decision before execution:** (a) root `package.json`
   `files` does not include the new `web/security.js`/`web/legacy-server.js`, so the published
   package would break unless the orchestrator approves that one-line change; (b) `doctor`'s
   `/api/studio/health` probe currently sends no token (`bin/commands/doctor.js:173`) and will start
   failing with 401 after SEC-05.

---

## 1. Agent CLI invocations: safe flags, denied flags, env, Windows

### 1.1 Current state in the bridge (`web/studio-api/agents.js`)

| Agent | Current argv | cwd / env | Gaps |
|---|---|---|---|
| Claude | `--print --output-format stream-json --include-partial-messages --verbose [--system-prompt S] PROMPT` (`:302-306`) | `cwd: WEB_DIR`, `tempCwd:false`, `{...process.env}` minus `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` (`:307-317`) | Runs in `web/` (contains the old token file); inherits all env; no tool restriction |
| Cursor | `--print --output-format stream-json --stream-partial-output [--model M] PROMPT` (`:324-327`) | temp cwd (`:365`), `process.env` | No `--force`/`--trust` today (good); `--print` still has all tools; env not scrubbed |
| OpenCode | `run --format json [--model M] PROMPT` (`:372-376`) | temp cwd, `opencodeEnv()` (`:56-69`, `:382-383`) | Injects `permission {edit,bash,webfetch:deny}`; env starts from full `process.env`; `.env` reads and external dirs not denied |
| Gemini | `-p PROMPT -o stream-json --approval-mode plan [-m M]` (`:390-393`) | temp cwd, `process.env` | Plan mode is not a hard boundary in headless (see 1.3); env not scrubbed |
| Antigravity | `-p GUARDED --output-format stream-json --mode plan [--model M]` (`:253-257`) | temp cwd, `process.env` | Good plain-text guard; env not scrubbed; custom `--agent` not blocked by a sentinel |
| Ollama | HTTP `POST {OLLAMA_HOST}/api/chat` (`:422-481`) | n/a | No spawn; `OLLAMA_HOST` is inherited (SSRF to a user-chosen host, not request-controlled) |

The legacy server's Claude path is the unsafe one: `--dangerously-skip-permissions`
(`web/server.js:396`) plus `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1` (`:412`) and `cwd: __dirname`
(`:414`). Its Cursor path adds `--trust` (`:754`). Its OpenCode path has **no** permission profile
(`:843-854`), which by OpenCode's own defaults is permissive.

> Note: the roadmap research flag names "Codex", but this codebase has no Codex runner
> (`AGENT_BINARIES` in `web/studio-api/health.js:18-25` lists only the six agents above). Do not add
> a seventh agent in Phase 2; if Codex support is wanted later it needs its own safe-invocation
> research (`codex exec --json` has its own bypass flags).

### 1.2 Safe invocation per agent (verified against current docs)

- **Claude Code (`claude`)** — `-p/--print` with `--output-format stream-json` is the supported
  non-interactive mode. Without `--dangerously-skip-permissions`, a `-p` run starts in the normal
  permission mode and anything that would prompt is denied in non-interactive runs. For a tutor that
  needs no tools, the strongest safe knob is `--tools` with an empty tool set (the official CLI
  reference documents `--tools` for restricting available tools; empty-string behavior should be
  feature-checked against the installed version) or a deny list
  `--disallowedTools "Bash,Edit,Write,Read,WebFetch,WebSearch"`; `--permission-mode plan` is a
  softer read-only posture. Keep the argv minimal for compatibility, but **deny**:
  `--dangerously-skip-permissions`, `--allow-dangerously-skip-permissions`,
  `--permission-mode=bypassPermissions|acceptEdits|auto`, and `--enable-auto-mode` (historical).
  (`--permission-mode plan` is allowed.) Source: Claude Code CLI reference / permission modes.
- **Cursor CLI (`agent` / `cursor-agent`)** — `--print` is the non-interactive mode and, per Cursor's
  docs, "has access to all tools, including write and shell"; `--force`/`--yolo` actually applies
  changes. Without `--force`, changes are proposed, not applied. Use `--print --output-format
  stream-json --stream-partial-output` with **no** `--force`, `--yolo`, `--trust`, `--approve-mcps`,
  or `--sandbox disabled`; optionally add `--sandbox enabled`. Source: Cursor CLI parameters /
  headless docs.
- **OpenCode (`opencode`)** — `run --format json` is correct. Inject
  `OPENCODE_CONFIG_CONTENT` with `permission` deny for `edit`, `bash`, `webfetch`, `websearch`,
  `task`, and `external_directory` (and keep read allowed; `.env` is denied by default). **Deny**
  `--auto` (auto-approves everything not explicitly denied) and `--dangerously-skip-permissions`
  (accepted by some builds/wrappers). Source: OpenCode permissions / CLI docs.
- **Gemini CLI (`gemini`)** — `-p`, `-o stream-json`, `--approval-mode plan` are current. Important
  caveat: Gemini's Plan Mode docs state that in non-interactive environments, when Plan Mode exits
  to execute a plan it **automatically switches to YOLO mode**. The bridge's prompt is plain text
  with no tools requested, so this normally never triggers, but plan mode must not be described as a
  sandbox. **Deny** `--yolo`, `-y`, `--approval-mode=yolo|auto_edit|default` (allow only `plan`),
  `--skip-trust`, `--allowed-tools`, and `--allowed-mcp-server-names`. Source: Gemini CLI headless /
  configuration / plan-mode docs.
- **Antigravity (`agy`)** — `-p`, `--output-format stream-json`, `--mode plan` are current; the
  existing plain-text guard is correct because headless tool steps can auto-deny and produce an
  empty exit-0 run. **Deny** `--dangerously-skip-permissions`, `--mode=accept-edits|default`,
  `--agent` (custom agent may carry its own permissions), and `--remote-control`. `--sandbox` is
  allowed. Source: Antigravity headless / modes docs.
- **Ollama** — no CLI flags; keep `OLLAMA_HOST`/`OLLAMA_MODEL` and validate the host is loopback
  unless explicitly overridden. No shell, no env injection surface beyond the HTTP URL.

**Deny-check contract (must be a single exported helper, used by both bridge and legacy):**

```js
assertSafeAgentInvocation(agent, args, env)
// throws { code: 'unsafe_invocation' } with the offending token
```

Rules:
- Reject exact tokens and `--flag=value` forms for the per-agent deny sets above.
- Reject short aliases only where they are bypasses (`-f` for Cursor/force, `-y` for Gemini/yolo);
  do **not** reject `-p` (print) or `-m` (model).
- Reject a deny-listed env key if it survives into the final spawn env (`NODE_OPTIONS`, `LD_*`,
  `DYLD_*`, `BASH_ENV`, `ENV`, `OPENCODE_PERMISSION`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, …).
- Run the check on the **final** argv/env immediately before `spawn`, so a future caller cannot
  bypass it.
- Return a user-facing error (SSE `error` with `code:'unsafe_invocation'`) rather than spawning and
  hoping the CLI enforces something.

### 1.3 Environment allowlist (Q3)

Base allowlist for every agent CLI:

```
PATH HOME USER LOGNAME SHELL TMPDIR TMP TEMP LANG LC_ALL LC_CTYPE TERM
# Windows process/runtime essentials
SystemRoot ComSpec PATHEXT WINDIR APPDATA LOCALAPPDATA USERPROFILE
PROGRAMDATA PROGRAMFILES "PROGRAMFILES(X86)" NUMBER_OF_PROCESSORS PROCESSOR_ARCHITECTURE
```

Per-agent credentials/config (keep only what is needed for auth):

| Agent | Keep |
|---|---|
| Claude | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_API_KEY`, `CLAUDE_CONFIG_DIR` (optional) |
| Gemini | `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` |
| Cursor | `CURSOR_API_KEY` |
| OpenCode | `OPENCODE_CONFIG_CONTENT` (only the value this server builds), optionally `OPENCODE_MODEL` |
| Antigravity | `GOOGLE_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` (creds otherwise live under `HOME`) |
| Ollama | `OLLAMA_HOST`, `OLLAMA_MODEL` |

Always drop (even if currently inherited): `NODE_OPTIONS`, `NODE_PATH`, `NODE_EXTRA_CA_CERTS`,
`LD_PRELOAD`, `LD_LIBRARY_PATH`, `LD_AUDIT`, every `DYLD_*`, `BASH_ENV`, `ENV`, `SHELLOPTS`,
`BASHOPTS`, `PS4`, `PROMPT_COMMAND`, `CDPATH`, `PERL5LIB`, `PERL5OPT`, `PERL5DB`, `PYTHONPATH`,
`PYTHONSTARTUP`, `PYTHONHOME`, `RUBYOPT`, `RUBYLIB`, `JAVA_TOOL_OPTIONS`, `_JAVA_OPTIONS`,
`JDK_JAVA_OPTIONS`, `MAVEN_OPTS`, `GRADLE_OPTS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*`,
`GIT_CONFIG_VALUE_*`, `GIT_SSH_COMMAND`, `GIT_EXTERNAL_DIFF`, `GIT_PAGER`, `PAGER`, `LESSOPEN`,
`LESSCLOSE`, `SSH_ASKPASS`, `SUDO_ASKPASS`, `npm_config_*`, `OPENCODE_PERMISSION`,
`CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, `CLAUDECODE`, `CLAUDE_CODE_*`.

Rationale: most of these are not attacker-controlled from the browser, but they are exactly the
vectors that turn a parent shell's environment into code execution inside a spawned agent. An
allowlist is auditable and satisfies D-15; a denylist alone would miss a new loader variable.

**Learner-run processes** get a smaller allowlist (`PATH HOME USER TMPDIR TMP TEMP LANG LC_ALL
LC_CTYPE TERM` + Windows essentials) plus `PYTHONUNBUFFERED=1` which the runner adds. No API keys,
no `*_OPTIONS`, no `DYLD_*`/`LD_*`. If a learner's toolchain needs a custom loader path, that is a
documented beta limitation, not a reason to widen the allowlist.

### 1.4 Windows `.cmd`/`.bat` shims (Q2)

Node's `child_process` docs are explicit: `.bat`/`.cmd` files are not executable on their own
without a terminal and cannot be launched with `execFile`; the supported options are `spawn` with
`shell: true`, `exec`, or `cmd.exe /c`. Since Phase 2 forbids a shell, these shims are unsupported
for beta.

Detection and message:
- Resolve the command with the cross-platform `whichPath` logic already in
  `bin/commands/doctor.js:17-27` (it checks `PATHEXT` `.cmd`/`.exe`/empty on Windows). Move/reuse a
  shared `resolveExecutable(command, { platform, pathValue })` in `web/security.js`.
- If the resolved path ends in `.cmd`/`.bat` on Windows, do not spawn. Return:
  `"<Agent> is installed as a Windows batch shim (<path>). The local bridge runs agents without a shell, so .cmd/.bat shims are unsupported in this beta. Install the native binary or use WSL."`
  with `code:'unsupported_windows_shim'`.
- Also map a `spawn` `error` with `code === 'EINVAL'` (or `ENOENT` for a `.cmd` path) on Windows to
  the same message, so an unexpected resolution path still produces a clear error rather than an
  opaque failure.
- `doctor` adds a `Windows agent shims` check: `fail` when any of `claude/opencode/agent/cursor-agent/gemini/agy`
  resolves to `.cmd`/`.bat`, listing the paths and the same hint. On non-Windows the check is `ok`
  with "not applicable".
- Note: `web/studio-api/health.js:84` and `web/studio-api/agents.js:295` currently use
  `execSync('which …')`, which is Unix-only. Replace with the shared resolver so detection is also
  correct on Windows (needed for the doctor message, even though execution is unsupported).

### 1.5 Agent test strategy

- Unit: `assertSafeAgentInvocation` accepts every real built argv and rejects each deny token/form;
  env-allowlist builder drops every deny key and preserves provider keys.
- Integration without real CLIs: put fake `claude`, `agent`, `opencode`, `gemini`, `agy` shell
  scripts on `PATH` that append `{argv, env, cwd}` as JSON to a temp file and emit the protocol's
  success event. Run `defaultAgentRunners()[agent]`, then assert: expected argv, no deny token,
  `cwd` is a `professor-*` temp dir (not `web/`), `env` has no `NODE_OPTIONS`/API keys that should
  be absent, and the temp cwd was removed. The existing `agy` fixture test
  (`test/studio-api-agents.test.js:191-222`) is the pattern.
- Spawn-failure: fake `.cmd` resolution (unit) and `EINVAL` mapping (unit).
- No test should depend on a real agent being installed; gate with `commandExists` only for the
  optional fake-script path.

---

## 2. Guard ordering and HTTP semantics (Q4)

### 2.1 Current gaps (evidence)

- `web/server.js:26-28`: `/api/studio` is mounted, then `cors()` for **all** routes, then a 50 MB
  JSON parser. Every legacy route is unauthenticated and cross-origin readable.
- `web/studio-api/guards.js:49-57`: JSON body parser runs before the loopback/origin/token guards.
  An unauthenticated 25 MB body is parsed before rejection.
- `guards.js:60-82`: origin allowlist and preflight; `allowAll` sets
  `Access-Control-Allow-Origin: *` (`:68`), which violates SEC-04's "no wildcard CORS anywhere".
- `guards.js:85-90`: token guard; no `Host` check anywhere.
- No JSON content-type gate; `express.json()` silently skips non-JSON bodies, so `req.body` is `{}`
  and handlers may act on missing fields instead of returning 415.

### 2.2 Required order (D-11)

For every API router (Studio and legacy):

```
1. Host guard                    -> 403 { code:'forbidden_host' }
2. Origin guard + preflight      -> 403 { code:'forbidden_origin' }; OPTIONS -> 204
3. Token guard (OPTIONS excepted)-> 401 { code:'unauthorized' }
4. JSON content-type gate        -> 415 { code:'unsupported_media_type' }
5. express.json({ limit, strict:true })
6. JSON/body error handler       -> 400 { code:'invalid_json' } / 413 { code:'payload_too_large' }
7. route handler
```

Global (in `createApp`): Host guard must also cover static assets; the token/origin/JSON guards must
**not** cover static Studio assets (D-04). Practical composition: put the Host guard on `app` first,
then mount static, then mount `/api/studio` (which installs its own copy of all guards), then the
legacy API guard+router when enabled, then an API 404, then the SPA fallback for GET/HEAD. A double
Host check on API requests is harmless and keeps standalone `createStudioApp()` correct.

**Preflight:** `OPTIONS` must pass Host+Origin, skip token and JSON, return 204 with exact
`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
`Access-Control-Allow-Headers: Content-Type, X-Studio-Token`, `Vary: Origin`, and
`Access-Control-Allow-Private-Network: true` when requested. A browser preflight never carries
`X-Studio-Token`, so token-before-OPTIONS would break the Studio client.

### 2.3 Content-type gate details

Do **not** use `req.is('application/json')` as the gate. Express's `req.is` delegates to `type-is`,
which returns `null` for a request with no body even when the header is present (documented in the
Express request docs and issue #3669). Use the raw header:

```js
const CHANGING = new Set(['POST', 'PUT', 'PATCH']);
const hasBody = Boolean(req.headers['transfer-encoding']) ||
  Number(req.headers['content-length'] || 0) > 0;
if (CHANGING.has(req.method) && (!hasBody || !isJsonMediaType(req.get('Content-Type')))) {
  return res.status(415).json({ ok:false, error:'Content-Type must be application/json', code:'unsupported_media_type' });
}
if (req.method === 'DELETE' && hasBody && !isJsonMediaType(...)) { /* 415 */ }
```

- `isJsonMediaType` should accept `application/json` with optional parameters (`; charset=utf-8`)
  and reject `application/*+json` unless we intentionally support it. All current endpoints send
  `application/json`.
- `GET`/`HEAD`/`OPTIONS` are never gated; SSE **responses** are unaffected because the request is
  still a JSON POST (`/complete`, `/run`).
- Body-parser errors: map `entity.parse.failed` -> 400 `invalid_json`; `entity.too.large` -> 413
  `payload_too_large`; unsupported charset/encoding -> 415. Return JSON, never Express's default HTML
  error page.
- Limits: Studio 25 MB (`guards.js:51`), legacy 50 MB (current `web/server.js:28`). Keep them
  per-router; do not add a global parser.

### 2.4 Host guard (DNS-rebinding defense)

- Read **`req.headers.host` / `req.get('Host')`** directly. Do not use `req.hostname` or `req.ip`:
  Express's `req.hostname` consults `X-Forwarded-Host` when `trust proxy` is enabled
  (`node_modules/express/lib/request.js:427-440`). Never enable `trust proxy`; document that the
  local server is not designed to sit behind a reverse proxy.
- Parse with the WHATWG URL API, which handles ports and IPv6 brackets:
  `new URL('http://' + hostHeader).hostname`.
  - `http://localhost:3000` -> `localhost`
  - `http://[::1]:3000` -> `[::1]` (Node keeps brackets)
  - `http://127.0.0.1:3000` -> `127.0.0.1`
  - invalid port (`localhost:abc`) throws -> 403
- Allow exactly `localhost`, `127.0.0.1`, `[::1]` (any valid port), per D-12. Reject a missing Host,
  userinfo (`http://evil.com@localhost` parses with username — reject if `url.username` or
  `url.password` is non-empty), paths/queries/fragments, and whitespace.
- `STUDIO_ALLOW_NON_LOOPBACK`: interpret the env value as the explicit hostname(s) to allow, not as
  a blanket "any host". If set to `1`/`true`, fall back to the `HOST` env value; if `HOST` is
  `0.0.0.0`/`::` (ambiguous), refuse to start with a non-zero exit and a clear message. Print a loud
  stderr warning. This preserves DNS-rebinding protection while allowing an intentional LAN bind.
- IPv4-mapped addresses: the client-address loopback check already accepts `::ffff:127.0.0.1`
  (`guards.js:24-33`); keep it for `req.socket.remoteAddress`. The Host allowlist itself stays the
  three names above.

### 2.5 Origin guard and the `STUDIO_ORIGINS=*` tension

- Exact string match against the allowlist; absent Origin is allowed to proceed to the token guard;
  `Origin: null` is a literal string and must be rejected (opaque origins, sandboxed iframes,
  `file://`).
- Default allowlist: `http://localhost:5180,http://127.0.0.1:5180` (D-13), **plus the server's own
  origin(s)** for the port it binds (`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`), plus
  `http://localhost:5173,http://127.0.0.1:5173` in legacy dev (Vite default port is 5173; the proxy
  forwards the browser's Origin while `changeOrigin` rewrites only Host). Without the own-origin
  merge, Studio served by `course-professor web` on 3000 would 403 its own same-origin calls.
- SEC-04 says "no wildcard CORS anywhere"; D-12 permits `STUDIO_ORIGINS=*` as a loud beta escape
  hatch. Reconcile them by **never emitting `Access-Control-Allow-Origin: *`**. When `*` is set,
  echo the exact request Origin (after rejecting `null`), warn loudly at startup, and have `doctor`
  report the posture as relaxed. Tests assert the header is never literally `*` in default mode, and
  that `*` still requires a token. If the planner wants SEC-04 to be literally unconditional, the
  alternative is to refuse `*` entirely and require an explicit host list — but that contradicts
  D-12, so flag it as a decision, not a silent change.
- CORS headers only for allowed origins. `Vary: Origin`. No credentials mode is needed (token is a
  custom header).

### 2.6 supertest/fetch behavior for the matrix

- `supertest(app)` starts an ephemeral server and sets `Host: 127.0.0.1:<port>`. To spoof Host,
  `.set('Host', 'evil.example')` overrides it. This is the reliable way to test DNS-rebinding
  rejection.
- `Origin` is not sent unless `.set('Origin', ...)`; `.set('Origin', 'null')` tests the opaque case.
- Node's `fetch` sets Host automatically; use it for SSE and entry-point tests. For the Host matrix,
  prefer supertest, or use `http.request` with an explicit `headers.host`. Do not rely on `fetch`
  allowing a spoofed Host.
- Test `OPTIONS` with `Access-Control-Request-Method/Headers` and, separately,
  `Access-Control-Request-Private-Network: true` (the existing test at
  `test/studio-api.test.js:102-115` is the pattern, but it must expect the new ordering).

### 2.7 Guard test matrix (minimum)

| Request | Expected |
|---|---|
| `GET /api/studio/health`, no token | 401 |
| same + valid token | 200 |
| same + valid token + `Origin: http://evil.example` | 403 `forbidden_origin` |
| same + valid token + `Origin: null` | 403 |
| same + valid token + `Host: evil.example` | 403 `forbidden_host` |
| same + valid token + `Host: localhost:<any>` / `[::1]:<any>` | 200 |
| `POST /api/studio/db`, `Content-Type: text/plain`, valid token | 415, no handler side effect |
| `POST /api/studio/db`, malformed JSON | 400 `invalid_json` |
| `POST /api/studio/db`, > limit | 413 `payload_too_large` |
| `OPTIONS` allowed origin, no token | 204 + exact ACAO/ACAH |
| same on legacy routes when legacy off | 404 |
| same on legacy routes when legacy on | same guard results |

---

## 3. Token lifecycle (Q6, SEC-07)

### 3.1 Required behavior

- Path: `${PROFESSOR_HOME:-~/.professor}/studio-token`. Create the directory with mode `0700`.
- Resolution order (D-01): `STUDIO_BRIDGE_TOKEN` env -> existing token file -> generate
  `randomBytes(24).toString('hex')` and persist. Trim the file's trailing newline on read.
- Every write: write a temp file in the same directory with `mode: 0o600`, `chmodSync(tmp, 0o600)`,
  atomic `renameSync(tmp, file)`, then `chmodSync(file, 0o600)`. Node's docs are explicit that
  `writeFile`'s `mode` only affects a newly created file, which is exactly why the current
  `web/.studio-token` keeps stale permissions when it already exists.
- Migration (D-02): only when no env override and no new token file exists, read
  `web/.studio-token`; if non-empty, persist it to the new path, delete the legacy file, and never
  read it again. If the new file already exists, leave the legacy file alone (do not delete a
  possible rollback artifact the user may still want).
- Masking (D-05): print `abcd…wxyz` (first 4 + last 4) or an equivalent fixed-width mask; print
  `Pairing URL: <studioUrl>/#token=<value>` (and `&bridge=<encoded apiUrl>` when
  `apiPort !== 3000`). Never print the token alone. The full token is allowed inside the fragment
  URL because the user must be able to pair; it is not a standalone log value.
- `--rotate-token`: generate + atomically write a new token, print the new masked value and pairing
  URL. If `STUDIO_BRIDGE_TOKEN` is set, refuse with a clear error (an env token cannot be rotated
  from the file). To make "invalidates immediately" true for a running server, the guard should
  take a `getToken()` callback that re-reads the file when its `mtimeMs`/`size` changes (a cheap
  `statSync` per request on a local server), with an in-memory cache. Alternative: document that a
  restart is required — but that contradicts D-05, so prefer the getter.
- Keep `TOKEN_FILE` as an exported symbol for the Phase 1 compatibility surface
  (`web/studio-api.js:35`), but point it at the new default path and mark it deprecated in favor of
  `tokenFilePath(env)`. Remove `resolveToken`'s unconditional regenerate/write.
- `bin/commands/studio.js` currently resolves the token but never persists a generated one
  (`:150-162`), so every start with no file changes the token and breaks saved pairings. Delegate to
  the shared helper.
- `bin/commands/doctor.js` should use `PROFESSOR_HOME` (it currently hard-codes `os.homedir()`,
  `:180`) and report `stat.mode & 0o777` as octal, `fail` when the token exists and is not `0600`.

### 3.2 Atomic write sketch

```js
function writeTokenFile(file, token) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = join(dir, `.studio-token.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, `${token}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);           // atomic on the same filesystem
  chmodSync(file, 0o600);          // re-apply even if the file pre-existed
}
```

On Windows, `chmod` has limited semantics; still call it (no-op-ish) and do not claim POSIX
guarantees in docs. The security property for Windows is the per-user profile ACL, not `0600`.

### 3.3 Token tests

- Pre-create the file with `0644`; resolve -> content preserved, mode becomes `0600`.
- No file -> generates 48 hex chars, file ends with `\n`, mode `0600`.
- Env override -> no file is created or modified.
- Migration -> legacy file content is used, the new file is `0600`, the legacy file is gone.
- Existing new file + legacy file -> new file wins; legacy file is not read/deleted.
- `maskToken` never returns the full token; banner text does not contain the full token except
  inside the pairing URL.
- Rotation -> new token guards requests; old token -> 401 (use `getToken` reading the file).
- `--rotate-token` with `STUDIO_BRIDGE_TOKEN` -> non-zero/refusal, no write.

---

## 4. Path containment (Q5, SEC-08)

### 4.1 Current gaps

- `getCourseFile`/`saveCourseFile` sanitize only `file`, not `slug`; `join(COURSES_DIR, slug, …)`
  (`web/server.js:87`, `:110`) lets `slug` escape. CONCERNS verified the write traversal.
- Exercise routes join the raw `filename` on read and write (`:192-193`, `:216-217`). Express
  decodes `%2F`, so `..%2F..` becomes `../..`.
- `getExercises` reads every `.md` in the directory; a symlink there escapes on read.
- `web/studio-runner.js` already validates relative paths and uses a lexical prefix check
  (`:49-59`, `:226-230`), but the check is lexical only and the final file may be a symlink.
- `saveFilesFromResponse` honors any `<file path="courses/<slug>/…">`, so prompt-injected content
  can overwrite another course (`:350-381`).

### 4.2 Required helper (single home in `web/security.js`)

`resolveInside(root, ...segments)`:

1. Reject non-strings, NUL/control chars, empty segments, `.`/`..`, backslashes, absolute paths,
   drive letters (`^[A-Za-z]:`), UNC prefixes, and (for slugs) any character outside
   `^[a-z0-9][a-z0-9-]*$`.
2. If a segment may contain percent-encoding (e.g., a body-supplied slug), decode once with
   `decodeURIComponent` and re-run step 1; if decoding throws, reject. Do not decode twice blindly;
   a literal `%` in a slug is invalid anyway.
3. Lexical containment on the **real root**: `realpathSync.native(root)` (create the root first or
   use the nearest existing ancestor). Resolve the candidate and require
   `candidate === realRoot || candidate.startsWith(realRoot + sep)`.
4. Symlink containment: walk up from the candidate to the nearest existing ancestor and
   `realpathSync.native` it; require it under `realRoot`. If the final target exists and
   `lstatSync(target).isSymbolicLink()`, reject.
5. For writes, create directories only after step 4; open the final file with
   `O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW` where the platform supports `O_NOFOLLOW` (POSIX).
   This closes the common TOCTOU window for the last component; a fully race-free implementation
   would need `openat`/`mkdirat`, which is unnecessary for a single-user local beta. Document the
   residual same-user race.

Legacy validators:
- Slug: `^[a-z0-9][a-z0-9-]*$`, length <= 120.
- Course file: exact set `COURSE.md`, `LECTURE.md`, `NOTES.md`, `CAPSTONE.md`.
- Exercise filename: `^[A-Za-z0-9][A-Za-z0-9._-]*\.md$`, no `..` segment, length <= 200.
- Workspace relative path: reuse `isSafeRelPath` from the runner (already rejects `\`, absolute,
  `..`, control chars) and add the realpath check.

`saveFilesFromResponse` scoping (D-10):
- If `courseSlug` is provided, only accept `courses/<courseSlug>/<file>` and bare `<file>`; skip a
  `courses/<other-slug>/…` block.
- If `courseSlug` is empty (legacy new-topic flow), allow a single `courses/<valid-slug>/…` **only
  when that course directory does not already exist**, and then adopt that slug for subsequent
  blocks in the same response. Never write into an existing different course. This preserves new
  course creation without opening the overwrite hole. This is a planner decision to confirm; it is
  the only way to satisfy D-10 and keep `professor:new-topic` working.
- Validate every resulting name with the exact file allowlist and `resolveInside`.

### 4.3 Traversal test vectors

| Vector | Where | Expected |
|---|---|---|
| `..`, `../x`, `..%2F..%2Fprobe` | slug param / body | 400/403, no file outside root |
| `%2e%2e`, `%252e%252e`, `..\\`, `..\` | slug/filename | reject |
| `/etc/passwd`, `C:\\x`, `\\\\server\\share` | filename/slug | reject |
| `x/../../y.md` | exercise filename | reject |
| symlink `courses/x/COURSE.md -> /tmp/outside` | read/write | reject (realpath) |
| symlink directory `courses/x/exercises -> /tmp` | read/write | reject |
| `<file path="courses/other/COURSE.md">` while chatting in `x` | LLM write | skip, no write |
| `<file path="courses/new/COURSE.md">` with empty current slug | LLM write | allowed only if `courses/new` absent |
| workspace `../escape.js`, `a/../../b`, `dir/link -> /tmp` | runner | 400, no write outside |

Tests assert both status and a snapshot of the root + its parent (to catch `probe/` outside the
root).

---

## 5. Entry points and legacy gating (SEC-01/02, D-06..D-09)

### 5.1 `web/server.js` shape

```
export function createApp({ legacy = false, token, origins, db, coursesDir, studioDist, log,
                            runners, capabilities, spawnImpl, allowNonLoopback } = {})
export function startServer({ ...options, port, host } = {}) -> { server, close }
// entry: if (import.meta.url === pathToFileURL(process.argv[1]).href) startServer(...)
```

- `createApp` must not: read/write the token file when `token` is supplied, create `COURSES_DIR`,
  start Vite, or call `listen`. Token resolution (and the one-time write) happens in
  `startServer`/the CLI entry; tests inject a token.
- `startServer` resolves the token via `web/security.js`, validates config (`STUDIO_ORIGINS=*` +
  `STUDIO_ALLOW_NON_LOOPBACK` -> exit 1 before bind), prints the masked banner + pairing URL, and
  calls `server.listen(port, host)`.
- Keep an `export { app, server }` compatibility shim only if a real importer needs it; grep shows
  only `bin/commands/web.js` dynamically imports the module for side effects and `test` does not
  import it. Prefer exporting `createApp`/`startServer` and dropping eager `app`/`server`.
- `web/studio-api.js`: remove the eager `createStudioRouter({announce:true})` block
  (`:145-156`) and the default export's fallback creation if unused; `createApp` should call
  `createStudioRouter` explicitly. This is required for side-effect-free imports and for tests.
- `createApp` mounts Studio static assets from `studio/dist` (public, D-04), with a Studio SPA
  fallback for `GET/HEAD` that does not catch `/api/*`. If `studio/dist/index.html` is missing,
  return a small HTML/JSON message telling the user to run `course-professor studio` or build
  Studio; do not fall back to the legacy client.
- `bin/commands/studio.js` already serves `studio/dist` on 5180 and starts `web/server.js` on 3000.
  Serving Studio again on 3000 is acceptable (public assets) but the planner may choose to set
  `SERVE_STUDIO=0` in that child to avoid duplication; either way, `/api/chat` must be 404.

### 5.2 Legacy mode

- Enabled by `--legacy` or `PROFESSOR_LEGACY=1`. `bin/commands/web.js` must parse flags properly:
  today `args[0]` is treated as the port (`:184-188`), so `web --legacy` would use `--legacy` as a
  port. Parse `--legacy`, `--production`, `--cloud`, `--rotate-token`, and a positional port; set
  `process.env.PROFESSOR_LEGACY='1'` before importing the server.
- `node web/server.js --legacy` should also work: the entry reads `process.argv.includes('--legacy')`
  in addition to the env.
- Legacy mode mounts the legacy API router on the same server behind the same guard layer; legacy
  static serving:
  - dev: spawn Vite from `web/client` only in legacy mode; no `shell: true` (use
    `spawn(npmCmd, ['run','dev'], { shell:false, cwd: clientDir })`; on Windows, the npm `.cmd`
    shim is unsupported — return a clear error, consistent with D-16). Add
    `http://localhost:5173`/`127.0.0.1:5173` to origins.
  - production: serve `web/client/dist` with the legacy SPA fallback.
- Every legacy start writes the deprecation warning to **stderr** (not stdout), e.g.
  `console.error('[deprecated] Legacy web UI is enabled. Use Professor Studio at http://localhost:5180.')`.
  `createApp` should not print; `startServer`/`web.js` does.
- When legacy is disabled: `/api/chat`, `/api/courses`, `/api/courses/*`, `/api/agents/*`,
  `/api/notify` and the legacy client routes return 404. Do not let the Studio SPA fallback return
  index.html for `/api/*` — add an API 404 handler first.
- The legacy React client shows a persistent banner linking to `http://localhost:5180`.

### 5.3 `course-professor web` behavior

- Studio-only by default: no API-key prompt, no legacy `.env` discovery, no Vite spawn. Keep the
  dependency check/install and the port/courses env handling for compatibility.
- Still resolve/print the pairing token and pairing URL (Studio needs the token to call the bridge);
  print the masked token and the `#token=` URL.
- `--legacy` keeps the old API-key discovery/prompt (legacy chat falls back to the Anthropic/OpenAI
  API), prints the stderr warning.
- `--rotate-token` should be handled by the shared token helper and exit without starting a server
  (support on `studio` and, for discoverability, `web`). If both `--rotate-token` and a server start
  are requested, rotate first then start with the new token.

---

## 6. Runner hardening and concurrency (Q7, SEC-10)

### 6.1 Current state

- `web/studio-runner.js` already: `shell:false` (`:343-348`), per-language allowlist (`:34-41`),
  Bash gated by `PROFESSOR_ALLOW_BASH` (`:108-110`, `:160`), timeout/output caps (`:28-31`), path
  validation (`:49-59`), lexical containment (`:226-230`).
- Gaps: spawn env is `{...process.env, PYTHONUNBUFFERED:'1'}` (`:347`); no concurrency cap; no
  explicit denylist function (a future edit could add `npm` to `COMMANDS`); `courseDir` itself can
  be a symlink; final file can be a symlink.

### 6.2 Required changes

- `COMMAND_DENYLIST = new Set(['npm','npx','pnpm','yarn','playwright','sh','bash','zsh','fish','cmd','powershell'])`;
  `assertCommandAllowed(cmd)` called by `buildPipeline` and again in `runStep`. Keep `bash` allowed
  only when `allowBash` is true and the pipeline is the explicit `bash` language.
- `PROFESSOR_MAX_RUNS` clamp 1–8, default 2. Acquire **after** request validation but **before**
  `mkdir`/`writeFile`/`spawn`; if full, return `429` with `Retry-After: 1` and
  `{ error:'Too many concurrent runs', code:'busy' }`. Release in a `finally` and on `res.on('close')`
  with an idempotent guard.
- Scrub env with the learner allowlist; keep `PYTHONUNBUFFERED=1` and `PYTHONIOENCODING=utf-8` if
  needed for output determinism.
- Use `resolveInside(workspacesRoot, courseSlug)` for the course directory and the final file;
  reject symlinked course dirs/final files.
- Expose `createRunLimiter({ max })` (pure counter with `tryAcquire`/`release`) for a deterministic
  unit test; the router uses one instance per process/router.

### 6.3 Concurrency tests without flakiness

- Unit-test the limiter: max 1, acquire, second `tryAcquire` false, release, acquire true.
- Router test: max 1; first request runs `setTimeout`-based JS (`setTimeout(()=>{}, 800)`) or a
  `while` loop with a 2s timeout; as soon as the first SSE response headers/status is received
  (proves it acquired), send the second request and expect 429 + `Retry-After`; then read the first
  to completion and assert a third request succeeds. Use a per-test timeout (<=15s), not a global
  one.
- Assert the 429 path did not create the second course directory (snapshot) and did not call the
  injected `spawnImpl`.

---

## 7. Legacy client changes (Q10, D-03/09)

- `web/client/src/api/client.js` currently uses `EventSource` with a GET and the message in the
  query string (`:42-82`). Native `EventSource` cannot set custom headers, and the server route is
  `POST /api/chat` with a JSON body — so the current client is both token-less and incompatible with
  the new guard. Replace it with a `fetch` POST that:
  - sends `Content-Type: application/json`, `X-Studio-Token`, body `{ messages, courseSlug, sessionId, provider, model }`;
  - reads the SSE stream from `response.body` (ReadableStream + TextDecoder) and parses
    `data: {...}` / `data: [DONE]` exactly like the existing EventSource handlers;
  - supports `AbortController` for cancel.
- Add a shared `authHeaders()` helper for every fetch (`/api/courses`, `/api/courses/:slug/:file`,
  `/api/courses/:slug/exercises`, save calls, `/api/notify`). Without it every legacy call is 401.
- Token acquisition: on load, read `location.hash`; if it contains `token=`, `decodeURIComponent` it,
  store in `sessionStorage` (never `localStorage`), and scrub the fragment with
  `history.replaceState(null, '', location.pathname + location.search)`. Support the `bridge=` value
  in the same fragment (API base) if present; otherwise same origin. Do not read a query string.
- If no token is present, show a clear "Pair this browser" state instead of firing requests that
  401. The banner can link to the pairing URL.
- Add a persistent `DeprecationBanner` (new component or inside `App.jsx` near the root
  `:103`) with a link to `http://localhost:5180`; keep it visible on mobile and desktop, and do not
  cover the chat input. Text should make clear the legacy UI is deprecated and Studio is the
  supported app.
- Because the legacy client is served from `http://localhost:3000` (production) or 5173 (Vite dev),
  ensure the origin allowlist includes those origins when legacy is enabled.

---

## 8. CONCERNS.md triage (Q9, SEC-14)

Legend: **Fix P2** = in a Phase-2-owned file and must be fixed now; **Map** = owned elsewhere, list
the owning phase (do not accept); **Accept** = written accepted risk with revisit trigger.

| # | Sev | Finding | File | Action |
|---|---|---|---|---|
| 1 | Critical | Legacy server unauthenticated + `cors()` + `/api/chat` Claude bypass spawn in `web/` | `web/server.js` | **Fix P2** (guard + legacy gating + safe spawn) |
| 2 | High | Legacy slug/filename traversal on write and read, cross-origin | `web/server.js` | **Fix P2** (`resolveInside`, exact allowlists) |
| 3 | High | Stale `shared/SKILL.md` | `shared/`, `professor-skill/` | **Map** Phase 3 |
| 4 | High | `generateJson` silently returns wrong language | `studio/src/lib/ai/provider-utils.js` | **Map** Phase 6 |
| 5 | Medium | Studio tests not run by root `npm test`/CI | `vitest.config.js`, workflows | **Map** Phase 4 |
| 6 | Medium | Synchronous capability probes on every legacy chat request | `web/server.js` | **Fix P2** opportunistically (TTL cache, injectable capabilities); at minimum the legacy route is now authenticated and gated |
| 7 | Medium | Claude bridge cwd is `web/` (holds old token) | `web/studio-api/agents.js` | **Fix P2** (temp cwd for Claude) |
| 8 | Medium | Hard-coded schema version + snapshot in `checks_json` | `web/studio-db.js`, `studio/src/lib/runner/history.js` | **Map** Phase 5 |
| 9 | Medium | Module-level language state mutated during render | `studio/src/lib/i18n/index.js` | **Map** Phase 6 |
| 10 | Medium | Registry install has no integrity check | `bin/registry-helpers.js` | **Accept** install integrity in `docs/security/ACCEPTED-RISKS.md`; **Fix P2** `validateItemName('..')` |
| — | Medium | Studio client sends token to any `bridgeUrl` | `studio/src/lib/runner/local.js`, `ai/bridge.js` | **Map** Phase 6 (SEC-12) |
| — | Medium | BYOK keys + token in `localStorage`, no CSP | `studio/src/lib/settings.js`, `studio/index.html` | **Map** Phase 6 |
| — | Medium | Worker same-origin execution (not a sandbox) | `studio/src/workers/js.worker.js` | **Map** post-beta (outside ownership) |
| — | Low-Med | Pyodide CDN without SRI | `studio/src/workers/python.worker.js` | **Map** post-beta |
| — | Low | `validateItemName('..')` accepts `..` | `bin/registry-helpers.js:91-96` | **Fix P2** + test |
| — | Low | Shell interpolation in publish flow | `bin/cli.js:754` etc. | **Map** post-beta (bin/cli.js not owned except the `web` case) |
| — | High | **New:** legacy OpenCode spawn has permissive defaults and no temp cwd/permission profile | `web/server.js:836-919` | **Fix P2** while extracting the legacy router (use safe env + `OPENCODE_CONFIG_CONTENT` deny + temp cwd) |
| — | Medium | **New:** `doctor` health probe has no token | `bin/commands/doctor.js:173` | **Fix P2** (send token or accept 401 as "server up") |
| — | Medium | **New:** legacy client uses token-less GET EventSource/query string | `web/client/src/api/client.js` | **Fix P2** (fetch POST + headers) |
| — | High | **New:** root `package.json` `files` omits `web/security.js`/`web/legacy-server.js` | `package.json` | **Decision needed** (orchestrator-approved `files` edit) |

Tech debt / known bugs not in the security gate: two web apps (legacy is now opt-in; full removal
is v2 BOUND-03), duplicate parsers, plugin drift (Phase 3), version drift (Phase 3/11), duplicated
tooling versions/lockfiles (Phase 1/4), `node:sqlite` experimental (Phase 4/5), large modules,
hook regex/YAML, stale registry updates, checks/snapshot coupling (Phase 5), sync probes (P2
opportunistic; Studio health caching could be P2 if cheap), bundle weight (Phase 6/12), single-user
design, agent-per-turn latency (by design), Express 5 (v2 DEBT-06), observability (post-beta),
backup confirmation (Phase 5/6).

**`validateItemName` fix**: replace the current
`if (!name || basename(name) !== name || name === '.')` with a type check plus
`/^[a-z0-9][a-z0-9-]*$/`. This rejects `..`, `.`, `%`, `\`, `/`, uppercase, and leading
separators. Add tests in `test/cli.test.js` next to the existing block (`:66-90`):
`validateItemName('..')` throws, `'...'` throws, `'a..b'` throws, `'A'` throws, valid lowercase
slugs pass. Note `installCourse` joins `learning/<name>` (`bin/registry-helpers.js:386`), so the
regex is the correct boundary.

**ACCEPTED-RISKS.md** should contain: scope/date/owner; the single accepted risk (community
registry integrity: HTTPS-only, user-initiated, no signature/checksum; revisit when the registry
publishes a signed index or at beta exit; owner: Phase 3/DEBT-05); a "mapped, not accepted" list
with the owning phases above; the escape hatches and their loud warnings; and residual risks
(same-user processes can read the token/DB; the local runner is not a sandbox; loopback is a trust
boundary, not an auth boundary).

---

## 9. Integration risks and cross-phase contracts

1. **Root `package.json` `files`.** `web/security.js` and `web/legacy-server.js` are new files not
   listed in `files` (`package.json` ships individual `web/*` entries). The published package would
   fail at import. Phase 2 does not own `package.json`. Either:
   - the orchestrator approves a one-line `files` addition (no dependency/lockfile change), or
   - Phase 4's smoke-pack work adds it before release.
   This must be settled in the plan; it is a hard release blocker, not a nice-to-have.
2. **`web/studio-api.js` eagerly initializes at import** (`:145-156`). Any `createApp` import in
   production opens the DB and prints a banner before options are applied. Remove it; the default
   export can remain lazy for compatibility, but `web/server.js` should use `createStudioRouter`.
3. **`doctor` health probe** (`bin/commands/doctor.js:173`) will 401 under the new guard. Send
   `X-Studio-Token` from the token helper, or treat 401 as "server is up but unpaired".
4. **`course-professor studio`** starts `web/server.js` with `STUDIO_BRIDGE_TOKEN` and
   `STUDIO_ORIGINS`; keep those env names. Its `waitForHealth` already sends the token
   (`bin/commands/studio.js:179`), so it will keep working.
5. **Phase 6 contract**: pairing URL must be exactly `#token=<value>` (plus `&bridge=…` when
   `apiPort !== 3000`). Do not keep `#/settings?token=…` (current
   `bin/commands/studio.js:142-147`); update `test/cli-studio.test.js:114-117`.
6. **Phase 4 smoke-pack** expects `web/security.js`/`web/legacy-server.js` packed and
   `.studio-token` not packed. Align the `files` change and do not add `.studio-token` to `files`.
7. **`cors` dependency** is still declared in `web/package.json`/root; removing the import leaves
   an unused dependency. Do not edit package.json in Phase 2; note it for Phase 1/4 cleanup.
8. **Default origins**: adding the server's own port (and 5173 in legacy dev) is necessary for
   same-origin/Vite use; this changes `DEFAULT_ORIGINS` behavior only by adding explicit origins,
   not by weakening the exact-match rule.
9. **`web/server.js` static serving**: `studio/dist` may not exist in a fresh checkout. Decide
   whether `createApp` serves it when present or always delegates to `course-professor studio`;
   either way, do not serve the legacy client in Studio-only mode.
10. **Node version**: the repo's root engines says >=18, but `web/server.js`/Studio DB need Node
    22.5+ (`bin/node-version.js`). The guard/token code should stay Node-18-compatible; tests run
    on the repo's Node 22+/26.

---

## 10. Suggested plan decomposition (dependency order)

1. **Plan 01 — `web/security.js` + token lifecycle.** Pure helpers: host/origin/token compare,
   JSON media type, `resolveInside`, env allowlists, argv deny, token file read/write/migrate/mask/
   rotate. Unit tests. No route changes; no behavior change yet.
2. **Plan 02 — Guard composition + `createApp` + Studio-only default.** Rewrite
   `web/studio-api/guards.js` to compose `web/security.js`; remove the eager init; make
   `web/server.js` a side-effect-free `createApp({legacy})`/`startServer`; mount Studio static;
   API 404; entry flags; origin merge; config refusal for `*` + non-loopback. Tests: guard matrix,
   Studio-only 404s, entry-point smoke.
3. **Plan 03 — `web/legacy-server.js` + traversal + LLM write scoping.** Extract legacy routes,
   path helpers, agent spawns (safe env/argv/temp cwd/OpenCode deny), Vite spawn without shell,
   deprecation warning, legacy SPA. Tests: traversal vectors, LLM write scoping, legacy guard
   parity, no-spawn assertions.
4. **Plan 04 — Agent and runner hardening.** `buildAgentArgs`/`assertSafeAgentInvocation`, temp cwd
   for Claude, env allowlist, Windows shim bail-out, runner command denylist + semaphore + scrubbed
   env. Tests: fake-binary argv/env/cwd capture, limiter unit, 429, timeout.
5. **Plan 05 — CLI, doctor, legacy client, accepted risks.** `bin/commands/{web,studio,doctor}.js`,
   `bin/cli.js` web case if needed, pairing URL/mask/rotate, doctor posture section, legacy client
   token header + fetch SSE + banner, `docs/security/ACCEPTED-RISKS.md`, `validateItemName` fix and
   registry tests. Regression-update `test/studio-api*.test.js`, `test/studio-runner.test.js`,
   `test/cli-studio.test.js`, `test/cli.test.js`.

Plans 02–04 depend on 01; 05 depends on 02+04. All plans must preserve the Phase 1 re-export surface
(`web/studio-api.js:181-216`).

---

## Validation Architecture

### Test layers

| Layer | What it proves | Tooling |
|---|---|---|
| L1 Unit / pure helpers | Host/origin parsing, JSON media type, token mask/atomic write, `resolveInside`, env allowlist, argv denylist, limiter | Vitest, temp dirs, no HTTP |
| L2 Router integration | Guard status/code matrix, 415/400/413, Studio-only 404, legacy parity, SSE shapes, traversal rejection | `supertest(app)` and/or ephemeral `http.Server` + `fetch` |
| L3 Entry-point parity | `node web/server.js`, `course-professor web`, `npm start` all default Studio-only; `--legacy`/env mounts legacy | Child process with temp `PROFESSOR_HOME`/`COURSES_DIR`, free port, health poll |
| L4 Side effects | Rejected requests write nothing and spawn nothing | Filesystem snapshot (path -> sha256 + mode) + `child_process` spy; injected `spawnImpl` |
| L5 Regression | Existing Studio/runner/CLI contracts still pass with the new guard | Existing suites updated only where the contract changed |

### Security suite contract (`test/security/**`)

- Layout: `test/security/helpers/{app.js,snapshot.js,env.js,free-port.js}`,
  `guards.test.js`, `entrypoints.test.js`, `legacy-paths.test.js`, `agents.test.js`,
  `runner.test.js`, `token.test.js`, `registry.test.js`.
- **No real agent CLI, no network, no user home.** Every L2 test builds
  `createApp({ legacy, token: FIXED, origins: DEFAULT, db: tempDb, coursesDir: tempCourses,
  studioDist: tempDist, log: () => {}, runners: fakeRunners, capabilities: () => STATIC,
  spawnImpl: spyThatThrows })`.
- **No top-level import of `web/server.js` without env isolation.** Prefer `startServer` in-process;
  for the subprocess smoke, set `PROFESSOR_HOME`, `COURSES_DIR`, `STUDIO_DIST`, `PORT`, `HOST`,
  `PROFESSOR_LEGACY` before spawn.
- **Every rejection test asserts three things:** status + machine code; the data-dir snapshot is
  byte-identical (including modes); the spawn spy was not called. This is the SEC-13 contract, not
  an optional extra.
- **Snapshot helper** walks a temp root with `readdirSync(..., { withFileTypes:true })`; records
  relative path, type, size, mode, and SHA-256 for files; follows no symlinks (records link target).
  Compare before/after with `toEqual`. Snapshot after app/startup creation so the DB/token file is
  part of the baseline.
- **Env isolation:** `vi.stubEnv`/`vi.unstubAllEnvs` in `afterEach`; restore `PATH` after fake
  binaries; kill servers/children in `finally`; remove temp dirs in `afterEach`.
- **Determinism:** no sleeps except a bounded wait for a child's readiness; use event/`once` and
  polling with a deadline. Per-test timeout <=15s for subprocess/concurrency tests; do not change
  global `testTimeout` (Phase 4 QA-05 owns flakiness).
- **SSE tests** read the full response body (`await res.text()`), assert the final `data: [DONE]`,
  and close the server; do not leave open intervals (the bridge heartbeat is `unref`'d).
- **Spawn proof:** in addition to injecting a throwing `spawnImpl`, add one suite-level test that
  `vi.mock('child_process')`/`vi.mock('node:child_process')` and asserts `spawn`/`spawnSync`/
  `execSync`/`execFileSync` are not called for the rejected-request matrix. Mock both specifiers
  because the codebase uses both (`agents.js` -> `child_process`; `studio-runner.js`/`health.js` ->
  `child_process`/`node:child_process`).

### Required test matrix (maps SEC-01..11,13,14)

| Requirement | Tests |
|---|---|
| SEC-01 | `entrypoints.test.js`: Studio-only 404 for `/api/chat`, `/api/courses`, legacy client path; `--legacy` and `PROFESSOR_LEGACY=1` mount them |
| SEC-02 | stderr warning captured from the child; legacy `App.jsx` banner rendered (component test or source assertion) |
| SEC-03 | `guards.test.js`: spoofed Host, missing Host, `localhost.evil`, `[::1]` allowed, any port allowed |
| SEC-04 | unknown/`null` Origin 403; exact ACAO; header never literal `*`; `STUDIO_ORIGINS=*` still token-gated |
| SEC-05 | no token / wrong token / no Origin + no token -> 401 on Studio, legacy, runner, DB, agents |
| SEC-06 | text/plain, form-urlencoded, missing Content-Type on POST -> 415 before handler; malformed JSON -> 400; oversize -> 413 |
| SEC-07 | token path/mode/atomic/migration/mask/rotate; pairing URL fragment; no query string |
| SEC-08 | all traversal vectors; symlink read/write; LLM write scoping; runner workspace escape |
| SEC-09 | fake binaries: no deny flags, temp cwd, scrubbed env; deny helper unit tests; Windows shim unit |
| SEC-10 | runner rejects npm/npx/playwright/sh/bash; Bash off by default; 429 under cap; scrubbed env |
| SEC-11 | startup warnings; `*` + non-loopback refused before bind; `doctor` reports legacy/bind/token mode/Bash/relaxed env |
| SEC-13 | every rejection test's snapshot + spawn spy |
| SEC-14 | `validateItemName('..')`/regex tests; ACCEPTED-RISKS content assertions (optional) |

### Exact commands

```bash
# Security suite only
npx vitest run test/security

# One security file while iterating
npx vitest run test/security/guards.test.js

# Regression suites touched by this phase
npx vitest run test/studio-api.test.js test/studio-api-agents.test.js \
  test/studio-runner.test.js test/cli-studio.test.js test/cli.test.js

# Root suite (includes test/security/**, because vitest.config.js includes test/**/*.test.js)
npm test

# Manual entry-point smoke (replace the port with a free one)
PROFESSOR_HOME="$(mktemp -d)" PROFESSOR_LEGACY=0 PORT=3901 node web/server.js
curl -i http://127.0.0.1:3901/api/courses                 # 404
curl -i -H 'Host: evil.example' http://127.0.0.1:3901/api/studio/health   # 403
PROFESSOR_HOME="$(mktemp -d)" PROFESSOR_LEGACY=1 PORT=3902 node web/server.js
curl -i http://127.0.0.1:3902/api/courses                 # 401 (no token)
node bin/cli.js doctor                                    # security posture section
```

### Flakiness rules

- Never assert on `web/`-relative cwd by string equality; assert the path is under `tmpdir()` and
  matches `professor-`.
- Never depend on a real `claude`/`agent`/`opencode` being installed; fake binaries only.
- Never use fixed ports; bind `0` or ask the OS for a free port, then pass it.
- Use `mkdtempSync` per test and clean up; do not share a DB/token file across tests.
- For subprocess parity, poll `/api/studio/health` with the token until 200 or a 5s deadline; then
  run the assertions; kill with `SIGTERM` in `finally`.
- For concurrency, signal readiness by reading the first SSE frame/headers, not by sleeping.
- Keep the suite parallel-safe: no global `process.env` mutation without `vi.stubEnv`; no writes to
  the real `~/.professor`.

---

## Open Questions for the Planner (decide, then encode in the plan)

1. **`STUDIO_ORIGINS=*` vs SEC-04.** D-12 allows it loudly; SEC-04 says "no wildcard CORS
   anywhere". Recommended: never emit `*`, echo the exact origin, reject `null`, warn, and report
   in doctor. Confirm this interpretation so the test contract is unambiguous.
2. **`package.json` `files`.** Approve the `web/security.js`/`web/legacy-server.js` addition (no
   lockfile impact) or assign it to Phase 4. Without it, the tarball is broken.
3. **`--rotate-token` immediate invalidation.** Use a per-request token getter (mtime cache) or
   document a restart. D-05 says immediate; recommend the getter.
4. **New-course LLM writes.** Confirm the "allow one non-existent course slug when `courseSlug` is
   empty, then adopt it" rule; otherwise `professor:new-topic` cannot create a course.
5. **`createApp` and Studio static.** Decide whether `web/server.js` serves `studio/dist` when
   present or always defers to `course-professor studio`; both satisfy SEC-01, but the tests need a
   fixed expectation.
6. **`doctor` health probe.** Send the token (preferred) or treat 401 as "server up"; update the
   existing check so the release-gate change does not make `doctor` report a false failure.
7. **Legacy dev origin.** Add 5173 to the allowlist in legacy dev, or change Vite's port to 5180;
   the current default allowlist only has 5180.

---

## Sources

Live docs checked on 2026-10-22 (version-sensitive facts):

- Claude Code CLI reference — https://docs.claude.com/en/docs/claude-code/cli-reference
- Claude Code permission modes — https://code.claude.com/docs/en/permission-modes
- Claude Code permissions — https://docs.claude.com/en/docs/claude-code/permissions
- Gemini CLI headless mode — https://www.geminicli.com/docs/cli/headless
- Gemini CLI configuration (`--approval-mode`, `--skip-trust`, `--yolo`) —
  https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
- Gemini CLI plan mode (headless auto-YOLO caveat) — https://geminicli.com/docs/cli/plan-mode/
- Cursor CLI parameters — https://cursor.com/docs/cli/reference/parameters
- Cursor CLI headless/print behavior — https://cursor.com/en-US/docs/cli/headless
- OpenCode CLI — https://dev.opencode.ai/docs/cli/
- OpenCode permissions — https://opencode.ai/docs/permissions
- Antigravity CLI headless — https://antigravity.google/docs/cli/headless
- Antigravity execution modes — https://www.antigravity.google/docs/cli/modes
- Node.js `child_process` (`.bat`/`.cmd` on Windows, `shell:false`) —
  https://nodejs.org/api/child_process.html
- Node.js `fs` (`mode` only on create; `realpath`; `O_NOFOLLOW`) —
  https://nodejs.org/docs/latest-v22.x/api/fs.html
- Express 4 request API (`req.is` null-on-empty-body; `req.hostname` trust-proxy behavior) —
  https://expressjs.com/en/4x/api/request.html and `node_modules/express/lib/request.js:427-440`
- Express body-parser (`type` default `application/json`, errors) —
  https://expressjs.com/en/resources/middleware/body-parser.html
- MCP TypeScript SDK Host-header validation (URL parsing, IPv6 brackets, port-agnostic) —
  https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/middleware/hostHeaderValidation.ts
- MDN EventSource (no custom headers) — https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- Express issue #3669 (`req.is` returns null when there is no body) —
  https://github.com/expressjs/express/issues/3669

Repo evidence cited inline by `file:line`; the key starting points are `web/server.js:26-28`,
`web/server.js:384-420`, `web/server.js:743-764`, `web/server.js:836-919`, `web/server.js:1170-1183`,
`web/studio-api/guards.js:49-90`, `web/studio-api.js:35-64,145-156`,
`web/studio-api/agents.js:110-120,302-420`, `web/studio-runner.js:188-249,339-348`,
`bin/commands/studio.js:142-162,309-323`, `bin/commands/web.js:184-203`,
`bin/commands/doctor.js:17-27,173-180`, `bin/registry-helpers.js:91-96,386`,
`web/client/src/api/client.js:42-82,118-128`.
