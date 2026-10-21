# Phase 6: Studio Beta Debt - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Learners never silently receive course content in the wrong language; the UI language switch is
render-safe and the catalogs are split per namespace so later phases add files instead of editing
shared ones; and Studio refuses to talk to a non-loopback bridge/runner, accepts the pairing token
from a bare `#token=` fragment while scrubbing it from the address bar, and ships a
Content-Security-Policy in `studio/index.html`.

In scope: DEBT-01, DEBT-02, SEC-12. Out of scope: server-side origin/token enforcement (Phase 2),
route splitting (Phase 1), Wave 2 UI work that consumes the namespace layout.

</domain>

<decisions>
## Implementation Decisions

### Wrong-language output (DEBT-01)
- **D-01:** After the single language repair retry still fails `checkJsonLanguage`, `generateJson`
  MUST throw a typed, retryable `WrongLanguageError` (code `wrong_language`) instead of returning
  the wrong-language JSON. This includes the case where the repair result fails validation — it is
  never returned as a fallback.
- **D-02:** Re-run the language check on the repaired result before returning it. Only one repair
  attempt (existing budget); a second mismatch throws.
- **D-03:** Coverage is central in `createGenerateJson`, so all four generated-JSON surfaces are
  covered: syllabus (`NewCourse`), quiz (`QuizPanel`), flashcards (`FlashcardGenerator`) and capstone
  (`generateCapstoneForCourse`).
- **D-04:** Add `wrong_language` to `studio/src/lib/ai/errors.js` (`ERROR_CODES`, `ERROR_HINTS`) and
  the `errors` namespace in both catalogs. The UI's existing Generate/Regenerate action is the Retry
  action; the localized message/hint explains what happened and that retrying is safe.
- **D-05:** Orchestrator sign-off (given in discuss): `errors.js` and the four call-site files are
  outside Phase 6's literal `Owns` list but are touched only for this error plumbing; no Phase 1/Wave
  1 phase owns them.

### i18n catalog split and render safety (DEBT-02)
- **D-06:** Layout is `studio/src/lib/i18n/<lang>/<namespace>.json` (for example
  `i18n/en/common.json`, `i18n/vi/common.json`), one file per existing top-level namespace per
  language. `index.js` auto-merges via `import.meta.glob('./{en,vi}/*.json', { eager: true })` — new
  namespace files are picked up without editing `index.js`.
  — **Reversibility:** one-way — Wave 2 phases (`betaReport`, `revision`, `runnerNotice`,
  `externalEvidence`, `playwrightTemplate`) are planned against this layout.
- **D-07:** Keep the existing public API and key strings unchanged: `t`, `translate`,
  `catalogKeys`, `setLanguage`, `getLanguage`, `UI_LANGUAGES`, `useT`, and the English fallback.
- **D-08:** `useT` must not mutate module state during render. Remove the render-time
  `currentLanguage = language` assignment; `t()` uses the language set explicitly by `setLanguage`
  (or `DEFAULT_LANGUAGE`), while `useT` translates through `translate(language, …)` derived from
  `settings.language`. A test proves a render with `vi` leaves the module-level language untouched.
- **D-09:** Tests prove `en` and `vi` have identical key sets **per namespace**, that every
  namespace file pair exists, and that a new namespace merges via the glob/merge function without
  editing `index.js`.

### Loopback-only bridge/runner and pairing (SEC-12)
- **D-10:** Loopback means `http:`/`https:` with hostname `localhost`, `*.localhost`, or an IPv4
  address in `127.0.0.0/8`. IPv6 literals are rejected (`0.0.0.0`, `::`, `[::1]`, `[::ffff:…]`),
  because Chrome ignores IPv6 loopback CSP host-sources; LAN IPs and tunnels/domains are rejected too.
- **D-11:** Enforce at settings save (the non-loopback bridge URL is not persisted / is reported as a
  validation issue) and again at use time in `createBridgeProvider` and `runnerBase` (used by
  `checkToolchains` / `runLocal`), which throw a `config` ProviderError before any fetch so the token
  is never attached to a remote host.
