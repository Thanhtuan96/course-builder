---
phase: 6
status: passed
score: "3/3 success criteria, 22/22 must-haves, 3/3 orchestrator review fixes"
verified: 2026-10-22
---

# Phase 6 Verification — Studio Beta Debt

**Goal:** Learners never silently get wrong-language content, the language switch is render-safe, and
BYOK keys are protected by a loopback-only bridge and a CSP.

**Mode:** Goal-backward re-verification after the orchestrator E2E review and the three fixes recorded
as D-21 (HTML preview ownership), D-22 (IPv6 loopback rejection) and the JS-runner correction.
**Result:** PASSED — all three original success criteria still hold, all three review fixes are
proven, and no source or user-facing copy still claims the browser JavaScript runner is CSP-blocked.
Remaining items are real beta limits or manual UAT confirmations only.

---

## Success Criteria

| # | Criterion | Evidence | Result |
|---|-----------|----------|--------|
| 1 | Wrong-language JSON after the repair retry becomes a retryable, localized error for syllabus, quiz, flashcards and capstone; the wrong-language value is never returned | `createGenerateJson` re-checked the single repair result and throws `WrongLanguageError` (`studio/src/lib/ai/provider-utils.js:59-82`). All four surfaces pass the language through that choke point: NewCourse (`studio/src/pages/NewCourse.jsx:58-62`), quiz (`studio/src/components/practice/QuizPanel.jsx:71-80`), flashcards (`studio/src/components/practice/FlashcardGenerator.jsx:44-54`) and capstone (`studio/src/lib/capstone.js:95-102`). `errors.wrong_language` exists in both catalogs (`errors.js:20,42,66-77`; `i18n/{en,vi}/errors.json`), `ErrorNotice` localizes it (`ErrorNotice.jsx:9-17`), and `useStream` sets status `error` so Generate/Regenerate stays the retry (`useStream.js:95-103`). Tests: 7 DEBT-01 cases (`studio/test/ai.test.js:143-208`). | **PASS** |
| 2 | Switching UI language never mutates shared state during render (test proves it); catalogs split per namespace so new namespaces add files only | `useT` translates through `translate(language, …)` derived from settings and never assigns module state; only `setLanguage` writes it (`studio/src/lib/i18n/index.js:42-48,140-146`). Twenty namespace files per language are auto-merged by `import.meta.glob('./{en,vi}/*.json', { eager: true })` (`:22-38`; 20 en + 20 vi files on disk). Tests: `i18n-render` proves a `vi` render leaves `getLanguage()`/`t()` untouched (`studio/test/i18n-render.test.js:37-58`); `i18n-catalogs` proves file-pair and per-namespace key parity plus a synthetic namespace merging without editing `index.js` (`studio/test/i18n-catalogs.test.js:57-101`). | **PASS** |
| 3 | Studio refuses non-loopback bridge/runner/remote endpoints, accepts `#token=` and scrubs it, and ships a CSP in `index.html` (strict in build, dev-only relaxation) | Loopback predicate + fail-fast assert (`studio/src/lib/settings.js:25-49`); guards before headers/fetch in bridge (`studio/src/lib/ai/bridge.js:19,30`), runner (`studio/src/lib/runner/local.js:17,27`) and remote adapter (`studio/src/lib/repo/remote-adapter.js:32,59-60,64,99`). Stored tampered URLs/tokens are sanitized on read/persist (`settings.js:160-178,192-203`); non-loopback pairing is rejected and still scrubbed (`settings.js:304-308`). Bare `#token=` / `#bridge=…&token=` and legacy `#/settings?…` parse and scrub (`settings.js:228-260,283-316`). CSP meta is the source of truth (`studio/index.html:5`); dev relaxation is a serve-only plugin (`studio/vite.config.js:11-30`). Tests: `settings-loopback`, `ai-loopback`, `runner-local`, `settings-pairing`, `settings-provider-form`, `settings-csp`. | **PASS** |

---

## Requirements

| Requirement | Description | Result | Evidence |
|-------------|-------------|--------|----------|
| DEBT-01 | Wrong-language generated JSON (syllabus, quiz, flashcards, capstone) becomes a retryable error instead of silently wrong content | **PASS** | `provider-utils.js:59-82`; `errors.js:20,42,66-77`; EN/VI `errors.wrong_language`; `ai.test.js:143-208` |
| DEBT-02 | The language switch never mutates shared state during render | **PASS** | `i18n/index.js:22-38,42-48,140-146`; `i18n-render.test.js:37-58`; `i18n-catalogs.test.js:57-101` |
| SEC-12 | Loopback-only bridge/runner/remote access, token-safe pairing, and a CSP that protects BYOK keys in localStorage | **PASS** | `settings.js:25-49,160-178,228-260,283-316`; bridge/runner/remote guards; `ai/index.js:100-116,129-132`; `index.html:5`; `settings-*`, `ai-loopback`, `runner-local` tests |

