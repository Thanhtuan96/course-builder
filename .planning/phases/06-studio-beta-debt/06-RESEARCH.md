# Phase 6 Research — Studio Beta Debt

**Phase:** 6 — Studio Beta Debt
**Researched:** 2026-10-22
**Worktree:** `.worktrees/phase-06` (branch `gsd/phase-06-studio-debt`)
**Scope:** DEBT-01, DEBT-02, SEC-12. Research only; no source files changed.
**Baseline:** `npm --prefix studio test` → **43 files / 372 tests passed** in 1.23 s (Vitest 5.0.4).

---

## 1. Standard stack and patterns

| Area | What is already in place | Consequence for this phase |
|---|---|---|
| Build | Vite 8.3.4, `@vitejs/plugin-react` 6.1.2, Tailwind 4, `base: './'` (`studio/vite.config.js:7-13`) | `import.meta.glob` is transformed by Vite/Vitest; production HTML has only external module scripts and one external stylesheet |
| Tests | Vitest 5.0.4, `environment: 'node'`, `include: ['test/**/*.test.js']` (`studio/vite.config.js:12`) | New tests may use `react-dom/server` `renderToString` (pattern: `test/tutor-panel.render.test.js:1-21`) |
| Errors | `ProviderError(code, message, hint)` + `ERROR_CODES` + `ERROR_HINTS` (`studio/src/lib/ai/errors.js:6-65`); UI localizes known codes (`studio/src/components/ui/ErrorNotice.jsx:9-19`) | A new error code is enough for localized UI; no component change is needed |
| JSON generation | One choke point, `createGenerateJson(streamText)` (`studio/src/lib/ai/provider-utils.js:36-83`); every provider exposes `generateJson` (`anthropic.js:85`, `openai-compatible.js:84`, `ollama.js:44`, `bridge.js:76`) | Fixing the choke point covers syllabus, quiz, flashcards and capstone |
| i18n | Dependency-free `translate`/`t`/`catalogKeys`/`useT` (`studio/src/lib/i18n/index.js:12-125`); 20 flat namespaces in each of `en.json`/`vi.json` | Split per namespace, keep the API byte-for-byte |
| Settings | localStorage + pairing hash parser + watcher (`studio/src/lib/settings.js:135-264`) | This is the safest place for the shared loopback helper (no import cycle) |
| Bridge / runner | `localFetch` wrapper already exists (`studio/src/lib/ai/fetch-local.js:39-51`), but its host list intentionally includes `0.0.0.0` (`:13`) | Do **not** reuse `isLocalUrl`; write a strict helper |
| CSP | None today (`studio/index.html:1-15`) | Add one meta policy; see severe compatibility findings in §5 |

No new npm dependency is needed for any requirement.

---

## 2. DEBT-01 — wrong-language output must become a retryable error

### 2.1 Exact current control flow

`createGenerateJson` (`studio/src/lib/ai/provider-utils.js:36-83`) runs two independent retry ladders:

1. `coerceWithRepair()` (`:38-57`) calls `streamText` once and parses/validates (`coerce`, `:89-103`).
   If parsing/validation fails, it makes **one** JSON repair call (`:44-49`) and validates again.
   If that fails too it throws `bad_json` (`:54`). Abort errors are re-thrown (`:43`, `:53`).
2. The language ladder (`:61-79`) runs only when `language` is provided. It calls
   `checkJsonLanguage(value, language)` (`:64`). On mismatch it sends one language-repair message
   (`:66-70`) and then:
   - **success today:** `return coerce(second, validate)` at `:73` **without re-running the language
     check**;
   - **invalid-JSON repair today:** `return value` at `:76`, i.e. it silently returns the original
     wrong-language JSON;
   - **valid-but-still-wrong-language repair today:** also falls through to `return value` at `:81`
     because the repaired value is never checked.

`CONCERNS.md:36` and `:172` confirm this is the known bug. The only budget is one language repair.

### 2.2 Required change (D-01/D-02)

All edits stay in `provider-utils.js` plus the approved error plumbing in `errors.js`.

```
language mismatch
  → one streamText language-repair call
  → coerce() (validate)
      ├─ coerce throws → throw WrongLanguageError (cause = coerce error)   // never return `value`
      └─ coerce ok → checkJsonLanguage(repaired, language)
            ├─ ok      → return repaired
            └─ mismatch→ throw WrongLanguageError
```

Key rules for the implementation:

- Do **not** convert abort or transport failures into `wrong_language`. Re-throw `isAbortError(err)`
  (`provider-utils.js:6`, `errors.js:68-70`). A bridge/network `ProviderError` from the repair call
  should propagate unchanged; only a *validation* failure of the repair result becomes
  `wrong_language`.
- `WrongLanguageError` should sub-class `ProviderError`, keep `instanceof ProviderError` true, set
  `name = 'WrongLanguageError'`, `code = 'wrong_language'`, and be constructible with **no custom
  message/hint** so `ErrorNotice` can localize it (see §2.3).
- No change to the existing `bad_json` ladder or the one-repair budget.
- `language` may be a legacy display name (`capstone.test.js:16` uses `language: 'English'`);
  `checkJsonLanguage` already normalizes (`i18n/detect.js:111-127`, `:159-169`), so no extra work.

### 2.3 Is `errors.js` + i18n keys sufficient? Yes.

`ErrorNotice` logic (`studio/src/components/ui/ErrorNotice.jsx:12-19`):

