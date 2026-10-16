# Stack Research

**Domain:** Local-first AI learning workspace (Professor Studio) — security-hardened private beta
**Researched:** 2026-10-17
**Confidence:** MEDIUM-HIGH (versions verified against the npm registry and GitHub releases on 2026-10-17; patterns verified against official docs where noted)

Scope: only what this milestone **adds** to the existing stack (Express 4.22, React 19, Vite 8,
node:sqlite, IndexedDB, Vitest). The existing stack is not re-evaluated here.

**Main recommendation:** add almost no runtime dependencies. All four areas are best handled by
small, auditable in-repo modules plus three dev dependencies (`@playwright/test`, `supertest`,
and a Vitest bump). A security hardening milestone should shrink the shipped dependency
surface, not grow it.

---

## Recommended Stack

### Core Technologies (new for this milestone)

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| `@playwright/test` | 1.64.1 (dev) | Browser E2E of Studio itself | Standard runner. Has a built-in multi-server `webServer` array (SPA and API together), traces on failure, and Chromium-only projects. Requires Node >=20, which is fine because CI runs Node 22. It is also the first beta course's subject, so the team uses what it teaches. | HIGH (npm registry, playwright.dev) |
| `supertest` | 7.3.1 (dev) | HTTP-level security regression tests against `createStudioApi()` / legacy app | Runs Express routers in-process without binding a port. You can forge `Origin`, `Host` and `X-Studio-Token` headers and percent-encoded traversal paths (`..%2F`) exactly. | HIGH (npm registry) |
| `vitest` | 5.0.5 (dev, root **and** studio) | Unified unit and security suites | Root is on `^4.1.1` and Studio on `^5.0.4`. Unify on 5 so one root `vitest.config.js` can declare `test.projects: ['studio/vite.config.js']` (the `workspace` file is deprecated since 3.2). Then a single root `npm test` runs both suites. | HIGH (vitest.dev/guide/projects) |
| Express | **stay on 4.22.x** (`latest-4` = 4.22.3) | Existing server | Express 4 and 5 both have ongoing support (expressjs.com/en/support). A 5.x migration changes path-matching syntax and error handling across 2,500 lines of routes in the middle of a security milestone, so it adds risk for no beta value. Bump to `^4.22.3`. | HIGH |
| Node built-ins (`crypto`, `path`, `fs.realpathSync`, `child_process.spawn`) | Node >=22.5 | Token, path containment, safe spawn | Everything needed for hardening is in core. Third-party wrappers add supply-chain surface to a package that spawns agents. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| `zod` | 4.6.7 | Schema for (a) the exported beta report, (b) parsing pasted Playwright JSON evidence, (c) bridge request bodies | Use for the report schema and evidence parsing, where schema drift is the main risk. It is optional for routes, since hand validation plus regex is fine there. Put it in `studio/` (browser) and import it from the server only if it is also added to the root `dependencies`. | MEDIUM (version verified; fit is a judgment call) |
| `@axe-core/playwright` | 4.14.0 (dev) | Optional a11y smoke in Studio E2E | Only if a11y checks are wanted in the full-loop E2E. Not required for the beta gate. | MEDIUM |
| `fast-xml-parser` | 5.11.2 | Parse JUnit XML evidence | **Defer.** Only add it if beta learners actually paste JUnit. JSON plus list output covers the template. | MEDIUM |
| `acorn` | 8.19.0 | Optional static heuristics on a pasted spec (counts `getByRole`/`getByLabel` vs CSS/XPath `locator()`, `waitForTimeout`) | Only if the rubric needs deterministic locator and waiting signals beyond the LLM review. It parses but never executes code. | LOW-MEDIUM |
| `helmet` | 8.3.0 | Security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`) when the CLI serves `studio/dist` | Use it on the static-serving app, not the API router. Alternatively set 4–5 headers by hand plus a CSP `<meta>` in `studio/index.html` (CONCERNS: no CSP present). Either works; hand-set headers avoid a dependency. | MEDIUM |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| GitHub Actions `actions/checkout` | Checkout | Latest release **v7.0.1** (gh api). The current workflow uses v4. Pin the major (`@v7`) or a SHA. |
| `actions/setup-node` | Node 22 / 18 matrix | Latest **v7.1.0**. Use `cache: npm` with `cache-dependency-path` listing all 4 lockfiles. |
| `actions/upload-artifact` | Upload Playwright report and traces on failure | Latest **v7.0.2**. Use `if: ${{ !cancelled() }}` per playwright.dev/docs/ci-intro, and `retention-days: 14`. |
| `actions/cache` | Cache `~/.cache/ms-playwright` keyed on Playwright version | Latest **v6.1.0**. Optional: Playwright docs do not cover browser caching, and `npx playwright install --with-deps chromium` (Chromium only) is about 1 minute. Add the cache only if CI time matters. |
| `eslint-plugin-playwright` | 2.12.1 | **Do not install in Studio.** Use its rule names as the vocabulary for the Playwright course rubric. Verified rules: `no-wait-for-timeout`, `prefer-web-first-assertions`, `no-raw-locators`, `no-networkidle`, `no-force-option`, `no-element-handle`, `prefer-native-locators`, `no-wait-for-selector`, `missing-playwright-await`, `no-focused-test`, `no-skipped-test`, `no-page-pause`. The course can tell learners to run it in **their own** project. |

---

## Area 1 — Hardening the localhost Express server (bridge, runner, legacy)

**Recommendation: one shared in-repo guard module (for example `web/local-guard.js`) applied to the
Studio router AND to the legacy app under `--legacy`. No `cors` package, no CSRF library.**

The guard pipeline below is ordered and fails closed. The existing `studio-api.js` already does
steps 1, 3, 5 and 6; the gaps are steps 2, 4, 7 and 8.

1. **Bind to loopback.** Bind with `server.listen(port, '127.0.0.1')`. Never use `0.0.0.0` or the unset default, which is all interfaces in Node. The MCP transport spec makes the same recommendation for local HTTP servers. Keep the `isLoopback(req.socket.remoteAddress)` check as defense in depth. `STUDIO_ALLOW_NON_LOOPBACK` must print a loud startup warning (CONCERNS gap).
2. **Validate the Host header (DNS-rebinding defense). This is missing today.** Allow only the exact
   `localhost:<port>`, `127.0.0.1:<port>` and `[::1]:<port>`; otherwise return 421 or 403. DNS
   rebinding sends a request with `Host: attacker.example` to 127.0.0.1, and the Origin then looks
   same-origin. Loopback binding and CORS do not stop this. The MCP spec (2025-06-18 transports) names
   Origin validation, localhost binding and authentication as the required trio against rebinding.
   Write about 15 lines in-repo. Do not use `host-validation` (last published in 2022).
3. **Use an exact Origin allowlist.** Use exact string match against `STUDIO_ORIGINS`. Reject the
   literal `Origin: null` (sandboxed iframes, `file://`). **Remove the `*` escape hatch** or make it
   warn loudly. For the legacy server, replace `app.use(cors())` with the same guard. Do not use the
   `cors` package with a function, because two implementations drift.