---

## Must-have checklist (22/22)

### Plan 06-01 — i18n namespace split and render-safe `useT` (6/6)

| Must-have | Result | Evidence |
|-----------|--------|----------|
| Catalogs live in `i18n/{en,vi}/<namespace>.json`, 20 × 2 | PASS | 20 files each under `studio/src/lib/i18n/en/` and `vi/` |
| `index.js` auto-merges via eager `import.meta.glob` and exports `mergeCatalogModules` | PASS | `studio/src/lib/i18n/index.js:22-38` |
| Public API and every key string unchanged | PASS | Exports `translate`, `t`, `catalogKeys`, `setLanguage`, `getLanguage`, `UI_LANGUAGES`, `useT`; only 4 new keys (`errors.wrong_language`, `errors.loopback_required`, `errors.csp_blocked`, `provider.loopbackOnly`) |
| `useT` no longer assigns the module language during render; a `vi` render leaves module state untouched | PASS | `i18n/index.js:140-146`; `i18n-render.test.js:38-57` |
| A new namespace merges without editing `index.js` | PASS | Glob merge + `i18n-catalogs.test.js:91-101` |
| Shared i18n tests assert a required subset, not an exact 20-file set | PASS | `REQUIRED_NAMESPACES` + `arrayContaining` at `i18n-catalogs.test.js:17-39,58-63` |

### Plan 06-02 — typed wrong-language error (5/5)

| Must-have | Result | Evidence |
|-----------|--------|----------|
| A still-wrong result after one repair throws `WrongLanguageError` (`wrong_language`), never returns the value | PASS | `provider-utils.js:59-82`; `ai.test.js:147-156` |
| An invalid repair throws `wrong_language` with the validation error as cause (not `bad_json` or the original) | PASS | `provider-utils.js:73-79`; `ai.test.js:166-175` |
| Abort and transport errors from the repair propagate unchanged | PASS | `provider-utils.js:71-78`; `ai.test.js:176-189` |
| Exactly one language repair; the existing `bad_json` ladder is unchanged | PASS | `provider-utils.js:40-83`; tests assert 2 stream calls |
| `ErrorNotice` localizes through `errors.wrong_language` | PASS | `errors.js:42,66-77`; catalogs; `ErrorNotice.jsx:9-17`; `ai.test.js:199-207` |

### Plan 06-03 — loopback bridge, pairing and token egress (6/6)

| Must-have | Result | Evidence |
|-----------|--------|----------|
| No bridge/runner/remote request leaves for a non-loopback host; the remote adapter is guarded on the URL alone, token or not | PASS | `bridge.js:30`; `runner/local.js:27`; `remote-adapter.js:59-60,64,99`; `ai-loopback.test.js:16-51`; `runner-local.test.js:73-81` |
| A stored non-loopback URL is sanitized on read/migration; a pairing carrying one is rejected and still scrubbed | PASS | `settings.js:160-178,303-309`; `settings-loopback.test.js:83-120`; `settings-pairing.test.js:191-207` |
| Bare `#token=` and `#bridge=…&token=` pair, default to `http://localhost:3000`, and scrub the address bar | PASS | `settings.js:228-260,283-300`; `settings-pairing.test.js:157-189` |
| The legacy `#/settings?bridge=…&token=…` form still works and is scrubbed | PASS | `settings.js:241-246,291-300`; `settings-pairing.test.js:45-60,72-100` |
| Custom OpenAI-compatible/Ollama origins outside the CSP allowlist fail fast with localized `csp_blocked` | PASS | `ai/index.js:100-116,129-132`; `ai-loopback.test.js:53-89` |
| ProviderForm shows a non-blocking `role="status"` message for a non-loopback URL | PASS | `ProviderForm.jsx:81,251-252`; `settings-provider-form.test.js:28-44` |

### Plan 06-04 — Content-Security-Policy (5/5)

| Must-have | Result | Evidence |
|-----------|--------|----------|
| `index.html` ships a CSP meta with `default-src 'self'` and no exact `'unsafe-eval'` | PASS | `studio/index.html:5`; `settings-csp.test.js:44-66` |
| `script-src` allows `'wasm-unsafe-eval'` + jsDelivr; `connect-src` allows loopback http/https + providers/CDN | PASS | `index.html:5`; `settings-csp.test.js:52-55` |
| Inline styles allowed; `img-src`/`font-src` allow `data:`; `object-src`/`base-uri` `'none'`; `form-action 'self'` | PASS | `index.html:5`; `settings-csp.test.js:52-60` |
| `frame-ancestors` absent (a meta tag cannot enforce it) | PASS | `index.html:5`; `settings-csp.test.js:62-65` |
| Dev relaxes only with `apply: 'serve'`; production keeps the strict meta with no inline script | PASS | `vite.config.js:11-30`; `settings-csp.test.js:85-110`; built-artifact assertions below |

