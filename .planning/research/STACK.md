# Stack Research

**Domain:** Local-first BYOK browser SPA for AI-assisted learning (Professor Studio, milestone v3.0)
**Researched:** 2026-10-15
**Confidence:** HIGH (versions read live from the npm registry; CORS claims verified by live `curl` against each provider on 2026-10-15; Void CLI/config behavior read from official docs)

---

## Executive summary

Professor Studio is a **static Vite SPA that talks directly to AI providers from the browser**. The
single most important finding — and the one that contradicts most older blog posts — is that **every
cloud provider on the list now returns permissive CORS headers on the actual `POST` response**, so a
browser-only BYOK app is viable with **no proxy**:

| Provider endpoint | `Access-Control-Allow-Origin` on live `POST` | Verified |
|---|---|---|
| `https://api.openai.com/v1/chat/completions` | `*` | ✅ live curl 2026-10-15 |
| `https://openrouter.ai/api/v1/chat/completions` | `*` | ✅ live curl 2026-10-15 |
| `https://api.groq.com/openai/v1/chat/completions` | `*` | ✅ live curl 2026-10-15 |
| `https://api.anthropic.com/v1/messages` (with `anthropic-dangerous-direct-browser-access: true`) | `*` | ✅ live curl 2026-10-15 |
| `http://localhost:11434` (Ollama) | localhost origins by default, else `OLLAMA_ORIGINS` | docs |
| `http://localhost:1234` (LM Studio) | needs `--cors` / "Enable CORS" for non-loopback origins | docs |

So the provider layer is a **client-side adapter set over `fetch` (or the official Anthropic SDK for
Anthropic only)**, not a server. The remaining risks are local-source quirks (Ollama origins, browser
Private-Network-Access to `localhost`), not cloud CORS.

**Deploy target caveat:** the task says "void.cloud". Void is VoidZero's Vite-native deploy platform that
ships to the user's own Cloudflare Workers/Pages account. It is currently in **Private Beta** ("we do not
recommend using it for mission-critical production workloads yet" — https://void.cloud/guide/ssg). It has
everything the later SaaS needs built in (D1/Drizzle, KV, R2, Workers AI, Better Auth), so it is a good
long-term bet, but the v3.0 static build must also work on any dumb static host (Cloudflare Pages, Netlify,
GitHub Pages) as a fallback.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| vite | ^8.3.4 | Build + dev server | Already in `studio/package.json`; Void is a Vite plugin/platform, so Vite is the natural backbone. |
| react / react-dom | ^19.3.1 | UI | Already chosen for Studio and `web/client`. React 19 is stable and all listed libs support it. |
| tailwindcss + @tailwindcss/vite | ^4.3.3 | Styling | Already present; v4 CSS-first config, no PostCSS config file. |
| @anthropic-ai/sdk | ^0.134.0 | Anthropic BYOK transport | Official SDK auto-adds the CORS header and gives typed streaming with abort. See Q1. |
| idb | ^8.0.4 *(optional)* | Typed IndexedDB escape hatch | Only adopt if the raw wrapper in `src/lib/db.js` outgrows hand-rolled code. See Q4. |
| void | ^1.1.0 | Build/deploy CLI for void.cloud | `void deploy` builds, provisions resources, and ships to Cloudflare. See Q5. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-markdown | ^10.1.0 | Markdown → React | Already present. Render lessons/tutor Markdown. **No `rehype-raw`.** |
| remark-gfm | ^4.0.1 | GFM (tables, task lists, autolinks) | Already present; quizzes/lessons use tables + checklists. |
| rehype-highlight | ^7.0.2 *(only if highlighting desired)* | `highlight.js` code-block highlighting via rehype | Add when code blocks look too plain. See Q6. |
| remark-math + rehype-katex + katex | ^6.0.0 / ^7.0.1 / ^0.19.0 | LaTeX math | Only if any course is math/sci heavy. **Skip for v3.0.** See Q6. |
| eventsource-parser | ^4.1.2 *(optional)* | Robust SSE frame parsing | Only if the hand-rolled SSE reader in Q2 proves brittle. |
| openai | ^7.34.0 | OpenAI-compatible client | **Not recommended** — prefer raw `fetch` for a uniform browser path. See Q2. |
| fake-indexeddb | ^6.2.5 (dev) | IndexedDB in Vitest (node env) | Already present; keeps `db.js` unit-testable. |
| vitest | ^5.0.4 (dev) | Test runner | Already present. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `npm run dev` (vite) | Local dev on `:5180` | Serving from `http://localhost:5180` is what makes Ollama/LM Studio/local-bridge work out of the box. |
| `npx void init` / `npx void deploy` | Configure + deploy to Cloudflare via Void | `void init` adds `voidPlugin()` + `void.config.ts`; `void deploy` provisions resources. |
| `void deploy --dir studio/dist` | Deploy a **pre-built** static SPA | Use this to keep Studio's existing Vite build untouched. See Q5. |
| Hash routing (no router lib) | Deep-linkable routes on any static host | Already chosen (`base: './'`). Zero deps. See Q7. |