- It localizes only when the code exists in `ERROR_HINTS` and `error.message === ERROR_HINTS[code]`.
- A default-constructed `ProviderError` gets `message = hint = ERROR_HINTS[code]`
  (`errors.js:49-54`), so the translated string becomes the message and the duplicate hint is
  suppressed.
- Therefore adding `wrong_language` to `ERROR_CODES` (`errors.js:6-21`) and `ERROR_HINTS`
  (`:24-40`), plus `errors.wrong_language` in both catalogs, is sufficient. **Do not pass a custom
  English hint** from `provider-utils.js`, or localization turns off.
- After the catalog split this key lives in `studio/src/lib/i18n/en/errors.json` and
  `studio/src/lib/i18n/vi/errors.json`.
- Suggested copy: EN “The model answered in the wrong language twice. Try again, or pick a stronger
  model.”; VI “Mô hình đã trả lời sai ngôn ngữ hai lần. Hãy thử lại, hoặc chọn mô hình mạnh hơn.”

### 2.4 Retry affordances at the four call sites — no edit required

All four generated-JSON surfaces already pass `language` and already have a retry action:

| Surface | Generate call | Retry affordance |
|---|---|---|
| NewCourse syllabus | `pages/NewCourse.jsx:61-62` (`createGenerateJson` + `language: effectiveLanguage`) | “Propose” button stays rendered (`NewCourse.jsx:196-201`) |
| Quiz | `components/practice/QuizPanel.jsx:79-80` (`provider.generateJson` + `language`) | Explicit “Try again” button in the error branch (`QuizPanel.jsx:146-153`) |
| Flashcards | `components/practice/FlashcardGenerator.jsx:52-54` | “Generate” / “Generate again” always rendered (`FlashcardGenerator.jsx:158-171`) |
| Capstone | `lib/capstone.js:93-103` (`language: course?.language`) | Course page re-runs `generateCapstoneForCourse` (`pages/Course.jsx:143-147`); capstone review also benefits centrally (`pages/Capstone.jsx:172-181`) |

`useStream` surfaces thrown errors as `error` and re-throws (`lib/ai/useStream.js:91-103`); each
call site catches and ignores because the error is already displayed. So **no call-site edit is
required**; the orchestrator-approved sign-off for call sites is precautionary.

Caveat: capstone generation during course creation is deliberately swallowed
(`pages/NewCourse.jsx:124-129`), so a wrong-language capstone is not shown at creation and no
wrong-language capstone is persisted. The learner can retry from the Course page. This still meets
“never silently receives wrong-language content”; do not change it in this phase.

### 2.5 Tests (see §7)

Add to `studio/test/ai.test.js` (matches owned `ai*.test.js`).

---

## 3. DEBT-02 — per-namespace catalogs and render-safe `useT`

### 3.1 Current shape

- `index.js` statically imports the two catalogs (`i18n/index.js:15-18`), builds
  `CATALOGS = { en, vi }`, exports `UI_LANGUAGES = Object.keys(CATALOGS)` (`:21`).
- 20 top-level namespaces in each file (verified): `common`, `nav`, `durability`, `app`,
  `onboarding`, `home`, `newCourse`, `course`, `lesson`, `reflection`, `practice`, `tutor`,
  `capstone`, `settings`, `provider`, `providerMeta`, `data`, `storage`, `workspace`, `errors`.
- `useT` mutates module state during render: `currentLanguage = language` at `i18n/index.js:123`.
  No production module-level consumer of `t()` / `getLanguage()` exists (all `src/**` importers use
  `useT`; verified by grep), so the mutation is latent but must be removed before Wave 2 adds
  callers.

### 3.2 Target merge

```js
// studio/src/lib/i18n/index.js
const modules = import.meta.glob('./{en,vi}/*.json', { eager: true });

export function mergeCatalogModules(mods) {
  const out = {};
  for (const [path, mod] of Object.entries(mods)) {
    const m = path.match(/^\.\/([^/]+)\/([^/]+)\.json$/);
    if (!m) continue;
    const [, lang, namespace] = m;
    (out[lang] ||= {})[namespace] = mod.default ?? mod;
  }
  return out;
}

const CATALOGS = mergeCatalogModules(modules);
```

Layout: one file per top-level key per language, e.g. `i18n/en/common.json`,
`i18n/vi/common.json`, `i18n/en/newCourse.json`, `i18n/en/providerMeta.json`. Move the existing
objects verbatim; keys inside each file stay exactly what they are under the old top-level key.
Delete `i18n/en.json` and `i18n/vi.json` after the move.

**Confirmed mechanics (Vite 8.3.4 / Vitest 5.0.4):** a probe config under `/tmp` using the studio
`node_modules` ran `import.meta.glob('../lang/{en,vi}/*.json', { eager: true })` in a Vitest node
test. Results: brace patterns work, keys are the literal relative paths, and each value is a module
namespace whose JSON object is on `.default` (assertions on `.default.a` / `.default.nested.k`
passed). Vite documents the same eager shape (`import * as __vite_glob_0_0`, then a path→namespace
map) at vite.dev/guide/features#glob-import. `{ eager: true }` is required so `CATALOGS` is built
synchronously during module import; the non-eager form returns lazy `() => import()` functions.

Caveats:

- `import.meta.glob` is Vite-only. `i18n/index.js` must never be imported by plain Node. It currently
  is not: only `src/**` and `test/i18n-*.test.js` import it, and `bin/commands/import.js` imports
  repo/SRS/prompt modules only. `studio/src/lib/` is shipped in the package, so this caveat must stay
  documented for future CLI use.