---

## Orchestrator review fixes (3/3)

### 1. HTML/CSS preview no longer inherits the app CSP (D-21)

| Check | Result | Evidence |
|-------|--------|----------|
| `OutputPanel` loads `./preview.html` in an iframe with `sandbox="allow-scripts"` and no `srcDoc` | PASS | `studio/src/components/workspace/OutputPanel.jsx:38-59,152`; static assertions at `studio/test/settings-csp.test.js:72-83` |
| Ownership exception recorded in CONTEXT | PASS | `06-CONTEXT.md:109-115` (D-21) |
| `preview.html` is a same-origin document with no CSP meta, receiving `{type:'preview-html', html}` and calling `document.write` | PASS | `studio/public/preview.html` (825 bytes); static assertions `settings-csp.test.js:74-82` |
| Production build contains `preview.html` | PASS | `/tmp/phase6-verify-dist/preview.html` exists |
| Learner inline `<script>` actually runs in the sandboxed preview with zero CSP violations (headless Chromium) | PASS | Re-run: parent `http://localhost:8123/index.html` (strict CSP) created `<iframe sandbox="allow-scripts" src="./preview.html">`, posted learner HTML whose inline script returned `{ran:true, marker:"inline-js-ran"}`; **0** console CSP violations |

### 2. IPv6 loopback is rejected everywhere (D-22)

| Check | Result | Evidence |
|-------|--------|----------|
| `isLoopbackBridgeUrl` rejects `[::1]`, `[::]`, `[::ffff:…]`, expanded IPv6 and `0.0.0.0` | PASS | `settings.js:25-38` (`host.startsWith('[')` rejects every IPv6 literal); `settings-loopback.test.js:55-70` |
| `studio/index.html` `connect-src` has no IPv6 host-source | PASS | No `[::1]` in the CSP meta (`index.html:5`); `settings-csp.test.js:67-70` |
| Dev relaxation has no `ws://[::1]` | PASS | `vite.config.js:11-17`; `settings-csp.test.js:69` |
| Tests cover the rejection (not acceptance) | PASS | 9 accepted cases, 10 rejected cases incl. three IPv6 forms (`settings-loopback.test.js:40-70`) |
| `provider.loopbackOnly` copy does not mention `[::1]` | PASS | EN: "localhost or 127.0.0.1"; VI: "localhost hoặc 127.0.0.1" (`i18n/{en,vi}/provider.json:26`) |

### 3. No remaining CSP-blocked JavaScript-runner claim

| Check | Result | Evidence |
|-------|--------|----------|
| CONTEXT corrected | PASS | `06-CONTEXT.md:86-96` — D-17 says workers do not inherit the meta CSP and "no runner is a beta limitation"; D-18 drops IPv6 |
| All four SUMMARYs corrected / free of the claim | PASS | `06-01` / `06-02` had no claim; `06-03-SUMMARY` no claim; `06-04-SUMMARY:36,97,114-117` says JS/SQL/Python workers keep working |
| VALIDATION corrected | PASS | `06-VALIDATION.md:63` manual check is now "HTML preview executes learner inline scripts", not a blocked JS runner |
| UI copy / `studio/src/**` / i18n carry no blocked-JS claim | PASS | Grep across `studio/src` + i18n finds only `errors.csp_blocked` (provider origins), loopback copy, and the `new Function` implementation in `js.worker.js`; no user-facing claim |
| Dedicated-worker behavior under the strict policy (supports the corrected docs) | PASS | Headless Chromium probe: external module page with the same strict CSP started `new Worker(new URL('./worker.js'))`; worker ran `new Function('return 1 + 1')()` → `worker:fn-ok:2`, **0** CSP violations |
| RESEARCH (historical artifact) | OK | Original finding retained with an explicit post-implementation correction note (`06-RESEARCH.md:425-433`); superseded by D-21/D-22 |

---

## Tests and build evidence (re-run 2026-10-22)

| Command | Result |
|---------|--------|
| `npm --prefix studio test` | **49 test files passed / 439 tests passed**, 2.66 s (Vitest 5.0.4) |
| Focused set: `ai`, `settings-loopback`, `settings-pairing`, `settings-migration`, `runner-local`, `ai-loopback`, `settings-provider-form`, `settings-csp`, `i18n-catalogs`, `i18n-render` | **10 test files passed / 106 tests passed**, 1.04 s |
| `npm --prefix studio run build -- --outDir /tmp/phase6-verify-dist --emptyOutDir` | **exit 0**, built in 1.50 s (only chunk-size warnings) |