4. **Add a Fetch Metadata check (cheap CSRF layer). This is missing today.** Reject requests whose
   `Sec-Fetch-Site` is `cross-site` unless the Origin is allowlisted. Also enforce
   `Content-Type: application/json` on POST. A cross-origin form post or `text/plain` "simple
   request" cannot set JSON or custom headers without a preflight.
5. **Require a token on every route (already in place).** The custom `X-Studio-Token` header forces a CORS
   preflight, so a token header plus the Origin allowlist **is** the CSRF defense. Do not add
   `csurf` (deprecated or archived) or `csrf-csrf` (built for cookie sessions; Studio uses no
   cookies). Fixes from CONCERNS: stop printing the full token in the banner (print a masked form
   plus the file path), `chmod 0600` after write (not only on create), and optionally persist the
   token across restarts. Use `crypto.randomBytes(32).toString('base64url')` and compare with
   `crypto.timingSafeEqual` after a length check (keep the current approach).
6. **Private Network Access / Local Network Access.** Keep echoing
   `Access-Control-Allow-Private-Network: true` **only for allowlisted origins**. Note: Chrome is
   replacing PNA preflights with a **Local Network Access permission prompt** (opt-in from Chrome
   138, prompt launching in Chrome 142). LNA covers public-site requests to loopback
   (`127.0.0.0/8`, `::1`). For the default setup (SPA served from `localhost:5180`) this is
   local-to-local and unaffected. It matters only for the hosted SPA (Void/Cloudflare) calling the
   local bridge, so test that path with `chrome://flags#local-network-access-check`. MEDIUM confidence:
   the Chrome blog does not say how the PNA header is handled under LNA.