- The brace set `{en,vi}` means a third language directory is not picked up until the glob is
  edited, which is intentional (only catalogs that exist should become UI languages). If a stray
  file appears directly under `i18n/`, it is ignored by the pattern.
- Glob file order is deterministic but not semantically important; `UI_LANGUAGES` only cares that
  `en` and `vi` appear.

### 3.3 Preserve the public API

`translate`, `t`, `catalogKeys`, `setLanguage`, `getLanguage`, `UI_LANGUAGES`, `useT`, plural
`one|other`, interpolation and the English fallback all remain unchanged. Only `CATALOGS`
construction and the `useT` body change.

Render-safe `useT` (D-08):

```js
export function useT() {
  const [settings] = useSettings();
  const language = normalizeLanguage(settings?.language);
  // remove: currentLanguage = language;
  return useCallback((key, params) => translate(language, key, params), [language]);
}
```

Consequence: module-level `t()` uses only the value set by `setLanguage` (or `DEFAULT_LANGUAGE`).
Since no production code calls module-level `t()` today, behavior is unchanged; future non-React
callers must call `translate(language, …)` explicitly. `getLanguage()` becomes “last explicit
`setLanguage`, else `en`”, which is exactly what the new test asserts.

### 3.4 Importers/tests that break, and the fix

| File | Impact | Action |
|---|---|---|
| `studio/src/lib/i18n/index.js:15-16` | Only direct importers of `en.json` / `vi.json` | Replace with the glob + merge; these two imports are the whole breakage surface |
| `studio/test/i18n-keys.test.js:11` | Imports `catalogKeys`, not JSON | Keeps working; update stale failure messages (“en.json” → directory) and extend for per-namespace parity |
| All `src/**` `useT` importers (35 files, list in §3.5) | Import the public API only | No change |
| `studio/README.md:251-258` | Documentation names `en.json` / `vi.json` | Optional doc touch-up; README is not owned — hand a note to the orchestrator rather than editing |

No component, page, route or test imports the JSON files directly (verified by repo-wide grep).

### 3.5 Every `useT` importer (all remain valid)

`src/App.jsx`, `components/{Layout,Onboarding}.jsx`, `components/capstone/{ArtifactCard,
CapstoneCard,CompletionPanel,ReviewPanel,RubricList,SubmissionForm,SubmissionHistory}.jsx`,
`components/course/LessonContent.jsx`, `components/data/{DataPanel,StorageChoice,StorageMoveDialog,
StorageSection}.jsx`, `components/practice/{DueBadge,FlashcardGenerator,LessonPractice,QuizPanel,
StreakBadge}.jsx`, `components/settings/ProviderForm.jsx`, `components/tutor/{ChatMessage,
QuickActions,TutorPanel}.jsx`, `components/ui/ErrorNotice.jsx`, `components/workspace/{CodeWorkspace,
FileTabs,HistoryDrawer,OutputPanel}.jsx`, `pages/{Capstone,Course,Home,Lesson,NewCourse,Review,
Settings}.jsx`.

### 3.6 Wave-2 compatibility

New namespace files (`betaReport.json`, `revision.json`, `runnerNotice.json`,
`externalEvidence.json`, `playwrightTemplate.json`) are picked up by the glob with **no `index.js`
edit**, satisfying ROADMAP Execution Rules § i18n. Files under `studio/src/lib/` are already in the
published package (`package.json` `files`: `"studio/src/lib/"`), so the split ships (CONCERNS.md:158).

---

## 4. SEC-12 — loopback-only bridge/runner

### 4.1 Where the bridge token is attached (complete list)

| Site | Line(s) | Notes |
|---|---|---|
| `studio/src/lib/ai/bridge.js` | headers built at `:28-31`, used by `streamText` `:38`, `listModels` `:88`, `health` `:102` | Owned. Validate `root` **before** constructing `headers` in `createBridgeProvider` (`:26-31`) |
| `studio/src/lib/runner/local.js` | `headersFor` `:33-39`, used by `checkToolchains` `:51` and `runLocal` `:88-92` | Owned. Validate inside `runnerBase` (`:24-27`) before any fetch |
| `studio/src/lib/repo/remote-adapter.js` | headers `:51-54`, used by DB health/post | **Not owned.** All storage calls (`select-adapter.js:99,128,174,255,297`) send the same token |
| `web/studio-api.js` / Phase-2 routes | server-side comparison only | No client change |

`select-adapter.js:30-38` reads `localStorage` raw (it does not call `loadSettings`/`migrateSettings`),
so a pre-existing/tampered remote URL can still reach `remote-adapter.js`. With only Phase 6 files
changed, the token-exfiltration fix is complete for the bridge/runner but **not** for the SQLite
remote adapter. Options: (a) accept and record the residual risk for beta (the UI defaults to
localhost and this phase stops new remote values from being paired/saved), or (b) ask the
orchestrator for sign-off to add the same guard to `remote-adapter.js` (one import + one call). Do
not silently claim the token can never reach a remote URL while this path exists.

### 4.2 Loopback definition (D-10)

Validate with the URL parser **after** normalization, never by string prefix — the WHATWG parser
folds alternate IPv4 spellings, closing bypasses:

```
http://127.1      → 127.0.0.1
http://2130706433 → 127.0.0.1
http://0x7f000001 → 127.0.0.1
http://0177.0.0.1 → 127.0.0.1
http://[0:0:0:0:0:0:0:1] → [::1]
```

Recommended predicate:

```js
export function isLoopbackBridgeUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '[::1]') return true;
  if (h.startsWith('[::ffff:7f00:')) return true; // optional IPv4-mapped form (URL normalizes 127.x)
  const m = h.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return Boolean(m) && m.slice(1).every((n) => Number(n) <= 255);
}
```

Reject `0.0.0.0`, `::`, LAN IPs, tunnels/domains, and non-http(s) schemes. `URL.hostname` for IPv6
includes brackets (`[::1]`), confirmed on Node 26.

### 4.3 Where the shared helper lives (no import cycle)

`i18n/index.js:13` imports `settings.js`, so the helper must **not** live under `i18n/` or in a
module that imports `i18n/index.js`. `settings.js` is the best home inside the literal Owns list:

- `settings.js` already imports `./ai/config.js`, `./ai/status.js`, `./ai/catalog.js` and
  `./i18n/languages.js`. None of those import `settings.js`, so exporting the helper from
  `settings.js` creates no cycle.
- `bridge.js` can import `assertLoopbackBridgeUrl` from `../settings.js`. `settings.js` does not
  import `bridge.js`, so no cycle.
- `runner/local.js` already imports `bridge.js` (`:16`); it can import the helper from
  `settings.js` directly.
- `settings.js` may import `providerError` from `./ai/errors.js` (errors has no imports). Throw
  `providerError('config', 'Studio only connects to a loopback bridge.', 'Use http://localhost:…')`
  before any fetch. A custom message is not localized, but it is an actionable configuration error;
  alternatively use the default `config` hint and accept “source not supported” wording.
- A new `lib/loopback.js` would be cleaner but is outside the literal Owns list; avoid it unless
  the orchestrator approves a new file.

### 4.4 Enforce at use time (authoritative)

- `createBridgeProvider`: validate the trimmed `root` at `bridge.js:27`, before building `headers`.
  Throw synchronously; `getProvider` dynamic-imports and returns, and `useStream` catches it.
- `runnerBase`: validate the resolved root at `runner/local.js:24-27` before returning the URL, so
  `checkToolchains` and `runLocal` never call `localFetch`. `runnerBase` is only called by those two
  functions and one test (`test/runner-local.test.js:19`).
- Keep `localFetch`/`isLocalUrl` untouched: it includes `0.0.0.0` (`fetch-local.js:13`) and is used
  for Ollama/LM Studio as well, which are not part of this requirement.

### 4.5 Enforce at settings save/migration (D-11) — UX caveat

Settings entry points:

| Entry point | Line | Effect |
|---|---|---|
| `saveSettings(patch)` | `settings.js:135-147` | merges, migrates, persists, notifies |
| `read()` / `loadSettings()` | `settings.js:115-128` | `read()` applies `migrateSettings` |
| `migrateSettings(raw)` | `settings.js:84-113` | called by both read and save |
| `applyPairingFromUrl(env)` | `settings.js:214-247` | builds a patch and calls `saveSettings` at `:234` |
| `installPairingWatcher` | `settings.js:255-264` | re-runs pairing on `hashchange` |
| `clearSecrets()` | `settings.js:267-273` | okay; it only clears keys |
| `select-adapter.readStoredSettings()` | `select-adapter.js:30-38` | bypasses all of the above |

Recommended behavior:

- `migrateSettings`: if `next.bridge?.bridgeUrl` (or legacy top-level `next.bridgeUrl`) is an absolute
  non-loopback http(s) URL, delete the URL **and** the paired `bridge.bridgeToken`/`bridgeToken`.
  `read()` then deep-merges `DEFAULT_SETTINGS`, restoring the safe `http://localhost:3000` default
  (`settings.js:48-53`). This neutralizes legacy/tampered storage for every `useSettings` consumer.
- `saveSettings`: apply the same sanitization to the merged result before `localStorage.setItem`
  (`:137-143`); never persist a token next to a rejected URL.
- `applyPairingFromUrl`: validate `pairing.bridgeUrl` explicitly **before** building the patch; on
  failure do not save anything (no provider switch, no onboarding/storage mutation), still scrub
  the hash (D-13).

**UX caveat (important for the plan):** `ProviderForm` is a controlled input whose value comes from
settings and whose `onChange` calls `saveSettings` on every keystroke
(`components/settings/ProviderForm.jsx:243-247`, `:66-69`). A strict “reject any non-loopback parsed
URL on save” rule makes even typing `http://127.0.0.1:3000` bounce, because intermediate strings
parse to other numeric hosts (`http://1` → `0.0.0.1`, `http://127.0` → `127.0.0.0`). The bridge URL
defaults to localhost and is normally supplied by pairing, so this may be acceptable for beta, but
the plan must choose one explicitly:

1. accept the typing limitation and document it (no unowned edits); or
2. request orchestrator sign-off for a tiny `ProviderForm` local-draft state (outside Owns); or
3. persist the draft URL but mark it rejected and rely on the use-time guards to protect the token
   (deviates from “not persisted”).

The security-critical invariant is (3)'s guard: **the token must never be attached to a
non-loopback host**. Use-time validation in §4.4 guarantees that regardless of what is stored.

### 4.6 Pairing fragment (D-12/D-13)