- **D-12:** Read the bare `#token=<value>` fragment (Phase 2's contract), store the token, default the
  bridge URL to `http://localhost:3000`, then scrub the URL with `history.replaceState`. Keep
  supporting and scrubbing the existing `#/settings?bridge=…&token=…` form.
- **D-13:** A pairing fragment carrying a non-loopback bridge URL is rejected (not saved) and leaves
  the address bar scrubbed.

### Content-Security-Policy (SEC-12)
- **D-14:** Add a `<meta http-equiv="Content-Security-Policy">` to `studio/index.html`:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  font-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:*
  https://127.0.0.1:* https://api.anthropic.com https://api.openai.com https://openrouter.ai; object-src 'none';
  base-uri 'none'; form-action 'self'`. No `unsafe-eval`; `frame-ancestors` is omitted because a meta
  tag cannot set it (the server header, if wanted, belongs to Phase 2).
- **D-15:** A test asserts the CSP meta exists and contains the locked directives, and that
  `unsafe-eval` is absent.

### Research amendments (orchestrator-approved 2026-10-22)
- **D-16:** Keep the strict production meta CSP, but add a dev-only `transformIndexHtml` hook in
  `studio/vite.config.js` that relaxes the policy for `vite dev` only (React-refresh preamble) so
  `npm run dev` keeps working. The strict meta in `index.html` stays the build contract. Ownership
  exception: `studio/vite.config.js` is unowned in Wave 1.
- **D-17:** Add `'wasm-unsafe-eval'` and `https://cdn.jsdelivr.net` (script/connect) so the SQL
  (WASM) and Python (Pyodide) browser runners keep working. Do NOT add `'unsafe-eval'`. Dedicated
  workers created with `new Worker(new URL(...))` do not inherit the document's meta CSP, so the
  browser JavaScript runner also keeps working; no runner is a beta limitation.
- **D-18:** `connect-src` includes loopback http+https (`localhost`, `*.localhost`, `127.0.0.1`),
  `https://api.anthropic.com`, `https://api.openai.com`, `https://openrouter.ai`,
  `https://api.groq.com`, and `https://cdn.jsdelivr.net` (Pyodide). IPv6 loopback is rejected by the
  predicate because a CSP host-source cannot route it. CSP cannot express `127.0.0.0/8`; only
  `127.0.0.1` is reachable from the browser. Custom OpenAI-compatible origins outside this list are
  CSP-blocked: `getProvider` throws a localized `csp_blocked` error naming the limitation and the
  phase SUMMARY records it as a known beta limitation.
- **D-19:** Save-time behavior: `saveSettings` does NOT hard-reject (the controlled `ProviderForm`
  saves every keystroke). Instead `migrateSettings`/`read` sanitize a stored non-loopback bridge URL
  (drop it and its token, restoring the default), `applyPairingFromUrl` rejects a non-loopback
  pairing without saving anything (still scrubs the URL), and use-time guards in
  `createBridgeProvider` / `runnerBase` throw a clear localized `loopback_required` error. The
  provider/bridge form shows a non-blocking inline validation message (`role="status"`) when the
  URL is not loopback. Ownership exceptions: `studio/src/components/settings/ProviderForm.jsx`
  (inline message) and `studio/src/lib/ai/index.js` (`getProvider` CSP preflight) — neither is owned
  by a Wave 1 phase.
- **D-20:** The bridge token guard is also applied to `studio/src/lib/repo/remote-adapter.js`
  (approved ownership exception; it reads raw localStorage and attaches the same token). It throws
  `loopback_required` before any fetch.
- **D-21 (orchestrator review):** The HTML/CSS workspace preview must not use a `srcdoc` iframe
  (it inherits the app meta CSP and blocks learner inline scripts). Render it from a dedicated
  same-origin static document, `studio/public/preview.html`, loaded with `sandbox="allow-scripts"`
  (no `allow-same-origin`) and fed the learner HTML via `postMessage` + `document.write`. The preview
  document ships no CSP meta so it does not inherit the app policy. Ownership exception:
  `studio/src/components/workspace/OutputPanel.jsx` and the new `studio/public/preview.html`;
  neither is owned by a Wave 1 phase.
- **D-22 (orchestrator review):** The `ipv6` acceptances in D-10/D-18 are corrected: `[::1]` and
  every IPv6 literal are rejected by `isLoopbackBridgeUrl` (and removed from the CSP) because Chrome
  ignores `http://[::1]:*` / `https://[::1]:*`, which would silently break an accepted bridge.
  `localhost` and `127.0.0.1`/`127.0.0.0/8` remain supported. **D-21/D-22 supersede the affected
  parts of D-10, D-14, D-17 and D-18.**

### the agent's Discretion
- Exact English/Vietnamese wording of the new `wrong_language` message and hint.
- IPv4-mapped IPv6 forms are rejected (CSP cannot express them); see D-22.
- Test file names, as long as they match Phase 6's owned globs (`ai*.test.js`, `i18n-*.test.js`,
  `runner-local.test.js`, `settings*.test.js`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/phases/06-studio-beta-debt/06-RESEARCH.md` — technical research, exact line references, CSP/runners findings, validation architecture.
- `.planning/ROADMAP.md` — Phase 6 section: Goal, Owns, Touch points, Success Criteria.
- `.planning/REQUIREMENTS.md` — DEBT-01, DEBT-02, SEC-12 (lines 23, 44–45).
- `.planning/ROADMAP.md` § Execution Rules — exclusive ownership, lockfiles, official planning-doc
  ownership (STATE.md/ROADMAP.md/CLAUDE.md are orchestrator-only).

### Known issues and recommended fixes
- `.planning/codebase/CONCERNS.md` § 4 (line 23) — `generateJson` silently returns wrong language.
- `.planning/codebase/CONCERNS.md` § 9 (line 28) and detail (line 35) — render-time i18n mutation.
- `.planning/codebase/CONCERNS.md` (line 36) — exact wrong-language fix recommendation.
- `.planning/codebase/CONCERNS.md` (line 102–104) — bridge token sent to any configured URL.
- `.planning/codebase/CONCERNS.md` (line 106–107) — BYOK keys/token in localStorage; CSP rationale.
- `.planning/codebase/CONCERNS.md` (line 158) — published package ships `studio/src/lib/`, so new
  i18n files under `lib/i18n/` ship too.

### Code contracts to preserve
- `studio/src/lib/i18n/index.js` — public i18n API consumed across `src/**`.
- `studio/src/lib/ai/fetch-local.js` — existing loopback host list and LNA opt-in (read-only).
- `studio/src/lib/settings.js` — pairing hash parser, settings persistence, bridge config.
- `studio/src/lib/ai/bridge.js` — bridge HTTP/SSE contract and `X-Studio-Token` header.
- `studio/src/lib/runner/local.js` — runner base URL and SSE contract.
- `web/studio-api.js` (read-only) — Phase 2 fragment/route contract; `#token=<value>`.
- `.planning/STATE.md` § Decisions — SEC-12 split between Phase 2 (emits fragment) and Phase 6
  (reads it).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createGenerateJson` in `provider-utils.js` — single choke point for JSON generation + language
  repair, already receives `language`.
- `checkJsonLanguage` / `checkLanguage` in `i18n/detect.js` — pure language verdicts.
- `providerError` / `ProviderError` / `ERROR_HINTS` in `ai/errors.js` — error taxonomy; adding
  `wrong_language` makes `ErrorNotice` localize it automatically.
- `ErrorNotice` — already translates codes that exist in `ERROR_HINTS`; no UI change needed.
- `useStream` — surfaces thrown errors as `error` and keeps the Generate button available for retry.
- `parsePairingHash` / `applyPairingFromUrl` / `installPairingWatcher` in `settings.js`.
- `localFetch` / `isLocalUrl` in `fetch-local.js` — reuse the loopback idea (but it includes
  `0.0.0.0`, which Phase 6 must reject).

### Established Patterns
- Vitest 5 in `studio/` (`vite.config.js` `test.include` = `test/**/*.test.js`), 43 files / 372
  tests green before this phase.
- Render smoke tests use `react-dom/server` `renderToString` on `.test.js` files.
- Catalogs are flat JSON with a `one|other` plural convention; `i18n-keys.test.js` already scans
  `src/**` for literal `t('…')` keys.
- Errors: `ProviderError(code, message, hint)`, UI localizes known codes via `errors.<code>`.

### Integration Points
- `provider-utils.js` → quiz/flashcards (`provider.generateJson`), NewCourse
  (`createGenerateJson(provider.streamText)`), `lib/capstone.js`.
- `settings.js` → `main.jsx` (`applyPairingFromUrl` before render) and the hash watcher.
- `bridge.js` / `runner/local.js` → settings bridge config and `fetch-local`.
- `studio/index.html` → Vite build output (CSP meta) and dev server.

</code_context>

<specifics>
## Specific Ideas

- Bad-language error copy should name the expected language and tell the learner retrying is safe
  ("The model answered in the wrong language twice. Try again, or pick a stronger model.").
- Loopback validation must run before the `X-Studio-Token` header is attached (the concern is token
  exfiltration, not just UX).
- Keep the existing `#/settings?bridge=…&token=…` flow working for older CLI-printed URLs.

</specifics>

<deferred>
## Deferred Ideas

- Server-side `Content-Security-Policy` headers and `frame-ancestors` (Phase 2 / deployment).
- `vite.config.js` CSP dev-server relaxations (not owned; the locked meta policy is the contract).
- Adding a dedicated Retry button inside `ErrorNotice` (unowned UI file; existing Generate action
  suffices for this phase).

</deferred>

---

*Phase: 6-Studio Beta Debt*
*Context gathered: 2026-10-22*