7. **Spawn child processes safely.** Use `spawn(bin, argvArray, { shell: false, cwd: <fresh temp dir>,
   env: <filtered allowlist>, windowsHide: true })` with an `AbortSignal`/timeout and a process-tree
   kill (already in the runner).
   - Resolve the binary from a fixed `AGENT_BINARIES` map. Never take it from request input.
   - Model ids and flags from the request must match a strict regex (`/^[A-Za-z0-9._:/-]{1,100}$/`) and
     be passed as separate argv elements. Put user text after `--` or on **stdin**, never as a flag
     value that could start with `-`.
   - **Windows:** since CVE-2024-27980, `spawn` of `.cmd`/`.bat` without `shell` throws `EINVAL`.
     Many agent CLIs (`claude.cmd`, `gemini.cmd`) are npm shims, so the Windows path needs explicit
     handling (resolve to `node <script.js>`, or fail with a clear doctor hint). **Do not** "fix" it with
     `shell: true`.
   - Use a fresh `mkdtemp` cwd for **every** agent including Claude (CONCERNS #7: Claude runs in `web/` next
     to `.studio-token`). Filter `env` so `*_API_KEY`s the agent does not need are not inherited.
   - Never pass `--dangerously-skip-permissions`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` or Cursor
     `--trust`. Add a regression test that asserts the built argv for every agent contains none of them.
   - Add a concurrency cap (1–2 in flight per runner) to address CONCERNS "no queue".
8. **Prevent path traversal** with one helper used for both read and write:
   `const target = path.resolve(root, ...parts); if (target !== root && !target.startsWith(root + path.sep)) reject;`
   then `fs.realpathSync` the existing parent and re-check it (symlink escape). Before joining,
   validate slugs with `/^[a-z0-9][a-z0-9-]{0,63}$/` and filenames with an allowlist or
   `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/` without `..`. Apply this to the route params Express has
   already decoded (`..%2F` arrives as `../`). Do not use `is-path-inside` (2023, ESM-only, trivial)
   or `sanitize-filename` (it sanitizes; you want to **reject**).

**Rate limiting:** not needed for a single-user loopback server. The concurrency cap in step 7 covers
abuse. Skip `express-rate-limit`.

**Node permission model (`--permission`)** is stable since 22.13/23.5, but the docs call it a "seat belt",
not a sandbox, and it does not confine non-Node child binaries. **Do not** present it, or the
runner, as a sandbox. The UI must say "Code runs on your machine".

## Area 2 — Local-first, privacy-preserving beta analytics

**Recommendation: no analytics library. Use a tiny in-repo event module plus an additive migration.**

- **Storage:** add `studio/migrations/0005_learning_events.sql` (D1-compatible), with a table such as
  `learning_events(id, owner_id, type, course_ref_hash?, created_at, day_offset?, meta_json)`, plus a
  matching IndexedDB object store (bump the DB version to 5) and an implementation in **all four repo
  adapters** (CONCERNS: adapter contract fragility). The event `type` comes from a closed enum such as
  `practice_attempt_completed`, `tutor_review_sent`, `revision_after_feedback` (with `parent_attempt_id`),
  `quiz_completed`, `recall_completed`, `workspace_run`, `capstone_checkpoint_updated` or `activated`.
  `meta_json` holds only numbers and enums (score bucket, pass/fail, course kind). Never store text,
  prompts, code, titles or keys. Enforce this with an allowlisted-keys sanitizer and a unit test.
- **Participant id:** a random `crypto.randomUUID()` generated once and stored locally, with no linkage to
  machine, user or email. It can be regenerated from the UI.
- **Report:** build the JSON in the browser and download it via `Blob` + `<a download>`. Use day
  **offsets** from activation instead of absolute timestamps, plus counts per type per day, a
  `week2Return` boolean computed by the same function the tests use, `appVersion`, `storageKind` and
  `schemaVersion`. Validate it against a **zod 4** schema before download, and keep the schema in
  `studio/src/lib/` so the beta aggregation script (`node scripts/aggregate-beta.mjs`) reuses it.
- **Aggregation:** a Node script reading N report files and producing CSV or a Markdown table. No database
  is needed for 3–5 learners.
- **Do not use:** PostHog, Plausible, Umami, Matomo, Segment, OpenTelemetry/OTLP exporters, or Sentry.
  All of them assume a collector endpoint, which contradicts the "no telemetry, even opt-in" constraint.
  Even self-hosted ones invite "just point it at a server". Do not use differential-privacy
  libraries either: with n=5 and manual export, the content-free schema is the privacy control.
  Show the exact JSON to the learner before they share it.

## Area 3 — Browser E2E of Studio and CI

- **Runner:** `@playwright/test` 1.64.1, with a **Chromium-only** project (the beta is Chromium, which keeps
  CI fast). `playwright.config.js` at the repo root (or `e2e/`) contains:
  - `webServer: [ { name: 'API', command: 'node bin/cli.js studio --api-only …', url: 'http://127.0.0.1:3000/api/studio/db/health'... }, { name: 'Studio', command: 'npm --prefix studio run preview -- --port 5180 --strictPort', url: 'http://127.0.0.1:5180' } ]`
    (array form, verified in the docs). The health route answers 401 without a token, and Playwright
    counts 401 as ready (verified: 2xx, 3xx, 400–403).
  - `env` sets a throwaway `PROFESSOR_HOME` (from `mkdtemp`), a fixed test token through an env
    override, and `STUDIO_ORIGINS=http://127.0.0.1:5180`.
  - `reuseExistingServer: !process.env.CI`, `gracefulShutdown: { signal: 'SIGTERM', timeout: 2000 }`
    (so the SQLite DB closes cleanly).
  - `use: { trace: 'retain-on-failure', baseURL: 'http://127.0.0.1:5180' }`, `retries: process.env.CI ? 1 : 0`,
    `workers: 1` (one shared SQLite file).
  - Reporters: `[['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/e2e.json' }]]`.