Current `parsePairingHash` (`settings.js:168-178`) returns `null` unless the fragment contains `?`;
`#token=<value>` therefore does nothing today. `applyPairingFromUrl` (`:214-247`) saves
`bridge.bridgeUrl`/`bridge.bridgeToken`, may switch to `bridge`, marks onboarding complete, defaults
to SQLite, and scrubs the hash with `history.replaceState` (`:236-244`). `main.jsx:9` calls it once
before render; `settings.js:264` installs the watcher in the browser.

Recommended parser behavior:

```
#/settings?bridge=…&token=…   → { bridgeUrl, token, path: '/settings' }   (unchanged)
#token=<value>                → { bridgeUrl: '', token, path: '/' }
#bridge=<url>&token=<value>   → { bridgeUrl, token, path: '/' }           (bare query form)
#token=  / #/settings?token=  → null                                     (empty)
```

Implementation sketch: if the fragment has no `?` and its first `=`-separated key is `token` or
`bridge`, parse the whole fragment with `URLSearchParams` and use `path: '/'`; otherwise keep the
existing path+query branch. Reject empty token/bridge as today (`:175`).

`applyPairingFromUrl` changes:

- If `pairing.bridgeUrl` is empty (bare `#token=`), use `BRIDGE_DEFAULT_URL`
  (`ai/catalog.js:42`, already adjacent to imports in `settings.js:10`) → `http://localhost:3000`.
- If `pairing.bridgeUrl` is present but non-loopback: reject per §4.5, do not save, still scrub.
- Scrub target remains `${pathname}${search}${pairing.path === '/' ? '' : '#' + pairing.path}`; a
  bare token drops the fragment while preserving the current route.
- `main.jsx` needs no change.
- Existing test expectations (`test/settings-pairing.test.js:72-133`) must keep passing; extend with
  bare-token, bare-bridge, non-loopback-rejection and scrub cases.

### 4.7 CSP (D-14/D-15)

Target meta (exact locked policy from 06-CONTEXT D-14) goes in `studio/index.html` immediately after
`<meta charset>` and before the favicon/scripts:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:* http://[::1]:* https://api.anthropic.com https://api.openai.com https://openrouter.ai; object-src 'none'; base-uri 'none'; form-action 'self'">
```

- `frame-ancestors` is intentionally omitted: MDN states the directive **is not supported in the
  `<meta>` element** (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors).
  The server-side header belongs to Phase 2.
- No `unsafe-eval`, no `unsafe-inline` for scripts.
- `style-src 'unsafe-inline'` is required: KaTeX emits style attributes, Mermaid injects `<style>` /
  style attributes in its SVG, and Vite dev injects CSS via `<style>` tags.
- `img-src data:` covers the inline SVG favicon (`index.html:7`) and Mermaid’s data images;
  `font-src 'self' data:` covers bundled KaTeX `.woff2` assets and any Vite-inlined small font.
- `connect-src 'self'` covers the Studio origin, built chunks and same-origin fetches; the local
  bridge/runner is covered by the loopback entries; Anthropic is `https://api.anthropic.com`
  (`ai/anthropic.js:23`); OpenAI presets are `api.openai.com`, `openrouter.ai`
  (`ai/catalog.js:25-31`).

CSP syntax for loopback hosts (important):

| Need | Correct source expression | Notes |
|---|---|---|
| localhost any port | `http://localhost:*` | omit `:*` would only allow port 80 |
| localhost subdomains | `http://*.localhost:*` | only a leftmost DNS wildcard is legal |
| IPv4 loopback | `http://127.0.0.1:*` | exact host only; **cannot** express `127.0.0.0/8` or `127.*` |
| IPv6 loopback | `http://[::1]:*` | brackets are part of host-source syntax |
| https loopback | `https://localhost:*`, `https://[::1]:*` … | currently absent from D-14 even though D-10 allows `https:` |

Production Vite build compatibility (verified with `npx vite build --outDir /tmp/phase6-dist`):
the built HTML contains one external `<script type="module" crossorigin src="./assets/…">`, external
`<link rel="stylesheet">`, modulepreload links and **zero inline scripts/styles**. `script-src
'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:` and `font-src 'self' data:` are
therefore sufficient. Vite also documents that small build assets are inlined as `data:` and that
`data:` must be allowed for `img-src`/`font-src` (never for `script-src`).

### 4.8 CSP conflicts that need an explicit planning decision

These are the highest-risk findings of this research. They are not reasons to weaken the policy
silently; they are decisions the plan/orchestrator must record.

> **Post-implementation correction (orchestrator E2E):** dedicated `new Worker(new URL(...))`
> workers do NOT inherit the document meta CSP, so the JavaScript/SQL/Python runners work with the
> strict policy (verified with the built `js.worker`). The HTML preview is likewise moved to a
> same-origin `public/preview.html` document (not `srcdoc`). IPv6 loopback host-sources are invalid
> in Chrome and are now rejected by the predicate. See CONTEXT D-21/D-22.