---

## Installation

```bash
# Inside studio/ — core additions for v3.0 provider layer
npm install @anthropic-ai/sdk@^0.134.0

# Optional (only if you decide you need them)
npm install idb@^8.0.4                     # typed IndexedDB, replaces hand-rolled wrapper
npm install rehype-highlight@^7.0.2        # code highlighting
npm install remark-math@^6.0.0 rehype-katex@^7.0.1 katex@^0.19.0   # math (probably skip)

# Deploy tooling (dev-only)
npm install -D void@^1.1.0

# Already present, no change needed
# react@19.3 react-dom@19.3 react-markdown@10 remark-gfm@4 tailwindcss@4 vite@8 vitest@5 fake-indexeddb@6
```

---

## Q1 — Anthropic BYOK from the browser (`@anthropic-ai/sdk@0.134`)

**Use the official SDK.** It is the only provider where the SDK is worth its weight, because it
encapsulates the CORS opt-in and the streaming state machine.

- Construct with **`dangerouslyAllowBrowser: true`**. When set, the SDK automatically adds the
  `anthropic-dangerous-direct-browser-access: true` request header — you do **not** add it by hand.
  Verified in SDK source: `defaultHeaders()` spreads `{'anthropic-dangerous-direct-browser-access': 'true'}`
  only when `dangerouslyAllowBrowser` is true
  (https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/sdk-v0.37.0/src/index.ts,
  https://github.com/anthropics/anthropic-sdk-typescript/issues/248).
- **CORS is live:** a `POST /v1/messages` carrying the header returns `access-control-allow-origin: *`
  (verified by curl 2026-10-15). The header is required even to pass preflight.
- **Streaming:** `client.messages.stream({ ... })` returns a `MessageStream` with:
  - `.on('text', (text) => …)` for incremental deltas,
  - `await stream.finalMessage()` to accumulate the full `Message`,
  - `.abort()` or `for await (…) { break }` to cancel.
  (https://platform.claude.com/docs/en/api/messages-streaming.md,
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/lib/MessageStream.ts,
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md)
- You may also pass `{ signal }` (a `RequestOptions` second arg) — the SDK wires it to an internal
  `AbortController` and throws `APIUserAbortError`. For a "Stop" button, keep your own controller and
  call `.abort()`.

**Model IDs to offer** (verified on the official models overview, 2026-10-15):

| Label in UI | Model ID | Notes |
|---|---|---|
| Claude Opus 5.5 (default) | `claude-opus-5-5` | $4/$20 per MTok, 1M ctx, adaptive thinking |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2/$10 per MTok, 1M ctx |
| Claude Haiku 5.5 | `claude-haiku-5-5` | cheapest/fastest, 1M ctx |
| Claude Fable 5.1 | `claude-fable-5-1` | premium, $10/$50 — offer as an "advanced" option only |

Source: https://platform.claude.com/docs/en/models/overview.

> ⚠️ **Model drift is real** (the lineup changes every few months). Do **not** hardcode this list as the
> only truth. Offer these as defaults and also call `GET https://api.anthropic.com/v1/models`
> (`anthropic-version: 2023-06-01`) to populate a live list
> (https://platform.claude.com/docs/en/api/models/list). Note `claude-sonnet-5` (released 2026-06-30)
> and `claude-sonnet-5-5` both appear in Anthropic docs across pages — the Models API is the tie-breaker.
> **UNVERIFIED:** that `claude-haiku-5-5` is the canonical id string in the products API vs. the
> overview page; reconcile with `GET /v1/models` at runtime.

**Refusals:** non-2xx and `stop_reason` handling should surface `error.message` / `stop_reason` as a
readable card; the SDK throws typed errors (e.g. `APIError`, `APIUserAbortError`) you can branch on.

---

## Q2 — OpenAI-compatible streaming from the browser

**Recommendation: raw `fetch` + `ReadableStream` SSE parsing, one shared adapter for OpenAI / OpenRouter /
Groq / LM Studio. Do not add the `openai` npm package for v3.0.**

Reasons:
1. All four endpoints are documented as OpenAI-compatible (`{baseURL}/v1/chat/completions`, `stream: true`).
2. The browser `fetch` body is a `ReadableStream`; parsing SSE by hand is ~30 lines and lets you handle
   OpenRouter's `: OPENROUTER PROCESSING` keep-alive comments and mid-stream error frames uniformly.
3. The `openai` package works in the browser with `dangerouslyAllowBrowser: true` and a `baseURL`, but it
   adds weight and its error/stream abstractions vary by provider — you'd still special-case OpenRouter.
   Add it **only** if you later want its typed tool-calling/embeddings surface.

**CORS verdict per provider (all verified live 2026-10-15 on `POST`):**
- **OpenAI** (`https://api.openai.com/v1`): `access-control-allow-origin: *`. Works from the browser now.
  (Older forum threads showed failures in 2025 — this has changed; the preflight also echoes the Origin.)
  https://community.openai.com/t/chat-completions-api-endpoint-down-blocked-any-web-browser-request/1362527
- **OpenRouter** (`https://openrouter.ai/api/v1`): `access-control-allow-origin: *`. Officially supports
  streaming; strip lines starting with `:` (keep-alive comments). Errors after the first token arrive as an
  SSE `data:` frame with an `error` field and `choices[0].finish_reason: "error"`.
  https://openrouter.ai/docs/api-reference/streaming, https://openrouter.ai/docs/api/reference/overview.md
- **Groq** (`https://api.groq.com/openai/v1`): `access-control-allow-origin: *`. Despite the CORS being
  permissive, **Groq's own security docs say "Never embed keys in frontend code… route through a trusted
  backend proxy"** (https://console.groq.com/docs/production-readiness/security-onboarding). This is a
  policy caution, not a technical block. For a **BYOK** app where the key is explicitly the learner's own,
  browser use is acceptable — but show a warning in Settings and never log/ship the key.
- **LM Studio** (`http://localhost:1234/v1`): browser clients need CORS enabled — GUI "Server Settings →
  Enable CORS" or `lms server start --cors` (https://lmstudio.ai/docs-md/cli/serve/server-start). Loopback
  origins generally work; a LAN bind needs auth.

**Shared adapter shape (conceptual):**

```js
// src/lib/ai/openaiCompat.js
export async function* streamChat({ baseUrl, apiKey, model, messages, signal }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(':')) continue;          // SSE comment / keep-alive
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let json; try { json = JSON.parse(data); } catch { continue; }
      if (json.error) throw new Error(json.error.message || 'provider error');
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }
}
```

**Abort/cancel:** pass an `AbortController.signal`; the "Stop" button calls `controller.abort()`, which
rejects the pending `reader.read()` with an `AbortError` — catch and treat as a clean stop.

**"Test connection" (AI-02):** for OpenAI-compatible providers, `GET {baseUrl}/models` with the key is the
lightest probe; map `401 → bad key`, `404 → wrong base URL`, network error → "not reachable / CORS"
(give the provider-specific hint text per the list above).

---

## Q3 — Ollama from the browser

- **Endpoints:** Ollama exposes both a native API and an OpenAI-compatible one.
  - Native: `POST /api/chat` (streams NDJSON, one JSON object per line, `message.content` deltas).
  - OpenAI-compatible: `POST {base}/v1/chat/completions` (SSE) — reuse the same `openaiCompat.js` adapter
    from Q2 with `baseUrl = http://localhost:11434/v1`, `apiKey = 'ollama'` (ignored but required by some
    clients). https://www.ollama.com/blog/openai-compatibility
  - **Model listing:** `GET /api/tags` returns `{ models: [{ name, model, size, modified_at, … }] }` — use
    this to populate the model dropdown. https://localhost:11434/api/tags (Ollama API reference)
- **CORS / origins:** Ollama allows cross-origin requests from `127.0.0.1` and `0.0.0.0` origins **by
  default**; any other origin must be added via `OLLAMA_ORIGINS`
  (https://github.com/ollama/ollama/issues/300,
  https://objectgraph.com/blog/ollama-cors,
  https://ollama-9269c548.mintlify.app/faq).
  - Dev flow (Studio on `http://localhost:5180`) usually works with no config.
  - If the user opens the **deployed** site and points at their local Ollama, they must set
    `OLLAMA_ORIGINS=<the site origin>` — provide a copy-pasteable per-OS snippet in Settings:
    - macOS: `launchctl setenv OLLAMA_ORIGINS "*"` then restart the Ollama app (or
      `OLLAMA_ORIGINS=* ollama serve`).
    - Linux (systemd): `systemctl edit ollama` → `[Service] Environment="OLLAMA_ORIGINS=*"` → restart.
    - Windows: `setx OLLAMA_ORIGINS "*"` (then restart Ollama / `ollama serve`).
    - Docker: `-e OLLAMA_ORIGINS=*`.
    Prefer the user's exact origin over `*`; warn that `*` lets any site on the machine hit their Ollama.
    **UNVERIFIED:** the exact `launchctl`/systemd text is pattern-verified from the sources above but not
    executed here — validate on macOS before shipping the copy in Settings.

> ⚠️ **Private Network Access (PNA):** a page served from a public HTTPS origin (e.g. `*.void.app`)
> calling `http://localhost:11434` can be blocked by Chromium's loopback PNA rules even with correct
> OLLAMA_ORIGINS (the same failure is reported for LM Studio:
> https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/392). **Practical guidance: local AI sources
> (Ollama, LM Studio, and the local agent bridge) are first-class when Studio is served from localhost
> (`npm run dev`), and best-effort when served from the deployed site.** Surface this honestly in Settings
> rather than promising it always works.

---

## Q3b — Local agent bridge (existing `web/server.js`)

The bridge is already specced in the repo: `POST /api/chat` streams **SSE with `data: {content}` frames,
then `data: [DONE]`** (see `web/server.js:471`, `:425`, `:683`). Studio should treat it as a fifth adapter:

- Parse with the **same SSE reader** as Q2, but read `json.content` (string) instead of `choices[0].delta`.
- The bridge is `http://localhost:3000` by default; it currently uses `cors()` with no allowlist
  (`web/server.js:19`). **DEPLOY-04 requires tightening this to an allowlist + a pairing token** — do that
  in the `web/` server, and have Studio send the token header. Until then, the bridge only works from
  localhost pages (browser PNA also applies to a deployed Studio → localhost).
- No API key is involved; the learner's own Claude Code / OpenCode / Cursor subscription does the work.

---

## Q4 — IndexedDB: keep raw wrapper vs `idb` vs Dexie

**Recommendation: keep the hand-rolled wrapper in `studio/src/lib/db.js` for v3.0.** It is small, already
written, already has the in-memory fallback (SHELL-04), and `dumpAll()`/`restoreAll()` already exclude the
`settings` meta key so **keys never enter backups (AI-03)**. Adding a library now is churn with no payoff.

**Migration trigger → adopt `idb@8`** when any of these become true: you need many ad-hoc queries/indexes,
schema migrations beyond the current `onupgradeneeded`, or typed generics across stores. `idb` is a ~1.3 kB
thin promise wrapper that keeps you in control and adds types without an ORM.

**Do NOT adopt Dexie for v3.0.** Dexie (`dexie@4.4.6`) is excellent, and its `liveQuery` + Dexie Cloud is
the strongest ready-made sync story — but:
- Dexie Cloud is a **commercial hosted service**; adopting it now would pre-commit the SaaS sync layer away
  from the void.cloud/D1 plan (Key Decision "Cloud sync belongs to the SaaS milestone").
- v3.0 has a **single user, few entities, no reactivity requirement** — Dexie's value is unrealized.
- Reach for Dexie **only if** a later decision is "buy sync instead of build it." Then it is the right call.

| Option | Size / cost | Best for | Verdict for Studio |
|---|---|---|---|
| Raw wrapper (current) | 0 deps, ~110 LOC | Single-user, few stores, full control | ✅ **v3.0** |
| `idb@8.0.4` | tiny, types only | When queries/migrations grow | ⏭ escape hatch |
| `dexie@4.4.6` | larger, own query lang | Rich querying + optional Dexie Cloud sync | ❌ unless sync is outsourced |

Sources: https://dexie.org/docs/Dexie.js.html, https://www.npmjs.com/package/dexie,
https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb.

**SaaS sync note:** with a D1/Postgres backend later, the sync layer will be a **custom push/pull with
`updatedAt` + tombstones** over the existing JSON dump — which the current flat store model already
supports. Keeping the raw wrapper maximizes freedom for that design.

---

## Q5 — void.cloud: what it is, and how to deploy a static Vite build

**What it is:** *Void* (by VoidZero, the Vite/Rolldown/Vitest company) is a Vite-native full-stack
framework + CLI + deploy platform. `void deploy` builds your app and ships it to **your own Cloudflare
Workers/Pages account**, provisioning resources it detects from your imports. It is **not** a third-party PAAS
with its own free tier — the tier is **Cloudflare Workers Free** (100k requests/day, static assets free &
unlimited; https://developers.cloudflare.com/workers/platform/pricing/). Docs: https://void.cloud/ .
**Status: Private Beta** — "we do not recommend using it for mission-critical production workloads yet"
(https://void.cloud/guide/ssg).

**Deploy paths for a pre-built Vite SPA (recommended — leaves `studio/` build untouched):**

1. `npm install -D void`
2. Add a minimal `void.config.ts` at the repo/project root and declare a static SPA:

```ts
// void.config.ts
import { defineConfig } from 'void/config';
export default defineConfig({
  inference: {
    appType: 'spa',      // static output + SPA fallback to index.html (200) for unknown paths
    outputDir: 'studio/dist',
  },
  cloudflare: { name: 'professor-studio' },
});
```

3. `npx void deploy --dir studio/dist` (uploads the pre-built static files directly) — or `npx void deploy`
   if you add `voidPlugin()` and let Void run the build.

**Config facts (from https://void.cloud/reference/config and https://void.cloud/guide/app-types):**
- Config is `void.config.ts` (preferred, supports `defineConfig`) or `void.json`.
- `inference.appType: "spa"` → "static output with SPA fallback. Non-file paths fall back to `index.html`
  with a 200 status so client-side routing works out of the box." **This means clean path routing is
  possible on Void even though the current app uses hash routing.**
- `inference.appType: "static"` → non-matching paths return `404.html`/404 (no SPA fallback).
- `inference.outputDir` defaults to `dist`; set it to `studio/dist`.
- `routing.fallbacks: { "/*": "/index.html" }` and `routing.notFound`: `"single-page-application"` are the
  other levers for SPA shells.
- `void deploy --dir <path>` uploads static files directly (no Void plugin required).

**SPA routing recommendation:** keep the **hash routing** already chosen (`vite.config.js` uses `base: './'`,
SHELL-02 wants routes that "survive refresh and deep links on a static host"). Hash routing needs **zero**
server config and works even on hosts that offer no rewrite rules. Document `appType: "spa"` (Void) /
`_redirects` (Netlify/Cloudflare Pages `/* /index.html 200`) as the way to switch to clean path routing later.

**Env vars / secrets:** declare server secrets with `void secret put <NAME>`; **public** build-time values
must be supplied as `VITE_*` in the build environment. Because Studio is BYOK, **no server secrets are
needed for v3.0** — keys live in IndexedDB. (https://void.cloud/guide/deployment)

**Built-ins useful for the later SaaS (all in-box, no config files):**
- **D1 database** via Drizzle (`import { db } from 'void/db'`) — accounts, courses, sync.
- **KV** (`void/kv`) — sessions/flags; **R2** (`void/storage`) — exports/backups.
- **Workers AI** (`void/ai`) — a managed-AI path for the paid tier (metered).
- **Better Auth** (`void/auth`) — email + OAuth providers (github, google, …) for accounts (SYNC-01).
- **Email, Queues, Cron** — notifications, background sync, streak reminders (AUDIO-01/streak jobs).
(https://void.cloud/guide/, https://void.cloud/reference/api)

> ⚠️ **Fallback plan:** because Void is in beta, keep the build **host-agnostic** (relative `base`,
> hash routing, no Void-only imports in `studio/src`). Then `studio/dist` also deploys verbatim to
> Cloudflare Pages / Netlify / GitHub Pages. Adopt `voidPlugin()`/`void/*` imports only when the SaaS
> milestone actually needs D1/KV/Auth.

---

## Q6 — Markdown rendering: safety and extras

**Sanitization — the current setup is already safe; keep it that way.**
- `react-markdown@10` is **secure by default**: it builds a virtual DOM from an AST and does not use
  `dangerouslySetInnerHTML`; raw HTML in Markdown is **escaped/ignored** unless you opt in with
  `rehype-raw`. (https://github.com/remarkjs/react-markdown — "Use of react-markdown is secure by default.")
- **Do NOT add `rehype-raw`.** It would let AI-generated (or imported-from-registry, REG-01) Markdown inject
  HTML → XSS. AI output is untrusted input; keep escaping on. The current app already does the right thing.
- **Do NOT add `rehype-sanitize` for v3.0 either** — it is only needed to clean up after `rehype-raw`
  or extra rehype plugins. Adding it without `rehype-raw` is dead weight. (If you later add plugins that
  emit HTML, re-introduce `rehype-sanitize@6`.)
- `react-markdown` already safely handles links (`defaultUrlTransform`) — do not override `urlTransform`
  with anything permissive.

**Code highlighting — optional, low priority for v3.0.**
- If you want it: `rehype-highlight@7.0.2` (highlight.js, server-rendered at parse time, small CSS theme).
  It is a **rehype** plugin and passes through react-markdown safely; render via `<Markdown
  rehypePlugins={[rehypeHighlight]}>`.
- Avoid `react-syntax-highlighter@16` (bigger, component-per-block churn) and avoid `shiki` here (heavy
  WASM/bundle) unless code blocks become a core product surface.
- **Alternative:** do nothing — a styled `<pre><code>` from Tailwind is perfectly readable for a learning
  reader. Ship without highlighting first.

**Math — explicitly "don't add" for v3.0.**
- KaTeX path exists and is well documented (`remark-math@6` + `rehype-katex@7` + `katex@0.19` + import
  `katex/dist/katex.min.css`), but it adds 3 packages + CSS + font assets for a feature no v3.0 requirement
  asks for (LESSON-03 only requires GFM tables/code + no raw HTML).
- If a math-heavy course appears, add it then, and run rehype-katex **after** rehype-sanitize if sanitize is
  reintroduced. (https://github.com/remarkjs/remark-math)

**Recommended v3.0 Markdown config:** `react-markdown` + `remark-gfm`, no rehype plugins, no `rehype-raw`,
no sanitize wrapper. Add highlighting (rehype-highlight) only if it visibly improves lessons.

---

## Q7 — What NOT to add (with reasons)

| Avoid | Why | Use Instead |
|---|---|---|
| `react-router` / `react-router-dom@7` / TanStack Router | Adds 20–40 kB + mental overhead for ~6 screens. The app already committed to hash routing in a static bundle. | A ~40-line `useHashRoute()` hook + `window.onhashchange` (SHELL-02). |
| Redux / Zustand / Jotai / MobX | Single-user, local data, no cross-cutting global state. IndexedDB is the source of truth. | React context for the AI-provider/settings + `useState`/`useReducer` in pages. |
| Any component kit (MUI, Mantine, Chakra, shadcn install) | Tailwind v4 is already in; a kit doubles the styling system and bloats the bundle. | Tailwind utility components in `studio/src/components`. |
| `rehype-raw` | Executes untrusted HTML from AI output / community courses → XSS. | Default escaping in react-markdown. |
| `openai` npm SDK (for v3.0) | Uniform raw-`fetch` SSE adapter already covers OpenAI/OpenRouter/Groq/LM Studio with less weight and fewer provider quirks. | `src/lib/ai/openaiCompat.js` (Q2). |
| Dexie / Dexie Cloud (for v3.0) | Pre-commits the sync layer to a commercial vendor that conflicts with the void.cloud/D1 SaaS plan; unnecessary for one user. | Keep `db.js`; escape to `idb@8` if needed (Q4). |
| Shiki / Prism / react-syntax-highlighter | 3 MB / WASM / extra components for a nice-to-have. | `rehype-highlight` if highlighting is needed, else nothing. |
| A BFF/proxy server for AI calls | The whole point of BYOK + verified CORS is browser→provider directly; a proxy would re-introduce infra to run and a key-hosting liability. | Direct adapters; the only server is the *optional* local bridge the user already runs. |
| TypeScript migration | Studio currently ships plain JS; adding TS is a build/config tax orthogonal to v3.0 goals. | JSDoc types; revisit only if the codebase grows. |

---

## Stack Patterns by Variant

**If serving from localhost (`npm run dev`) — the primary dev/demo flow:**
- Ollama, LM Studio, and the `web/` bridge all work with default config (loopback origins).
- Use this as the reference environment for AI-06 (local agent bridge) and manual QA.

**If serving from the deployed static site (`*.void.app`):**
- Cloud BYOK providers (Anthropic/OpenAI/OpenRouter/Groq) work directly — verified CORS.
- Local sources are best-effort: require `OLLAMA_ORIGINS=<site origin>` / LM Studio CORS **and** may be
  blocked by browser Private Network Access. Show an explicit "run Studio locally for local AI" hint.

**If a course is math-heavy:**
- Add `remark-math` + `rehype-katex` + `katex`, import `katex/dist/katex.min.css`. Otherwise skip (Q6).

**If the SaaS milestone starts:**
- Adopt `voidPlugin()` + `void/*` imports (D1/Drizzle, KV, R2, Better Auth, Workers AI) *in `studio/src`
  only then*; keep the v3.0 build free of Void imports so the static build stays portable.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| react-markdown@10 / remark-gfm@4 | react@19 | ESM-only; matches `studio/`'s `"type":"module"`. |
| rehype-highlight@7 | react-markdown@10 (rehype 4+) | Works with unified 6+; keep as a rehype plugin. |
| remark-math@6 / rehype-katex@7 | react-markdown@10 | Must also install `katex@0.19` and import its CSS. |
| @anthropic-ai/sdk@0.134 | modern browsers | Requires `dangerouslyAllowBrowser: true` in browser; adds the CORS header automatically. |
| idb@8 | any modern browser | Plain ES module, zero deps; drop-in vs current `db.js`. |
| void@1.1.0 | vite@8–9 | `void` CLI version must match the installed `void` package and, for CF deploys, the saved target. |
| fake-indexeddb@6 | vitest@5 (node env) | Already wired; keeps `db.js` tests realistic. |

---

## Sources

- **Live verification (curl, 2026-10-15):** `POST` to `api.openai.com/v1/chat/completions`,
  `openrouter.ai/api/v1/chat/completions`, `api.groq.com/openai/v1/chat/completions`, and
  `api.anthropic.com/v1/messages` all returned `access-control-allow-origin: *` — the primary CORS claim.
- **npm registry (`npm view`, 2026-10-15):** exact current versions for `@anthropic-ai/sdk`, `react`,
  `react-dom`, `react-markdown`, `remark-gfm`, `vite`, `@vitejs/plugin-react`, `tailwindcss`,
  `@tailwindcss/vite`, `vitest`, `fake-indexeddb`, `idb`, `dexie`, `openai`, `katex`, `rehype-katex`,
  `remark-math`, `rehype-highlight`, `react-syntax-highlighter`, `eventsource-parser`, `void`, `groq-sdk`,
  `rehype-sanitize`.
- Anthropic SDK browser/CORS + streaming: https://github.com/anthropics/anthropic-sdk-typescript/issues/248 ,
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md ,
  https://platform.claude.com/docs/en/api/messages-streaming.md ,
  https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/
- Anthropic models: https://platform.claude.com/docs/en/models/overview ,
  https://platform.claude.com/docs/en/api/models/list
- OpenRouter streaming/SSE: https://openrouter.ai/docs/api-reference/streaming
- Groq OpenAI-compat + security guidance: https://console.groq.com/docs/openai ,
  https://console.groq.com/docs/production-readiness/security-onboarding
- Ollama: https://www.ollama.com/blog/openai-compatibility ,
  https://github.com/ollama/ollama/issues/300 , https://objectgraph.com/blog/ollama-cors ,
  https://ollama-9269c548.mintlify.app/faq
- LM Studio: https://lmstudio.ai/docs-md/cli/serve/server-start ,
  https://lmstudio.ai/docs/developer/openai-compat , https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/392
- IndexedDB libs: https://dexie.org/docs/Dexie.js.html , https://www.npmjs.com/package/dexie ,
  https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb
- Void platform: https://void.cloud/ , https://void.cloud/guide/quickstart ,
  https://void.cloud/guide/app-types , https://void.cloud/guide/ssg , https://void.cloud/guide/deployment ,
  https://void.cloud/reference/config , https://void.cloud/reference/cli , https://void.cloud/reference/api
- Cloudflare Workers pricing (Void's effective free tier):
  https://developers.cloudflare.com/workers/platform/pricing/
- react-markdown safety + math: https://github.com/remarkjs/react-markdown ,
  https://github.com/remarkjs/remark-math

---
*Stack research for: Professor Studio (v3.0 static BYOK learning SPA)*
*Researched: 2026-10-15*