- **Test the built bundle** (`vite preview` of `studio/dist`), not the Vite dev server. That is what the
  tarball ships, and it removes HMR flakiness.
- **Provider in CI:** deterministic. Either intercept with `page.route()` against the OpenAI-compatible
  preset, or run a ~60-line stub OpenAI-compatible SSE server as a third `webServer`. The stub is
  preferred because it also exercises the bridge path. The **real provider plus local agent UAT** stays a
  manual, documented checklist run before beta (secrets and agent CLIs are not available in CI).
- **Security regression suite:** Vitest + supertest, under `test/security/*.test.js`. Cover traversal
  read/write (`..%2F`, `%2e%2e`, absolute paths, symlink), unknown and `null` Origin, a bad Host header, a
  missing or invalid token returning 401, the loopback bind address (assert `server.address().address === '127.0.0.1'`),
  the runner allowlist, Bash default-off, and argv containing no dangerous flags for every agent. Add one
  Playwright spec that loads a page from a **second origin** (for example `http://127.0.0.1:5199`) and asserts
  `fetch` to the bridge fails. This is the real-browser CORS proof.
- **CI** (`.github/workflows/ci.yml`; triggers: `push` to `develop` and `main`, `pull_request` to `develop`). Jobs:
  `unit` (Node 22: root and Studio Vitest via projects), `security` (supertest suite),
  `e2e` (Node 22, `npx playwright install --with-deps chromium`, upload `playwright-report/` and
  `test-results/` with `if: ${{ !cancelled() }}`), plus the existing `tarball-smoke` (Node 22) and
  `cli-floor` (Node 18). Use `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`.
  Set `timeout-minutes` on each job.