1. **`npm run dev` breaks under the strict meta CSP (verified).** The Vite 8 + plugin-react 6 dev
   server injects an **inline** React-refresh preamble into the HTML:
   `<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"; …</script>`.
   This was captured from a running `vite --port 5199`; plugin-react implements it via
   `transformIndexHtml` (`node_modules/@vitejs/plugin-react/dist/index.js:181-189`). With
   `script-src 'self'` and no hash/nonce the preamble is blocked; transformed modules then throw
   `$RefreshSig$ is not defined` (`/src/App.jsx` starts with `$RefreshSig$()`), so the dev app does
   not boot. A meta tag cannot be made production-only without Vite HTML transformation. Options:
   - add a Vite `transformIndexHtml` dev-only relaxation in `vite.config.js` (explicitly deferred
     and **not owned** by Phase 6; needs orchestrator sign-off);
   - include the SHA-256 hash of the exact dev preamble in `script-src` (stays inside `index.html`,
     keeps `unsafe-inline` out, but is brittle across plugin versions and base paths);
   - accept a broken `npm run dev` (not recommended).
   The plan must not pretend the locked meta works in dev without one of these.
2. **Workspace runners are blocked by the locked policy.** `js.worker.js:113,136` compiles learner
   code with `new Function`; CSP without `'unsafe-eval'` blocks it. `sql.worker.js` uses sql.js
   WebAssembly and `python.worker.js:24` dynamically imports Pyodide from
   `https://cdn.jsdelivr.net/...`; WebAssembly needs `'wasm-unsafe-eval'` and the CDN is absent from
   `script-src`/`connect-src` (MDN: without `'wasm-unsafe-eval'`, WebAssembly is blocked). The
   sandboxed HTML preview (`OutputPanel.jsx:128-129`, `srcdoc`) also runs inline scripts, which
   inherit the parent policy. If beta must keep browser runners, the policy needs
   `'wasm-unsafe-eval'` and `https://cdn.jsdelivr.net` (and JS still needs `'unsafe-eval'`, which
   defeats the XSS rationale for protecting localStorage keys). Otherwise record the regression and
   route runnable exercises to the local runner.
3. **Locked `connect-src` omits shipped providers/valid loopback forms.** `catalog.js:28` ships a
   Groq preset (`https://api.groq.com/openai/v1`), but Groq is absent from D-14. Custom
   OpenAI-compatible base URLs (`catalog.js:30`) can be any origin and are therefore blocked. An
   `https://localhost` bridge (allowed by D-10) is blocked because only `http://localhost:*` is
   listed. `127.0.0.2`–`127.255.255.254` are allowed by D-10 but not by the exact
   `http://127.0.0.1:*` source. `*.localhost` is allowed by D-10 but absent. Either D-14 is amended
   (add `https://api.groq.com`, `https://localhost:* https://127.0.0.1:* https://[::1]:*`,
   `http://*.localhost:*`) or the plan explicitly accepts those failures and narrows the validator
   to exactly `localhost`, `127.0.0.1`, `[::1]`.
4. **CSP test placement.** No owned glob matches “csp”. Use `studio/test/settings-csp.test.js`
   (matches `settings*.test.js`) or fold the assertions into `settings-pairing.test.js`. Do not
   create `csp.test.js` — it is outside the owned globs.

---

## 5. Recommended approach (per requirement)

**DEBT-01**
1. `ai/errors.js`: add `'wrong_language'` to `ERROR_CODES`, an English default in `ERROR_HINTS`,
   export `WrongLanguageError extends ProviderError` (no custom message by default) and a
   `wrongLanguageError(cause?)` factory.
2. `ai/provider-utils.js:61-79`: re-check the repaired value; replace both fallback returns with
   `WrongLanguageError`; preserve abort/transport propagation; keep exactly one language repair.
3. Add `errors.wrong_language` to `i18n/en/errors.json` and `i18n/vi/errors.json` after the split.
4. No call-site edits. Extend `test/ai.test.js`.

**DEBT-02**
1. Split both catalogs into 40 namespace files; delete the two monoliths.
2. Replace the static imports with the eager brace glob + exported `mergeCatalogModules`.
3. Remove `currentLanguage = language` from `useT`.
4. Add `test/i18n-catalogs.test.js` (pairing/parity/merge) and `test/i18n-render.test.js`
   (`renderToString` safety); extend `test/i18n-keys.test.js` messages/pair checks.

**SEC-12**
1. Export `isLoopbackBridgeUrl` (and a throwing wrapper) from `settings.js`; import it from
   `bridge.js` and `runner/local.js`; validate before headers/fetch.
2. Sanitize `migrateSettings`/`saveSettings`; reject non-loopback pairing before saving; still scrub.
3. Accept bare `#token=` and bare `#bridge=…&token=…`; default the URL to
   `http://localhost:3000`; preserve the legacy `#/settings?...` path.
4. Add the locked CSP meta to `index.html`; add `test/settings-csp.test.js`.
5. Record the dev-server/runners/provider-origin decisions from §4.8 before execution.

---

## 6. Risks and pitfalls