Focused coverage maps to DEBT-01 (`ai.test.js`), DEBT-02 (`i18n-catalogs`, `i18n-render`) and SEC-12
(`settings-loopback`, `settings-pairing`, `settings-migration`, `runner-local`, `ai-loopback`,
`settings-provider-form`, `settings-csp`).

### Built-artifact assertions (`/tmp/phase6-verify-dist/index.html`)

| Assertion | Result | Detail |
|-----------|--------|--------|
| CSP meta survives and precedes the first script | **PASS** | `cspPresent: true`, `cspBeforeFirstScript: true`; 9 directives |
| No exact `'unsafe-eval'` | **PASS** | `'wasm-unsafe-eval'` present by locked decision D-17; exact token absent |
| No `frame-ancestors` | **PASS** | Absent (server header is Phase 2) |
| No `[::1]` host-source | **PASS** | Absent from the built policy |
| No `ws://localhost` dev source | **PASS** | Absent; websocket sources are serve-only |
| No inline script body | **PASS** | Exactly 1 `<script>` tag, external: `./assets/index-CJRmzE3k.js`; `inlineScriptCount: 0` |
| `preview.html` is emitted | **PASS** | `/tmp/phase6-verify-dist/preview.html` exists |
| `preview.html` has no CSP meta and listens for `preview-html` | **PASS** | `previewHasCspMeta: false`; `previewHasPostMessageListener: true`; `previewHasDocumentWrite: true` |

---

## Ownership

`git diff --name-only c85cfef..HEAD` = **68 files** (63 `studio/**` + 5 `06-*-SUMMARY.md` /
`06-VERIFICATION.md`). The uncommitted review-fix work adds 16 paths (75 unique total), including the
untracked `studio/public/preview.html`. Every path maps to Phase 6 `Owns` or a recorded exception:

| Changed area | Ownership |
|--------------|-----------|
| `studio/src/lib/ai/provider-utils.js`, `ai/bridge.js`, `runner/local.js`, `settings.js`, `i18n/**`, `index.html` | Phase 6 `Owns` |
| `studio/test/ai*.test.js`, `i18n-*.test.js`, `runner-local.test.js`, `settings*.test.js` | Phase 6 owned test globs |
| `studio/src/lib/ai/errors.js` | **D-05** exception (error plumbing; also carries loopback/CSP codes) |
| `studio/vite.config.js` | **D-16** exception (dev-only CSP plugin) |
| `studio/src/components/settings/ProviderForm.jsx`, `studio/src/lib/ai/index.js` | **D-19** exceptions (inline warning, CSP preflight) |
| `studio/src/lib/repo/remote-adapter.js` | **D-20** exception (token/URL egress guard) |
| `studio/src/components/workspace/OutputPanel.jsx`, `studio/public/preview.html` | **D-21** exceptions (CSP-free preview) |
| `06-0*-PLAN.md`, `06-0*-SUMMARY.md`, `06-CONTEXT.md`, `06-RESEARCH.md`, `06-VALIDATION.md`, `06-VERIFICATION.md` | Phase 6 planning artifacts |

**Unflagged files: none.**

---

## Remaining beta limitations (all recorded, none blocks a must-have)

1. **Custom OpenAI-compatible provider origins** outside the CSP allowlist are CSP-blocked; the
   localized `csp_blocked` error names the limitation (D-18).
2. **`127.0.0.2`–`127.255.255.254`** pass `isLoopbackBridgeUrl` but the CSP cannot express a CIDR, so
   the browser blocks them; use `localhost` or `127.0.0.1` (D-10).
3. **`frame-ancestors`** cannot be set from a meta tag; deploying it needs a server response header
   (Phase 2 / deployment).

## Advisory manual checks (not gaps)

- `npm --prefix studio run dev`: confirm the React-refresh preamble and HMR websocket work under the
  serve-only relaxed policy.
- `vite preview` of `/tmp/phase6-verify-dist`: confirm no CSP violations for KaTeX/Mermaid and that
  an HTML workspace exercise runs its inline script through `preview.html`.
- Real-provider UAT: trigger `wrong_language` twice and confirm the localized notice leaves
  Generate/Regenerate available as the retry.

---

## Verdict

Every Phase 6 success criterion and all 22 plan must-haves remain verified by code inspection plus
passing tests (49 files / 439 tests). The three orchestrator review fixes are each independently
confirmed: the HTML preview runs learner inline scripts from a CSP-free same-origin document with
zero console violations; IPv6 loopback is rejected by the predicate, absent from the CSP and the dev
relaxation, and covered by tests; and no phase doc or UI copy still claims the browser JavaScript
runner is CSP-blocked (the strict-CSP worker probe returned `fn-ok` with zero violations). The
production build keeps the strict CSP, emits `preview.html`, and ownership is clean.