- **Flaky import test:** fix it deterministically (injected clock, fake timers, no real network),
  not by raising `testTimeout`.

## Area 4 — Assessing learner-submitted Playwright evidence (no execution in Studio)

**Recommendation: deterministic parse, then LLM rubric review, then store as evidence. Studio never
spawns `npx`/`playwright` and never opens trace zips.**

- **Primary evidence format: the Playwright JSON reporter.** The learner runs
  `npx playwright test --project=chromium --reporter=list,json` with `PLAYWRIGHT_JSON_OUTPUT_NAME=results.json`
  (the env var is in the docs; without it, JSON goes to stdout and mixes with list output). The learner
  then uploads or pastes `results.json`.
  The schema is verified from `playwright@1.64.1/types/testReporter.d.ts`:
  `JSONReport { config (includes version, projects[].name), suites[] (recursive: specs[] -> tests[] -> results[]), errors[], stats { startTime, duration, expected, unexpected, flaky, skipped } }`;
  `JSONReportTest.status ∈ skipped|expected|unexpected|flaky`, `projectName`; `results[].status`,
  `retry`, `errors[]`, `attachments[]` (name/path/contentType; `body` may be base64 so **strip it**).
  Parse with a **zod** schema using `.passthrough()` and tolerant optional fields (the format drifts
  across versions). Then derive the facts the rubric needs: Playwright version, browser project is
  chromium, passed/failed/flaky counts, test titles, failure messages, retries > 0 (flakiness signal),
  durations, and whether stats match the walked specs (a consistency check against hand-edited JSON).
- **Fallback: list reporter text.** Parse lines such as `✓  1 [chromium] › file.spec.ts:3:5 › title (1.2s)`
  and the `N passed (Xs)` summary with regex, stripping ANSI first. Mark it as **lower-trust evidence**.
- **Trace (`trace.zip`) and HTML report:** do **not** accept uploads in Studio for the beta. A trace
  contains DOM snapshots, network bodies and possibly cookies/secrets from the learner's app. Unzipping
  untrusted archives in the browser adds zip-bomb and path risks. Ask the learner to open it in their
  own `npx playwright show-trace` and answer a reflection question instead (this fits the Socratic method).
- **Spec source (optional paste):** the LLM tutor reviews it against the rubric (semantic locators,
  web-first assertions, isolation, no fixed waits). Use the `eslint-plugin-playwright` rule names
  as rubric criteria. Optional deterministic signals come from `acorn` (parse only). Treat
  pasted content as **untrusted data inside delimiters** in the prompt (the same pattern as TutorPanel's
  "Check my answer").
- **Limits:** cap the upload size (for example 2 MB), parse with `JSON.parse` in a try block, and never `eval`
  or render report HTML. Store only derived facts plus the learner's summary as evidence. Do not log them
  as analytics events, only `evidence_submitted` with pass/fail enums.
- **Trust model:** evidence is self-reported and cannot be cryptographically verified locally. State
  this. The rubric's "learner explains isolation, waiting and locator choice" step is the real check.