| Risk | Evidence | Mitigation / decision |
|---|---|---|
| Strict meta CSP breaks `npm run dev` | Verified inline preamble from running Vite; plugin-react `transformIndexHtml` | Dev-only Vite transform (needs sign-off), preamble hash, or accept; decide before planning |
| CSP blocks browser runners / Pyodide | `js.worker.js:113,136` (`new Function`), wasm in `sql.worker.js`, CDN import `python.worker.js:24`, `srcdoc` iframe `OutputPanel.jsx:128-129` | Add `'wasm-unsafe-eval'` + CDN or record feature regression; `'unsafe-eval'` would undermine the CSP |
| Locked `connect-src` is narrower than shipped providers and D-10 | `catalog.js:25-31`; D-14 list | Amend D-14 or explicitly narrow the validator/accept Groq/custom/https failures |
| `frame-ancestors` silently ignored in meta | MDN explicitly says unsupported in `<meta>` | Omit; server header is Phase 2 |
| Save-time URL rejection fights the controlled `ProviderForm` input | `ProviderForm.jsx:243-247` + every-keystroke `saveSettings` | Prefer use-time guard; if strict save rejection, add a local draft (needs sign-off) or document typing limitation |
| `remote-adapter` still sends the token to a raw stored URL | `remote-adapter.js:51-54`; `select-adapter.js:30-38` bypasses migration | Accept/record or request one-line guard sign-off |
| Pairing token saved with a rejected URL | `applyPairingFromUrl:234` | Validate before building the patch; never save bridgeUrl/token on rejection |
| Wrong-language repair returning invalid JSON must not become `bad_json` | D-01; current `:74-77` returns the wrong value | Explicit `WrongLanguageError({ cause })` in the coerce-failure branch |
| Localized hint lost if custom text is passed | `ErrorNotice.jsx:16-19` | Construct the error with defaults; put copy only in `ERROR_HINTS` + catalogs |
| `import.meta.glob` crashes outside Vite | Vite-only feature | Do not import `i18n/index.js` from plain Node/CLI; document |
| New namespace not picked up in a running dev server | Glob is resolved at transform time | Expected; restart dev after adding a namespace file |
| Per-language missing namespace silently falls back to English | `translate` fallback `index.js:82-87` | Pair test fails on file-set/key mismatch |
| `t()` behavior after removing render mutation | No production module-level callers (verified) | Keep `setLanguage`; use `translate(language, …)` for future non-React callers |
| Capstone creation swallows the new error | `NewCourse.jsx:124-129` | Intentional; retry from Course page; no wrong content is stored |
| Test placement outside owned globs | Owns lists `ai*.test.js`, `i18n-*.test.js`, `runner-local.test.js`, `settings*.test.js` | `ai.test.js` / `ai-loopback.test.js`, `i18n-catalogs.test.js` / `i18n-render.test.js`, `runner-local.test.js`, `settings-loopback.test.js` / `settings-pairing.test.js` / `settings-csp.test.js` |

---

## 7. Validation Architecture

### 7.1 Test layers

**Layer 1 — unit (node env, no browser), all inside owned globs**

| File | Case | Proves |
|---|---|---|
| `test/ai.test.js` (extend) | first value EN for `vi`; repair EN too | rejects `WrongLanguageError` (`code: 'wrong_language'`, `instanceof ProviderError`), exactly 2 stream calls |
| same | repair returns VI prose | resolves repaired JSON (one language repair) |
| same | repair returns invalid JSON | rejects `wrong_language`, **not** `bad_json` |
| same | abort during language repair | rejects abort, not `wrong_language` |
| same | no `language` argument | existing behavior/`bad_json`/call counts unchanged |
| `test/i18n-catalogs.test.js` (new) | `en/` and `vi/` file sets identical; per-namespace deep key parity | D-09 pair + parity; missing namespace file fails |
| same | `mergeCatalogModules({ './en/zzz.json': { default: { a: 'A' } } })` | a brand-new namespace merges without editing `index.js` |
| same | `catalogKeys('en')`/`catalogKeys('vi')` sets identical | global parity still holds after the split |
| `test/i18n-render.test.js` (new) | mock localStorage `{ language: 'vi' }`; `renderToString` a `useT` component; then `getLanguage()` / module `t()` | render leaves module-level language untouched (D-08); rendered string is Vietnamese |
| `test/settings-loopback.test.js` (new) | table: `localhost`, `foo.localhost`, `127.0.0.1`, `127.9.8.7`, `[::1]`, `https://localhost`, `[::ffff:127.0.0.1]` → true; `0.0.0.0`, `::`, `192.168.1.5`, `evil.com`, `ftp://localhost` → false | D-10 definition incl. URL normalization bypasses |
| same | `saveSettings`/`migrateSettings` with a remote URL + token | URL/token not persisted; loopback persists |
| `test/settings-pairing.test.js` (extend) | `#token=abc123`; bare `#bridge=…&token=…`; legacy `#/settings?...` | parser shape, default `http://localhost:3000`, scrub target |
| same | non-loopback pairing | nothing saved, provider/onboarding/storage unchanged, `replaceState` still called |
| `test/runner-local.test.js` (extend) | `runnerBase` with remote URL | throws `config`; stub `fetch` never called; loopback returns the expected URL and still attaches the token |
| `test/ai-loopback.test.js` (new) | `createBridgeProvider({ bridgeUrl: 'http://evil.example', bridgeToken: 't' })` | throws `config` before headers/fetch; default localhost still constructs |
| `test/settings-csp.test.js` (new) | parse `studio/index.html` | meta present before scripts; locked directives present; `unsafe-eval` absent; `frame-ancestors` absent; loopback source expressions correct |

**Layer 2 — suite and production build**

| Command | Proves |
|---|---|
| `npm --prefix studio test` | All 43 existing files + new files pass together (no import/settings/runner regression) |
| `cd studio && npx vitest run test/ai.test.js test/settings-pairing.test.js test/settings-loopback.test.js test/i18n-catalogs.test.js test/i18n-render.test.js test/runner-local.test.js test/settings-csp.test.js` | Focused acceptance for all three requirements |
| `cd studio && npx vite build --outDir /tmp/phase6-dist --emptyOutDir` | Production HTML keeps the meta, emits only external module script/style, no inline script/style; CSP is production-compatible |
| `node -e "…read /tmp/phase6-dist/index.html…"` or manual inspection | Build output has no inline scripts and the meta survived Vite HTML processing |