---

## Installation

```bash
# Root (dev only; nothing new shipped to users except an express patch bump)
npm install express@^4.22.3
npm install -D @playwright/test@^1.64.1 supertest@^7.3.1 vitest@^5.0.5
npx playwright install --with-deps chromium

# Studio
npm --prefix studio install zod@^4.6.7
npm --prefix studio install -D vitest@^5.0.5

# Optional, only if needed later
# npm --prefix studio install acorn@^8.19.0 fast-xml-parser@^5.11.2
# npm install -D @axe-core/playwright@^4.14.0
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| In-repo Host/Origin/token guard | `cors` package (2.8.6) with origin function | Never for the agent bridge. Two CORS implementations in one server will drift, and `cors` does not check Host or token. |
| Express 4.22.x | Express 5.3.0 | Next milestone, once legacy routes are deleted (fewer routes to migrate). |
| Playwright `webServer` array | `start-server-and-test` 3.0.13 / `wait-on` 9.5.1 | Only if E2E ever moves off Playwright. The built-in array already supports multiple servers. |
| Vitest + supertest for security tests | Playwright `request` fixture | Use Playwright for the one real-browser cross-origin test. Supertest is faster and can forge headers browsers forbid (Host). |
| Stub OpenAI-compatible server in CI | Real Anthropic key in CI secrets | Only for a manual `workflow_dispatch` UAT job. Never on PRs (cost, secrets exposure on forks). |
| zod 4 | valibot 1.5.0 / ajv 8.20.0 | valibot if Studio bundle size becomes critical. Use ajv if the report schema must be published as JSON Schema for external tooling. |
| Hand-built `spawn` | `execa` 10.1.1 / `cross-spawn` 7.0.6 | `cross-spawn` only if Windows `.cmd` shims must be supported broadly. It handles escaping for cmd.exe, but review it carefully, since that is exactly the risk area. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `app.use(cors())` / `Access-Control-Allow-Origin: *` | Verified exploit path in legacy `web/server.js` (CONCERNS #1) | Exact-origin allowlist guard shared by all routers |
| `--dangerously-skip-permissions`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, Cursor `--trust` | Turns a CSRF into full RCE as the user | Default permissions; read-only/plan modes; regression test on argv |
| `shell: true`, `exec`, `execSync` with template strings | Shell interpolation (also CONCERNS: publish flow `execSync`) | `spawn`/`execFile` with argv arrays, `shell: false` |
| `csurf`, `lusca`, `csrf-csrf` | Deprecated or stale, or designed for cookie sessions Studio does not have | Custom header token + Origin + Fetch Metadata |
| `host-validation` (2.0.1, last published 2022) | Unmaintained; about 15 lines in-repo is clearer | In-repo Host allowlist |
| Node `--permission`, Web Worker, or "local runner" described as a sandbox | Docs: "seat belt", not a sandbox; does not confine child binaries | Plain UI copy: "Code runs on your machine" |
| PostHog / Plausible / Umami / Segment / OTel / Sentry | Server collector, which breaks the no-telemetry constraint | Local events table + manual JSON export |
| Storing prompts, code, titles or free text in events | Privacy promise; the report must be content-free | Enum types + numeric meta with an allowlist sanitizer |
| Spawning `npx playwright` from Studio or the runner | Widens the bridge into a general command executor (explicitly out of scope) | Learner runs it in their own toolchain; Studio parses the JSON report |
| Accepting `trace.zip` / HTML report uploads | Secrets in snapshots; zip/HTML handling risk | JSON report + list text + reflection questions |
| Vitest `workspace` file | Deprecated since Vitest 3.2 | `test.projects` in root config |
| Running E2E against `vite dev` | HMR and dep-optimization flakiness; not what ships | `vite preview` of the built `studio/dist` |

## Stack Patterns by Variant

**If the SPA is served by the CLI from loopback (default):**
- Origin allowlist = the exact local origin(s), PNA/LNA irrelevant (local to local).

**If the hosted SPA (Void/Cloudflare) talks to the local bridge:**
- Add the hosted origin explicitly to `STUDIO_ORIGINS`, keep the PNA allow header, and expect Chrome 142+
  to show an LNA permission prompt. Test with `chrome://flags#local-network-access-check`.