**Layer 3 — manual / UAT (must be run before verify because of §4.8)**

| Check | Proves |
|---|---|
| `npm --prefix studio run dev` + browser console | Whether the chosen dev-CSP decision actually boots the app |
| `npx vite build --outDir /tmp/phase6-dist && npx vite preview --outDir /tmp/phase6-dist` + browser console | No CSP violations in the real build; KaTeX/Mermaid render; language switch works |
| Run one quiz/flashcards/syllabus with a stub or real provider in the preview | Wrong-language error path is visible and retryable (manual complement to unit tests) |
| Workspace JS / SQL / Python runs in the preview | Documents which runner backends the locked CSP blocks; this is a decision input, not a silent regression |
| Paste `#token=<hex>` and `#/settings?bridge=…&token=…` into the preview URL | Token saved, renderer configured, address bar scrubbed, no token in history |

**Baseline command already run:** `npm --prefix studio test` → 43 files / 372 tests passed
(2026-10-22, worktree HEAD `05b4532`).

---

## 8. Sources

**Phase contract / decisions**
- `.planning/phases/06-studio-beta-debt/06-CONTEXT.md` (D-01…D-15, canonical refs)
- `.planning/REQUIREMENTS.md` (DEBT-01 line 44, DEBT-02 line 45, SEC-12 line 23)
- `.planning/ROADMAP.md` (Phase 6 lines 152-166; Execution Rules lines 20-44, especially i18n line 36)
- `.planning/STATE.md` (SEC-12 split; Vitest 5 note)
- `.planning/codebase/CONCERNS.md` (lines 23, 35-36, 102-109, 158, 172, 201-203, 257-267)

**Code (line-referenced in the findings above)**
- `studio/src/lib/ai/provider-utils.js:36-103` — JSON + language retry ladder
- `studio/src/lib/ai/errors.js:6-70` — codes, hints, `ProviderError`
- `studio/src/components/ui/ErrorNotice.jsx:9-19` — localization contract
- `studio/src/pages/NewCourse.jsx:54-62, 103-138, 196-201`; `components/practice/QuizPanel.jsx:61-86,
  146-153`; `components/practice/FlashcardGenerator.jsx:32-63, 158-171`; `lib/capstone.js:93-103`;
  `pages/Course.jsx:143-147`; `pages/Capstone.jsx:172-181`
- `studio/src/lib/i18n/index.js:12-125` (catalog imports, `translate`, `catalogKeys`, `useT`)
- `studio/src/lib/i18n/en.json` / `vi.json` (20 top-level namespaces each, 607 lines each)
- `studio/test/i18n-keys.test.js:1-58`; `studio/test/tutor-panel.render.test.js:1-21`
- `studio/src/lib/settings.js:84-147, 152-178, 214-264, 267-273`
- `studio/src/main.jsx:1-15`
- `studio/src/lib/ai/bridge.js:26-110`; `studio/src/lib/runner/local.js:24-100`
- `studio/src/lib/ai/fetch-local.js:13-51`; `studio/src/lib/repo/remote-adapter.js:51-54`;
  `studio/src/lib/repo/select-adapter.js:30-53, 94-106`
- `studio/src/lib/ai/catalog.js:25-45`; `studio/src/lib/ai/anthropic.js:23`
- `studio/src/workers/js.worker.js:113,136`; `studio/src/workers/sql.worker.js:10-19`;
  `studio/src/workers/python.worker.js:15-25`; `studio/src/components/workspace/OutputPanel.jsx:128-129`
- `studio/index.html:1-15`; `studio/vite.config.js:1-13`
- `studio/node_modules/@vitejs/plugin-react/dist/index.js:181-189` (inline dev preamble)
- `bin/commands/studio.js:8, 140-161` (current pairing URL/token format)

**External references**
- MDN, CSP `frame-ancestors`: “This directive is not supported in the `<meta>` element.”
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors
- MDN, CSP `connect-src`: controls `fetch`/XHR/WebSocket/EventSource; “`connect-src 'self'` does not
  resolve to websocket schemes in all browsers.”
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src
- MDN, CSP `script-src`: without `'unsafe-eval'`, `eval`/`Function` are blocked; without
  `'wasm-unsafe-eval'`, WebAssembly is blocked.
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src
- Vite, Glob Import (`{ eager: true }` produces a path→namespace map; must be a literal pattern).
  https://vite.dev/guide/features#glob-import
- Vite, CSP notes (`data:` for `img-src`/`font-src`, never `script-src`; `html.cspNonce`).
  https://vite.dev/guide/features#content-security-policy-csp
- `@vitejs/plugin-react` README, “can’t detect preamble” error and `transformIndexHtml` preamble.
  https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react
- Empirical probes run for this research: (a) Vite dev HTML on `127.0.0.1:5199` contained an inline
  React-refresh preamble; (b) production build to `/tmp/phase6-dist` contained zero inline scripts;
  (c) Vitest 5.0.4 with studio `node_modules` resolved `import.meta.glob('../lang/{en,vi}/*.json',
  { eager: true })` to `{ path: { default: JSON } }`; (d) WHATWG URL normalization of alternate
  IPv4/IPv6 loopback spellings.

---

## RESEARCH COMPLETE