**If a learner is on Windows:**
- Agent CLIs are `.cmd` shims, and `spawn` without a shell throws `EINVAL`. Resolve to the underlying JS entry
  (`node <path>`) or report the problem in `doctor`. Never fall back to `shell: true`.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@playwright/test@1.64.1` | Node >=20 | CI E2E on Node 22. Keep it out of the Node 18 `cli-floor` job (dev dependency only, so `npm ci` installs it but it never runs). |
| `vitest@5.0.5` root + studio | Vite 8 (Studio) | Root currently on 4.x. Align before using `test.projects` pointing at `studio/vite.config.js` (the file name must start with `vite.config`/`vitest.config`). |
| `supertest@7.3.1` | Express 4.22 | Node >=14.18 |
| `express@4.22.3` | Node 18 floor | Express 5 needs Node >=18, also fine; deferred for risk reasons, not compatibility. |
| `zod@4.6.7` | Browser + Node | Used by both Studio and the aggregation script. |
| `node:sqlite` | Node >=22.5 | Unchanged; new migration 0005 must stay D1-compatible SQL. |

## Sources

- npm registry (`npm view`, 2026-10-17): @playwright/test 1.64.1 (engines node>=20), express latest 5.3.0 / latest-4 4.22.3, supertest 7.3.1, vitest 5.0.5, zod 4.6.7, helmet 8.3.0, cors 2.8.6, eslint-plugin-playwright 2.12.1, acorn 8.19.0, fast-xml-parser 5.11.2, @axe-core/playwright 4.14.0, host-validation 2.0.1 (2022), csrf-csrf 4.0.3 (2025-05), lusca 1.7.0 (2022): HIGH
- GitHub releases API: actions/checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2, cache v6.1.0: HIGH
- `playwright@1.64.1` tarball `types/testReporter.d.ts`: JSONReport schema, verified directly: HIGH
- https://playwright.dev/docs/test-reporters: JSON/JUnit/list/blob reporters and env vars: HIGH
- https://playwright.dev/docs/test-webserver: `webServer` array, ready status codes, `gracefulShutdown`, `reuseExistingServer`: HIGH
- https://playwright.dev/docs/ci-intro: GitHub Actions example (docs show checkout@v6/upload-artifact@v4; newer majors exist), `!cancelled()` upload: HIGH
- https://vitest.dev/guide/projects: `test.projects`, workspace deprecated since 3.2: HIGH
- https://expressjs.com/en/support/: 4.x and 5.x both "ongoing" support: HIGH
- https://nodejs.org/api/permissions.html: permission model stable in 22.13/23.5, "seat belt" not sandbox: HIGH
- https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2: CVE-2024-27980 `.cmd`/`.bat` EINVAL without shell: HIGH
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports: DNS-rebinding guidance (validate Origin, bind localhost, authenticate): HIGH
- https://developer.chrome.com/blog/local-network-access: LNA replaces PNA, prompt in Chrome 142, loopback included: MEDIUM (PNA header handling under LNA not stated)
- https://developer.chrome.com/blog/private-network-access-preflight: original PNA preflight headers: MEDIUM (superseded)
- Repo: `.planning/codebase/CONCERNS.md`, `STACK.md`, `INTEGRATIONS.md`, `web/studio-api.js` guard code (lines ~990–1045), `web/studio-runner.js` (`shell: false`): HIGH

---
*Stack research for: Professor Studio security-hardened private beta*
*Researched: 2026-10-17*
